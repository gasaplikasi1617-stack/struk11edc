import React from 'react';
import { ReceiptData } from '../types';
import { Printer, Download, CheckCircle, ShieldCheck } from 'lucide-react';

interface ReceiptPreviewProps {
  receipt: ReceiptData;
  onPrint: () => void;
  onSave: () => void;
  savedStatus: boolean;
}

export function ReceiptPreview({ receipt, onPrint, onSave, savedStatus }: ReceiptPreviewProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-4">
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
          >
            Simpan
          </button>
          <button
            onClick={onPrint}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg shadow-sm transition-all flex items-center gap-1"
          >
            <Printer className="w-3.5 h-3.5" /> Cetak / PDF
          </button>
        </div>
      </div>

      {/* A6 Receipt Container - styled specifically for A6 portrait look and print */}
      <div
        id="printable-receipt"
        className="w-full max-w-[380px] bg-white border-2 border-slate-800 p-5 text-slate-900 font-mono text-xs shadow-xl relative my-2"
        style={{ minHeight: '520px' }}
      >
        {/* Header Agen */}
        <div className="text-center border-b-2 border-dashed border-slate-700 pb-3 mb-3">
          <h2 className="text-base font-extrabold tracking-wide uppercase">{receipt.namaAgen || 'AGEN BATARA'}</h2>
          <p className="text-[11px] text-slate-700 mt-0.5">{receipt.alamat || 'Bekasi'}</p>
          <p className="text-[11px] text-slate-700">Telp/WA: {receipt.noHp || '-'}</p>
          <div className="mt-2 text-[10px] bg-slate-100 py-0.5 px-2 rounded inline-block font-bold">
            STRUK BUKTI PEMBAYARAN RESMI
          </div>
        </div>

        {/* Transaction Metadata */}
        <div className="space-y-1 border-b border-dashed border-slate-400 pb-2 mb-3 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-600">Tgl/Waktu:</span>
            <span className="font-semibold">{receipt.tanggal || new Date().toLocaleDateString('id-ID')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">ID Pelanggan:</span>
            <span className="font-bold">{receipt.idpel || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Nama:</span>
            <span className="font-bold uppercase">{receipt.namaPelanggan || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Bulan/Periode:</span>
            <span>{receipt.bulanTagihan || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Pemakaian:</span>
            <span>{receipt.pemakaian || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Stand Meter:</span>
            <span>{receipt.standMeter || '-'}</span>
          </div>
        </div>

        {/* Bill Details */}
        <div className="space-y-1.5 border-b-2 border-dashed border-slate-700 pb-3 mb-3">
          <div className="text-[11px] font-bold text-slate-700 mb-1">Rincian Transaksi:</div>
          <div className="flex justify-between text-[11px]">
            <span>{receipt.rincianTagihan || 'Tagihan Pembayaran'}</span>
            <span>Rp {Number(receipt.rpTagihan || 0).toLocaleString('id-ID')}</span>
          </div>
          {Number(receipt.lainLain) > 0 && (
            <div className="flex justify-between text-[11px]">
              <span>Biaya Lain-Lain</span>
              <span>Rp {Number(receipt.lainLain || 0).toLocaleString('id-ID')}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span>Admin Bank / Loket</span>
            <span>Rp {Number(receipt.adminBank || 0).toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* Total Bayar */}
        <div className="bg-slate-100 border border-slate-300 p-2.5 rounded mb-4 text-center">
          <div className="text-[10px] text-slate-600 uppercase font-bold">Total Pembayaran</div>
          <div className="text-base font-extrabold text-blue-900 mt-0.5">
            Rp {Number(receipt.totalBayar || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold mt-1 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> LUNAS & TERVERIFIKASI
          </div>
        </div>

        {/* Footer Barcode Placeholder */}
        <div className="text-center pt-2">
          <div className="font-mono tracking-widest text-xs font-bold text-slate-800">
            ||| | |||| || |||||| | |||
          </div>
          <p className="text-[9px] text-slate-500 mt-1">Terima Kasih Atas Pembayaran Anda</p>
          <p className="text-[9px] text-slate-400">Simpan struk ini sebagai bukti pembayaran yang sah.</p>
        </div>
      </div>

      <div className="w-full mt-4 flex gap-3">
        <button
          onClick={onPrint}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow flex items-center justify-center gap-2 transition-all"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Langsung (A6)</span>
        </button>
        <button
          onClick={onPrint}
          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow flex items-center justify-center gap-2 transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF</span>
        </button>
      </div>
    </div>
  );
}
