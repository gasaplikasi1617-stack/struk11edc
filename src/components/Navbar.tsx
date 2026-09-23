import React, { useEffect, useState } from 'react';
import { Printer, History, Receipt, RefreshCw, Database, ExternalLink } from 'lucide-react';
import { subscribeSyncState, SyncState, executeTwoWaySync, getStoredSheetUrl } from '../services/gasClientSync';

interface NavbarProps {
  activeTab: 'create' | 'history' | 'gas';
  setActiveTab: (tab: 'create' | 'history' | 'gas') => void;
  historyCount: number;
  onSyncTrigger?: () => void;
}

export function Navbar({ activeTab, setActiveTab, historyCount, onSyncTrigger }: NavbarProps) {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncedAt: null,
    lastError: null,
    totalInSheet: 0,
  });

  const [sheetUrl, setSheetUrl] = useState<string>(getStoredSheetUrl());

  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setSyncState(state);
      if (state.sheetUrl) {
        setSheetUrl(state.sheetUrl);
      }
    });
    return unsubscribe;
  }, []);

  const handleManualSyncClick = async () => {
    try {
      await executeTwoWaySync();
      if (onSyncTrigger) onSyncTrigger();
    } catch {}
  };

  const handleOpenDatabaseLink = () => {
    const url = sheetUrl || getStoredSheetUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      setActiveTab('gas');
    }
  };

  const formatLastSync = (iso: string | null) => {
    if (!iso) return 'Belum sync';
    const date = new Date(iso);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg leading-tight tracking-tight">Cetak Resi Tagihan</h1>
                {/* Auto Sync Live Pill */}
                <button
                  onClick={handleManualSyncClick}
                  title="Auto-Sync 2 Arah Aktif ke Google Sheets. Klik untuk sinkron manual sekarang."
                  className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                    syncState.status === 'syncing'
                      ? 'bg-blue-900/60 text-blue-300 border-blue-700 animate-pulse'
                      : syncState.status === 'error'
                      ? 'bg-rose-900/40 text-rose-300 border-rose-700 hover:bg-rose-900/60'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/80'
                  }`}
                >
                  {syncState.status === 'syncing' ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                      <span>Menyinkronkan...</span>
                    </>
                  ) : syncState.status === 'error' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      <span>Auto-Sync Gagal</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Auto-Sync Aktif ({formatLastSync(syncState.lastSyncedAt)})</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-400">Agen Batara — Bekasi & Google Apps Script</p>
            </div>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'create'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span className="hidden md:inline">Buat &amp; Cetak Resi</span>
              <span className="md:hidden">Resi</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Riwayat</span>
              {historyCount > 0 && (
                <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                  {historyCount > 99 ? '99+' : historyCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('gas')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'gas'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Database</span>
            </button>

            {/* Direct Button: Link Database Google Sheet */}
            <button
              onClick={handleOpenDatabaseLink}
              title={sheetUrl ? 'Buka Google Sheet Database di Tab Baru' : 'Atur / Buka Link Database Google Sheet'}
              className="hidden sm:flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs border border-emerald-400/30"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Link Database</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
