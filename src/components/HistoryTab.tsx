import React, { useState, useMemo } from 'react';
import { ReceiptData } from '../types';
import { printDotMatrixReceipt } from '../utils/dotMatrixPrinter';
import { printDirectQZTray } from '../utils/qzTrayPrinter';
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
  X,
  ExternalLink,
  Check,
  Share2,
  Calendar,
  Zap,
  Archive,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { exportTransactionsToExcel } from '../utils/exportExcel';
import { getTransactionCategory, getCategoryLabel, BillCategory } from '../utils/billParser';
import { drawReceiptToCanvas } from '../utils/receiptCanvasDrawer';
import { formatTerbilang } from '../utils/terbilang';
import {
  executeTwoWaySync,
  forceSyncWithGoogleSheets,
  addDeletedTransactionId,
  setLastResetTimestamp,
  archiveAndResetGoogleSheet,
  getStoredGasUrl,
} from '../services/gasClientSync';
import { MonthlyResetModal } from './MonthlyResetModal';
import { RestoreDataModal } from './RestoreDataModal';
import {
  RolloverResult,
  getDefaultPeriodName,
  downloadExcelBackup,
  downloadJsonBackup,
} from '../utils/monthlyArchive';

interface HistoryTabProps {
  transactions: ReceiptData[];
  onSelectTransaction: (tx: ReceiptData) => void;
  onDeleteTransaction: (id: string, tx?: ReceiptData) => void;
  onToggleStatus?: (tx: ReceiptData) => void;
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
  if (tx.id && String(tx.id).startsWith('TX-')) {
    const num = Number(String(tx.id).replace('TX-', ''));
    if (!isNaN(num) && num > 1000000000) return num;
  }
  if (tx.tanggal) {
    // Direct JS Date parse
    const directDate = new Date(tx.tanggal);
    if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2000) {
      return directDate.getTime();
    }
    // Indonesian month name mapping
    const monthMap: Record<string, number> = {
      jan: 0, januari: 0,
      feb: 1, februari: 1,
      mar: 2, maret: 2,
      apr: 3, april: 3,
      mei: 4,
      jun: 5, juni: 5,
      jul: 6, juli: 6,
      agu: 7, agustus: 7, ags: 7,
      sep: 8, september: 8,
      okt: 9, oktober: 9,
      nov: 10, november: 10,
      des: 11, desember: 11,
    };
    const tokens = tx.tanggal.toLowerCase().split(/[\s,.:/-]+/);
    let day = 0, month = -1, year = 0;
    for (const tok of tokens) {
      if (monthMap[tok] !== undefined) {
        month = monthMap[tok];
      } else {
        const val = parseInt(tok, 10);
        if (!isNaN(val)) {
          if (val > 1900 && val < 2100) year = val;
          else if (val >= 1 && val <= 31 && day === 0) day = val;
          else if (val >= 1 && val <= 12 && month === -1 && day > 0) month = val - 1;
        }
      }
    }
    if (year > 0 && month >= 0 && day > 0) {
      return new Date(year, month, day).getTime();
    }

    // Slash or dash format DD/MM/YYYY
    const parts = tx.tanggal.split(/[/.-]/);
    if (parts.length >= 3) {
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

export function HistoryTab({
  transactions,
  onSelectTransaction,
  onDeleteTransaction,
  onToggleStatus,
  onRefreshTransactions,
  onNavigateToGasTab,
}: HistoryTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState<ServiceFilterType>('all');
  const [sortCriterion, setSortCriterion] = useState<SortCriterion>('date-desc');
  const [pageSize, setPageSize] = useState<number>(1000);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);
  const [isSyncingGas, setIsSyncingGas] = useState(false);
  const [isMonthlyResetModalOpen, setIsMonthlyResetModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  const handleRestoreComplete = async (count: number, mode: 'replace' | 'merge') => {
    setExportSuccessNotice(
      `Sukses memulihkan ${count} transaksi ke riwayat (${mode === 'replace' ? 'Mode Gantikan Semua' : 'Mode Gabungkan'})! Riwayat telah diperbarui.`
    );
    if (onRefreshTransactions) {
      await onRefreshTransactions();
    }
    setTimeout(() => setExportSuccessNotice(null), 6000);
  };

  const handlePrintQZTrayFromHistory = async (tx: ReceiptData) => {
    try {
      const printedTo = await printDirectQZTray(tx);
      setExportSuccessNotice(`SUKSES! Struk ${tx.namaPelanggan || tx.idpel} langsung dicetak ke ${printedTo} via QZ Tray.`);
      setTimeout(() => setExportSuccessNotice(null), 4000);
    } catch (err: any) {
      console.error(err);
      printDotMatrixReceipt(tx);
    }
  };
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const setTodayFilter = () => {
    const today = new Date().toISOString().slice(0, 10);
    setStartDate(today);
    setEndDate(today);
  };

  const setLast7DaysFilter = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const setThisMonthFilter = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${y}-${m}-01`;
    const lastDayObj = new Date(y, now.getMonth() + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    setStartDate(firstDay);
    setEndDate(lastDay);
  };

  const resetDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isTodayActive = startDate === todayStr && endDate === todayStr;

  const isLast7Active = useMemo(() => {
    if (!startDate || !endDate) return false;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return startDate === start.toISOString().slice(0, 10) && endDate === end.toISOString().slice(0, 10);
  }, [startDate, endDate]);

  const isThisMonthActive = useMemo(() => {
    if (!startDate || !endDate) return false;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${y}-${m}-01`;
    const lastDayObj = new Date(y, now.getMonth() + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
    return startDate === firstDay && endDate === lastDay;
  }, [startDate, endDate]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    serviceFilter !== 'all' ||
    startDate ||
    endDate
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setServiceFilter('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

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

  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const handleForceSyncFromSheets = async () => {
    setIsForceSyncing(true);
    try {
      const res = await forceSyncWithGoogleSheets();
      setExportSuccessNotice(
        `SUKSES! Berhasil menyamakan persis ${res.count} data transaksi dari Google Sheets ke perangkat ini. Data kini 100% identik!`
      );
      if (onRefreshTransactions) {
        await onRefreshTransactions();
      }
    } catch (e: any) {
      setExportSuccessNotice(`Gagal menyamakan dengan Google Sheets: ${e.message}`);
    } finally {
      setIsForceSyncing(false);
      setTimeout(() => setExportSuccessNotice(null), 7000);
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

  const [isClearingAll, setIsClearingAll] = useState(false);

  const handleQuickClearAll = async () => {
    if (transactions.length === 0) {
      alert('Riwayat transaksi sudah kosong (0 data).');
      return;
    }

    const conf = confirm(
      `PERINGATAN TUTUP BUKU / BERSIHKAN DATA:\n\n` +
      `Anda akan menghapus seluruh ${transactions.length} data riwayat transaksi saat ini.\n\n` +
      `1. File backup Excel (.xlsx) & cadangan JSON akan OTOMATIS diunduh agar data lama Anda aman 100% di komputer/HP.\n` +
      `2. Riwayat aplikasi akan menjadi 0 transaksi bersih.\n` +
      `3. Data lama dijamin TIDAK AKAN MUNCUL KEMBALI di bulan baru.\n\n` +
      `Apakah Anda yakin ingin melanjutkan?`
    );
    if (!conf) return;

    setIsClearingAll(true);
    try {
      const periodName = getDefaultPeriodName();
      const safePeriodTag = periodName.replace(/[^a-zA-Z0-9_-]/g, '_');

      // 1. Download Backup Otomatis
      downloadExcelBackup(transactions, `Backup_Transaksi_${safePeriodTag}.xlsx`, periodName);
      await new Promise((r) => setTimeout(r, 600));
      downloadJsonBackup(transactions, `Backup_Transaksi_${safePeriodTag}.json`, periodName);

      // 2. Tandai timestamp reset dan seluruh ID agar tidak pernah ditarik kembali oleh sinkronisasi otomatis
      const now = Date.now();
      setLastResetTimestamp(now);
      transactions.forEach((t) => {
        if (t.id) addDeletedTransactionId(t.id);
        if (t.idpel) addDeletedTransactionId(t.idpel);
      });

      // 3. Reset database server
      try {
        await fetch('/api/transactions/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupPeriod: safePeriodTag }),
        });
      } catch {}

      // 4. Arsipkan & kosongkan Google Sheets jika terhubung
      try {
        const gUrl = getStoredGasUrl();
        if (gUrl) {
          archiveAndResetGoogleSheet(gUrl, periodName).catch(() => {});
        }
      } catch {}

      // 5. Bersihkan storage lokal
      try {
        localStorage.removeItem('agent_batara_txs');
      } catch {}

      // 6. Refresh state transaksi menjadi 0
      if (onRefreshTransactions) {
        await onRefreshTransactions();
      }

      setExportSuccessNotice(
        `Sukses! Seluruh ${transactions.length} data riwayat telah dibersihkan dan dicadangkan. Aplikasi kini fresh dengan 0 transaksi untuk bulan baru.`
      );
    } catch (err: any) {
      alert(`Terjadi kendala saat membersihkan data: ${err.message || String(err)}`);
    } finally {
      setIsClearingAll(false);
      setTimeout(() => setExportSuccessNotice(null), 6000);
    }
  };

  const [pngModalState, setPngModalState] = useState<{
    url: string;
    blob: Blob | null;
    fileName: string;
    transaction: ReceiptData;
  } | null>(null);
  const [copiedClipboard, setCopiedClipboard] = useState(false);

  const handleQuickDownloadPng = (tx: ReceiptData) => {
    try {
      const canvas = drawReceiptToCanvas(tx);
      const safeId = String(tx.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
      const safeName = String(tx.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = String(tx.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
      const fileName = `Struk_${safeId}_${safeName}_${dateStr}.png`;

      canvas.toBlob((blob) => {
        const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        setPngModalState({
          url,
          blob,
          fileName,
          transaction: tx,
        });

        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (document.body.contains(link)) document.body.removeChild(link);
        }, 1500);
      }, 'image/png');

      setExportSuccessNotice(`Gambar struk PNG untuk ${tx.namaPelanggan || 'transaksi'} berhasil dibuat!`);
      setTimeout(() => setExportSuccessNotice(null), 5000);
    } catch (err: any) {
      setExportSuccessNotice(`Gagal membuat gambar struk: ${err.message}`);
    }
  };

  const handleCopyImageToClipboard = async () => {
    if (!pngModalState) return;
    try {
      if (pngModalState.blob && navigator.clipboard && (window as any).ClipboardItem) {
        const item = new (window as any).ClipboardItem({ 'image/png': pngModalState.blob });
        await navigator.clipboard.write([item]);
        setCopiedClipboard(true);
        setTimeout(() => setCopiedClipboard(false), 3000);
      } else {
        setExportSuccessNotice('Gunakan tombol "Unduh File PNG" atau "Kirim via WhatsApp".');
      }
    } catch (e) {
      setExportSuccessNotice('Browser tidak mengizinkan salin gambar otomatis.');
    }
  };

  const handleSendWhatsAppText = (tx: ReceiptData) => {
    const text = encodeURIComponent(
      `*STRUK PEMBAYARAN RESMI*\n` +
      `-----------------------------------\n` +
      `Agen: ${tx.namaAgen || 'Agen Batara'}\n` +
      `Alamat: ${tx.alamat || '-'}\n` +
      `-----------------------------------\n` +
      `Tanggal: ${tx.tanggal || '-'}\n` +
      `ID Pelanggan: ${tx.idpel || '-'}\n` +
      `Nama: ${tx.namaPelanggan || '-'}\n` +
      `Layanan: ${tx.rincianTagihan || '-'}\n` +
      `Periode: ${tx.bulanTagihan || '-'}\n` +
      `Total Bayar: Rp ${Number(tx.totalBayar || 0).toLocaleString('id-ID')}\n` +
      `Terbilang: ${formatTerbilang(Number(tx.totalBayar || 0))}\n` +
      `-----------------------------------\n` +
      `Terima kasih atas pembayaran Anda.`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Base transactions filtered by search query and date range (before serviceFilter is applied)
  const baseFilteredForCategories = useMemo(() => {
    let startMs: number | null = null;
    let endMs: number | null = null;

    if (startDate) {
      const s = new Date(startDate + 'T00:00:00');
      if (!isNaN(s.getTime())) startMs = s.getTime();
    }
    if (endDate) {
      const e = new Date(endDate + 'T23:59:59.999');
      if (!isNaN(e.getTime())) endMs = e.getTime();
    }

    return transactions.filter((t) => {
      // 1. Search query match
      const q = searchTerm.toLowerCase().trim();
      const matchSearch =
        !q ||
        (t.id != null && String(t.id).toLowerCase().includes(q)) ||
        (t.idpel != null && String(t.idpel).toLowerCase().includes(q)) ||
        (t.namaPelanggan != null && String(t.namaPelanggan).toLowerCase().includes(q)) ||
        (t.rincianTagihan != null && String(t.rincianTagihan).toLowerCase().includes(q)) ||
        (t.bulanTagihan != null && String(t.bulanTagihan).toLowerCase().includes(q)) ||
        (t.tanggal != null && String(t.tanggal).toLowerCase().includes(q)) ||
        (t.totalBayar != null && String(t.totalBayar).includes(q));

      if (!matchSearch) return false;

      // 2. Date range filter
      if (startMs !== null || endMs !== null) {
        const txMs = getTransactionTimestamp(t);
        if (txMs > 0) {
          if (startMs !== null && txMs < startMs) return false;
          if (endMs !== null && txMs > endMs) return false;
        }
      }

      return true;
    });
  }, [transactions, searchTerm, startDate, endDate]);

  // Category counts accurately reflecting active search & date filters
  const categoryCounts = useMemo(() => {
    const counts: Record<ServiceFilterType, number> = {
      all: baseFilteredForCategories.length,
      pln: 0,
      pdam: 0,
      bpjs: 0,
      telkom: 0,
      pascabayar: 0,
      other: 0,
    };
    for (const t of baseFilteredForCategories) {
      const cat = getTransactionCategory(t);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [baseFilteredForCategories]);

  // Filter transactions by selected service category
  const filteredList = useMemo(() => {
    if (serviceFilter === 'all') {
      return baseFilteredForCategories;
    }
    return baseFilteredForCategories.filter((t) => getTransactionCategory(t) === serviceFilter);
  }, [baseFilteredForCategories, serviceFilter]);

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
          return String(a.namaPelanggan || '').localeCompare(String(b.namaPelanggan || ''), 'id');
        case 'name-desc':
          return String(b.namaPelanggan || '').localeCompare(String(a.namaPelanggan || ''), 'id');
        case 'total-desc':
          return (Number(b.totalBayar) || 0) - (Number(a.totalBayar) || 0);
        case 'total-asc':
          return (Number(a.totalBayar) || 0) - (Number(b.totalBayar) || 0);
        case 'idpel-asc':
          return String(a.idpel || '').localeCompare(String(b.idpel || ''), undefined, { numeric: true });
        case 'idpel-desc':
          return String(b.idpel || '').localeCompare(String(a.idpel || ''), undefined, { numeric: true });
        case 'service-asc':
          return String(a.rincianTagihan || '').localeCompare(String(b.rincianTagihan || ''), 'id');
        case 'service-desc':
          return String(b.rincianTagihan || '').localeCompare(String(a.rincianTagihan || ''), 'id');

        default:
          return 0;
      }
    });

    return list;
  }, [filteredList, sortCriterion]);

  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedList = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return sortedAndFiltered.slice(start, start + pageSize);
  }, [sortedAndFiltered, validCurrentPage, pageSize]);

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
    const isAsc =
      sortCriterion === 'date-asc' ||
      sortCriterion === 'name-asc' ||
      sortCriterion === 'idpel-asc' ||
      sortCriterion === 'service-asc' ||
      sortCriterion === 'total-asc';
    return isAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold" />
    );
  };

  // Export to Excel with current sorting & filtering
  const handleExportToExcel = () => {
    if (sortedAndFiltered.length === 0) {
      alert('Tidak ada data transaksi yang sesuai dengan filter untuk diekspor.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const rawCategory = serviceFilter === 'all' ? 'Semua' : getCategoryLabel(serviceFilter);
    const filterTag = rawCategory.replace(/[:\\/?*\[\]\s]+/g, '_');
    
    let dateRangeTag = todayStr;
    let periodText = '';
    if (startDate && endDate) {
      dateRangeTag = `${startDate}_sd_${endDate}`;
      periodText = ` (Periode ${startDate} s/d ${endDate})`;
    } else if (startDate) {
      dateRangeTag = `sejak_${startDate}`;
      periodText = ` (Sejak ${startDate})`;
    } else if (endDate) {
      dateRangeTag = `hingga_${endDate}`;
      periodText = ` (Hingga ${endDate})`;
    }

    const fileName = `Riwayat_${filterTag}_${dateRangeTag}.xlsx`;
    const cleanCategoryForSheet = rawCategory.replace(/[:\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    const sheetName = serviceFilter === 'all' ? 'Riwayat Transaksi' : `Riwayat ${cleanCategoryForSheet}`.slice(0, 31);

    try {
      exportTransactionsToExcel(sortedAndFiltered, {
        fileName,
        sheetName,
      });

      setExportSuccessNotice(
        `Berhasil mengekspor ${sortedAndFiltered.length} transaksi (${rawCategory})${periodText} ke file Excel ${fileName}.`
      );
      setTimeout(() => {
        setExportSuccessNotice(null);
      }, 5000);
    } catch (err: any) {
      console.error('Export error:', err);
      alert('Gagal mengekspor data ke Excel: ' + (err.message || String(err)));
    }
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
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-50 p-0.5 border border-slate-200 shrink-0 flex items-center justify-center shadow-xs">
                <img
                  src="https://iili.io/nRihMkG.png"
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/logo.png';
                  }}
                />
              </div>
              <span>Riwayat</span>
            </h2>
          </div>

          {/* Export to Excel, Anti-Duplicate & GAS Two-Way Sync Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-deduplicate-history"
              onClick={handleDeduplicate}
              disabled={isDeduplicating || transactions.length === 0}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm font-semibold px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
              title="Periksa dan pastikan tidak ada data transaksi yang dobel di riwayat"
            >
              <ShieldCheck className={`w-4 h-4 ${isDeduplicating ? 'animate-pulse' : ''}`} />
              <span>{isDeduplicating ? 'Memeriksa...' : 'Anti'}</span>
            </button>

            <button
              id="btn-gas-sync-history"
              onClick={handleGasSyncClick}
              disabled={isSyncingGas}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
              title="Sinkronisasi 2 arah dengan Google Sheets"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingGas ? 'animate-spin' : ''}`} />
              <span>{isSyncingGas ? 'Sinkronisasi...' : 'Sinkron'}</span>
            </button>

            <button
              id="btn-force-sync-sheets"
              onClick={handleForceSyncFromSheets}
              disabled={isForceSyncing}
              className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer border border-teal-500/80"
              title="Tarik seluruh transaksi dari Google Sheets dan samakan persis di perangkat ini"
            >
              <RefreshCw className={`w-4 h-4 ${isForceSyncing ? 'animate-spin' : ''}`} />
              <span>{isForceSyncing ? 'Menyamakan...' : 'Sinkron sheet'}</span>
            </button>

            <button
              id="btn-export-excel"
              onClick={handleExportToExcel}
              disabled={sortedAndFiltered.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
              title="Export riwayat transaksi ke format Microsoft Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export</span>
              {sortedAndFiltered.length > 0 && (
                <span className="bg-emerald-700/60 text-emerald-100 text-xs px-2 py-0.5 rounded-full font-mono">
                  {sortedAndFiltered.length}
                </span>
              )}
            </button>

            <button
              id="btn-restore-data"
              onClick={() => setIsRestoreModalOpen(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
              title="Restore / upload data dari file backup JSON atau tarik langsung dari Google Sheets"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Restore</span>
            </button>

            <button
              id="btn-monthly-reset"
              onClick={() => setIsMonthlyResetModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
              title="Tutup buku bulanan: cadangkan data lama ke Excel/JSON & kosongkan riwayat untuk bulan baru (0 data)"
            >
              <Archive className="w-4 h-4" />
              <span>TTP buku</span>
            </button>

            <button
              id="btn-clear-all-history"
              onClick={handleQuickClearAll}
              disabled={isClearingAll || transactions.length === 0}
              className="bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 text-xs sm:text-sm font-semibold px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl border border-rose-200 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
              title="Hapus seluruh riwayat transaksi sekarang (fresh 0 data)"
            >
              <Trash2 className={`w-4 h-4 text-rose-600 ${isClearingAll ? 'animate-bounce' : ''}`} />
              <span>{isClearingAll ? 'Membersihkan...' : 'Hapus'}</span>
            </button>
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
              <p className="text-[11px] font-medium text-slate-500">
                {hasActiveFilters ? 'Total Tersaring' : 'Total Riwayat'}
              </p>
              <p className="text-sm font-bold text-slate-800">
                {sortedAndFiltered.length}{' '}
                <span className="text-slate-400 font-normal text-xs">
                  {hasActiveFilters ? `dari ${transactions.length} Transaksi` : 'Transaksi'}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
            <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Total Pembayaran</p>
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
              <p className="text-[11px] font-medium text-slate-500">Total Admin Bank</p>
              <p className="text-sm font-bold text-amber-700">
                Rp {totalAdmin.toLocaleString('id-ID')}
              </p>
            </div>
          </div>
        </div>

        {/* Modern Unified Filter & Search Control Panel */}
        <div className="mt-6 bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          {/* Row 1: Search + Sort + Reset */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="input-search-history"
                type="text"
                placeholder="Cari ID transaksi, nama pelanggan, IDPEL, layanan..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-10 pl-10 pr-9 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 placeholder:text-slate-400 shadow-2xs transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 h-10 bg-white border border-slate-300 px-3 rounded-xl shadow-2xs">
                <ArrowUpDown className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-500 hidden md:inline">Urutan:</span>
                <select
                  id="select-sort-criteria"
                  value={sortCriterion}
                  onChange={(e) => setSortCriterion(e.target.value as SortCriterion)}
                  className="text-xs font-semibold text-slate-800 bg-transparent outline-none cursor-pointer pr-1"
                >
                  <option value="date-desc">Tanggal: Terbaru → Terlama</option>
                  <option value="date-asc">Tanggal: Terlama → Terbaru</option>
                  <option value="name-asc">Nama Pelanggan: A → Z</option>
                  <option value="name-desc">Nama Pelanggan: Z → A</option>
                  <option value="total-desc">Total Bayar: Tertinggi</option>
                  <option value="total-asc">Total Bayar: Terendah</option>
                  <option value="idpel-asc">IDPEL: 0 → 9</option>
                  <option value="idpel-desc">IDPEL: 9 → 0</option>
                  <option value="service-asc">Layanan: A → Z</option>
                  <option value="service-desc">Layanan: Z → A</option>
                </select>
              </div>

              {/* Reset All Filters button if active */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="h-10 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  title="Kembalikan semua filter ke pengaturan awal"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Date Presets & Custom Date Trigger */}
          <div className="pt-2 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 w-14">
              Waktu:
            </span>
            <div className="flex-1 flex flex-wrap sm:flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => { resetDateFilter(); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                    !startDate && !endDate
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => { setTodayFilter(); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                    isTodayActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => { setLast7DaysFilter(); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                    isLast7Active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => { setThisMonthFilter(); setCurrentPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                    isThisMonthActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Bulan Ini
                </button>

                {/* Inline custom date inputs */}
                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                    className="h-8 text-[11px] font-medium bg-white border border-slate-300 text-slate-700 rounded-lg px-2 focus:ring-1 focus:ring-blue-500 outline-none shadow-2xs cursor-pointer"
                    title="Tanggal Mulai"
                  />
                  <span className="text-slate-400 text-xs">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                    className="h-8 text-[11px] font-medium bg-white border border-slate-300 text-slate-700 rounded-lg px-2 focus:ring-1 focus:ring-blue-500 outline-none shadow-2xs cursor-pointer"
                    title="Tanggal Selesai"
                  />
                </div>
              </div>
            </div>

          {/* Row 3: Category Service Filter Segmented Grid */}
          <div className="pt-2 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1 w-14">
              Layanan:
            </span>
            <div className="flex-1 flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Semua Layanan', count: categoryCounts.all },
                { id: 'pln', label: 'Listrik / PLN', count: categoryCounts.pln },
                { id: 'pdam', label: 'PDAM / Air', count: categoryCounts.pdam },
                { id: 'bpjs', label: 'BPJS', count: categoryCounts.bpjs },
                { id: 'telkom', label: 'Speedy / Telkom', count: categoryCounts.telkom },
                { id: 'pascabayar', label: 'Pascabayar', count: categoryCounts.pascabayar },
                { id: 'other', label: 'Lain-lain', count: categoryCounts.other },
              ].map((cat) => {
                const isActive = serviceFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setServiceFilter(cat.id as ServiceFilterType);
                      setCurrentPage(1);
                    }}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                        isActive
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 text-slate-600 border border-slate-200/60'
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Filter Chips Bar */}
          {hasActiveFilters && (
            <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-medium">Filter aktif:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium shadow-2xs">
                    Cari: &ldquo;{searchTerm}&rdquo;
                    <button onClick={() => { setSearchTerm(''); setCurrentPage(1); }} className="hover:text-rose-600 ml-0.5 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {serviceFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium shadow-2xs">
                    Layanan: {getCategoryLabel(serviceFilter as BillCategory)}
                    <button onClick={() => { setServiceFilter('all'); setCurrentPage(1); }} className="hover:text-rose-600 ml-0.5 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {(startDate || endDate) && (
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-medium shadow-2xs">
                    Periode: {startDate || '...'} s/d {endDate || '...'}
                    <button onClick={() => { resetDateFilter(); setCurrentPage(1); }} className="hover:text-rose-600 ml-0.5 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 underline transition-colors cursor-pointer"
              >
                Hapus Semua Filter
              </button>
            </div>
          )}
        </div>

        {/* Transactions Table with Sortable Columns */}
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <span>Daftar Transaksi</span>
                <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-mono font-medium">
                  {sortedAndFiltered.length}
                </span>
              </h3>
            </div>

            {/* Page Size Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Tampilkan:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                {[50, 100, 250, 500, 1000].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                      pageSize === size
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
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
                      <div className="flex flex-col items-center justify-center gap-2.5">
                        <AlertCircle className="w-9 h-9 text-slate-300" />
                        <p className="text-sm font-bold text-slate-700">
                          {transactions.length === 0 ? 'Belum Ada Transaksi di Riwayat Perangkat Ini' : 'Tidak ada data transaksi yang sesuai.'}
                        </p>
                        <p className="text-xs text-slate-500 max-w-lg leading-relaxed">
                          {transactions.length === 0
                            ? 'Baru buka di HP/Laptop lain atau baru saja menghapus riwayat? Jika Anda memiliki data di Google Sheets, Anda dapat langsung menarik dan menyamakannya 100% persis ke perangkat ini.'
                            : 'Coba ubah kata kunci pencarian atau filter kategori.'}
                        </p>
                        {transactions.length === 0 && (
                          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
                            <button
                              type="button"
                              onClick={handleForceSyncFromSheets}
                              disabled={isForceSyncing}
                              className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
                            >
                              <RefreshCw className={`w-4 h-4 ${isForceSyncing ? 'animate-spin' : ''}`} />
                              <span>{isForceSyncing ? 'Menyamakan dari Google Sheets...' : '⚡ Tarik & Samakan dari Google Sheets'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsRestoreModalOpen(true)}
                              className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <UploadCloud className="w-4 h-4" />
                              <span>Upload File Backup JSON</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedList.map((tx, idx) => (
                    <tr key={tx.id || idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 text-center text-xs font-mono text-slate-400">
                        {(validCurrentPage - 1) * pageSize + idx + 1}
                      </td>
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
                            title="Buka & Cetak Ulang Resi (A6)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">A6</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintQZTrayFromHistory(tx);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg shadow-2xs inline-flex items-center gap-1 transition-all border border-emerald-500"
                            title="Cetak langsung ke Epson LX-310 via QZ Tray (RAW Direct 100% Tajam)"
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                            <span className="hidden sm:inline">QZ Tray</span>
                          </button>
                          <button
                            onClick={() => handleQuickDownloadPng(tx)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-2xs inline-flex items-center gap-1 font-medium transition-all"
                            title="Unduh langsung gambar struk (PNG)"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">PNG</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const deleteKey = tx.id || tx.idpel || tx.namaPelanggan || '';
                              if (deleteKey) {
                                onDeleteTransaction(deleteKey, tx);
                              }
                            }}
                            className="bg-rose-50 hover:bg-rose-100 hover:text-rose-700 text-rose-600 text-xs p-1.5 rounded-lg transition-all border border-rose-200 cursor-pointer"
                            title="Hapus riwayat transaksi ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-end items-center text-xs text-slate-600 gap-4">
              <span>
                Total Tagihan: <strong>Rp {sortedAndFiltered.reduce((s, t) => s + (Number(t.rpTagihan) || 0), 0).toLocaleString('id-ID')}</strong>
              </span>
              <span className="text-blue-700 font-bold">
                Total Bayar: Rp {totalOmset.toLocaleString('id-ID')}
              </span>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-xl shadow-2xs">
              <div className="text-xs text-slate-500 font-medium">
                Halaman <span className="font-bold text-slate-800">{validCurrentPage}</span> dari{' '}
                <span className="font-bold text-slate-800">{totalPages}</span> (Total {sortedAndFiltered.length} transaksi)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validCurrentPage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sebelumnya</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      if (totalPages <= 7) return true;
                      if (p === 1 || p === totalPages) return true;
                      return Math.abs(p - validCurrentPage) <= 1;
                    })
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && p - prev > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="px-1 text-slate-400 text-xs">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              validCurrentPage === p
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer"
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PNG & WhatsApp Modal */}
      {pngModalState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col max-h-[90vh]">
            <button
              onClick={() => setPngModalState(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-base">Struk PNG & WhatsApp</h4>
                <p className="text-xs text-slate-500">Pelanggan: {pngModalState.transaction.namaPelanggan || '-'}</p>
              </div>
            </div>

            {/* Thumbnail Preview */}
            <div className="my-3 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center overflow-auto max-h-56">
              <img
                src={pngModalState.url}
                alt="Preview Struk PNG"
                className="max-h-48 rounded shadow-xs border border-slate-300 object-contain"
              />
            </div>

            {/* Quick Actions for WhatsApp and downloading */}
            <div className="space-y-2 mt-2">
              <a
                href={pngModalState.url}
                download={pngModalState.fileName}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>Unduh File PNG ({pngModalState.fileName})</span>
              </a>

              <div className="flex gap-2">
                <button
                  onClick={handleCopyImageToClipboard}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Salin gambar agar dapat langsung di-paste (Ctrl+V) ke WhatsApp Web"
                >
                  {copiedClipboard ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin! Paste di WA</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Salin Gambar WA</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleSendWhatsAppText(pngModalState.transaction)}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  title="Kirim detail transaksi ke WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Kirim Teks WA</span>
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => window.open(pngModalState.url, '_blank')}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Buka gambar di tab browser baru"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Buka Gambar di Tab Baru</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center mt-3">
              *Klik <strong>Salin Gambar WA</strong> lalu Paste di chat WhatsApp, atau gunakan <strong>Kirim Teks WA</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Modal Tutup Buku & Reset Periode Bulan Baru */}
      <MonthlyResetModal
        isOpen={isMonthlyResetModalOpen}
        onClose={() => setIsMonthlyResetModalOpen(false)}
        transactions={transactions}
        onResetComplete={(result) => {
          setExportSuccessNotice(result.message);
          if (onRefreshTransactions) {
            onRefreshTransactions();
          }
        }}
      />

      {/* Modal Restore Data (JSON Backup & Google Sheets) */}
      <RestoreDataModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onRestoreComplete={handleRestoreComplete}
      />
    </div>
  );
}
