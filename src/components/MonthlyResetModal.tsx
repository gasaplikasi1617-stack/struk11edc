import React, { useState } from 'react';
import {
  Archive,
  Download,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  History,
  Info,
  Calendar,
  Layers,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { ReceiptData } from '../types';
import {
  getDefaultPeriodName,
  getStoredArchives,
  executeMonthlyRollover,
  downloadExcelBackup,
  downloadJsonBackup,
  MonthlyArchiveRecord,
  RolloverResult,
} from '../utils/monthlyArchive';
import { getStoredGasUrl } from '../services/gasClientSync';

interface MonthlyResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: ReceiptData[];
  onResetComplete: (result: RolloverResult) => void;
}

export function MonthlyResetModal({
  isOpen,
  onClose,
  transactions,
  onResetComplete,
}: MonthlyResetModalProps) {
  const [activeTab, setActiveTab] = useState<'reset' | 'history'>('reset');
  const [periodName, setPeriodName] = useState(getDefaultPeriodName());
  const [downloadExcel, setDownloadExcel] = useState(true);
  const [downloadJson, setDownloadJson] = useState(true);
  const [archiveGasSheet, setArchiveGasSheet] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [successResult, setSuccessResult] = useState<RolloverResult | null>(null);
  const [archivesList, setArchivesList] = useState<MonthlyArchiveRecord[]>(getStoredArchives());

  if (!isOpen) return null;

  const totalAmount = transactions.reduce((acc, t) => acc + (Number(t.totalBayar) || 0), 0);
  const totalAdmin = transactions.reduce((acc, t) => acc + (Number(t.adminBank) || 0), 0);
  const gasUrl = getStoredGasUrl();

  const handleManualExcelDownload = () => {
    const safeTag = periodName.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadExcelBackup(transactions, `Laporan_Transaksi_${safeTag}.xlsx`, periodName);
  };

  const handleManualJsonDownload = () => {
    const safeTag = periodName.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadJsonBackup(transactions, `Backup_Transaksi_${safeTag}.json`, periodName);
  };

  const handleExecuteRollover = async () => {
    if (transactions.length === 0) {
      if (!confirm('Riwayat transaksi saat ini sudah 0. Apakah Anda tetap ingin membuat arsip dan mereset periode?')) {
        return;
      }
    }

    setIsProcessing(true);
    setProgressMsg('Memulai proses tutup buku bulanan...');

    try {
      const result = await executeMonthlyRollover({
        periodName: periodName.trim() || getDefaultPeriodName(),
        transactions,
        gasUrl,
        downloadExcel,
        downloadJson,
        archiveGasSheet,
        onProgress: (msg) => setProgressMsg(msg),
      });

      setSuccessResult(result);
      setArchivesList(getStoredArchives());
      onResetComplete(result);
    } catch (err: any) {
      alert(`Terjadi kesalahan saat tutup buku: ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 text-white p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            title="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs border border-white/20">
              <Archive className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">Tutup Buku & Reset Bulan Baru</h2>
              <p className="text-xs sm:text-sm text-indigo-100 mt-0.5">
                Amankan data riwayat lama, dan mulai bulan berikutnya fresh dengan 0 data transaksi.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-white/15">
            <button
              onClick={() => setActiveTab('reset')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'reset'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tutup Buku Periode Ini</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                setArchivesList(getStoredArchives());
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Arsip ({archivesList.length})</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {activeTab === 'reset' ? (
            <>
              {/* Success Result View */}
              {successResult ? (
                <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-4 animate-fade-in text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-emerald-900">
                        Tutup Buku Berhasil Diselesaikan!
                      </h3>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        {successResult.message}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-emerald-100 text-xs text-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Jumlah Transaksi Diarsipkan:</span>
                      <span className="font-bold text-slate-800">{successResult.archivedCount} Transaksi</span>
                    </div>
                    {successResult.excelDownloaded && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">File Backup Excel (.xlsx):</span>
                        <span className="font-semibold text-emerald-700">✓ Berhasil diunduh</span>
                      </div>
                    )}
                    {successResult.jsonDownloaded && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">File Cadangan JSON:</span>
                        <span className="font-semibold text-emerald-700">✓ Berhasil diunduh</span>
                      </div>
                    )}
                    {successResult.gasArchived && successResult.gasTabName && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Tab Arsip di Google Sheets:</span>
                        <span className="font-bold font-mono text-indigo-700">'{successResult.gasTabName}'</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-500">Status Riwayat Aplikasi Saat Ini:</span>
                      <span className="font-bold text-emerald-600 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                        0 Transaksi (Fresh)
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={onClose}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Selesai & Mulai Bulan Baru
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Current Active Statistics Banner */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/80">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-600" />
                        Ringkasan Data Transaksi Aktif Saat Ini
                      </span>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                        {transactions.length} Transaksi
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500 text-[11px]">Total Transaksi</p>
                        <p className="text-base font-bold text-slate-800 font-mono">{transactions.length}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[11px]">Total Perputaran Uang</p>
                        <p className="text-sm font-bold text-emerald-600 font-mono">
                          Rp {totalAmount.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-slate-500 text-[11px]">Total Admin Bank</p>
                        <p className="text-sm font-bold text-amber-600 font-mono">
                          Rp {totalAdmin.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Period Name Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                      Label / Nama Periode Bulan Ini yang Ditutup
                    </label>
                    <input
                      type="text"
                      value={periodName}
                      onChange={(e) => setPeriodName(e.target.value)}
                      placeholder="Contoh: September 2026"
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                    />
                    <p className="text-[11px] text-slate-500">
                      Nama ini akan digunakan sebagai nama file backup dan nama tab arsip di Google Sheets (contoh: <code>Arsip_Sep_2026</code>).
                    </p>
                  </div>

                  {/* Safety & Workflow Explanation */}
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 space-y-2.5 text-xs text-slate-700">
                    <div className="flex items-center gap-2 font-bold text-indigo-900">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span>Alur Tutup Buku Otomatis & Aman (Berulang Selamanya Tanpa Error):</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                      <li>
                        <strong>File Backup Otomatis Terunduh:</strong> Seluruh rincian transaksi bulan ini langsung diekspor rapi ke file <strong>Excel (.xlsx)</strong> dan cadangan <strong>JSON</strong>.
                      </li>
                      <li>
                        <strong>Google Sheets Diarsipkan:</strong> Jika terhubung ke Google Sheets, sheet aktif disalin ke tab baru (contoh: <code>Arsip_{periodName.slice(0, 8)}</code>). Data transaksi di tab utama kemudian dikosongkan untuk bulan baru.
                      </li>
                      <li>
                        <strong>Riwayat Aplikasi Kembali 0:</strong> Data lokal direset menjadi 0 transaksi. Karena sheet aktif di Google Sheets juga kosong, <strong>sinkronisasi 2 arah tidak akan memunculkan data lama lagi</strong>!
                      </li>
                    </ol>
                  </div>

                  {/* Checkbox Options */}
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-700">Pilihan Tindakan Otomatis:</p>
                    <div className="space-y-2 text-xs text-slate-600">
                      <label className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={downloadExcel}
                          onChange={(e) => setDownloadExcel(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Otomatis unduh laporan Excel (.xlsx) rapi lengkap</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={downloadJson}
                          onChange={(e) => setDownloadJson(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>Otomatis unduh file cadangan JSON (dapat di-restore sewaktu-waktu)</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={archiveGasSheet}
                          onChange={(e) => setArchiveGasSheet(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <Archive className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>
                          Arsipkan tab di Google Sheets & kosongkan sheet aktif (mencegah data lama muncul kembali)
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Manual Quick Download Buttons */}
                  {transactions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[11px] text-slate-500">Unduh manual terlebih dahulu:</span>
                      <button
                        type="button"
                        onClick={handleManualExcelDownload}
                        className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Unduh Excel Sekarang</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleManualJsonDownload}
                        className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh JSON</span>
                      </button>
                    </div>
                  )}

                  {/* Progress Indicator */}
                  {isProcessing && (
                    <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs flex items-center gap-3 animate-pulse">
                      <RotateCcw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                      <span className="font-semibold">{progressMsg}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isProcessing}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteRollover}
                      disabled={isProcessing}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <RotateCcw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                      <span>{isProcessing ? 'Memproses Tutup Buku...' : 'Konfirmasi Tutup Buku & Mulai 0 Data'}</span>
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            /* History of Archives Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Daftar Arsip Tutup Buku Sebelumnya</h3>
                  <p className="text-xs text-slate-500">Catatan riwayat bulan-bulan yang telah ditutup buku.</p>
                </div>
              </div>

              {archivesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-2 border border-dashed border-slate-200 rounded-2xl">
                  <Archive className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-medium text-slate-500">Belum ada catatan tutup buku sebelumnya.</p>
                  <p className="text-[11px] text-slate-400">
                    Saat Anda melakukan tutup buku di akhir bulan, riwayat arsip akan otomatis tercatat di sini.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {archivesList.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-4 bg-slate-50 hover:bg-indigo-50/40 border border-slate-200 rounded-2xl transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                            <Calendar className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-bold text-slate-800">{rec.periodName}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(rec.closedAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-200/60">
                        <div>
                          <span className="text-[11px] text-slate-500">Total Transaksi:</span>
                          <p className="font-bold text-slate-800">{rec.transactionCount} Transaksi</p>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500">Total Pembayaran:</span>
                          <p className="font-bold text-emerald-600 font-mono">
                            Rp {rec.totalAmount.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <span className="text-[11px] text-slate-500">Google Sheets:</span>
                          <p className="font-medium text-indigo-700 font-mono">
                            {rec.googleSheetArchived && rec.googleSheetTabName ? `Tab: ${rec.googleSheetTabName}` : 'Tidak terkoneksi'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
