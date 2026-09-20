import React from 'react';
import { AlertTriangle, History, X, Check, ArrowRight } from 'lucide-react';
import { ReceiptData } from '../types';

interface DuplicateWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: string;
  incoming: Partial<ReceiptData>;
  matched?: ReceiptData;
  onForceSave?: () => void;
  onViewHistory?: () => void;
}

export function DuplicateWarningModal({
  isOpen,
  onClose,
  reason,
  incoming,
  matched,
  onForceSave,
  onViewHistory,
}: DuplicateWarningModalProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-amber-200 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-xs">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Peringatan Transaksi Duplikat</h3>
              <p className="text-xs text-amber-100">Data tidak disimpan ganda ke riwayat</p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Tutup (Batalkan)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm leading-relaxed flex items-start gap-2.5">
            <span className="font-semibold text-amber-800 shrink-0">Info:</span>
            <span>{reason || 'Transaksi dengan rincian ini sudah pernah tercatat di riwayat.'}</span>
          </div>

          {/* Comparison card if matched exists */}
          {matched && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
              <div className="font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Data yang Ada di Riwayat:</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                  {matched.id || '-'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-slate-600">
                <div>
                  <span className="text-slate-400">ID Pelanggan:</span>{' '}
                  <span className="font-semibold text-slate-800 font-mono">{matched.idpel || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Nama:</span>{' '}
                  <span className="font-semibold text-slate-800 uppercase">{matched.namaPelanggan || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Periode:</span>{' '}
                  <span className="font-semibold text-slate-800">{matched.bulanTagihan || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400">Tanggal:</span>{' '}
                  <span className="font-semibold text-slate-800">{matched.tanggal || '-'}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-slate-500">Total Pembayaran:</span>
                  <span className="font-bold text-blue-700 text-sm">
                    Rp {Number(matched.totalBayar || 0).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center">
            Aplikasi otomatis mengamankan database agar tidak terjadi duplikasi pembukuan transaksi.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5 justify-end">
          {onViewHistory && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewHistory();
              }}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <History className="w-4 h-4" />
              <span>Lihat di Riwayat</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Tutup (Batalkan Simpan)</span>
          </button>

          {onForceSave && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onForceSave();
              }}
              className="text-xs text-slate-400 hover:text-slate-600 underline text-center sm:self-center py-1 cursor-pointer"
            >
              Tetap Simpan Sebagai Data Baru
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
