import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  Database,
  ArrowRight,
  Sparkles,
  Layers,
  Calendar,
  Check,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { ReceiptData } from '../types';
import {
  getStoredGasUrl,
  getStoredSheetUrl,
  restoreTransactionsLocally,
  executeTwoWaySync,
  getStoredTransactions,
} from '../services/gasClientSync';
import { formatReceiptDateTime, generateRandomTransactionId } from '../utils/dateFormatter';
import { deduplicateTransactionList } from '../utils/antiDuplicate';

interface RestoreDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete: (restoredCount: number, mode: 'replace' | 'merge') => void;
}

export function RestoreDataModal({
  isOpen,
  onClose,
  onRestoreComplete,
}: RestoreDataModalProps) {
  const [activeTab, setActiveTab] = useState<'json' | 'gas'>('json');
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [syncToGas, setSyncToGas] = useState(true);

  // JSON Upload State
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<ReceiptData[]>([]);
  const [parsedMeta, setParsedMeta] = useState<{
    periodName?: string;
    totalAmount: number;
    count: number;
    fileName?: string;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Google Sheets Pull State
  const [isPullingGas, setIsPullingGas] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);
  const [gasTransactions, setGasTransactions] = useState<ReceiptData[]>([]);
  const [gasMeta, setGasMeta] = useState<{
    periodName?: string;
    totalAmount: number;
    count: number;
  } | null>(null);

  // Processing & Success State
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const gasUrl = getStoredGasUrl();
  const sheetUrl = getStoredSheetUrl();

  // Parse Raw Uploaded JSON File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processJsonFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processJsonFile(file);
  };

  const processJsonFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setParseError('Format file harus berupa file .JSON (file cadangan yang diunduh saat Tutup Buku atau Export)');
      return;
    }

    setParseError(null);
    setJsonFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const json = JSON.parse(text);

        let txList: any[] = [];
        let periodName = '';

        if (Array.isArray(json)) {
          txList = json;
        } else if (json && typeof json === 'object') {
          if (Array.isArray(json.transactions)) {
            txList = json.transactions;
            periodName = json.periodName || '';
          } else if (Array.isArray(json.data)) {
            txList = json.data;
          } else if (json.idpel || json.namaPelanggan) {
            txList = [json];
          }
        }

        if (txList.length === 0) {
          throw new Error('Tidak ditemukan data transaksi di dalam file JSON ini.');
        }

        // Normalize transactions
        const normalized: ReceiptData[] = txList.map((t: any, idx: number) => {
          const totalBayar = Number(t.totalBayar) || (Number(t.rpTagihan) || 0) + (Number(t.adminBank) || 0) || 0;
          return {
            id: t.id ? String(t.id) : `RESTORE-${Date.now()}-${idx}`,
            tanggal: t.tanggal || formatReceiptDateTime(),
            idpel: String(t.idpel || '-'),
            namaPelanggan: String(t.namaPelanggan || 'Pelanggan'),
            pemakaian: String(t.pemakaian || '-'),
            standMeter: String(t.standMeter || '-'),
            rincianTagihan: String(t.rincianTagihan || 'Tagihan Pembayaran'),
            bulanTagihan: String(t.bulanTagihan || '-'),
            rpTagihan: Number(t.rpTagihan) || (totalBayar - (Number(t.adminBank) || 2500)),
            lainLain: Number(t.lainLain) || 0,
            adminBank: Number(t.adminBank) || 2500,
            totalBayar,
            namaAgen: String(t.namaAgen || 'Agen Batara'),
            alamat: String(t.alamat || 'Bekasi'),
            noHp: String(t.noHp || '081234567890'),
            status: t.status === 'tidak_aktif' ? 'tidak_aktif' : 'aktif',
            createdAt: t.createdAt || new Date().toISOString(),
          };
        });

        const { cleaned } = deduplicateTransactionList(normalized);
        const totalAmount = cleaned.reduce((sum, t) => sum + (Number(t.totalBayar) || 0), 0);

        setParsedTransactions(cleaned);
        setParsedMeta({
          periodName,
          totalAmount,
          count: cleaned.length,
          fileName: file.name,
        });
      } catch (err: any) {
        setParseError(`Gagal membaca file JSON: ${err.message || String(err)}`);
        setParsedTransactions([]);
        setParsedMeta(null);
      }
    };
    reader.readAsText(file);
  };

  // Pull All Transactions from Google Sheets for Restore
  const handlePullFromSheets = async () => {
    if (!gasUrl) {
      setGasError('URL Google Apps Script belum terpasang. Konfigurasi terlebih dahulu di tab Google Sheet.');
      return;
    }

    setIsPullingGas(true);
    setGasError(null);

    try {
      // Direct call to GAS bypasses local cutoff
      let fetchedRows: any[] = [];

      // Try internal proxy first
      try {
        const res = await fetch('/api/gas/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: gasUrl.trim() }),
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const json = await res.json();
          if (json && json.success && Array.isArray(json.data)) {
            fetchedRows = json.data;
          }
        }
      } catch (proxyErr) {
        console.warn('Backend /api/gas/pull fallback:', proxyErr);
      }

      // Fallback: direct browser fetch
      if (fetchedRows.length === 0) {
        const cleanUrl = gasUrl.trim();
        const sep = cleanUrl.includes('?') ? '&' : '?';
        const fullUrl = `${cleanUrl}${sep}action=getTransactions&t=${Date.now()}`;
        const directRes = await fetch(fullUrl);
        const text = await directRes.text();
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) fetchedRows = json;
          else if (json && Array.isArray(json.data)) fetchedRows = json.data;
        } catch {
          // If HTML login
          if (text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
            throw new Error('Akses Google Sheets memerlukan izin otorisasi. Pastikan Apps Script di-deploy dengan akses Anyone.');
          }
        }
      }

      if (fetchedRows.length === 0) {
        throw new Error('Tidak ditemukan data transaksi di Google Sheets aktif.');
      }

      // Format pulled data
      const normalized: ReceiptData[] = fetchedRows.map((t: any, idx: number) => {
        const totalBayar = Number(t.totalBayar) || (Number(t.rpTagihan) || 0) + (Number(t.adminBank) || 0) || 0;
        return {
          id: t.id ? String(t.id) : `SHEET-${Date.now()}-${idx}`,
          tanggal: t.tanggal || formatReceiptDateTime(),
          idpel: String(t.idpel || '-'),
          namaPelanggan: String(t.namaPelanggan || 'Pelanggan'),
          pemakaian: String(t.pemakaian || '-'),
          standMeter: String(t.standMeter || '-'),
          rincianTagihan: String(t.rincianTagihan || 'Tagihan Pembayaran'),
          bulanTagihan: String(t.bulanTagihan || '-'),
          rpTagihan: Number(t.rpTagihan) || (totalBayar - (Number(t.adminBank) || 2500)),
          lainLain: Number(t.lainLain) || 0,
          adminBank: Number(t.adminBank) || 2500,
          totalBayar,
          namaAgen: String(t.namaAgen || 'Agen Batara'),
          alamat: String(t.alamat || 'Bekasi'),
          noHp: String(t.noHp || '081234567890'),
          status: t.status === 'tidak_aktif' ? 'tidak_aktif' : 'aktif',
          createdAt: t.createdAt || new Date().toISOString(),
        };
      });

      const { cleaned } = deduplicateTransactionList(normalized);
      const totalAmount = cleaned.reduce((sum, t) => sum + (Number(t.totalBayar) || 0), 0);

      setGasTransactions(cleaned);
      setGasMeta({
        totalAmount,
        count: cleaned.length,
      });
    } catch (err: any) {
      setGasError(err.message || 'Gagal menarik data dari Google Sheets.');
      setGasTransactions([]);
      setGasMeta(null);
    } finally {
      setIsPullingGas(false);
    }
  };

  // Execute Restore
  const handleExecuteRestore = async () => {
    const listToRestore = activeTab === 'json' ? parsedTransactions : gasTransactions;
    if (listToRestore.length === 0) {
      alert('Pilih atau upload data transaksi terlebih dahulu sebelum melakukan restore.');
      return;
    }

    setIsRestoring(true);
    try {
      // 1. Restore Locally in Browser (LocalStorage & Sync Services)
      restoreTransactionsLocally(listToRestore, restoreMode);

      // 2. Call Server Backend to update server data.json & reset tombstones
      try {
        await fetch('/api/transactions/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions: listToRestore,
            mode: restoreMode,
            syncToGas,
          }),
        });
      } catch (srvErr) {
        console.warn('Backend server restore warning (client fallback active):', srvErr);
      }

      // 3. If requested and Google Sheet URL is set, trigger sync
      if (syncToGas && gasUrl) {
        executeTwoWaySync(gasUrl, listToRestore).catch(() => {});
      }

      setRestoreSuccess(
        `Sukses! Berhasil me-restore ${listToRestore.length} transaksi ke riwayat dengan mode ${
          restoreMode === 'replace' ? 'Gantikan Semua (Utuh)' : 'Gabungkan (Merge)'
        }.`
      );

      onRestoreComplete(listToRestore.length, restoreMode);

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      alert(`Terjadi kendala saat me-restore data: ${err.message || String(err)}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const targetList = activeTab === 'json' ? parsedTransactions : gasTransactions;
  const targetMeta = activeTab === 'json' ? parsedMeta : gasMeta;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-700 via-sky-600 to-blue-600 text-white p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs border border-white/20">
              <UploadCloud className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Restore Data Transaksi</h2>
              <p className="text-xs text-sky-100 mt-0.5">
                Pulihkan riwayat transaksi dari file backup JSON atau tarik langsung dari Google Sheets
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={() => setActiveTab('json')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'json'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Upload File Backup JSON</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gas')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'gas'
                  ? 'bg-white text-sky-700 shadow-xs'
                  : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Restore dari Google Sheets</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Success Notice */}
          {restoreSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-3 animate-fade-in shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-semibold">{restoreSuccess}</span>
            </div>
          )}

          {activeTab === 'json' ? (
            /* TAB 1: JSON BACKUP UPLOAD */
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  parsedMeta
                    ? 'border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70'
                    : 'border-slate-300 hover:border-sky-500 bg-slate-50/70 hover:bg-sky-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex flex-col items-center gap-2">
                  <div className={`p-3 rounded-full ${parsedMeta ? 'bg-emerald-100 text-emerald-600' : 'bg-sky-100 text-sky-600'}`}>
                    {parsedMeta ? <Check className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {jsonFile ? jsonFile.name : 'Klik untuk memilih file cadangan JSON atau seret ke sini'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Mendukung file <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700 font-mono">.json</code> yang otomatis diunduh saat Tutup Buku
                    </p>
                  </div>
                </div>
              </div>

              {parseError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: GOOGLE SHEETS RESTORE */
            <div className="space-y-4">
              <div className="p-4 bg-sky-50/60 border border-sky-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-bold text-slate-800">Koneksi Google Sheets</span>
                  </div>
                  {sheetUrl && (
                    <a
                      href={sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-sky-600 hover:text-sky-800 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Buka Spreadsheet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Fitur ini akan menarik seluruh riwayat transaksi yang tersimpan di baris Google Sheets Anda dan memulihkannya kembali ke riwayat aplikasi (bahkan jika riwayat aplikasi pernah di-reset/tutup buku).
                </p>

                <button
                  type="button"
                  onClick={handlePullFromSheets}
                  disabled={isPullingGas || !gasUrl}
                  className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isPullingGas ? 'animate-spin' : ''}`} />
                  <span>{isPullingGas ? 'Menghubungi Google Sheets...' : 'Tarik & Analisis Data dari Google Sheets'}</span>
                </button>
              </div>

              {gasError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{gasError}</span>
                </div>
              )}
            </div>
          )}

          {/* Data Summary Preview */}
          {targetMeta && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Data Siap Direstore ({targetMeta.count} Transaksi Valid)
                  </span>
                </div>
                {targetMeta.periodName && (
                  <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    {targetMeta.periodName}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-emerald-200/60">
                <div>
                  <span className="text-[11px] text-slate-500">Jumlah Transaksi:</span>
                  <p className="font-bold text-slate-800 text-sm">{targetMeta.count} Transaksi</p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Total Nominal Pembayaran:</span>
                  <p className="font-bold text-emerald-700 font-mono text-sm">
                    Rp {targetMeta.totalAmount.toLocaleString('id-ID')}
                  </p>
                </div>
              </div>

              {/* Sample 3 Items Preview */}
              <div className="space-y-1.5 pt-2">
                <p className="text-[11px] font-semibold text-slate-500">Contoh data yang akan dipulihkan:</p>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {targetList.slice(0, 3).map((t, idx) => (
                    <div
                      key={t.id || idx}
                      className="bg-white/80 p-2 rounded-lg border border-emerald-100 flex items-center justify-between text-[11px]"
                    >
                      <div className="truncate pr-2">
                        <span className="font-bold text-slate-800">{t.namaPelanggan}</span>
                        <span className="text-slate-400 mx-1.5">•</span>
                        <span className="text-slate-500">{t.idpel}</span>
                        <span className="text-slate-400 mx-1.5">•</span>
                        <span className="text-slate-500">{t.rincianTagihan}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-700 shrink-0">
                        Rp {Number(t.totalBayar || 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Restore Configuration Settings */}
          {targetMeta && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800">Pengaturan Metode Restore:</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    restoreMode === 'replace'
                      ? 'border-sky-500 bg-sky-50/40 text-sky-900 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    value="replace"
                    checked={restoreMode === 'replace'}
                    onChange={() => setRestoreMode('replace')}
                    className="mt-0.5 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">Gantikan Semua (Replace)</span>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                      Ganti seluruh data riwayat aktif dengan data ini. Cocok setelah Tutup Buku bulanan.
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    restoreMode === 'merge'
                      ? 'border-sky-500 bg-sky-50/40 text-sky-900 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="restoreMode"
                    value="merge"
                    checked={restoreMode === 'merge'}
                    onChange={() => setRestoreMode('merge')}
                    className="mt-0.5 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">Gabungkan (Merge)</span>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                      Tambahkan ke riwayat yang sudah ada tanpa menduplikasi data yang identik.
                    </span>
                  </div>
                </label>
              </div>

              {/* Sync to Google Sheets Checkbox */}
              {gasUrl && (
                <label className="flex items-center gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all mt-2">
                  <input
                    type="checkbox"
                    checked={syncToGas}
                    onChange={(e) => setSyncToGas(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    Otomatis sinkronkan juga data yang dipulihkan ke spreadsheet Google Sheets
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isRestoring}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleExecuteRestore}
              disabled={isRestoring || targetList.length === 0}
              className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
              <span>
                {isRestoring
                  ? 'Memulihkan Data...'
                  : targetList.length > 0
                  ? `Restore ${targetList.length} Transaksi Sekarang`
                  : 'Pilih Data Terlebih Dahulu'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
