import React, { useState } from 'react';
import { ReceiptData } from '../types';
import { Printer, Download, CheckCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';

interface ReceiptPreviewProps {
  receipt: ReceiptData;
  onPrint: () => void;
  onSave: () => void;
  savedStatus: boolean;
}

export function ReceiptPreview({ receipt, onPrint, onSave, savedStatus }: ReceiptPreviewProps) {
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const showActionNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => {
      setActionNotice(null);
    }, 4000);
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
    // 1. Otomatis simpan data transaksi ke riwayat
    onSave();
    const receiptElement = document.getElementById('printable-receipt');
    if (!receiptElement) return;

    try {
      setIsDownloadingImage(true);
      showActionNotice('Menyiapkan file gambar struk & data otomatis tersimpan ke riwayat...');

      const canvas = await html2canvas(receiptElement, {
        scale: 2.5,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeId = (receipt.idpel || 'Resi').replace(/[^a-zA-Z0-9]/g, '_');
      const safeName = (receipt.namaPelanggan || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = (receipt.tanggal || '').replace(/[^a-zA-Z0-9]/g, '_') || Date.now();
      link.href = dataUrl;
      link.download = `Struk_${safeId}_${safeName}_${dateStr}.png`;
      link.click();

      showActionNotice('Struk PNG berhasil di-download & data otomatis tersimpan ke riwayat!');
    } catch (err) {
      console.error('Error generating image file:', err);
    } finally {
      setIsDownloadingImage(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <span>4. Preview Resi Ukuran A6</span>
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
        <div className="space-y-1 border-b border-dashed border-slate-400 pb-2 mb-3 text-[11px] text-black">
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
          <span>Download Gambar (PNG)</span>
        </button>
      </div>

      {/* Auto Save Assurance Notice */}
      <p className="text-[11px] text-slate-500 text-center mt-2.5 flex items-center justify-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Setiap tombol <b>Cetak</b> atau <b>Download</b> otomatis menyimpan data ke riwayat transaksi.</span>
      </p>
    </div>
  );
}
