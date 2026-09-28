import { DEFAULT_GAS_URL } from '../data/gasTemplates';
import { ReceiptData } from '../types';

/**
 * CLIENT-SIDE & HYBRID GOOGLE SHEETS 2-WAY SYNC SERVICE
 * Berjalan stabil di:
 * 1. AI Studio Dev Server
 * 2. Vercel / Netlify Production Deployment
 * 3. Mode Browser Direct ke Google Apps Script
 */

const STORAGE_KEY_URL = 'gas_web_app_url';
const STORAGE_KEY_SHEET_URL = 'gas_google_sheet_url';
const STORAGE_KEY_TXS = 'batara_transactions_backup';
const STORAGE_KEY_LAST_SYNC = 'batara_last_synced_at';
const STORAGE_KEY_AUTO_SYNC = 'batara_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'batara_auto_sync_interval';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  totalInSheet: number;
  sheetUrl?: string;
}

type SyncListener = (state: SyncState, transactions?: ReceiptData[]) => void;
const syncListeners: Set<SyncListener> = new Set();

let currentSyncState: SyncState = {
  status: 'idle',
  lastSyncedAt: getLastSyncedTime(),
  lastError: null,
  totalInSheet: 0,
};

export function subscribeSyncState(listener: SyncListener): () => void {
  syncListeners.add(listener);
  // Emit current state immediately
  listener(currentSyncState);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifySyncListeners(state: Partial<SyncState>, transactions?: ReceiptData[]) {
  currentSyncState = { ...currentSyncState, ...state };
  syncListeners.forEach((l) => {
    try {
      l(currentSyncState, transactions);
    } catch (e) {
      console.error('Error in sync listener:', e);
    }
  });
}

export function isAutoSyncEnabled(): boolean {
  const val = localStorage.getItem(STORAGE_KEY_AUTO_SYNC);
  if (val === null) return true; // Default true
  return val === 'true';
}

export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_AUTO_SYNC, String(enabled));
}

let autoSyncTimerId: any = null;
let currentRunSyncFn: (() => Promise<void>) | null = null;

export function getAutoSyncInterval(): number {
  const val = localStorage.getItem(STORAGE_KEY_SYNC_INTERVAL);
  if (val) {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 15) return num;
  }
  return 30; // Default 30 detik
}

export function setAutoSyncInterval(seconds: number): void {
  const clamped = Math.max(15, seconds);
  localStorage.setItem(STORAGE_KEY_SYNC_INTERVAL, String(clamped));
  // Segera perbarui timer yang sedang berjalan ke interval baru
  if (autoSyncTimerId && currentRunSyncFn) {
    clearInterval(autoSyncTimerId);
    autoSyncTimerId = setInterval(currentRunSyncFn, clamped * 1000);
  }
}

export function getStoredGasUrl(): string {
  return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_GAS_URL;
}

export function setStoredGasUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
}

export const DEFAULT_SHEET_ID = '1BsGCKV1wvFlmaVuJDZee8bSJsklwatMzVznkOzBFzys';
export const DEFAULT_SHEET_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_SHEET_ID}/edit`;

export function getStoredSheetUrl(): string {
  return localStorage.getItem(STORAGE_KEY_SHEET_URL) || DEFAULT_SHEET_URL;
}

export function setStoredSheetUrl(url: string): void {
  if (url) {
    localStorage.setItem(STORAGE_KEY_SHEET_URL, url.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_SHEET_URL);
  }
}

export function getLastSyncedTime(): string | null {
  return localStorage.getItem(STORAGE_KEY_LAST_SYNC);
}

export function setLastSyncedTime(isoTime: string): void {
  localStorage.setItem(STORAGE_KEY_LAST_SYNC, isoTime);
}

export function getStoredTransactions(): ReceiptData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TXS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deletedIds = getDeletedTransactionIds();
        const resetTime = getLastResetTimestamp();
        return parsed.filter(isValidTransaction).filter((t) => {
          if (t.id && deletedIds.has(t.id)) return false;
          if (t.idpel && deletedIds.has(t.idpel)) return false;
          if (resetTime > 0) {
            let tTime = 0;
            if (t.createdAt) tTime = new Date(t.createdAt).getTime();
            if (!tTime && t.id && String(t.id).startsWith('TX-')) {
              const num = Number(String(t.id).replace('TX-', ''));
              if (!isNaN(num) && num > 1000000000) tTime = num;
            }
            if (tTime > 0 && tTime < resetTime) return false;
          }
          return true;
        });
      }
    }
  } catch (e) {
    console.warn('Failed reading transactions from localStorage:', e);
  }
  return [];
}

export function saveStoredTransactions(txs: ReceiptData[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TXS, JSON.stringify(txs));
  } catch (e) {
    console.warn('Failed saving transactions to localStorage:', e);
  }
}

/**
 * Normalisasi URL Web App Google Apps Script
 */
export function normalizeGasUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim();
  clean = clean.replace(/\/edit.*$/, '/exec');
  clean = clean.replace(/\/dev.*$/, '/exec');
  if (!clean.includes('/exec') && clean.includes('script.google.com')) {
    clean = clean.replace(/\/?$/, '/exec');
  }
  return clean;
}

/**
 * Helper pembersih respons Google Apps Script agar terbebas dari format HTML
 */
function parseGasRawResponse(text: string): any {
  if (!text || typeof text !== 'string') {
    return { success: false, error: 'Respon kosong dari Google Apps Script' };
  }
  const trimmed = text.trim();

  // Jika JSON murni
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  // Jika halaman HTML login / error otorisasi
  const lower = trimmed.toLowerCase();
  if (
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    lower.includes('the page') ||
    lower.includes('accounts.google.com') ||
    lower.includes('servicelogin') ||
    lower.includes('authorization required')
  ) {
    throw new Error(
      'Akses Google Apps Script memerlukan otorisasi. Pastikan di Apps Script: Deploy > Manage deployments > Edit > Who has access diubah ke "Anyone" (Siapa saja).'
    );
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.length < 250) {
      return { success: true, message: trimmed };
    }
    throw new Error('Respon dari Google Apps Script bukan JSON yang valid.');
  }
}

/**
 * Panggilan langsung ke Google Apps Script (Browser Direct)
 */
export async function directGasCall(
  gasUrl: string,
  action: string,
  payload: Record<string, any> = {}
): Promise<any> {
  const url = normalizeGasUrl(gasUrl || getStoredGasUrl());
  if (!url) throw new Error('URL Google Apps Script belum diisi');

  const isReadAction = action === 'getTransactions' || action === 'pull' || action === 'ping' || action === 'test';

  if (isReadAction) {
    // 1. Coba GET terlebih dahulu untuk read (paling stabil di browser & Vercel, tanpa CORS issue)
    try {
      const u = new URL(url);
      u.searchParams.set('action', action);
      if (payload.id) u.searchParams.set('id', String(payload.id));
      if (payload.idpel) u.searchParams.set('idpel', String(payload.idpel));
      const getRes = await fetch(u.toString(), { method: 'GET' });
      const getText = await getRes.text();
      const parsed = parseGasRawResponse(getText);
      if (parsed && (parsed.success || Array.isArray(parsed) || Array.isArray(parsed.data))) {
        return parsed;
      }
    } catch (errGet: any) {
      console.warn('Direct GET to GAS failed, falling back to POST:', errGet.message);
    }

    // 2. Fallback POST jika GET gagal
    try {
      const postBody = JSON.stringify({ action, ...payload });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: postBody,
      });
      const text = await res.text();
      return parseGasRawResponse(text);
    } catch (errPost: any) {
      throw errPost;
    }
  }

  // Untuk Write Action (save, sync): POST text/plain terlebih dahulu
  try {
    const postBody = JSON.stringify({ action, ...payload });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: postBody,
    });
    const text = await res.text();
    return parseGasRawResponse(text);
  } catch (errPost: any) {
    console.warn('Direct POST to GAS failed, falling back to GET:', errPost.message);
  }

  // Fallback GET untuk write
  const u = new URL(url);
  u.searchParams.set('action', action);
  if (payload.id) u.searchParams.set('id', String(payload.id));
  if (payload.idpel) u.searchParams.set('idpel', String(payload.idpel));
  const getRes = await fetch(u.toString(), { method: 'GET' });
  const getText = await getRes.text();
  return parseGasRawResponse(getText);
}

function cleanIdpel(val: any): string {
  if (val === null || val === undefined || val === '') return '-';
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Number.isInteger(val) ? val.toLocaleString('fullwide', { useGrouping: false }) : BigInt(Math.round(val)).toString();
  }
  let s = String(val).trim();
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(s)) {
    const num = Number(s);
    if (!isNaN(num) && Number.isFinite(num)) {
      try {
        return BigInt(Math.round(num)).toString();
      } catch {
        return num.toLocaleString('fullwide', { useGrouping: false });
      }
    }
  }
  return s || '-';
}

const STORAGE_KEY_DELETED_IDS = 'agent_batara_deleted_tx_ids';
const STORAGE_KEY_RESET_TIMESTAMP = 'agent_batara_last_reset_timestamp';

export function getDeletedTransactionIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_IDS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function addDeletedTransactionId(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedTransactionIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEY_DELETED_IDS, JSON.stringify(Array.from(set).slice(-1000)));
  } catch {}
}

export function clearDeletedTransactionIds(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_DELETED_IDS);
  } catch {}
}

export function removeDeletedTransactionId(id: string): void {
  if (!id) return;
  try {
    const set = getDeletedTransactionIds();
    set.delete(id);
    localStorage.setItem(STORAGE_KEY_DELETED_IDS, JSON.stringify(Array.from(set)));
  } catch {}
}

export function restoreTransactionsLocally(
  transactions: ReceiptData[],
  mode: 'replace' | 'merge' = 'replace'
): ReceiptData[] {
  const set = getDeletedTransactionIds();
  transactions.forEach((t) => {
    if (t.id) set.delete(t.id);
    if (t.idpel) set.delete(t.idpel);
  });
  localStorage.setItem(STORAGE_KEY_DELETED_IDS, JSON.stringify(Array.from(set)));

  if (mode === 'replace') {
    setLastResetTimestamp(0);
    const valid = transactions.filter(isValidTransaction);
    const toSave = valid.slice(0, 1000);
    saveStoredTransactions(toSave);
    try {
      localStorage.setItem('agent_batara_txs', JSON.stringify(toSave));
    } catch {}
    return toSave;
  } else {
    const current = getStoredTransactions();
    const map = new Map<string, ReceiptData>();
    transactions.filter(isValidTransaction).forEach((t) => {
      const id = t.id || `TX-${Date.now()}`;
      map.set(id, t);
    });
    current.filter(isValidTransaction).forEach((t) => {
      const id = t.id || `TX-${Date.now()}`;
      if (!map.has(id)) map.set(id, t);
    });
    const toSave = Array.from(map.values()).slice(0, 1000);
    saveStoredTransactions(toSave);
    try {
      localStorage.setItem('agent_batara_txs', JSON.stringify(toSave));
    } catch {}
    return toSave;
  }
}

export function getLastResetTimestamp(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESET_TIMESTAMP);
    if (raw) return Number(raw) || 0;
  } catch {}
  return 0;
}

export function setLastResetTimestamp(ts: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_RESET_TIMESTAMP, String(ts));
  } catch {}
}

/**
 * Hapus transaksi dari Google Sheets (Cloud)
 * Menjamin ID Transaksi dan ID Pelanggan dicatat ke tombstone agar tidak akan bangkit lagi saat disinkronkan
 */
export async function deleteGoogleSheetTransaction(id: string, idpel?: string): Promise<any> {
  if (!id && !idpel) return;
  if (id) addDeletedTransactionId(id);
  if (idpel && idpel !== '-') addDeletedTransactionId(idpel);

  const url = getStoredGasUrl();
  if (!url) return;
  try {
    return await directGasCall(url, 'deleteTransaction', { id, idpel });
  } catch (err: any) {
    console.warn('Gagal menghapus baris di Google Sheets:', err.message);
  }
}

export function isValidTransaction(t: any): boolean {
  if (!t || typeof t !== 'object') return false;
  const name = String(t.namaPelanggan || '').trim();
  const idpel = String(t.idpel || '').trim();
  const total = Number(t.totalBayar) || Number(t.rpTagihan) || 0;
  if (!name && (idpel === '' || idpel === '-') && total === 0) return false;
  return true;
}

/**
 * Gabung daftar transaksi lokal & cloud tanpa duplikasi,
 * DILENGKAPI FILTER ANTI-BANGKIT (Mencegah transaksi yang sudah dihapus / direset muncul kembali)
 */
export function mergeTransactions(
  localList: ReceiptData[],
  remoteList: ReceiptData[]
): ReceiptData[] {
  const map = new Map<string, ReceiptData>();
  const deletedIds = getDeletedTransactionIds();
  const resetTime = getLastResetTimestamp();

  // Masukkan data remote HANYA jika valid, bukan transaksi yang sudah dihapus, atau sebelum waktu reset
  remoteList.filter(isValidTransaction).forEach((t) => {
    const id = t.id || `TX-${new Date(t.createdAt || Date.now()).getTime()}`;
    // Jika sudah dihapus oleh pengguna, jangan pernah dimasukkan lagi!
    if (deletedIds.has(id)) return;
    if (t.idpel && deletedIds.has(t.idpel)) return;

    // Jika ada waktu reset tutup buku, lewati transaksi lama yang dibuat sebelum waktu reset
    if (resetTime > 0) {
      let tTime = 0;
      if (t.createdAt) {
        tTime = new Date(t.createdAt).getTime();
      }
      if (!tTime && t.id && String(t.id).startsWith('TX-')) {
        const parsedNum = Number(String(t.id).replace('TX-', ''));
        if (!isNaN(parsedNum) && parsedNum > 1000000000) tTime = parsedNum;
      }
      if (tTime > 0 && tTime < resetTime) {
        return; // Lewati data lama sebelum tutup buku!
      }
    }

    map.set(id, { ...t, id, idpel: cleanIdpel(t.idpel) });
  });

  // Masukkan/Pertahankan data lokal (yang valid dan tidak dihapus)
  localList.filter(isValidTransaction).forEach((t) => {
    if (t.id && !deletedIds.has(t.id) && !map.has(t.id)) {
      map.set(t.id, { ...t, idpel: cleanIdpel(t.idpel) });
    }
  });

  // Urutkan dari transaksi terbaru (waktu menurun)
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

let isSyncInProgress = false;

/**
 * SINKRONISASI 2 ARAH CERDAS (TWO-WAY SYNC)
 * 1. Kirim transaksi lokal ke Google Sheets (Sheets menambah yang belum ada).
 * 2. Ambil seluruh data transaksi lengkap dari Google Sheets.
 * 3. Simpan gabungan data ke state & local storage.
 */
export async function executeTwoWaySync(
  customGasUrl?: string,
  currentLocalTxs?: ReceiptData[]
): Promise<{
  success: boolean;
  message: string;
  mergedTransactions: ReceiptData[];
  pushedToSheet: number;
  totalInSheet: number;
}> {
  if (isSyncInProgress) {
    return {
      success: true,
      message: 'Sinkronisasi sedang berlangsung...',
      mergedTransactions: currentLocalTxs || getStoredTransactions(),
      pushedToSheet: 0,
      totalInSheet: currentSyncState.totalInSheet,
    };
  }

  isSyncInProgress = true;
  notifySyncListeners({ status: 'syncing', lastError: null });

  const gasUrl = normalizeGasUrl(customGasUrl || getStoredGasUrl());
  const localList = currentLocalTxs || getStoredTransactions();

  // 1. Coba lewat API backend internal terlebih dahulu
  try {
    const res = await fetch('/api/gas/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl, transactions: localList }),
    });
    const text = await res.text();
    if (text.startsWith('{') || text.startsWith('[')) {
      const data = JSON.parse(text);
      if (data.success) {
        const remoteData: ReceiptData[] = Array.isArray(data.detail?.data)
          ? data.detail.data
          : Array.isArray(data.data)
          ? data.data
          : [];
        
        const merged = mergeTransactions(localList, remoteData);
        saveStoredTransactions(merged);
        const now = new Date().toISOString();
        setLastSyncedTime(now);

        const total = data.totalInSheet ?? merged.length;
        notifySyncListeners(
          {
            status: 'synced',
            lastSyncedAt: now,
            lastError: null,
            totalInSheet: total,
          },
          merged
        );
        isSyncInProgress = false;

        return {
          success: true,
          message: data.message || 'Sinkronisasi 2 arah berhasil dengan Google Sheets!',
          mergedTransactions: merged,
          pushedToSheet: data.pushedToSheet ?? 0,
          totalInSheet: total,
        };
      }
    }
  } catch (backendErr: any) {
    console.warn('Backend proxy sync failed, trying direct sync:', backendErr.message);
  }

  // 2. Fallback: Panggilan langsung ke Google Apps Script
  try {
    const gasRes = await directGasCall(gasUrl, 'twoWaySync', { transactions: localList });
    if (gasRes && gasRes.success) {
      const remoteData: ReceiptData[] = Array.isArray(gasRes.data) ? gasRes.data : [];
      const merged = mergeTransactions(localList, remoteData);
      saveStoredTransactions(merged);
      const now = new Date().toISOString();
      setLastSyncedTime(now);

      const total = gasRes.totalInSheet ?? merged.length;
      notifySyncListeners(
        {
          status: 'synced',
          lastSyncedAt: now,
          lastError: null,
          totalInSheet: total,
        },
        merged
      );
      isSyncInProgress = false;

      return {
        success: true,
        message: 'Sinkronisasi 2 arah berhasil langsung dengan Google Sheets!',
        mergedTransactions: merged,
        pushedToSheet: gasRes.pushedToSheet ?? 0,
        totalInSheet: total,
      };
    }
    throw new Error(gasRes?.error || 'Gagal sinkronisasi');
  } catch (directErr: any) {
    const errMsg = directErr.message || 'Gagal terhubung ke Google Apps Script';
    notifySyncListeners({ status: 'error', lastError: errMsg });
    isSyncInProgress = false;
    throw new Error(errMsg);
  }
}

/**
 * FORCE SYNC / SAMAKAN PERSIS DENGAN GOOGLE SHEETS (MULTI-DEVICE MASTER SYNC)
 * Menghilangkan seluruh pemblokiran lokal (tombstone & waktu reset) sehingga seluruh transaksi
 * aktif dari Google Sheets disalin 100% persis ke memori perangkat ini.
 * Sangat berguna ketika:
 * 1. Pindah ke HP / Laptop / Komputer kasir baru.
 * 2. Perangkat baru saja menghapus semua riwayat secara tidak sengaja.
 * 3. Ingin data lokal dan Google Sheets sama persis tanpa terfilter.
 */
export async function forceSyncWithGoogleSheets(customGasUrl?: string): Promise<{
  success: boolean;
  message: string;
  transactions: ReceiptData[];
  count: number;
}> {
  const gasUrl = normalizeGasUrl(customGasUrl || getStoredGasUrl());
  if (!gasUrl) {
    throw new Error('URL Google Apps Script belum terpasang. Konfigurasi terlebih dahulu di tab Google Sheet.');
  }

  notifySyncListeners({ status: 'syncing', lastError: null });

  // 1. Bersihkan proteksi lokal tombstone & waktu reset
  clearDeletedTransactionIds();
  // Tetap proteksi data sampel palsu lama agar tidak masuk
  addDeletedTransactionId('541293847210');
  addDeletedTransactionId('TRX-85485204');
  setLastResetTimestamp(0);

  let fetchedList: any[] = [];

  // 2. Coba lewat backend /api/gas/force-pull
  try {
    const res = await fetch('/api/gas/force-pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && Array.isArray(json.transactions)) {
        fetchedList = json.transactions;
      }
    }
  } catch (srvErr) {
    console.warn('Backend force-pull failed, falling back to direct GAS:', srvErr);
  }

  // 3. Fallback direct call jika backend gagal
  if (fetchedList.length === 0) {
    try {
      const directRes = await directGasCall(gasUrl, 'getTransactions');
      const rawData = Array.isArray(directRes) ? directRes : (Array.isArray(directRes?.data) ? directRes.data : []);
      fetchedList = rawData;
    } catch (gasErr: any) {
      notifySyncListeners({ status: 'error', lastError: gasErr.message });
      throw gasErr;
    }
  }

  // 4. Normalisasi dan saring
  const normalized: ReceiptData[] = fetchedList
    .filter(isValidTransaction)
    .filter(
      (t) =>
        t.idpel !== '541293847210' &&
        t.id !== 'TRX-85485204' &&
        t.namaPelanggan !== 'BUDI SANTOSO'
    )
    .map((t, idx) => {
      const totalBayar = Number(t.totalBayar) || ((Number(t.rpTagihan) || 0) + (Number(t.adminBank) || 0));
      return {
        ...t,
        id: t.id ? String(t.id) : `TX-SHEET-${idx}`,
        idpel: cleanIdpel(t.idpel),
        rpTagihan: Number(t.rpTagihan) || 0,
        lainLain: Number(t.lainLain) || 0,
        adminBank: Number(t.adminBank) || 0,
        totalBayar,
        status: t.status === 'tidak_aktif' ? 'tidak_aktif' : 'aktif',
        createdAt: t.createdAt || new Date().toISOString(),
      };
    });

  // Simpan secara permanen ke localStorage
  saveStoredTransactions(normalized);
  try {
    localStorage.setItem('agent_batara_txs', JSON.stringify(normalized));
  } catch {}

  const now = new Date().toISOString();
  setLastSyncedTime(now);

  notifySyncListeners(
    {
      status: 'synced',
      lastSyncedAt: now,
      lastError: null,
      totalInSheet: normalized.length,
    },
    normalized
  );

  return {
    success: true,
    message: `SUKSES! Berhasil menyamakan persis ${normalized.length} transaksi dari Google Sheets ke perangkat ini.`,
    transactions: normalized,
    count: normalized.length,
  };
}

/**
 * START BACKGROUND AUTO-SYNC TIMER
 */
export function startAutoSync(
  getCurrentTxs: () => ReceiptData[],
  onUpdate: (merged: ReceiptData[]) => void
) {
  if (autoSyncTimerId) {
    clearInterval(autoSyncTimerId);
    autoSyncTimerId = null;
  }

  if (!isAutoSyncEnabled()) return;

  const runSync = async () => {
    if (!isAutoSyncEnabled()) return;
    try {
      const current = getCurrentTxs();
      const res = await executeTwoWaySync(undefined, current);
      if (res && res.success && Array.isArray(res.mergedTransactions)) {
        onUpdate(res.mergedTransactions);
      }
    } catch (e) {
      // Background auto-sync handles errors silently in state
    }
  };

  currentRunSyncFn = runSync;

  // Run initial auto-sync after 1.5 seconds
  setTimeout(runSync, 1500);

  // Set recurring interval (e.g. 30 seconds)
  const intervalMs = getAutoSyncInterval() * 1000;
  autoSyncTimerId = setInterval(runSync, intervalMs);

  // Also sync on window focus / visibility change
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && isAutoSyncEnabled()) {
      runSync();
    }
  };
  window.addEventListener('focus', handleVisibility);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    if (autoSyncTimerId) {
      clearInterval(autoSyncTimerId);
      autoSyncTimerId = null;
    }
    currentRunSyncFn = null;
    window.removeEventListener('focus', handleVisibility);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

/**
 * Tutup Buku & Arsipkan Google Sheets:
 * Menduplikasi sheet aktif menjadi tab arsip (contoh Arsip_Sep_2026) dan mengosongkan baris data sheet aktif
 */
export async function archiveAndResetGoogleSheet(
  gasUrl?: string,
  monthName?: string
): Promise<{ success: boolean; message: string; archiveTabName?: string; archivedCount?: number }> {
  const url = gasUrl || getStoredGasUrl();
  if (!url) {
    throw new Error('URL Google Apps Script belum diisi');
  }

  // 1. Coba lewat proxy internal backend
  try {
    const pRes = await fetch('/api/gas/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasUrl: url.trim(), periodName: monthName }),
    });
    if (pRes.ok) {
      const data = await pRes.json();
      if (data && data.success) return data;
    }
  } catch {}

  // 2. Fallback Direct GAS Call
  return await directGasCall(url.trim(), 'archiveAndResetMonth', {
    monthName,
    periodName: monthName,
  });
}

