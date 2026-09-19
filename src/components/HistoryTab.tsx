import React, { useState } from 'react';
import { ReceiptData } from '../types';
import { History, Search, Printer, Trash2, ArrowUpDown, FileText, CheckCircle2 } from 'lucide-react';

interface HistoryTabProps {
  transactions: ReceiptData[];
  onSelectTransaction: (tx: ReceiptData) => void;
  onDeleteTransaction: (id: string) => void;
}

export function HistoryTab({ transactions, onSelectTransaction, onDeleteTransaction }: HistoryTabProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = transactions.filter((t) => {
    const q = searchTerm.toLowerCase();
    return (
      (t.id && t.id.toLowerCase().includes(q)) ||
      (t.idpel && t.idpel.toLowerCase().includes(q)) ||
      (t.namaPelanggan && t.namaPelanggan.toLowerCase().includes(q)) ||
      (t.rincianTagihan && t.rincianTagihan.toLowerCase().includes(q))
    );
  });

  const recent20 = transactions.slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <History className="w-6 h-6 text-blue-600" />
              <span>Riwayat Transaksi & 20 Terakhir</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Setiap resi yang dicetak atau disimpan otomatis tercatat. Akses 20 transaksi terakhir untuk cetak ulang instan.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari ID Pelanggan / Nama..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64"
            />
          </div>
        </div>

        {/* 20 Recent Shortcuts Bar */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Shortcut 20 Transaksi Terakhir (Instant Reprint)
          </h3>
          {recent20.length === 0 ? (
            <p className="text-sm text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center">
              Belum ada riwayat transaksi tersimpan. Buat dan simpan resi pertama Anda!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {recent20.map((tx, idx) => (
                <div
                  key={tx.id || idx}
                  onClick={() => onSelectTransaction(tx)}
                  className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 p-3 rounded-xl cursor-pointer transition-all shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-mono text-slate-500">{tx.tanggal}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                    </div>
                    <p className="font-bold text-xs text-slate-800 truncate">{tx.namaPelanggan}</p>
                    <p className="text-[11px] text-slate-500 font-mono">ID: {tx.idpel}</p>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-extrabold text-blue-600">
                      Rp {Number(tx.totalBayar || 0).toLocaleString('id-ID')}
                    </span>
                    <span className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium">
                      <Printer className="w-3 h-3" /> Cetak
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Full History Table */}
        <div className="border-t pt-6">
          <h3 className="font-bold text-sm text-slate-800 mb-4">Semua Riwayat Transaksi ({filtered.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider">
                  <th className="p-3 rounded-l-lg">ID Transaksi</th>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">ID Pelanggan</th>
                  <th className="p-3">Nama Pelanggan</th>
                  <th className="p-3">Rincian</th>
                  <th className="p-3">Total Bayar</th>
                  <th className="p-3 text-right rounded-r-lg">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Tidak ada data riwayat transaksi yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  filtered.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono text-xs text-slate-600">{tx.id}</td>
                      <td className="p-3 text-slate-600">{tx.tanggal}</td>
                      <td className="p-3 font-mono font-semibold">{tx.idpel}</td>
                      <td className="p-3 font-medium uppercase">{tx.namaPelanggan}</td>
                      <td className="p-3 text-slate-600">{tx.rincianTagihan}</td>
                      <td className="p-3 font-extrabold text-blue-700">
                        Rp {Number(tx.totalBayar || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => onSelectTransaction(tx)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg shadow-xs inline-flex items-center gap-1 font-medium"
                        >
                          <Printer className="w-3.5 h-3.5" /> Cetak
                        </button>
                        {tx.id && (
                          <button
                            onClick={() => onDeleteTransaction(tx.id!)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs p-1.5 rounded-lg transition-all"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
