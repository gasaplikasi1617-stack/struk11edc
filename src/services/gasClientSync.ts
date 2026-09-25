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
      if (Array.isArray(parsed)) return parsed;
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

/**
 * Gabung daftar transaksi lokal & cloud tanpa duplikasi
 */
export function mergeTransactions(
  localList: ReceiptData[],
  remoteList: ReceiptData[]
): ReceiptData[] {
  const map = new Map<string, ReceiptData>();

  // Masukkan data remote
  remoteList.forEach((t) => {
    const id = t.id || `TX-${new Date(t.createdAt || Date.now()).getTime()}`;
    map.set(id, { ...t, id, idpel: cleanIdpel(t.idpel) });
  });

  // Masukkan/Pertahankan data lokal
  localList.forEach((t) => {
    if (t.id && !map.has(t.id)) {
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
