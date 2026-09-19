import React from 'react';
import { Printer, History, Receipt, RefreshCw } from 'lucide-react';

interface NavbarProps {
  activeTab: 'create' | 'history' | 'gas';
  setActiveTab: (tab: 'create' | 'history' | 'gas') => void;
  historyCount: number;
}

export function Navbar({ activeTab, setActiveTab, historyCount }: NavbarProps) {
  return (
    <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md flex items-center justify-center">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight">Cetak Resi Tagihan</h1>
              <p className="text-xs text-slate-400">Agen Batara — Bekasi & Google Apps Script</p>
            </div>
          </div>

          <nav className="flex space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'create'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Buat & Cetak Resi</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
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
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'gas'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Integrasi & Sinkron GAS</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
