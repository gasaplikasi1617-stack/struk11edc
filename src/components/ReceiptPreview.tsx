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
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { drawReceiptToCanvas } from '../utils/receiptCanvasDrawer';

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
    showActionNotice('Menyiapkan gambar struk resolusi tajam (A6)...');

    const safeId = (receipt.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = (receipt.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = (receipt.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
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
            onClick={onSave}
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
            <span className="text-[10px] bg-blue-800/70 px-1.5 py-0.2 rounded font-mono">Auto Save</span>
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

      {/* A6 Receipt Container - styled specifically for A6 portrait look and print */}
      <div
        id="printable-receipt"
        className="w-full max-w-[380px] bg-white p-5 text-black font-mono text-xs border-0 outline-none shadow-none relative my-2"
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
    </div>
  );
}
