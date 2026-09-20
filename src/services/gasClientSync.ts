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
const STORAGE_KEY_TXS = 'batara_transactions_backup';
const STORAGE_KEY_LAST_SYNC = 'batara_last_synced_at';

export function getStoredGasUrl(): string {
  return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_GAS_URL;
}

export function setStoredGasUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
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

  // 1. Coba POST text/plain (CORS-friendly di browser)
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

  // 2. Coba GET sebagai fallback
  const u = new URL(url);
  u.searchParams.set('action', action);
  if (payload.id) u.searchParams.set('id', String(payload.id));
  const getRes = await fetch(u.toString(), { method: 'GET' });
  const getText = await getRes.text();
  return parseGasRawResponse(getText);
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
    map.set(id, { ...t, id });
  });

  // Masukkan/Pertahankan data lokal
  localList.forEach((t) => {
    if (t.id && !map.has(t.id)) {
      map.set(t.id, t);
    }
  });

  // Urutkan dari transaksi terbaru (waktu menurun)
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}

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

        return {
          success: true,
          message: data.message || 'Sinkronisasi 2 arah berhasil dengan Google Sheets!',
          mergedTransactions: merged,
          pushedToSheet: data.pushedToSheet ?? 0,
          totalInSheet: data.totalInSheet ?? merged.length,
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

      return {
        success: true,
        message: 'Sinkronisasi 2 arah berhasil langsung dengan Google Sheets!',
        mergedTransactions: merged,
        pushedToSheet: gasRes.pushedToSheet ?? 0,
        totalInSheet: gasRes.totalInSheet ?? merged.length,
      };
    }
    throw new Error(gasRes?.error || 'Gagal sinkronisasi');
  } catch (directErr: any) {
    throw new Error(directErr.message || 'Gagal terhubung ke Google Apps Script');
  }
}
