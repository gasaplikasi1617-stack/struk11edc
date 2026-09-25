import { ReceiptData } from '../types';
import { exportTransactionsToExcel } from './exportExcel';
import { directGasCall, getStoredGasUrl } from '../services/gasClientSync';

export interface MonthlyArchiveRecord {
  id: string;
  periodName: string;
  closedAt: string;
  transactionCount: number;
  totalAmount: number;
  totalAdmin: number;
  googleSheetArchived: boolean;
  googleSheetTabName?: string;
  excelBackupFileName?: string;
  jsonBackupFileName?: string;
}

const STORAGE_KEY_ARCHIVES = 'agent_batara_monthly_archives';

export function getStoredArchives(): MonthlyArchiveRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ARCHIVES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Gagal membaca data arsip bulanan dari localStorage:', e);
  }
  return [];
}

export function saveArchiveRecord(record: MonthlyArchiveRecord): void {
  try {
    const existing = getStoredArchives();
    const updated = [record, ...existing.filter((r) => r.id !== record.id)];
    localStorage.setItem(STORAGE_KEY_ARCHIVES, JSON.stringify(updated));
  } catch (e) {
    console.warn('Gagal menyimpan catatan arsip bulanan:', e);
  }
}

export function deleteArchiveRecord(id: string): void {
  try {
    const existing = getStoredArchives();
    const updated = existing.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY_ARCHIVES, JSON.stringify(updated));
  } catch (e) {
    console.warn('Gagal menghapus catatan arsip:', e);
  }
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Mendapatkan nama periode default (contoh: "September 2026")
 */
export function getDefaultPeriodName(date: Date = new Date()): string {
  const m = MONTH_NAMES_ID[date.getMonth()];
  const y = date.getFullYear();
  return `${m} ${y}`;
}

/**
 * Download file backup JSON murni yang dapat di-import kembali sewaktu-waktu
 */
export function downloadJsonBackup(transactions: ReceiptData[], fileName: string, periodName: string): void {
  try {
    const backupPayload = {
      app: 'Agen Batara - Cetak Resi & Pembayaran Tagihan',
      version: '3.0',
      periodName,
      exportedAt: new Date().toISOString(),
      totalTransactions: transactions.length,
      transactions,
    };

    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1500);
  } catch (err) {
    console.error('Gagal mengunduh backup JSON:', err);
  }
}

/**
 * Download file backup Excel (.xlsx) dengan pemformatan rapi
 */
export function downloadExcelBackup(transactions: ReceiptData[], fileName: string, periodName: string): void {
  try {
    const cleanFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    exportTransactionsToExcel(transactions, {
      fileName: cleanFileName,
      sheetName: periodName.slice(0, 30),
      filterDescription: `Tutup Buku Periode: ${periodName} (Total ${transactions.length} Transaksi)`,
      sortDescription: 'Urutan Default Arsip Tutup Buku',
    });
  } catch (err) {
    console.error('Gagal mengunduh backup Excel:', err);
  }
}

export interface RolloverOptions {
  periodName: string;
  transactions: ReceiptData[];
  gasUrl?: string;
  downloadExcel?: boolean;
  downloadJson?: boolean;
  archiveGasSheet?: boolean;
  onProgress?: (message: string) => void;
}

export interface RolloverResult {
  success: boolean;
  message: string;
  excelDownloaded: boolean;
  jsonDownloaded: boolean;
  gasArchived: boolean;
  gasTabName?: string;
  archivedCount: number;
}

/**
 * Eksekusi Tutup Buku Bulanan & Reset Bulan Baru:
 * 1. Unduh backup Excel & JSON
 * 2. Arsipkan sheet aktif di Google Sheets ke tab baru (misal Arsip_Sep_2026) dan kosongkan sheet transaksi aktif
 * 3. Kosongkan data lokal di aplikasi (React state, localStorage, backend server)
 * 4. Simpan riwayat tutup buku ke log arsip
 */
export async function executeMonthlyRollover(options: RolloverOptions): Promise<RolloverResult> {
  const {
    periodName,
    transactions,
    gasUrl = getStoredGasUrl(),
    downloadExcel = true,
    downloadJson = true,
    archiveGasSheet = true,
    onProgress,
  } = options;

  const count = transactions.length;
  const safePeriodTag = periodName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const excelFileName = `Backup_Transaksi_AgenBatara_${safePeriodTag}.xlsx`;
  const jsonFileName = `Backup_Transaksi_AgenBatara_${safePeriodTag}.json`;

  let excelDownloaded = false;
  let jsonDownloaded = false;
  let gasArchived = false;
  let gasTabName: string | undefined;

  // Total perhitungan
  const totalAmount = transactions.reduce((acc, t) => acc + (Number(t.totalBayar) || 0), 0);
  const totalAdmin = transactions.reduce((acc, t) => acc + (Number(t.adminBank) || 0), 0);

  // 1. Download Backup Excel jika ada data
  if (downloadExcel && count > 0) {
    onProgress?.('Mengunduh file laporan Excel (.xlsx)...');
    try {
      downloadExcelBackup(transactions, excelFileName, periodName);
      excelDownloaded = true;
    } catch (e) {
      console.warn('Warning: Gagal download Excel otomatis:', e);
    }
  }

  // 2. Download Backup JSON cadangan jika ada data
  if (downloadJson && count > 0) {
    onProgress?.('Mengunduh file cadangan JSON...');
    try {
      // Tunggu sedikit agar browser tidak memblokir multi-download
      await new Promise((r) => setTimeout(r, 600));
      downloadJsonBackup(transactions, jsonFileName, periodName);
      jsonDownloaded = true;
    } catch (e) {
      console.warn('Warning: Gagal download JSON otomatis:', e);
    }
  }

  // 3. Arsipkan sheet di Google Sheets (jika opsi aktif dan URL GAS tersedia)
  if (archiveGasSheet && gasUrl && gasUrl.trim()) {
    onProgress?.('Mengarsipkan tab di Google Spreadsheet & mengosongkan sheet aktif untuk bulan baru...');
    try {
      let gasRes: any = null;
      // Coba lewat proxy internal server dahulu
      try {
        const pRes = await fetch('/api/gas/archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: gasUrl.trim(), periodName }),
        });
        if (pRes.ok) {
          gasRes = await pRes.json();
        }
      } catch {}

      // Fallback direct GAS call
      if (!gasRes || !gasRes.success) {
        gasRes = await directGasCall(gasUrl.trim(), 'archiveAndResetMonth', {
          periodName,
          monthName: periodName,
        });
      }

      if (gasRes && gasRes.success) {
        gasArchived = true;
        gasTabName = gasRes.archiveTabName;
      }
    } catch (gasErr: any) {
      console.warn('Peringatan arsip Google Sheets:', gasErr.message);
    }
  }

  // 4. Reset data transaksi lokal di server backend
  onProgress?.('Mereset riwayat transaksi lokal aplikasi...');
  try {
    await fetch('/api/transactions/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupPeriod: safePeriodTag }),
    });
  } catch (srvErr) {
    console.warn('Server reset notice (normal di static hosting):', srvErr);
  }

  // 5. Reset data transaksi di localStorage browser
  try {
    localStorage.removeItem('agent_batara_txs');
  } catch {}

  // 6. Simpan catatan riwayat arsip bulanan
  const archiveRecord: MonthlyArchiveRecord = {
    id: `ARCHIVE-${Date.now()}`,
    periodName,
    closedAt: new Date().toISOString(),
    transactionCount: count,
    totalAmount,
    totalAdmin,
    googleSheetArchived: gasArchived,
    googleSheetTabName: gasTabName,
    excelBackupFileName: excelDownloaded ? excelFileName : undefined,
    jsonBackupFileName: jsonDownloaded ? jsonFileName : undefined,
  };
  saveArchiveRecord(archiveRecord);

  onProgress?.('Tutup buku selesai! Aplikasi siap digunakan dengan 0 data untuk bulan baru.');

  return {
    success: true,
    message: `Tutup buku periode ${periodName} berhasil! Data (${count} transaksi) telah dicadangkan dan riwayat aplikasi telah direset menjadi 0 transaksi untuk bulan baru.`,
    excelDownloaded,
    jsonDownloaded,
    gasArchived,
    gasTabName,
    archivedCount: count,
  };
}
