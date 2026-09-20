import React, { useState, useEffect } from 'react';
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
  MessageSquare,
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { drawReceiptToCanvas, drawDotMatrixToCanvas } from '../utils/receiptCanvasDrawer';
import { DotMatrixReceipt } from './DotMatrixReceipt';
import {
  formatReceiptForWhatsApp,
  getWhatsAppShareUrl,
  copyImageBlobToClipboard,
  copyTextToClipboard,
} from '../utils/whatsappFormatter';

interface ReceiptPreviewProps {
  receipt: ReceiptData;
  onPrint: () => void;
  onSave: () => void;
  savedStatus: boolean;
}

interface DownloadedModalState {
  url: string;
  blob: Blob | null;
  fileName: string;
}

export function ReceiptPreview({ receipt, onPrint, onSave, savedStatus }: ReceiptPreviewProps) {
  const [layoutMode, setLayoutMode] = useState<'dotmatrix' | 'a6'>('dotmatrix');
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [downloadedModal, setDownloadedModal] = useState<DownloadedModalState | null>(null);
  const [copiedClipboard, setCopiedClipboard] = useState(false);

  const showActionNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice(null);
    }, 5000);
  };

  const handlePrintDotMatrix = () => {
    // 1. Otomatis simpan data transaksi ke riwayat
    onSave();
    showActionNotice('Data otomatis tersimpan! Menyiapkan cetak Dot Matrix 21,6 x 6,95 cm (1 lembar pas)...');

    // Injeksi style print khusus dot matrix untuk fallback in-page
    const existingStyle = document.getElementById('dotmatrix-print-style');
    if (existingStyle) existingStyle.remove();

    const printStyle = document.createElement('style');
    printStyle.id = 'dotmatrix-print-style';
    printStyle.innerHTML = `
      @page {
        size: 216mm 69.5mm !important;
        margin: 0 !important;
      }
    `;
    document.head.appendChild(printStyle);
    document.body.classList.add('print-mode-dotmatrix');

    const dotmatrixElement = document.getElementById('printable-dotmatrix-receipt');
    const innerHtml = dotmatrixElement ? dotmatrixElement.innerHTML : '';

    try {
      const printWindow = window.open('', '_blank', 'width=950,height=440');
      if (!printWindow) {
        window.print();
        setTimeout(() => {
          document.body.classList.remove('print-mode-dotmatrix');
          printStyle.remove();
        }, 1500);
        return;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Cetak Dot Matrix Bukopin - ${receipt.namaPelanggan || 'Pelanggan'}</title>
          <style>
            @page {
              size: 216mm 69.5mm;
              margin: 0mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html, body {
              width: 216mm;
              height: 69.5mm;
              max-height: 69.5mm;
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: "Courier New", Courier, "Lucida Console", Monaco, monospace;
              overflow: hidden;
            }
            @media print {
              html, body {
                width: 216mm !important;
                height: 69.5mm !important;
                max-height: 69.5mm !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #ffffff !important;
                page-break-inside: avoid !important;
                page-break-after: avoid !important;
                page-break-before: avoid !important;
                break-inside: avoid !important;
                break-after: avoid !important;
              }
            }
            .dotmatrix-print-box {
              width: 216mm;
              height: 69.5mm;
              max-height: 69.5mm;
              overflow: hidden;
              padding: 2.5mm 5mm;
              box-sizing: border-box;
              font-size: 9.5pt;
              line-height: 1.18;
              color: #000000;
              background: #ffffff;
            }
            .dotmatrix-print-box * {
              color: #000000 !important;
            }
          </style>
        </head>
        <body>
          <div class="dotmatrix-print-box">
            ${innerHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
                window.close();
              }, 300);
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      setTimeout(() => {
        document.body.classList.remove('print-mode-dotmatrix');
        printStyle.remove();
      }, 1500);
    } catch (e) {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('print-mode-dotmatrix');
        printStyle.remove();
      }, 1500);
    }
  };

  const handleDirectPrint = (isPdf = false) => {
    // 1. Otomatis simpan data transaksi ke riwayat
    onSave();
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
    onSave();

    setIsDownloadingImage(true);
    const isDm = layoutMode === 'dotmatrix';
    showActionNotice(
      isDm
        ? 'Menyiapkan gambar struk Dot Matrix Bukopin (21,6 x 6,95 cm)...'
        : 'Menyiapkan gambar struk resolusi tajam (A6)...'
    );

    const safeId = (receipt.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = (receipt.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = (receipt.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
    const fileName = isDm
      ? `Struk_DotMatrix_Bukopin_${safeId}_${safeName}_${dateStr}.png`
      : `Struk_${safeId}_${safeName}_${dateStr}.png`;

    try {
      let canvas: HTMLCanvasElement | null = null;
      if (isDm) {
        canvas = drawDotMatrixToCanvas(receipt);
      } else {
        const receiptElement = document.getElementById('printable-receipt');

        // Coba render DOM melalui html2canvas-pro
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

        // Fallback jika html2canvas-pro tidak menghasilkan canvas
        if (!canvas) {
          canvas = drawReceiptToCanvas(receipt);
        }
      }

      // Konversi canvas ke Blob PNG
      const blob: Blob | null = await new Promise((resolve) => {
        canvas!.toBlob((b) => resolve(b), 'image/png', 1.0);
      });

      const fileUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');

      // Trigger auto-download via tag <a> ter-append ke DOM
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

      // Buka modal opsi lengkap untuk user (Unduh Ulang, Buka di Tab Baru, Salin ke WhatsApp)
      setDownloadedModal({
        url: fileUrl,
        blob: blob,
        fileName: fileName,
      });

      showActionNotice(
        isDm
          ? 'Struk Dot Matrix PNG (21,6 x 6,95 cm) berhasil diunduh!'
          : 'Struk PNG berhasil dibuat & unduhan otomatis dimulai!'
      );
    } catch (err: any) {
      console.error('Error generating image file:', err);

      // Emergency fallback dengan pure canvas 2D
      try {
        const fallbackCanvas = isDm ? drawDotMatrixToCanvas(receipt) : drawReceiptToCanvas(receipt);
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

  // Close modal on Escape key
  useEffect(() => {
    if (!downloadedModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDownloadedModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [downloadedModal]);

  const handleCopyImageToClipboard = async () => {
    if (!downloadedModal) return;
    try {
      let copied = false;
      if (downloadedModal.blob) {
        copied = await copyImageBlobToClipboard(downloadedModal.blob);
      }
      if (copied) {
        setCopiedClipboard(true);
        showActionNotice('Gambar struk PNG berhasil disalin! Silakan langsung Paste (Ctrl+V) di chat WhatsApp.');
        setTimeout(() => setCopiedClipboard(false), 3000);
      } else {
        // Fallback: copy WhatsApp formatted text
        const waText = formatReceiptForWhatsApp(receipt);
        const textCopied = await copyTextToClipboard(waText);
        if (textCopied) {
          setCopiedClipboard(true);
          showActionNotice('Browser membatasi salin gambar. Teks rincian WhatsApp telah disalin! Tinggal Paste di WA.');
          setTimeout(() => setCopiedClipboard(false), 3500);
        } else {
          showActionNotice('Klik tombol "Buka Tab Baru", lalu klik kanan dan pilih "Salin Gambar".');
        }
      }
    } catch (e) {
      showActionNotice('Browser membatasi salin otomatis. Gunakan tombol "Buka Tab Baru".');
    }
  };

  const handleSendToWhatsAppDirect = () => {
    const waUrl = getWhatsAppShareUrl(receipt, receipt.noHp);
    window.open(waUrl, '_blank');
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <span>Preview Struk</span>
        </h3>
        <div className="flex items-center gap-2">
          {savedStatus && (
            <span className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Tersimpan
            </span>
          )}
          <button
            onClick={onSave}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
            title="Simpan manual data transaksi ke database riwayat"
          >
            Simpan
          </button>
          <button
            onClick={() => (layoutMode === 'dotmatrix' ? handlePrintDotMatrix() : handleDirectPrint(false))}
            className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            title="Cetak struk dan otomatis simpan ke riwayat"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{layoutMode === 'dotmatrix' ? 'Cetak Dot Matrix' : 'Cetak Resi A6'}</span>
            <span className="text-[10px] bg-black/25 px-1.5 py-0.2 rounded font-mono">Auto Save</span>
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

      {/* Layout Mode Switcher Tabs */}
      <div className="w-full bg-slate-100 p-1 rounded-xl flex items-center gap-1.5 mb-4 border border-slate-200">
        <button
          type="button"
          id="btn-switch-dotmatrix"
          onClick={() => setLayoutMode('dotmatrix')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            layoutMode === 'dotmatrix'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Dot Matrix Bukopin (21,6 x 6,95 cm)</span>
          <span
            className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
              layoutMode === 'dotmatrix' ? 'bg-emerald-950/60 text-emerald-200' : 'bg-slate-200 text-slate-600'
            }`}
          >
            1 Lembar
          </span>
        </button>
        <button
          type="button"
          id="btn-switch-a6"
          onClick={() => setLayoutMode('a6')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            layoutMode === 'a6'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-200/80'
          }`}
        >
          <span className="font-mono text-xs">📄</span>
          <span>Resi Standar (A6 Portrait)</span>
        </button>
      </div>

      {/* Dot Matrix Preview Area */}
      {layoutMode === 'dotmatrix' && (
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-[850px] mb-2 flex items-center justify-between text-[11px] text-slate-500 font-medium px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Continuous Form Horizontal (21,6 x 6,95 cm) • PPOB Bukopin Jaman Dulu</span>
            </span>
            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-mono text-[10px]">
              Tepat 1 Lembar Pas
            </span>
          </div>

          <DotMatrixReceipt receipt={receipt} id="printable-dotmatrix-receipt" showTractorHoles={true} />
        </div>
      )}

      {/* A6 Receipt Container - styled specifically for A6 portrait look and print */}
      <div
        id="printable-receipt"
        className={`w-full max-w-[380px] bg-white p-5 text-black font-mono text-xs border-0 outline-none shadow-none relative my-2 ${
          layoutMode === 'a6' ? 'block' : 'hidden'
        }`}
        style={{ minHeight: '520px' }}
      >
        {/* Header Agen */}
        <div className="text-center border-b-2 border-dashed border-black pb-3 mb-3">
          <h2 className="text-base font-extrabold tracking-wide uppercase text-black">{receipt.namaAgen || 'AGEN BATARA'}</h2>
          <p className="text-[11px] text-black mt-0.5">{receipt.alamat || 'Bekasi'}</p>
          <p className="text-[11px] text-black">Telp/WA: {receipt.noHp || '-'}</p>
          <div className="mt-2 text-[10.5px] py-1 px-1 inline-block font-bold uppercase tracking-wider text-black bg-transparent">
            {(() => {
              const raw = receipt.rincianTagihan || '';
              const clean = raw.replace(/^info\s*tagihan/i, '').replace(/^tagihan/i, '').trim();
              const title = clean || raw || 'PEMBAYARAN RESMI';
              if (title.toUpperCase().includes('STRUK')) return title.toUpperCase();
              return `STRUK PEMBAYARAN ${title.toUpperCase()}`;
            })()}
          </div>
        </div>

        {/* Transaction Metadata */}
        <div className="space-y-1 border-b border-dashed border-black pb-2 mb-3 text-[11px] text-black">
          <div className="flex justify-between">
            <span className="text-black">Tgl/Waktu:</span>
            <span className="font-semibold text-black">{receipt.tanggal || new Date().toLocaleDateString('id-ID')}</span>
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

      {/* Action Buttons: Cetak, Download PDF, Download Gambar - Semua otomatis save data */}
      {layoutMode === 'dotmatrix' ? (
        <div className="w-full mt-4 flex flex-col sm:flex-row gap-2.5">
          <button
            id="btn-print-dotmatrix"
            onClick={handlePrintDotMatrix}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Cetak langsung menggunakan printer Dot Matrix (ukuran kertas 21,6 x 6,95 cm - 1 lembar pas)"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Dot Matrix (21,6 x 6,95 cm)</span>
            <span className="text-[10px] bg-emerald-950/60 text-emerald-200 px-1.5 py-0.2 rounded font-mono">
              1 Lembar
            </span>
          </button>
          <button
            id="btn-download-png"
            onClick={handleDownloadImage}
            disabled={isDownloadingImage}
            className="flex-1 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Download struk format gambar PNG Dot Matrix Bukopin (21,6 x 6,95 cm)"
          >
            {isDownloadingImage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            <span>{isDownloadingImage ? 'Memproses PNG...' : 'Download PNG Bukopin'}</span>
          </button>
          <button
            onClick={() => {
              setLayoutMode('a6');
              setTimeout(() => handleDirectPrint(false), 100);
            }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2.5 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Beralih dan cetak versi A6 Portrait"
          >
            <span>Cetak Resi A6</span>
          </button>
        </div>
      ) : (
        <div className="w-full mt-4 flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={() => handleDirectPrint(false)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Cetak langsung struk ukuran A6 (Otomatis simpan ke riwayat transaksi)"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Langsung (A6)</span>
          </button>
          <button
            onClick={() => handleDirectPrint(true)}
            className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Download struk format PDF A6 (Otomatis simpan ke riwayat transaksi)"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
          <button
            id="btn-download-png"
            onClick={handleDownloadImage}
            disabled={isDownloadingImage}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-semibold py-2.5 px-3 rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Download struk format gambar PNG resolusi tajam (Otomatis simpan ke riwayat transaksi)"
          >
            {isDownloadingImage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            <span>{isDownloadingImage ? 'Memproses PNG...' : 'Download Gambar (PNG)'}</span>
          </button>
        </div>
      )}

      {/* Auto Save Assurance Notice */}
      <p className="text-[11px] text-slate-500 text-center mt-2.5 flex items-center justify-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        {layoutMode === 'dotmatrix' ? (
          <span>Printer Dot Matrix: Dikalibrasi <b>216mm x 69.5mm</b> (1 lembar pas) & otomatis simpan ke riwayat.</span>
        ) : (
          <span>Setiap tombol <b>Cetak</b> atau <b>Download</b> otomatis menyimpan data ke riwayat transaksi.</span>
        )}
      </p>

      {/* Download PNG Success & Actions Modal */}
      {downloadedModal && (
        <div
          onClick={() => setDownloadedModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col max-h-[90vh] cursor-default"
          >
            <button
              type="button"
              onClick={() => setDownloadedModal(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Tutup (Esc)"
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

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyImageToClipboard}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
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
                      <span>Salin Gambar (WA)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSendToWhatsAppDirect}
                  className="bg-[#25D366] hover:bg-[#1EBE5D] text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  title="Kirim rincian struk via WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Buka WhatsApp</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => window.open(downloadedModal.url, '_blank')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="Buka gambar di tab browser baru"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>Buka Gambar di Tab Baru</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center mt-3">
              *Jika unduhan otomatis dibatasi oleh browser, klik tombol <strong>Unduh File PNG</strong> di atas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
