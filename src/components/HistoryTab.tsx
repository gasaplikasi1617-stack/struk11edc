import React, { useState, useMemo, useEffect } from 'react';
import { ReceiptData } from '../types';
import {
  History,
  Search,
  Printer,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  Download,
  Filter,
  CheckCircle2,
  Receipt,
  Wallet,
  Building2,
  AlertCircle,
  RefreshCw,
  Database,
  Image as ImageIcon,
  ShieldCheck,
  Share2,
  Copy,
  Check,
  ExternalLink,
  X,
  MessageSquare,
} from 'lucide-react';
import { exportTransactionsToExcel } from '../utils/exportExcel';
import { getTransactionCategory, getCategoryLabel, BillCategory } from '../utils/billParser';
import { drawReceiptToCanvas, drawDotMatrixToCanvas } from '../utils/receiptCanvasDrawer';
import { executeTwoWaySync } from '../services/gasClientSync';
import {
  formatReceiptForWhatsApp,
  getWhatsAppShareUrl,
  copyImageBlobToClipboard,
  copyTextToClipboard,
} from '../utils/whatsappFormatter';

interface HistoryTabProps {
  transactions: ReceiptData[];
  onSelectTransaction: (tx: ReceiptData) => void;
  onDeleteTransaction: (id: string, tx?: ReceiptData) => void;
  onClearAllTransactions?: () => void;
  onRefreshTransactions?: () => Promise<void> | void;
  onNavigateToGasTab?: () => void;
}

type ServiceFilterType = 'all' | BillCategory;

type SortCriterion =
  | 'date-desc'
  | 'date-asc'
  | 'name-asc'
  | 'name-desc'
  | 'total-desc'
  | 'total-asc'
  | 'idpel-asc'
  | 'idpel-desc'
  | 'service-asc'
  | 'service-desc';

function getTransactionTimestamp(tx: ReceiptData): number {
  if (tx.createdAt) {
    const t = new Date(tx.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (tx.id && tx.id.startsWith('TX-')) {
    const num = Number(tx.id.replace('TX-', ''));
    if (!isNaN(num) && num > 1000000) return num;
  }
  if (tx.tanggal) {
    const parts = tx.tanggal.split(/[/.-]/);
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      const t = new Date(y, m, d).getTime();
      if (!isNaN(t)) return t;
    }
  }
  return 0;
}

interface PngActionModalData {
  tx: ReceiptData;
  dataUrl: string;
  blob: Blob | null;
  fileName: string;
  layout: 'dotmatrix' | 'a6';
}

export function HistoryTab({
  transactions,
  onSelectTransaction,
  onDeleteTransaction,
  onClearAllTransactions,
  onRefreshTransactions,
  onNavigateToGasTab,
}: HistoryTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState<ServiceFilterType>('all');
  const [sortCriterion, setSortCriterion] = useState<SortCriterion>('date-desc');
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);
  const [isSyncingGas, setIsSyncingGas] = useState(false);

  // PNG & WhatsApp Modal State
  const [pngModal, setPngModal] = useState<PngActionModalData | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied-img' | 'copied-text'>('idle');
  const [targetWaPhone, setTargetWaPhone] = useState('');

  // Close modal on Escape key
  useEffect(() => {
    if (!pngModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPngModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pngModal]);

  const handleGasSyncClick = async () => {
    setIsSyncingGas(true);
    try {
      const res = await executeTwoWaySync(undefined, transactions);
      setExportSuccessNotice(res.message);
      if (onRefreshTransactions) {
        await onRefreshTransactions();
      }
    } catch (e: any) {
      setExportSuccessNotice(`Gagal sinkron: ${e.message}`);
    } finally {
      setIsSyncingGas(false);
      setTimeout(() => setExportSuccessNotice(null), 6000);
    }
  };

  const [isDeduplicating, setIsDeduplicating] = useState(false);

  const handleDeduplicate = async () => {
    setIsDeduplicating(true);
    try {
      const res = await fetch('/api/transactions/deduplicate', { method: 'POST' });
      const data = await res.json();
      if (onRefreshTransactions) {
        await onRefreshTransactions();
      }
      setExportSuccessNotice(data.message || 'Pemeriksaan anti-duplikat selesai.');
    } catch (err: any) {
      setExportSuccessNotice('Gagal membersihkan duplikat: ' + (err.message || String(err)));
    } finally {
      setIsDeduplicating(false);
      setTimeout(() => setExportSuccessNotice(null), 5000);
    }
  };

  const switchPngModalLayout = (newLayout: 'dotmatrix' | 'a6') => {
    if (!pngModal) return;
    try {
      const tx = pngModal.tx;
      const canvas = newLayout === 'dotmatrix' ? drawDotMatrixToCanvas(tx) : drawReceiptToCanvas(tx);
      const safeId = (tx.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
      const safeName = (tx.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = (tx.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
      const fileName = newLayout === 'dotmatrix'
        ? `Struk_DotMatrix_Bukopin_${safeId}_${safeName}_${dateStr}.png`
        : `Struk_${safeId}_${safeName}_${dateStr}.png`;
      const dataUrl = canvas.toDataURL('image/png');

      canvas.toBlob((blob) => {
        setPngModal({
          tx,
          dataUrl,
          blob: blob || null,
          fileName,
          layout: newLayout,
        });
      }, 'image/png');
    } catch (err) {
      console.error('Error switching modal layout:', err);
    }
  };

  const handleOpenPngModal = (tx: ReceiptData, autoDownload = true) => {
    try {
      // Default ke Dot Matrix 21,6 x 6,95 cm horizontal
      const canvas = drawDotMatrixToCanvas(tx);
      const safeId = (tx.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
      const safeName = (tx.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = (tx.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
      const fileName = `Struk_DotMatrix_Bukopin_${safeId}_${safeName}_${dateStr}.png`;
      const dataUrl = canvas.toDataURL('image/png');

      canvas.toBlob((blob) => {
        setPngModal({
          tx,
          dataUrl,
          blob: blob || null,
          fileName,
          layout: 'dotmatrix',
        });
      }, 'image/png');

      setTargetWaPhone(tx.noHp || '');
      setCopyStatus('idle');

      // Attempt immediate direct browser download
      if (autoDownload) {
        try {
          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = dataUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
          }, 1200);
        } catch (dlErr) {
          console.warn('Auto download error, fallback modal ready:', dlErr);
        }
      }

      setExportSuccessNotice(`Gambar struk Dot Matrix Bukopin untuk "${tx.namaPelanggan || 'transaksi'}" siap!`);
      setTimeout(() => setExportSuccessNotice(null), 4000);
    } catch (err: any) {
      setExportSuccessNotice(`Gagal menyiapkan gambar struk: ${err.message}`);
    }
  };

  const handleCopyPngImage = async () => {
    if (!pngModal) return;
    let ok = false;
    if (pngModal.blob) {
      ok = await copyImageBlobToClipboard(pngModal.blob);
    }
    if (ok) {
      setCopyStatus('copied-img');
      setExportSuccessNotice('Gambar struk PNG berhasil disalin! Silakan langsung Paste (Ctrl+V) di chat WhatsApp.');
      setTimeout(() => setCopyStatus('idle'), 3500);
    } else {
      // Fallback: copy formatted WhatsApp text
      const waText = formatReceiptForWhatsApp(pngModal.tx);
      const textOk = await copyTextToClipboard(waText);
      if (textOk) {
        setCopyStatus('copied-text');
        setExportSuccessNotice('Browser membatasi salin gambar langsung. Teks rincian WhatsApp telah disalin! Tinggal Paste di WA.');
        setTimeout(() => setCopyStatus('idle'), 4000);
      } else {
        setExportSuccessNotice('Gunakan tombol "Buka Gambar di Tab Baru" lalu klik kanan Salin Gambar.');
      }
    }
  };

  const handleSendViaWhatsApp = () => {
    if (!pngModal) return;
    const url = getWhatsAppShareUrl(pngModal.tx, targetWaPhone);
    window.open(url, '_blank');
  };

  const handleCopyWaText = async () => {
    if (!pngModal) return;
    const waText = formatReceiptForWhatsApp(pngModal.tx);
    const ok = await copyTextToClipboard(waText);
    if (ok) {
      setCopyStatus('copied-text');
      setExportSuccessNotice('Format teks struk WhatsApp berhasil disalin ke clipboard!');
      setTimeout(() => setCopyStatus('idle'), 3000);
    }
  };

  // Category counts across all transactions
  const categoryCounts = useMemo(() => {
    const counts: Record<ServiceFilterType, number> = {
      all: transactions.length,
      pln: 0,
      pdam: 0,
      bpjs: 0,
      telkom: 0,
      pascabayar: 0,
      other: 0,
    };
    for (const t of transactions) {
      const cat = getTransactionCategory(t);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [transactions]);

  // Filter transactions by search term and expanded service categories
  const filteredList = useMemo(() => {
    return transactions.filter((t) => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        (t.id && t.id.toLowerCase().includes(q)) ||
        (t.idpel && t.idpel.toLowerCase().includes(q)) ||
        (t.namaPelanggan && t.namaPelanggan.toLowerCase().includes(q)) ||
        (t.rincianTagihan && t.rincianTagihan.toLowerCase().includes(q)) ||
        (t.bulanTagihan && t.bulanTagihan.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (serviceFilter === 'all') return true;

      const cat = getTransactionCategory(t);
      return cat === serviceFilter;
    });
  }, [transactions, searchTerm, serviceFilter]);

  // Sort filtered transactions based on selected criterion
  const sortedAndFiltered = useMemo(() => {
    const list = [...filteredList];

    list.sort((a, b) => {
      switch (sortCriterion) {
        case 'date-desc':
          return getTransactionTimestamp(b) - getTransactionTimestamp(a);
        case 'date-asc':
          return getTransactionTimestamp(a) - getTransactionTimestamp(b);
        case 'name-asc':
          return (a.namaPelanggan || '').localeCompare(b.namaPelanggan || '', 'id');
        case 'name-desc':
          return (b.namaPelanggan || '').localeCompare(a.namaPelanggan || '', 'id');
        case 'total-desc':
          return (Number(b.totalBayar) || 0) - (Number(a.totalBayar) || 0);
        case 'total-asc':
          return (Number(a.totalBayar) || 0) - (Number(b.totalBayar) || 0);
        case 'idpel-asc':
          return (a.idpel || '').localeCompare(b.idpel || '', undefined, { numeric: true });
        case 'idpel-desc':
          return (b.idpel || '').localeCompare(a.idpel || '', undefined, { numeric: true });
        case 'service-asc':
          return (a.rincianTagihan || '').localeCompare(b.rincianTagihan || '', 'id');
        case 'service-desc':
          return (b.rincianTagihan || '').localeCompare(a.rincianTagihan || '', 'id');
        default:
          return 0;
      }
    });

    return list;
  }, [filteredList, sortCriterion]);

  // Quick toggle column sort when clicking on table header
  const handleColumnSortClick = (field: 'date' | 'name' | 'idpel' | 'service' | 'total') => {
    if (field === 'date') {
      setSortCriterion((prev) => (prev === 'date-desc' ? 'date-asc' : 'date-desc'));
    } else if (field === 'name') {
      setSortCriterion((prev) => (prev === 'name-asc' ? 'name-desc' : 'name-asc'));
    } else if (field === 'idpel') {
      setSortCriterion((prev) => (prev === 'idpel-asc' ? 'idpel-desc' : 'idpel-asc'));
    } else if (field === 'service') {
      setSortCriterion((prev) => (prev === 'service-asc' ? 'service-desc' : 'service-asc'));
    } else if (field === 'total') {
      setSortCriterion((prev) => (prev === 'total-desc' ? 'total-asc' : 'total-desc'));
    }
  };

  // Helper to render sort icon on table headers
  const renderSortIndicator = (field: 'date' | 'name' | 'idpel' | 'service' | 'total') => {
    const isCurrent = sortCriterion.startsWith(field);
    if (!isCurrent) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100" />;
    }
    const isAsc = sortCriterion.endsWith('-asc');
    return isAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold" />
    );
  };

  // Export to Excel with current sorting & filtering
  const handleExportToExcel = () => {
    if (sortedAndFiltered.length === 0) {
      alert('Tidak ada data transaksi yang dapat diekspor.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const filterTag = serviceFilter === 'all' ? 'Semua' : getCategoryLabel(serviceFilter).replace(/[\/\s]+/g, '_');
    const fileName = `Riwayat_${filterTag}_${todayStr}.xlsx`;
    const sheetName = serviceFilter === 'all' ? 'Riwayat Semua Transaksi' : `Riwayat ${getCategoryLabel(serviceFilter)}`;

    exportTransactionsToExcel(sortedAndFiltered, {
      fileName,
      sheetName,
    });

    setExportSuccessNotice(
      `Berhasil mengekspor ${sortedAndFiltered.length} transaksi ke ${fileName} (sesuai urutan sortir & kriteria aktif).`
    );
    setTimeout(() => {
      setExportSuccessNotice(null);
    }, 4500);
  };

  // Compute summary stats for the current list
  const totalOmset = useMemo(() => {
    return sortedAndFiltered.reduce((sum, t) => sum + (Number(t.totalBayar) || 0), 0);
  }, [sortedAndFiltered]);

  const totalAdmin = useMemo(() => {
    return sortedAndFiltered.reduce((sum, t) => sum + (Number(t.adminBank) || 0), 0);
  }, [sortedAndFiltered]);

  return (
    <div className="space-y-6">
      {/* Header & Stats Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History className="w-6 h-6 text-blue-600" />
              <span>Riwayat Transaksi (Maksimal 100 Transaksi)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Data transaksi otomatis tersimpan hingga 100 data terakhir. Anda dapat menyortir kriteria sebelum mengekspor ke Excel.
            </p>
          </div>

          {/* Export to Excel, Anti-Duplicate & GAS Two-Way Sync Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-deduplicate-history"
              onClick={handleDeduplicate}
              disabled={isDeduplicating || transactions.length === 0}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold px-3.5 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all"
              title="Periksa dan pastikan tidak ada data transaksi yang dobel di riwayat"
            >
              <ShieldCheck className={`w-4 h-4 ${isDeduplicating ? 'animate-pulse' : ''}`} />
              <span>{isDeduplicating ? 'Memeriksa...' : 'Anti-Duplikat'}</span>
            </button>

            <button
              id="btn-gas-sync-history"
              onClick={handleGasSyncClick}
              disabled={isSyncingGas}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-2 transition-all"
              title="Sinkronisasi 2 arah dengan Google Sheets"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingGas ? 'animate-spin' : ''}`} />
              <span>{isSyncingGas ? 'Sinkronisasi...' : 'Sinkron 2 Arah Sheets'}</span>
            </button>

            <button
              id="btn-export-excel"
              onClick={handleExportToExcel}
              disabled={sortedAndFiltered.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-2 transition-all"
              title="Export riwayat transaksi ke format Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export ke Excel (.xlsx)</span>
              {sortedAndFiltered.length > 0 && (
                <span className="bg-emerald-700/60 text-emerald-100 text-xs px-2 py-0.5 rounded-full font-mono">
                  {sortedAndFiltered.length}
                </span>
              )}
            </button>

            {onClearAllTransactions && transactions.length > 0 && (
              <button
                id="btn-clear-all-history"
                onClick={onClearAllTransactions}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-sm font-semibold px-3.5 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all"
                title="Hapus semua riwayat transaksi secara permanen (Lokal & Google Sheets)"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Hapus Semua</span>
              </button>
            )}
          </div>
        </div>

        {/* Info Banner: Permanent Deletion Protection */}
        <div className="mt-4 p-3 bg-blue-50/70 border border-blue-100 text-blue-900 rounded-xl text-xs flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <span className="font-bold">Proteksi Hapus Permanen Aktif:</span> Menghapus transaksi akan otomatis membersihkan baris di Google Sheets dan mencatat ID ke sistem blacklist agar data terhapus <span className="font-semibold text-blue-700 underline">tidak akan pernah masuk kembali saat sinkronisasi 2 arah</span>.
          </div>
        </div>

        {/* Success Alert for Export */}
        {exportSuccessNotice && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 shadow-xs transition-all animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{exportSuccessNotice}</span>
          </div>
        )}

        {/* Stat Summary Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Kapasitas Riwayat</p>
              <p className="text-sm font-bold text-slate-800">
                {transactions.length} <span className="text-slate-400 font-normal text-xs">/ 100 Transaksi</span>
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total Pembayaran (Aktif)</p>
              <p className="text-sm font-bold text-emerald-700">
                Rp {totalOmset.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-amber-100 text-amber-700 p-2 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total Admin Bank (Aktif)</p>
              <p className="text-sm font-bold text-amber-700">
                Rp {totalAdmin.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </div>

        {/* Filter and Sort Criteria Control Bar */}
        <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="input-search-history"
                type="text"
                placeholder="Cari ID Transaksi, Nama, IDPEL, Layanan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none w-full bg-white text-slate-800 shadow-2xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sort Criteria Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
                <ArrowUpDown className="w-4 h-4 text-blue-600 shrink-0" />
                <label htmlFor="select-sort-criteria" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                  Urutkan Berdasarkan:
                </label>
                <select
                  id="select-sort-criteria"
                  value={sortCriterion}
                  onChange={(e) => setSortCriterion(e.target.value as SortCriterion)}
                  className="text-xs font-medium text-slate-800 bg-transparent outline-none cursor-pointer pr-1"
                >
                  <option value="date-desc">📅 Tanggal Transaksi (Terbaru → Terlama)</option>
                  <option value="date-asc">📅 Tanggal Transaksi (Terlama → Terbaru)</option>
                  <option value="name-asc">👤 Nama Pelanggan (A → Z)</option>
                  <option value="name-desc">👤 Nama Pelanggan (Z → A)</option>
                  <option value="total-desc">💰 Total Bayar (Tertinggi → Terendah)</option>
                  <option value="total-asc">💰 Total Bayar (Terendah → Tertinggi)</option>
                  <option value="idpel-asc">🔢 ID Pelanggan (0 → 9)</option>
                  <option value="idpel-desc">🔢 ID Pelanggan (9 → 0)</option>
                  <option value="service-asc">⚡ Jenis Layanan (A → Z)</option>
                  <option value="service-desc">⚡ Jenis Layanan (Z → A)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Category Service Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter:
            </span>
            <button
              onClick={() => setServiceFilter('all')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>Semua</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.all}
              </span>
            </button>
            <button
              onClick={() => setServiceFilter('pln')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'pln'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>Listrik / PLN</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'pln' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.pln}
              </span>
            </button>
            <button
              onClick={() => setServiceFilter('pdam')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'pdam'
                  ? 'bg-cyan-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>PDAM / Air</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'pdam' ? 'bg-cyan-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.pdam}
              </span>
            </button>
            <button
              onClick={() => setServiceFilter('bpjs')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'bpjs'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>BPJS</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'bpjs' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.bpjs}
              </span>
            </button>
            <button
              onClick={() => setServiceFilter('telkom')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'telkom'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>Speedy / Telkom</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'telkom' ? 'bg-rose-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.telkom}
              </span>
            </button>
            <button
              onClick={() => setServiceFilter('pascabayar')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'pascabayar'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>Paskabayar Baru</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'pascabayar' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.pascabayar}
              </span>
            </button>
            <button
              onClick={() => setServiceFilter('other')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 ${
                serviceFilter === 'other'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <span>Lain-lain</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${serviceFilter === 'other' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {categoryCounts.other}
              </span>
            </button>
          </div>
        </div>

        {/* Transactions Table with Sortable Columns */}
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm text-slate-800">
              Daftar Transaksi ({sortedAndFiltered.length} dari {transactions.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              *Klik pada header kolom untuk menyortir urutan langsung.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider select-none">
                  <th className="p-3 w-12 text-center">No</th>
                  <th
                    onClick={() => handleColumnSortClick('date')}
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk sortir tanggal"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Tanggal</span>
                      {renderSortIndicator('date')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleColumnSortClick('idpel')}
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk sortir ID Pelanggan"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>ID Pelanggan</span>
                      {renderSortIndicator('idpel')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleColumnSortClick('name')}
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk sortir Nama"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Nama Pelanggan</span>
                      {renderSortIndicator('name')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleColumnSortClick('service')}
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors group"
                    title="Klik untuk sortir Jenis Layanan"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Layanan & Periode</span>
                      {renderSortIndicator('service')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleColumnSortClick('total')}
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors group text-right"
                    title="Klik untuk sortir Total Bayar"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Total Bayar</span>
                      {renderSortIndicator('total')}
                    </div>
                  </th>
                  <th className="p-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sortedAndFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-slate-300" />
                        <p className="text-sm font-medium">Tidak ada data transaksi yang sesuai.</p>
                        <p className="text-xs text-slate-400">
                          {transactions.length === 0
                            ? 'Belum ada transaksi tersimpan. Buat dan simpan resi pertama Anda!'
                            : 'Coba ubah kata kunci pencarian atau filter kategori.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedAndFiltered.map((tx, idx) => (
                    <tr key={tx.id || idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 text-center text-xs font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3">
                        <p className="text-xs font-semibold text-slate-800">{tx.tanggal}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {tx.id || '-'}
                        </p>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800 text-xs">
                        {tx.idpel || '-'}
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-xs uppercase text-slate-800">
                          {tx.namaPelanggan || '-'}
                        </p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const cat = getTransactionCategory(tx);
                            switch (cat) {
                              case 'pln':
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                                    PLN
                                  </span>
                                );
                              case 'pdam':
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-300">
                                    PDAM
                                  </span>
                                );
                              case 'bpjs':
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    BPJS
                                  </span>
                                );
                              case 'telkom':
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                                    TELKOM
                                  </span>
                                );
                              case 'pascabayar':
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300">
                                    PASCABAYAR
                                  </span>
                                );
                              default:
                                return (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                                    LAINNYA
                                  </span>
                                );
                            }
                          })()}
                          <span className="text-xs text-slate-800 font-medium">{tx.rincianTagihan || '-'}</span>
                        </div>
                        {tx.bulanTagihan && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Periode: {tx.bulanTagihan}</p>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <p className="font-extrabold text-xs text-blue-700">
                          Rp {Number(tx.totalBayar || 0).toLocaleString('id-ID')}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Tagihan: Rp {Number(tx.rpTagihan || 0).toLocaleString('id-ID')}
                        </p>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onSelectTransaction(tx)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-2xs inline-flex items-center gap-1 font-medium transition-all"
                            title="Buka & Cetak Ulang Resi"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Cetak</span>
                          </button>
                          <button
                            onClick={() => handleOpenPngModal(tx, true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-2xs inline-flex items-center gap-1 font-medium transition-all cursor-pointer"
                            title="Unduh langsung gambar struk (PNG)"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">PNG</span>
                          </button>
                          <button
                            onClick={() => handleOpenPngModal(tx, false)}
                            className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-2xs inline-flex items-center gap-1 font-medium transition-all cursor-pointer"
                            title="Salin ke WhatsApp / Kirim Struk"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">WA</span>
                          </button>
                          {tx.id && (
                            <button
                              onClick={() => onDeleteTransaction(tx.id!, tx)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs p-1.5 rounded-lg transition-all cursor-pointer"
                              title="Hapus permanen transaksi ini dari aplikasi & Google Sheets"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary */}
          {sortedAndFiltered.length > 0 && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-center text-xs text-slate-600 gap-2">
              <span>
                Menampilkan <strong>{sortedAndFiltered.length}</strong> transaksi terpilih
              </span>
              <div className="flex items-center gap-4">
                <span>
                  Total Tagihan: <strong>Rp {sortedAndFiltered.reduce((s, t) => s + (Number(t.rpTagihan) || 0), 0).toLocaleString('id-ID')}</strong>
                </span>
                <span className="text-blue-700 font-bold">
                  Total Bayar: Rp {totalOmset.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Aksi PNG & Berbagi WhatsApp */}
      {pngModal && (
        <div
          id="png-history-modal-backdrop"
          onClick={() => setPngModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
        >
          <div
            id="png-history-modal-container"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] cursor-default relative"
          >
            {/* Modal Header */}
            <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between select-none">
              <div className="flex items-center space-x-2.5">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-xs">
                  <ImageIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Struk PNG & Berbagi WhatsApp</h3>
                  <p className="text-xs text-emerald-100">
                    {pngModal.tx.namaPelanggan || 'Pelanggan'} • {pngModal.tx.idpel || '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPngModal(null)}
                className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center text-white bg-white/20 hover:bg-white/35 active:bg-white/50 rounded-xl transition-all cursor-pointer shadow-xs focus:outline-none"
                aria-label="Tutup"
                title="Tutup (Esc)"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
              {/* Layout Switcher Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => switchPngModalLayout('dotmatrix')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    pngModal.layout === 'dotmatrix'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Dot Matrix (21,6 x 6,95 cm)</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchPngModalLayout('a6')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    pngModal.layout === 'a6'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  <span>Resi A6 Portrait</span>
                </button>
              </div>

              {/* Thumbnail Preview Struk */}
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center">
                <div className="max-h-56 overflow-auto rounded-lg shadow-sm border border-slate-300 bg-white p-1">
                  <img
                    src={pngModal.dataUrl}
                    alt="Preview Struk PNG"
                    className={`h-auto object-contain mx-auto ${
                      pngModal.layout === 'dotmatrix' ? 'w-full max-w-[420px]' : 'w-auto max-w-[260px]'
                    }`}
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-2 font-medium">
                  {pngModal.layout === 'dotmatrix'
                    ? 'Format Continuous Form Bukopin 21,6 x 6,95 cm (1 Lembar Pas)'
                    : 'Format standar A6 Portrait siap cetak atau dikirim via WhatsApp'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                {/* 1. Unduh File PNG (Native Direct Download Link) */}
                <a
                  href={pngModal.dataUrl}
                  download={pngModal.fileName}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh File PNG ({pngModal.fileName})</span>
                </a>

                {/* 2. Salin Gambar & Salin Teks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPngImage}
                    className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    title="Salin gambar agar dapat langsung di-paste (Ctrl+V) ke chat WhatsApp"
                  >
                    {copyStatus === 'copied-img' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Gambar Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-600" />
                        <span>Salin Gambar (WA)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyWaText}
                    className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    title="Salin teks rincian struk rapi untuk pesan WhatsApp"
                  >
                    {copyStatus === 'copied-text' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700 font-bold">Teks Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4 text-slate-600" />
                        <span>Salin Teks Struk</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 3. Kirim via WhatsApp */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase">
                    Kirim ke WhatsApp (Opsional Nomor Tujuan):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={targetWaPhone}
                      onChange={(e) => setTargetWaPhone(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSendViaWhatsApp}
                      className="bg-[#25D366] hover:bg-[#1EBE5D] active:bg-[#199E4B] text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Buka WhatsApp</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    *Membuka WhatsApp dengan rincian struk otomatis terformat.
                  </p>
                </div>

                {/* 4. Opsi Buka Gambar di Tab Baru */}
                <button
                  type="button"
                  onClick={() => window.open(pngModal.dataUrl, '_blank')}
                  className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Buka gambar di tab baru jika ingin klik kanan simpan manual"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Buka Gambar di Tab Baru</span>
                </button>
              </div>

              {/* Tips Petunjuk */}
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-relaxed">
                💡 <strong>Cara mudah kirim ke WhatsApp:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-0.5 text-emerald-800">
                  <li>Klik tombol <strong>Salin Gambar (WA)</strong>.</li>
                  <li>Buka chat WhatsApp pelanggan, lalu tekan <strong>Ctrl + V</strong> (Paste) dan kirim.</li>
                  <li>Atau klik <strong>Buka WhatsApp</strong> untuk mengirim rincian teks struk otomatis.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
