import React, { useEffect, useState } from 'react';
import { Home, History, Receipt, RefreshCw, LogOut, UserCheck } from 'lucide-react';
import { subscribeSyncState, SyncState, executeTwoWaySync } from '../services/gasClientSync';
import { AppUser } from '../types';

interface NavbarProps {
  activeTab: 'create' | 'history' | 'gas';
  setActiveTab: (tab: 'create' | 'history' | 'gas') => void;
  historyCount: number;
  onSyncTrigger?: () => void;
  currentUser?: AppUser | null;
  onLogout?: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  historyCount,
  onSyncTrigger,
  currentUser,
  onLogout,
}: NavbarProps) {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncedAt: null,
    lastError: null,
    totalInSheet: 0,
  });

  useEffect(() => {
    const unsubscribe = subscribeSyncState((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  const handleManualSyncClick = async () => {
    try {
      await executeTwoWaySync();
      if (onSyncTrigger) onSyncTrigger();
    } catch {}
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
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white p-1 shadow-md border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src="https://iili.io/nRihMkG.png"
                alt="Logo Aplikasi Cetak Resi"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo.png';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg leading-tight tracking-tight">Sistem Pembayaran Online</h1>
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
              <p className="text-xs text-slate-400">Agen Batara</p>
            </div>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
              title="Halaman Utama / Input Resi"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
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
                  {historyCount > 999 ? '999+' : historyCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('gas')}
              className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'gas'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Integrasi</span>
            </button>

            {/* User Profile Badge & Logout Button */}
            {currentUser && (
              <div className="flex items-center pl-2 sm:pl-3 border-l border-slate-700/80 gap-2">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-100 flex items-center justify-end gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{currentUser.username}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium capitalize">
                    {currentUser.role || 'Admin'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="bg-rose-900/40 hover:bg-rose-800/80 text-rose-200 hover:text-white p-2 rounded-lg border border-rose-700/60 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                  title={`Logout (${currentUser.username})`}
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span className="hidden lg:inline">Keluar</span>
                </button>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
