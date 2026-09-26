import React, { useState } from 'react';
import { ReceiptData } from '../types';
import {
  Printer,
  Download,
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  X,
  Share2,
  HelpCircle,
  Zap,
  FileText,
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { drawReceiptToCanvas } from '../utils/receiptCanvasDrawer';
import { formatReceiptDateTime } from '../utils/dateFormatter';
import { getReceiptHeaderTitle } from '../utils/billParser';
import {
  printDotMatrixReceipt,
  printRawTextLX310,
  generatePlainTextReceipt,
  DotMatrixFontSize,
} from '../utils/dotMatrixPrinter';
import {
  printDirectQZTray,
  getQZTrayPrinters,
  connectQZTray,
} from '../utils/qzTrayPrinter';
import {
  printDirectJSPM,
  getJSPMPrinters,
  connectJSPM,
} from '../utils/jsPrintManagerPrinter';

interface ReceiptPreviewProps {
  receipt: ReceiptData;
  onPrint: () => void;
  onSave: (force?: boolean) => void | Promise<any>;
  savedStatus: boolean;
}

interface DownloadedModalState {
  url: string;
  blob: Blob | null;
  fileName: string;
}

export function ReceiptPreview({ receipt, onPrint, onSave, savedStatus }: ReceiptPreviewProps) {
  const [previewMode, setPreviewMode] = useState<'a6' | 'dotmatrix'>('a6');
  const [dotMatrixFontSize, setDotMatrixFontSize] = useState<DotMatrixFontSize>('normal');
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [downloadedModal, setDownloadedModal] = useState<DownloadedModalState | null>(null);
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const [copiedRawText, setCopiedRawText] = useState(false);
  const [showLx310GuideModal, setShowLx310GuideModal] = useState(false);

  // QZ Tray State & Handlers
  const [isQzPrinting, setIsQzPrinting] = useState(false);
  const [qzPrinterList, setQzPrinterList] = useState<string[]>([]);
  const [selectedQzPrinter, setSelectedQzPrinter] = useState<string>('');
  const [showQzModal, setShowQzModal] = useState(false);

  // JSPrintManager (JSPM) State & Handlers
  const [isJspmPrinting, setIsJspmPrinting] = useState(false);
  const [jspmPrinterList, setJspmPrinterList] = useState<string[]>([]);
  const [selectedJspmPrinter, setSelectedJspmPrinter] = useState<string>('');
  const [showJspmModal, setShowJspmModal] = useState(false);
  const [showJspmHelpModal, setShowJspmHelpModal] = useState(false);

  const handlePrintJSPM = async (overridePrinterName?: string) => {
    await onSave(true);
    setIsJspmPrinting(true);
    showActionNotice('Data tersimpan ke riwayat! Menghubungkan ke JSPrintManager & Mengirim Perintah Cetak ke LX-310...');
    try {
      const printerName = overridePrinterName || selectedJspmPrinter;
      const printedTo = await printDirectJSPM(receipt, printerName || undefined);
      showActionNotice(`SUKSES! Data tersimpan & struk dikirim ke ${printedTo} via JSPrintManager (RAW Mode).`);
      setShowJspmModal(false);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal Mencetak via JSPrintManager: ${err.message || err}`);
      setShowJspmHelpModal(true);
    } finally {
      setIsJspmPrinting(false);
    }
  };

  const handleOpenJspmModal = async () => {
    await onSave(true);
    setIsJspmPrinting(true);
    try {
      showActionNotice('Data tersimpan ke riwayat! Menghubungkan ke JSPrintManager Client...');
      await connectJSPM();
      const printers = await getJSPMPrinters();
      setJspmPrinterList(printers);
      if (printers.length > 0) {
        const lxPrinter = printers.find((p) => p.toUpperCase().includes('LX') || p.toUpperCase().includes('EPSON')) || printers[0];
        setSelectedJspmPrinter(lxPrinter);
      }
      setShowJspmModal(true);
    } catch (err: any) {
      console.error(err);
      setShowJspmHelpModal(true);
    } finally {
      setIsJspmPrinting(false);
    }
  };

  const handlePrintQZTray = async (overridePrinterName?: string) => {
    await onSave(true);
    setIsQzPrinting(true);
    showActionNotice('Data tersimpan ke riwayat! Menghubungkan ke QZ Tray & Mengirim Perintah Cetak ke LX-310...');
    try {
      const printerName = overridePrinterName || selectedQzPrinter;
      const printedTo = await printDirectQZTray(receipt, printerName || undefined);
      showActionNotice(`SUKSES! Data tersimpan & struk berhasil dicetak ke ${printedTo} via QZ Tray (Direct Hardware RAW).`);
      setShowQzModal(false);
    } catch (err: any) {
      console.error(err);
      alert(`Gagal Mencetak via QZ Tray: ${err.message || err}`);
      setShowLx310GuideModal(true);
    } finally {
      setIsQzPrinting(false);
    }
  };

  const handleOpenQzModal = async () => {
    await onSave(true);
    setIsQzPrinting(true);
    try {
      showActionNotice('Data tersimpan ke riwayat! Menghubungkan ke QZ Tray...');
      await connectQZTray();
      const printers = await getQZTrayPrinters();
      setQzPrinterList(printers);
      if (printers.length > 0) {
        const lxPrinter = printers.find((p) => p.toUpperCase().includes('LX') || p.toUpperCase().includes('EPSON')) || printers[0];
        setSelectedQzPrinter(lxPrinter);
      }
      setShowQzModal(true);
    } catch (err: any) {
      alert(`QZ Tray belum terhubung: ${err.message || err}\n\nPastikan program QZ Tray sudah terbuka dan aktif (ikon hijau di dekat jam Windows).`);
    } finally {
      setIsQzPrinting(false);
    }
  };

  const handleDotMatrixPrintClick = async () => {
    await onSave(true);
    showActionNotice(`Data otomatis tersimpan ke riwayat! Menyiapkan cetak Dot Matrix Layout...`);
    setTimeout(() => {
      printDotMatrixReceipt(receipt, undefined, dotMatrixFontSize);
    }, 100);
  };

  const handleRawTextLX310PrintClick = async () => {
    await onSave(true);
    showActionNotice('Data otomatis tersimpan ke riwayat! Menyiapkan Cetak Direct Text LX-310 (Pasti Tajam 100%)...');
    setTimeout(() => {
      printRawTextLX310(receipt, undefined);
    }, 100);
  };

  const handleDownloadTxtFile = async () => {
    await onSave(true);
    const rawText = generatePlainTextReceipt(receipt);
    const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Struk_LX310_${receipt.idpel || receipt.id || 'transaksi'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showActionNotice('Data tersimpan ke riwayat & File Struk .TXT diunduh! Buka file di Notepad & tekan Ctrl+P untuk cetak 100% tajam.');
  };

  const handleCopyRawText = async () => {
    try {
      const rawText = generatePlainTextReceipt(receipt);
      await navigator.clipboard.writeText(rawText);
      setCopiedRawText(true);
      showActionNotice('Teks murni struk berhasil disalin ke clipboard! Siap dipaste ke printer raw / Notepad.');
      setTimeout(() => setCopiedRawText(false), 3000);
    } catch {
      showActionNotice('Gagal menyalin teks.');
    }
  };

  const showActionNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice(null);
    }, 5000);
  };

  const handleDirectPrint = async (isPdf = false) => {
    // 1. Otomatis simpan data transaksi ke riwayat
    await onSave(true);
    showActionNotice(
      isPdf
        ? 'Data otomatis tersimpan ke riwayat! Menyiapkan dokumen PDF A6...'
        : 'Data otomatis tersimpan ke riwayat! Menyiapkan cetak resi A6...'
    );

    const receiptElement = document.getElementById('printable-receipt');
    if (!receiptElement) {
      onPrint();
      return;
    }

    try {
      const printWindow = window.open('', '_blank', 'width=450,height=650');
      if (!printWindow) {
        onPrint();
        return;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cetak Resi A6 - ${receipt.namaPelanggan || 'Pelanggan'}</title>
          <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
          <style>
            @page {
              size: 105mm 148mm;
              margin: 0;
            }
            html, body {
              width: 105mm;
              height: 148mm;
              margin: 0;
              padding: 0;
              background: white;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              overflow: hidden;
            }
            .print-wrapper {
              width: 105mm;
              height: 148mm;
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
              padding: 4mm;
            }
            .receipt-box {
              width: 98mm;
              max-height: 140mm;
              border: none;
              outline: none;
              box-shadow: none;
              padding: 6px 8px;
              box-sizing: border-box;
              background: transparent;
              page-break-inside: avoid;
              break-inside: avoid;
              font-size: 11px;
              line-height: 1.35;
            }
          </style>
        </head>
        <body>
          <div class="print-wrapper">
            <div class="receipt-box">
              ${receiptElement.innerHTML}
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                window.close();
              }, 350);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    } catch (e) {
      onPrint();
    }
  };

  const handleDownloadImage = async () => {
    // 1. Otomatis simpan data transaksi ke riwayat & Google Sheets
    await onSave(true);

    setIsDownloadingImage(true);
    showActionNotice('Data tersimpan ke riwayat! Menyiapkan gambar struk resolusi tajam (A6)...');

    const safeId = String(receipt.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = String(receipt.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = String(receipt.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
    const fileName = `Struk_${safeId}_${safeName}_${dateStr}.png`;

    try {
      let canvas: HTMLCanvasElement | null = null;
      const receiptElement = document.getElementById('printable-receipt');

      // 1. Coba render DOM melalui html2canvas-pro
      if (receiptElement) {
        try {
          canvas = await html2canvas(receiptElement, {
            scale: 2.5,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0,
          });
        } catch (canvasErr) {
          console.warn('html2canvas-pro warning, falling back to pure canvas drawer:', canvasErr);
        }
      }

      // 2. Fallback jika html2canvas-pro tidak menghasilkan canvas
      if (!canvas) {
        canvas = drawReceiptToCanvas(receipt);
      }

      // 3. Konversi canvas ke Blob PNG
      const blob: Blob | null = await new Promise((resolve) => {
        canvas!.toBlob((b) => resolve(b), 'image/png', 1.0);
      });

      const fileUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');

      // 4. Trigger auto-download via tag <a> ter-append ke DOM
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1500);

      // 5. Buka modal opsi lengkap untuk user (Unduh Ulang, Buka di Tab Baru, Salin ke WhatsApp)
      setDownloadedModal({
        url: fileUrl,
        blob: blob,
        fileName: fileName,
      });

      showActionNotice('Struk PNG berhasil dibuat & unduhan otomatis dimulai!');
    } catch (err: any) {
      console.error('Error generating image file:', err);

      // Emergency fallback dengan pure canvas 2D
      try {
        const fallbackCanvas = drawReceiptToCanvas(receipt);
        const dataUrl = fallbackCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (document.body.contains(link)) document.body.removeChild(link);
        }, 1500);

        setDownloadedModal({
          url: dataUrl,
          blob: null,
          fileName: fileName,
        });
        showActionNotice('Struk PNG berhasil dibuat & di-download!');
      } catch (fallbackErr: any) {
        showActionNotice(`Gagal membuat gambar PNG: ${fallbackErr.message || err.message}`);
      }
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleCopyImageToClipboard = async () => {
    if (!downloadedModal) return;
    try {
      if (downloadedModal.blob && navigator.clipboard && (window as any).ClipboardItem) {
        const item = new (window as any).ClipboardItem({ 'image/png': downloadedModal.blob });
        await navigator.clipboard.write([item]);
        setCopiedClipboard(true);
        setTimeout(() => setCopiedClipboard(false), 3000);
      } else {
        showActionNotice('Klik tombol "Buka Gambar", lalu klik kanan dan pilih "Salin Gambar".');
      }
    } catch (e) {
      showActionNotice('Browser tidak mengizinkan salin gambar otomatis. Gunakan tombol "Buka Gambar".');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <span>Preview</span>
        </h3>
        <div className="flex items-center gap-2">
          {savedStatus && (
            <span className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Tersimpan
            </span>
          )}
          <button
            onClick={() => onSave(false)}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all"
            title="Simpan manual data transaksi ke database riwayat"
          >
            Simpan
          </button>
          <button
            onClick={() => handleDirectPrint(false)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            title="Cetak struk dan otomatis simpan ke riwayat"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* Auto Save Feedback Notification */}
      {actionNotice && (
        <div className="w-full mb-3 p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs flex items-center justify-between shadow-2xs animate-fade-in">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            {actionNotice}
          </span>
        </div>
      )}

      {/* Mode Selector Tabs (Struk A6 vs Dot Matrix 21.6x6.95 cm) */}
      <div className="w-full flex items-center justify-center gap-2 mb-3 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setPreviewMode('a6')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            previewMode === 'a6'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Pratinjau A6 (Portrait)
        </button>
        <button
          onClick={() => setPreviewMode('dotmatrix')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
            previewMode === 'dotmatrix'
              ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Dot Matrix</span>
        </button>
      </div>

      {previewMode === 'a6' ? (
        /* A6 Receipt Container - styled specifically for A6 portrait look and print */
        <div
          id="printable-receipt"
          className="w-full max-w-[380px] bg-white p-5 text-black font-mono text-xs border-0 outline-none shadow-none relative my-2"
          style={{ minHeight: '520px' }}
        >
          {/* Header Agen (Bukopin PPOB Style: Centered, Bold, Larger Header Title at Very Top) */}
          <div className="text-center border-b-2 border-dashed border-black pb-3 mb-3">
            <div className="flex justify-center mb-2">
              <img
                src="https://iili.io/nRihMkG.png"
                alt="Logo Agen"
                className="h-10 w-auto object-contain max-h-12"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo.png';
                }}
              />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-wide uppercase text-black leading-tight">
              {getReceiptHeaderTitle(receipt)}
            </h2>
            <p className="text-xs font-bold uppercase text-black mt-1">
              LOKET: {receipt.namaAgen || 'AGEN BATARA'}
            </p>
            {receipt.alamat && (
              <p className="text-[11px] text-black mt-0.5">{receipt.alamat}</p>
            )}
            {receipt.noHp && (
              <p className="text-[11px] text-black">Telp/WA: {receipt.noHp}</p>
            )}
          </div>

          {/* Transaction Metadata */}
          <div className="space-y-1 border-b border-dashed border-black pb-2 mb-3 text-[11px] text-black">
            <div className="flex justify-between">
              <span className="text-black">ID Transaksi:</span>
              <span className="font-bold text-black font-mono">{receipt.id || 'TRX-83920184'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black">Tgl/Waktu:</span>
              <span className="font-semibold text-black">{formatReceiptDateTime(receipt.tanggal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black">ID Pelanggan:</span>
              <span className="font-bold text-black">{receipt.idpel || '-'}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-black shrink-0">Nama:</span>
              <span className="font-bold uppercase text-black text-right whitespace-nowrap overflow-hidden text-ellipsis max-w-[210px]" title={receipt.namaPelanggan}>
                {receipt.namaPelanggan || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-black">Bulan/Periode:</span>
              <span className="text-black">{receipt.bulanTagihan || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black">Pemakaian:</span>
              <span className="text-black">{receipt.pemakaian || '-'}</span>
            </div>
            {receipt.standMeter && (
              <div className="flex justify-between">
                <span className="text-black">Stand Meter:</span>
                <span className="text-black">{receipt.standMeter}</span>
              </div>
            )}
          </div>

          {/* Bill Details */}
          <div className="space-y-1.5 border-b-2 border-dashed border-black pb-3 mb-3 text-black">
            <div className="text-[11px] font-bold text-black mb-1">Rincian Transaksi:</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-black">{receipt.rincianTagihan || 'Tagihan Pembayaran'}</span>
              <span className="text-black">Rp {Number(receipt.rpTagihan || 0).toLocaleString('id-ID')}</span>
            </div>
            {Number(receipt.lainLain) > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-black">Biaya Lain-Lain</span>
                <span className="text-black">Rp {Number(receipt.lainLain || 0).toLocaleString('id-ID')}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px]">
              <span className="text-black">Admin Bank / Loket</span>
              <span className="text-black">Rp {Number(receipt.adminBank || 0).toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Total Bayar */}
          <div className="py-2.5 mb-4 text-center text-black border-y-2 border-black bg-transparent">
            <div className="text-[10px] text-black uppercase font-bold tracking-wider">Total Pembayaran</div>
            <div className="text-base font-extrabold text-black mt-0.5">
              Rp {Number(receipt.totalBayar || 0).toLocaleString('id-ID')}
            </div>
          </div>

          {/* Footer Thanks */}
          <div className="text-center pt-2 text-black">
            <p className="text-[10px] text-black mt-1 font-semibold">Terima Kasih Atas Pembayaran Anda</p>
            <p className="text-[9px] text-black">Simpan struk ini sebagai bukti pembayaran yang sah.</p>
          </div>
        </div>
      ) : (
        /* Dot Matrix 21.6 x 6.95 cm Continuous Text Preview */
        <div className="w-full bg-amber-50/70 border border-amber-300 rounded-2xl p-4 my-2 font-serif text-slate-950 shadow-xs overflow-x-auto">
          {/* Top Header Centered, Bold, Larger Font (Bukopin PPOB Style) */}
          <div className="text-center pb-2 mb-3 border-b border-dashed border-amber-300/80">
            <h2 className="text-base font-extrabold uppercase tracking-wide text-slate-950">
              {getReceiptHeaderTitle(receipt)}
            </h2>
            <div className="text-xs font-bold text-slate-800 uppercase mt-0.5">
              LOKET: {receipt.namaAgen || 'AGEN BATARA'} {receipt.alamat ? ` - ${receipt.alamat}` : ''}
            </div>
          </div>

          <div className="min-w-[620px] grid grid-cols-2 gap-6">
            {/* Left Col */}
            <div className="pr-2 space-y-2 flex flex-col justify-between">
              <div>
                <div className="space-y-1 text-xs font-normal">
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-700">ID Transaksi</span>
                    <span className="col-span-2 font-mono text-slate-950">: {receipt.id || 'TRX-83920184'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-700">Tgl/Waktu</span>
                    <span className="col-span-2 text-slate-950">: {formatReceiptDateTime(receipt.tanggal)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-700">ID Pelanggan</span>
                    <span className="col-span-2 text-slate-950">: {receipt.idpel || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-700">Nama</span>
                    <span className="col-span-2 text-slate-950 uppercase truncate">: {receipt.namaPelanggan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-700">Periode</span>
                    <span className="col-span-2 text-slate-950">: {receipt.bulanTagihan || '-'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <span className="text-slate-700">Pemakaian</span>
                    <span className="col-span-2 text-slate-950">: {receipt.pemakaian || '-'}</span>
                  </div>
                  {receipt.standMeter && (
                    <div className="grid grid-cols-3 gap-1">
                      <span className="text-slate-700">Stand Meter</span>
                      <span className="col-span-2 text-slate-950">: {receipt.standMeter}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-slate-600 font-normal pt-2">
                *Tanpa Garis / Polos | Font Roman Dot Matrix (Single-Pass Normal Weight)
              </div>
            </div>

            {/* Right Col */}
            <div className="pl-2 flex flex-col justify-between">
              <div>
                <div className="font-normal text-xs text-slate-950 uppercase mb-2">RINCIAN PEMBAYARAN TAGIHAN</div>
                <div className="space-y-1.5 text-xs font-normal">
                  <div className="flex justify-between">
                    <span className="text-slate-800">{receipt.rincianTagihan || 'Tagihan Pembayaran'}</span>
                    <span className="text-slate-950">Rp {Number(receipt.rpTagihan || 0).toLocaleString('id-ID')}</span>
                  </div>
                  {Number(receipt.lainLain) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-800">Biaya Lain-Lain</span>
                      <span className="text-slate-950">Rp {Number(receipt.lainLain || 0).toLocaleString('id-ID')}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-800">Admin Bank / Loket</span>
                    <span className="text-slate-950">Rp {Number(receipt.adminBank || 0).toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="my-3 py-2 px-2 flex justify-between font-normal text-base text-slate-950 bg-amber-200/90 rounded-lg">
                  <span>TOTAL BAYAR</span>
                  <span>Rp {Number(receipt.totalBayar || 0).toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="text-center text-xs text-slate-900 pt-2 font-normal space-y-0.5">
                <div>TERIMA KASIH ATAS PEMBAYARAN ANDA</div>
                <div className="text-[10px] text-slate-700 font-normal">Simpan struk ini sebagai bukti pembayaran yang sah.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
        <button
          onClick={handleOpenQzModal}
          disabled={isQzPrinting}
          className="flex-1 min-w-[200px] bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold py-2.5 px-3.5 rounded-xl text-xs shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-400"
          title="Cetak langsung ke Epson LX-310 via QZ Tray (Paling Tajam 100%, Kecepatan Maksimal, Tanpa Dialog Chrome)"
        >
          {isQzPrinting ? (
            <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
          ) : (
            <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
          )}
          <span>Cetak QZ Tray</span>
        </button>

        <button
          onClick={handleOpenJspmModal}
          disabled={isJspmPrinting}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2.5 px-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-indigo-400"
          title="Cetak langsung ke Epson LX-310 via JSPrintManager (JSPM RAW Mode)"
        >
          {isJspmPrinting ? (
            <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
          ) : (
            <Printer className="w-4 h-4 text-indigo-200" />
          )}
          <span>Cetak JSPrintManager</span>
        </button>

        <button
          onClick={() => handleDirectPrint(false)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          title="Cetak langsung struk ukuran A6 portrait"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak A6</span>
        </button>

        <button
          onClick={() => handleDirectPrint(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          title="Download struk format PDF A6"
        >
          <Download className="w-4 h-4" />
          <span>PDF A6</span>
        </button>

        <button
          id="btn-download-png"
          onClick={handleDownloadImage}
          disabled={isDownloadingImage}
          className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          title="Download struk format gambar PNG"
        >
          {isDownloadingImage ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
          <span>{isDownloadingImage ? 'Memproses PNG...' : 'PNG'}</span>
        </button>
      </div>

      {/* Auto Save Assurance Notice */}
      <p className="text-[11px] text-slate-500 text-center mt-2.5 flex items-center justify-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Setiap tombol <b>Cetak</b> atau <b>Download</b> otomatis menyimpan data ke riwayat transaksi.</span>
      </p>

      {/* Download PNG Success & Actions Modal */}
      {downloadedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col max-h-[90vh]">
            <button
              onClick={() => setDownloadedModal(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-base">Gambar Struk PNG Siap!</h4>
                <p className="text-xs text-slate-500">Resolusi tinggi, siap dibagikan ke pelanggan atau dicetak.</p>
              </div>
            </div>

            {/* Thumbnail Preview */}
            <div className="my-3 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center overflow-auto max-h-56">
              <img
                src={downloadedModal.url}
                alt="Preview Struk PNG"
                className="max-h-48 rounded shadow-xs border border-slate-300 object-contain"
              />
            </div>

            {/* Quick Actions for WhatsApp and saving */}
            <div className="space-y-2 mt-2">
              <a
                href={downloadedModal.url}
                download={downloadedModal.fileName}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>Unduh File PNG ({downloadedModal.fileName})</span>
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
                      <span>Salin ke WhatsApp</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => window.open(downloadedModal.url, '_blank')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Buka gambar di tab browser baru"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Buka Tab Baru</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center mt-3">
              *Jika unduhan browser tidak langsung muncul otomatis, klik tombol <strong>Unduh File PNG</strong> di atas.
            </p>
          </div>
        </div>
      )}

      {/* LX-310 Dot Matrix Setup Guide Modal */}
      {showLx310GuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowLx310GuideModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3 border-b border-slate-100 pb-3">
              <div className="bg-amber-100 text-amber-800 p-2.5 rounded-xl font-extrabold text-sm">
                EPSON LX-310
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">Panduan Cetak Tajam LX-310</h4>
                <p className="text-xs text-slate-500">Solusi agar cetakan jarum paku 100% jelas & tidak pecah/buram</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                <div className="font-bold text-emerald-950 flex items-center gap-1.5 mb-1 text-sm">
                  <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                  Solusi 1: Gunakan Tombol "Cetak Direct LX-310" (Rekomendasi Utama)
                </div>
                <p className="text-emerald-900">
                  Klik tombol hijau <b>"Cetak Direct LX-310"</b>. Mode ini mengirim teks ASCII murni langsung ke pita printer tanpa diubah menjadi gambar oleh browser, sehingga paku jarum LX-310 langsung mengetuk karakter asli. <b>Pasti 100% tajam dan sangat cepat!</b>
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                <div className="font-bold text-amber-950 mb-1 text-sm">
                  Mengapa Cetakan Browser Sering Pecah/Buram?
                </div>
                <p className="text-amber-900">
                  Secara default, Google Chrome merender halaman web sebagai <b>Gambar Graphic 180 DPI</b> sebelum dikirim ke driver printer. Jarum Epson LX-310 mencoba mengetuk piksel titik-titik gambar halus (dithering) sehingga huruf terasa samar/pecah.
                </p>
              </div>

              <div className="border border-teal-200 bg-teal-50/80 p-3 rounded-xl space-y-1.5">
                <div className="font-bold text-teal-950 flex items-center gap-1 text-xs">
                  <FileText className="w-4 h-4 text-teal-700" />
                  Solusi 2: Metode File .TXT + Notepad (Metode Resmi Loket PLN/PPOB)
                </div>
                <p className="text-teal-900 text-[11px]">
                  1. Klik tombol <b>"Download .TXT"</b> di aplikasi.<br/>
                  2. Buka file <code>.txt</code> tersebut di program <b>Notepad</b> Windows.<br/>
                  3. Tekan <b>Ctrl + P</b> lalu cetak ke LX-310. Karena Notepad adalah aplikasi teks murni Win32, paku jarum LX-310 mencetak <b>100% cepat, tajam, dan tidak akan pernah pecah!</b>
                </p>
              </div>

              <div className="border border-blue-200 bg-blue-50/80 p-3 rounded-xl space-y-1.5">
                <div className="font-bold text-blue-950 text-xs">
                  Solusi 3: Software Add-on / Extension RAW Print Browser
                </div>
                <p className="text-blue-900 text-[11px]">
                  Jika ingin cetak langsung dari browser secara otomatis tanpa dialog Chrome:<br/>
                  • <b>QZ Tray (qz.io)</b>: Software print bridge resmi untuk menghubungkan web browser ke printer dot matrix USB.<br/>
                  • <b>Web2Print / RawBT Extension</b>: Ekstensi Chrome untuk meneruskan perintah ESC/P ke printer LPT/USB.<br/>
                  • <b>JSPrintManager</b>: Driver add-on lokal untuk bypass rendering raster Chrome.
                </p>
              </div>

              <div className="border border-slate-200 p-3 rounded-xl space-y-2 bg-slate-50">
                <div className="font-bold text-slate-900">Solusi 4: Setting di Jendela Print Browser (Chrome / Edge)</div>
                <ol className="list-decimal list-inside space-y-1 text-slate-700 pl-1 text-[11px]">
                  <li>Saat menekan tombol Cetak, di jendela Print Chrome klik <b>Setelan Lainnya (More Settings)</b>.</li>
                  <li>Pada pilihan <b>Kualitas (Quality / Resolution)</b>, ubah dari 240/360 dpi menjadi <b>120 x 144 dpi</b> atau <b>120 x 72 dpi</b>. Opsi dpi rendah ini adalah mode teks pita khas dot matrix!</li>
                  <li>Pastikan centang <b>Background Graphics / Grafik Latar Belakang</b> dalam keadaan <u>dimatikan (OFF)</u>.</li>
                </ol>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowLx310GuideModal(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QZ Tray Printer Selection Modal */}
      {showQzModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col">
            <button
              onClick={() => setShowQzModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3 border-b border-slate-100 pb-3">
              <div className="bg-emerald-100 text-emerald-900 p-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-600 fill-emerald-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">Cetak Direct QZ Tray</h4>
                <p className="text-xs text-slate-500">Koneksi Hardware RAW Direct ke Epson LX-310</p>
              </div>
            </div>

            <div className="space-y-4 my-2 text-xs text-slate-700">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl space-y-1">
                <div className="font-bold text-emerald-950">QZ Tray Terhubung!</div>
                <p className="text-emerald-900">
                  Sistem berhasil mendeteksi aplikasi QZ Tray di komputer Anda. Silakan pilih printer Dot Matrix Anda di bawah ini:
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Pilih Printer Dot Matrix (EPSON LX-310):
                </label>
                <select
                  value={selectedQzPrinter}
                  onChange={(e) => setSelectedQzPrinter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {qzPrinterList.map((printer, idx) => (
                    <option key={idx} value={printer}>
                      {printer} {printer.toUpperCase().includes('LX') || printer.toUpperCase().includes('EPSON') ? '★ (Rekomendasi LX-310)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                *Catatan: Saat pertama kali menekan Cetak, QZ Tray di Windows akan menampilkan pop-up konfirmasi dialog keselamatan. Klik tombol <b>"Allow"</b> / <b>"Remember"</b>.
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowQzModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => handlePrintQZTray()}
                disabled={isQzPrinting || !selectedQzPrinter}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-extrabold py-2.5 px-5 rounded-xl text-xs transition-colors shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                {isQzPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Cetak Sekarang (100% Tajam)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSPrintManager (JSPM) Selection Modal */}
      {showJspmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col">
            <button
              onClick={() => setShowJspmModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3 border-b border-slate-100 pb-3">
              <div className="bg-indigo-100 text-indigo-900 p-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center">
                <Printer className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">Cetak JSPrintManager (JSPM)</h4>
                <p className="text-xs text-slate-500">Koneksi Hardware RAW via JSPrintManager Client</p>
              </div>
            </div>

            <div className="space-y-4 my-2 text-xs text-slate-700">
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl space-y-1">
                <div className="font-bold text-indigo-950">JSPrintManager Client Terhubung!</div>
                <p className="text-indigo-900">
                  Aplikasi JSPrintManager di Windows berhasil terdeteksi. Silakan pilih printer EPSON LX-310 Anda di bawah ini:
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Pilih Printer Dot Matrix (EPSON LX-310):
                </label>
                <select
                  value={selectedJspmPrinter}
                  onChange={(e) => setSelectedJspmPrinter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {jspmPrinterList.map((printer, idx) => (
                    <option key={idx} value={printer}>
                      {printer} {printer.toUpperCase().includes('LX') || printer.toUpperCase().includes('EPSON') ? '★ (Rekomendasi LX-310)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                *Mengirim perintah karakter ESC/P langsung ke port USB printer. Hasil cetakan dipastikan <b>100% tajam & tanpa raster gambar</b>.
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowJspmModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={() => handlePrintJSPM()}
                disabled={isJspmPrinting}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-extrabold py-2.5 px-5 rounded-xl text-xs transition-colors shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                {isJspmPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" />
                    <span>Cetak Sekarang (JSPM Tajam)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSPrintManager Activation Guide Modal */}
      {showJspmHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowJspmHelpModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3 border-b border-slate-100 pb-3">
              <div className="bg-indigo-100 text-indigo-900 p-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center">
                <Printer className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">Panduan Mengaktifkan JSPrintManager</h4>
                <p className="text-xs text-slate-500">3 Langkah Cepat Mengaktifkan Koneksi JSPrintManager di Windows</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-1">
                <div className="font-bold text-amber-950">Status: Belum Terhubung</div>
                <p className="text-amber-900 text-[11px]">
                  Browser belum dapat berkomunikasi dengan aplikasi JSPrintManager di Komputer Anda. Ikuti 3 langkah mudah berikut:
                </p>
              </div>

              <div className="border border-slate-200 p-3 rounded-xl space-y-1.5 bg-slate-50">
                <div className="font-bold text-slate-900">1. Jalankan Aplikasi JSPrintManager di Windows</div>
                <p className="text-slate-600 text-[11px]">
                  Buka Start Menu Windows &gt; ketik <b>JSPrintManager</b> &gt; klik jalankan. Pastikan ikon JSPrintManager sudah muncul di pojok kanan bawah Windows (dekat jam).
                </p>
              </div>

              <div className="border border-indigo-200 p-3 rounded-xl space-y-1.5 bg-indigo-50/70">
                <div className="font-bold text-indigo-950">2. Izinkan Sertifikat HTTPS Localhost (PENTING)</div>
                <p className="text-indigo-900 text-[11px]">
                  Karena web ini menggunakan HTTPS, browser Chrome memblokir koneksi ke JSPrintManager sebelum Anda mengizinkannya 1x.<br/>
                  <b>Klik tombol biru di bawah ini untuk membuka dan mengizinkan localhost:</b>
                </p>
                <div className="flex gap-2 pt-1">
                  <a
                    href="https://localhost:20001"
                    target="_blank"
                    rel="noreferrer"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg text-[11px] inline-flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka https://localhost:20001</span>
                  </a>
                </div>
                <p className="text-[10px] text-slate-500 pt-1">
                  *Di tab baru yang terbuka: Klik <b>"Advanced" (Lanjutan)</b> &gt; lalu klik <b>"Proceed to localhost (unsafe)" / "Lanjutkan"</b>. Setelah itu tutup tab tersebut.
                </p>
              </div>

              <div className="border border-slate-200 p-3 rounded-xl space-y-1.5 bg-slate-50">
                <div className="font-bold text-slate-900">3. Klik "Cetak JSPrintManager" Kembali</div>
                <p className="text-slate-600 text-[11px]">
                  Setelah menjalankan JSPrintManager dan mengizinkan tautan di atas, klik tombol <b>Cetak JSPrintManager (JSPM)</b> di aplikasi ini. Struk akan langsung tercetak 100% tajam!
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowJspmHelpModal(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
