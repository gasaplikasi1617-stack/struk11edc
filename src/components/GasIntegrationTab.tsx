import React, { useState, useEffect } from 'react';
import {
  FileCode2,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  BookOpen,
  RefreshCw,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Link,
  Database,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { GasSyncConfig, ReceiptData } from '../types';
import { DEFAULT_GAS_DATA, DEFAULT_GAS_URL, GasScriptData } from '../data/gasTemplates';
import {
  executeTwoWaySync,
  directGasCall,
  getStoredTransactions,
  saveStoredTransactions,
  setStoredGasUrl,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  getAutoSyncInterval,
  setAutoSyncInterval,
  subscribeSyncState,
  SyncState,
} from '../services/gasClientSync';

interface GasIntegrationTabProps {
  onSyncSuccess?: () => void;
}

async function safeFetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }
    return data;
  } catch {
    const lower = text.toLowerCase();
    if (lower.includes('the page') || lower.includes('<!doctype') || lower.includes('<html') || lower.includes('servicelogin')) {
      throw new Error(
        'Google Apps Script mengembalikan halaman HTML/Error. Pastikan izin deployment Web App di Apps Script diset ke "Who has access: Anyone" (Siapa saja) dan URL berakhiran /exec.'
      );
    }
    throw new Error(text.slice(0, 200) || `Server mengembalikan status HTTP ${res.status}`);
  }
}

export function GasIntegrationTab({ onSyncSuccess }: GasIntegrationTabProps) {
  const [gasData, setGasData] = useState<GasScriptData>(DEFAULT_GAS_DATA);

  const [gasUrl, setGasUrl] = useState(DEFAULT_GAS_URL);
  const [autoSync, setAutoSync] = useState(isAutoSyncEnabled());
  const [syncInterval, setSyncInterval] = useState(getAutoSyncInterval());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [liveSyncState, setLiveSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncedAt: null,
    lastError: null,
    totalInSheet: 0,
  });

  const [copiedGs, setCopiedGs] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [showConfig, setShowConfig] = useState(true);
  const [directSheetUrl, setDirectSheetUrl] = useState<string>(getStoredSheetUrl());
  const [previewSearch, setPreviewSearch] = useState('');

  // Operation states
  const [isTesting, setIsTesting] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [sheetInfo, setSheetInfo] = useState<{ name?: string; url?: string } | null>(null);

  const [syncNotice, setSyncNotice] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Preview of live data from GAS/Sheet
  const [previewData, setPreviewData] = useState<ReceiptData[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Subscribe to live sync events
  useEffect(() => {
    const unsub = subscribeSyncState((state) => {
      setLiveSyncState(state);
      if (state.lastSyncedAt) setLastSyncedAt(state.lastSyncedAt);
    });
    return unsub;
  }, []);

  // Load config and code on mount
  useEffect(() => {
    // 1. Load GAS source code from server if updated
    fetch('/api/gas-code')
      .then((res) => {
        if (!res.ok) throw new Error('Network error');
        return res.json();
      })
      .then((data) => {
        if (data && data.codeGs && data.indexHtml) {
          setGasData(data);
        }
      })
      .catch((err) => console.log('Using default GAS code:', err.message));

    // 2. Load stored GAS config
    fetch('/api/gas/config')
      .then((res) => res.json())
      .then((cfg: GasSyncConfig) => {
        const urlToSet = cfg.gasUrl || DEFAULT_GAS_URL;
        setGasUrl(urlToSet);
        if (typeof cfg.autoSync === 'boolean') setAutoSync(cfg.autoSync);
        if (cfg.lastSyncedAt) setLastSyncedAt(cfg.lastSyncedAt);

        // If URL exists, fetch preview
        if (urlToSet) {
          loadPreview(urlToSet);
        }
      })
      .catch(() => {
        // Fallback local storage
        const savedUrl = localStorage.getItem('gas_web_app_url');
        const urlToSet = savedUrl || DEFAULT_GAS_URL;
        setGasUrl(urlToSet);
      });
  }, []);

  const loadPreview = async (targetUrl?: string) => {
    const urlToUse = targetUrl || gasUrl;
    if (!urlToUse) return;

    setIsLoadingPreview(true);
    try {
      const json = await safeFetchJson('/api/gas/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gasUrl: urlToUse }),
      });
      if (json.success && Array.isArray(json.data)) {
        setPreviewData(json.data.slice(0, 10));
        if (json.lastSyncedAt) setLastSyncedAt(json.lastSyncedAt);
        if (onSyncSuccess) onSyncSuccess();
      }
    } catch {
      // preview error silent
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      setStoredGasUrl(gasUrl.trim());
      const data = await safeFetchJson('/api/gas/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gasUrl: gasUrl.trim(), autoSync }),
      });
      if (data.success) {
        setSyncNotice({
          type: 'success',
          text: 'Pengaturan Web App URL Google Apps Script berhasil disimpan!',
        });
      } else {
        throw new Error(data.error || 'Gagal menyimpan pengaturan');
      }
    } catch (e: any) {
      setStoredGasUrl(gasUrl.trim());
      setSyncNotice({
        type: 'success',
        text: 'URL Web App berhasil disimpan ke memori lokal aplikasi.',
      });
    } finally {
      setIsSavingConfig(false);
      setTimeout(() => setSyncNotice(null), 5000);
    }
  };

  const handleTestConnection = async () => {
    if (!gasUrl.trim()) {
      setSyncNotice({
        type: 'error',
        text: 'Silakan isi URL Web App Google Apps Script terlebih dahulu.',
      });
      return;
    }

    setIsTesting(true);
    setSyncNotice({
      type: 'info',
      text: 'Menguji koneksi ke Web App Google Apps Script...',
    });

    try {
      // 1. Coba lewat backend proxy
      let data: any;
      try {
        data = await safeFetchJson('/api/gas/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: gasUrl.trim() }),
        });
      } catch (beErr) {
        // Fallback direct call
        data = await directGasCall(gasUrl.trim(), 'ping');
      }

      if (data && (data.success || data.status === 'online')) {
        const sUrl = data.detail?.spreadsheet?.url || data.spreadsheet?.url || data.detail?.spreadsheetUrl || data.spreadsheetUrl;
        const sName = data.detail?.spreadsheet?.name || data.spreadsheet?.name || data.detail?.spreadsheetName || data.spreadsheetName;
        if (sUrl) {
          setSheetInfo({ name: sName, url: sUrl });
          setDirectSheetUrl(sUrl);
          setStoredSheetUrl(sUrl);
        }
        setSyncNotice({
          type: 'success',
          text: 'Koneksi BERHASIL! Google Apps Script Web App terhubung dan merespons dengan baik.',
        });
        loadPreview(gasUrl.trim());
      } else {
        throw new Error(data.error || 'Respon koneksi tidak valid');
      }
    } catch (e: any) {
      setSyncNotice({
        type: 'error',
        text: e.message || 'Koneksi Gagal. Pastikan Web App di-deploy dengan akses "Anyone" (Siapa saja).',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Setup / Inisialisasi Database Google Sheets
  const handleSetupDatabase = async () => {
    if (!gasUrl.trim()) {
      setSyncNotice({
        type: 'error',
        text: 'Silakan isi URL Web App Google Apps Script terlebih dahulu.',
      });
      return;
    }

    setIsSettingUp(true);
    setSyncNotice({
      type: 'info',
      text: 'Menyiapkan database & tabel RiwayatTransaksi di Google Sheets...',
    });

    try {
      let data: any;
      try {
        data = await safeFetchJson('/api/gas/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: gasUrl.trim() }),
        });
      } catch {
        data = await directGasCall(gasUrl.trim(), 'setupDatabase');
      }

      if (data && data.success) {
        const sUrl = data.detail?.spreadsheetUrl || data.spreadsheetUrl || data.detail?.spreadsheet?.url;
        const sName = data.detail?.spreadsheetName || data.spreadsheetName || data.detail?.spreadsheet?.name;
        if (sUrl) {
          setSheetInfo({ name: sName, url: sUrl });
          setDirectSheetUrl(sUrl);
          setStoredSheetUrl(sUrl);
        }
        setSyncNotice({
          type: 'success',
          text: 'Database Google Sheet BERHASIL disiapkan! Tab RiwayatTransaksi dan header 16 kolom siap digunakan.',
        });
        loadPreview(gasUrl.trim());
      } else {
        throw new Error(data?.error || 'Gagal inisialisasi database');
      }
    } catch (e: any) {
      setSyncNotice({
        type: 'error',
        text: `Gagal Setup Database: ${e.message}`,
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  // Full 2-Way Sync (Sinkron 2 Arah)
  const handleTwoWaySync = async () => {
    if (!gasUrl.trim()) {
      setSyncNotice({
        type: 'error',
        text: 'Silakan isi dan simpan Web App URL terlebih dahulu sebelum sinkronisasi.',
      });
      return;
    }

    setIsSyncing(true);
    setSyncNotice({
      type: 'info',
      text: 'Sedang menjalankan Sinkronisasi 2 Arah (Mengirim data lokal & mengambil data terbaru dari Google Sheets)...',
    });

    try {
      const res = await executeTwoWaySync(gasUrl.trim());
      setSyncNotice({
        type: 'success',
        text: res.message || 'Sinkronisasi 2 arah berhasil dijalankan!',
      });
      if (Array.isArray(res.mergedTransactions)) {
        setPreviewData(res.mergedTransactions.slice(0, 10));
      }
      if (onSyncSuccess) onSyncSuccess();
    } catch (e: any) {
      setSyncNotice({
        type: 'error',
        text: `Gagal Sinkronisasi 2 Arah: ${e.message}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull from Google Sheets (Tarik Data Saja)
  const handlePullOnly = async () => {
    if (!gasUrl.trim()) return;
    setIsPulling(true);
    try {
      let data: any;
      try {
        data = await safeFetchJson('/api/gas/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: gasUrl.trim() }),
        });
      } catch {
        data = await directGasCall(gasUrl.trim(), 'getTransactions');
      }

      const txs = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      if (data && (data.success || Array.isArray(txs))) {
        setSyncNotice({
          type: 'success',
          text: `Berhasil menarik ${txs.length} data dari Google Sheets!`,
        });
        setPreviewData(txs.slice(0, 10));
        if (onSyncSuccess) onSyncSuccess();
      } else {
        throw new Error(data?.error || 'Gagal menarik data');
      }
    } catch (e: any) {
      setSyncNotice({
        type: 'error',
        text: `Gagal menarik data: ${e.message}`,
      });
    } finally {
      setIsPulling(false);
    }
  };

  // Push to Google Sheets (Kirim Data Saja)
  const handlePushOnly = async () => {
    if (!gasUrl.trim()) return;
    setIsPushing(true);
    try {
      const localTxs = getStoredTransactions();
      let data: any;
      try {
        data = await safeFetchJson('/api/gas/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gasUrl: gasUrl.trim(), transactions: localTxs }),
        });
      } catch {
        data = await directGasCall(gasUrl.trim(), 'twoWaySync', { transactions: localTxs });
      }

      if (data && data.success) {
        setSyncNotice({
          type: 'success',
          text: data.message || 'Berhasil mengirim transaksi lokal ke Google Sheets!',
        });
        loadPreview(gasUrl.trim());
      } else {
        throw new Error(data?.error || 'Gagal mengirim data');
      }
    } catch (e: any) {
      setSyncNotice({
        type: 'error',
        text: `Gagal mengirim data: ${e.message}`,
      });
    } finally {
      setIsPushing(false);
    }
  };

  const copyToClipboard = (text: string, type: 'gs' | 'html') => {
    navigator.clipboard.writeText(text);
    if (type === 'gs') {
      setCopiedGs(true);
      setTimeout(() => setCopiedGs(false), 2000);
    } else {
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Integration Header & Link Database Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-xs">
                <Database className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">
                Database Google Sheets &amp; Pengaturan Sync
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Semua data transaksi tersimpan dan tersinkronisasi 2 arah secara otomatis ke <strong>Google Sheets</strong>. 
              Gunakan tombol <strong>Link Database</strong> di bawah untuk membuka spreadsheet Anda secara langsung.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* LINK DATABASE BUTTON */}
            <a
              href={directSheetUrl || sheetInfo?.url || 'https://docs.google.com/spreadsheets'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm border border-emerald-500"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Link Database Google Sheet</span>
            </a>

            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${
                gasUrl.trim()
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${gasUrl.trim() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{gasUrl.trim() ? 'Google Sheet Terhubung' : 'Belum Ada URL'}</span>
            </span>
          </div>
        </div>

        {/* Persistent Pengaturan & Sync Container */}
        <div className="pt-6 border-t border-slate-100 space-y-6">
          {/* Sync Status / Notice Banner */}
          {syncNotice && (
            <div
              className={`p-4 rounded-xl text-xs flex flex-col gap-2 transition-all shadow-xs ${
                syncNotice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : syncNotice.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {syncNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : syncNotice.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
                )}
                <div className="flex-1 font-medium">{syncNotice.text}</div>
              </div>

              {syncNotice.type === 'error' && (syncNotice.text.includes('Anyone') || syncNotice.text.includes('Ditolak') || syncNotice.text.includes('JSON')) && (
                <div className="mt-2 pt-2 border-t border-rose-200 bg-white/70 p-3 rounded-lg text-[11px] text-rose-900 space-y-1.5">
                  <p className="font-bold text-rose-950 flex items-center gap-1">
                    💡 Cara Memperbaiki Pengaturan Hak Akses di Google Apps Script:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-700">
                    <li>Buka project Google Apps Script Anda.</li>
                    <li>Klik tombol biru <strong>Deploy &gt; Manage deployments</strong> (Kelola penerapan).</li>
                    <li>Klik ikon <strong>Pensil (Edit)</strong> pada deployment Web App aktif Anda.</li>
                    <li>Ubah kolom <strong>Version</strong> menjadi <em>New version</em> (Versi baru).</li>
                    <li>Ubah kolom <strong>Who has access</strong> menjadi <strong className="text-emerald-700">"Anyone" (Siapa saja)</strong>.</li>
                    <li>Klik <strong>Deploy</strong>, izinkan akses jika diminta, lalu coba uji kembali di sini.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* Configuration Form */}
          <div className="space-y-4">
            {/* Active Sheet Banner */}
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-slate-600">Nama Spreadsheet Database: </span>
                  <strong className="text-emerald-950">{sheetInfo?.name || 'Database Resi Agen Batara'}</strong>
                </div>
              </div>
              <a
                href={directSheetUrl || sheetInfo?.url || 'https://docs.google.com/spreadsheets'}
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
              >
                <span>Buka Link Database</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Link className="w-3.5 h-3.5 text-blue-600" />
                  <span>Google Apps Script Web App URL (/exec)</span>
                </span>
                {lastSyncedAt && (
                  <span className="text-[11px] font-normal text-slate-500">
                    Terakhir sinkron: {new Date(lastSyncedAt).toLocaleString('id-ID')}
                  </span>
                )}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={gasUrl}
                  onChange={(e) => setGasUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                  className="flex-1 px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs text-slate-800"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleSaveConfig}
                    disabled={isSavingConfig}
                    className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-all shadow-xs whitespace-nowrap"
                  >
                    {isSavingConfig ? 'Menyimpan...' : 'Simpan URL'}
                  </button>
                  <button
                    onClick={handleSetupDatabase}
                    disabled={isSettingUp || !gasUrl.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-all shadow-xs whitespace-nowrap flex items-center gap-1.5"
                    title="Inisialisasi header dan tabel RiwayatTransaksi di Google Sheet"
                  >
                    {isSettingUp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>⚙️</span>}
                    <span>{isSettingUp ? 'Menyiapkan...' : 'Setup Database'}</span>
                  </button>
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !gasUrl.trim()}
                    className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-all border border-slate-200 whitespace-nowrap flex items-center gap-1.5"
                  >
                    {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <Zap className="w-3.5 h-3.5 text-amber-600" />}
                    <span>Uji Koneksi</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                *Salin Web App URL dari menu <strong>Deploy &gt; Manage deployments</strong> di Google Apps Script (berakhiran <code>/exec</code>).
              </p>
            </div>

            {/* Direct Google Sheet Link Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                <span>Link Direct Spreadsheet Google Sheets (Opsional)</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={directSheetUrl}
                  onChange={(e) => {
                    const u = e.target.value;
                    setDirectSheetUrl(u);
                    setStoredSheetUrl(u);
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="flex-1 px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none shadow-2xs text-slate-800"
                />
                {directSheetUrl && (
                  <a
                    href={directSheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <span>Buka Database Sheet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Auto Sync Toggle & Configuration */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Sinkronisasi Otomatis 2 Arah (Auto 2-Way Sync)</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Secara periodik menyamakan data antara aplikasi &amp; Google Sheets secara otomatis di latar belakang tanpa menekan tombol.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAutoSync(val);
                      setAutoSyncEnabled(val);
                      fetch('/api/gas/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ autoSync: val }),
                      }).catch(() => {});
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {autoSync && (
                <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="text-[11px] font-medium">Interval Sinkronisasi Otomatis:</span>
                    <select
                      value={syncInterval}
                      onChange={(e) => {
                        const num = parseInt(e.target.value, 10);
                        setSyncInterval(num);
                        setAutoSyncInterval(num);
                      }}
                      className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value={15}>Setiap 15 Detik (Sangat Cepat)</option>
                      <option value={30}>Setiap 30 Detik (Direkomendasikan)</option>
                      <option value={60}>Setiap 1 Menit</option>
                      <option value={120}>Setiap 2 Menit</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Status Terakhir:</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        liveSyncState.status === 'syncing'
                          ? 'bg-blue-100 text-blue-700'
                          : liveSyncState.status === 'error'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {liveSyncState.status === 'syncing' ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Sinkron Berjalan</span>
                        </>
                      ) : liveSyncState.status === 'error' ? (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          <span>Koneksi Gagal</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Tersinkronisasi Otomatis</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Two-Way Sync Actions */}
            <div className="p-4 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200 rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-blue-950 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 text-blue-600" />
                    <span>Aksi Sinkronisasi 2 Arah (Two-Way Sync)</span>
                  </h4>
                  <p className="text-xs text-blue-800/80 mt-0.5">
                    Menyamakan seluruh riwayat transaksi antara aplikasi lokal dan Google Sheets tanpa menghapus atau menduplikasi data.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    id="btn-two-way-sync"
                    onClick={handleTwoWaySync}
                    disabled={isSyncing || !gasUrl.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkron 2 Arah Sekarang'}</span>
                  </button>

                  <button
                    onClick={handlePullOnly}
                    disabled={isPulling || !gasUrl.trim()}
                    className="bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-300 transition-all shadow-2xs flex items-center gap-1.5"
                    title="Tarik data terbaru dari Google Sheets"
                  >
                    <Download className={`w-3.5 h-3.5 text-blue-600 ${isPulling ? 'animate-bounce' : ''}`} />
                    <span>Tarik (Pull)</span>
                  </button>

                  <button
                    onClick={handlePushOnly}
                    disabled={isPushing || !gasUrl.trim()}
                    className="bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl border border-slate-300 transition-all shadow-2xs flex items-center gap-1.5"
                    title="Kirim semua data lokal ke Google Sheets"
                  >
                    <Upload className={`w-3.5 h-3.5 text-emerald-600 ${isPushing ? 'animate-bounce' : ''}`} />
                    <span>Kirim (Push)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Live Sheet Data Table (Always Rendered) */}
        <div className="mt-8 border-t border-slate-100 pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Tabel Data Terkini di Google Sheets</span>
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  {previewData.length} Baris
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Menampilkan data transaksi secara langsung dari Google Sheets.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                placeholder="Cari ID / Nama / IDPEL..."
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 w-48 sm:w-60"
              />
              <button
                onClick={() => loadPreview()}
                disabled={isLoadingPreview || !gasUrl.trim()}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                <span>Segarkan Data</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold">
                  <th className="p-2.5 w-10 text-center">No</th>
                  <th className="p-2.5">ID Transaksi</th>
                  <th className="p-2.5">Tanggal</th>
                  <th className="p-2.5">ID Pelanggan</th>
                  <th className="p-2.5">Nama Pelanggan</th>
                  <th className="p-2.5">Layanan</th>
                  <th className="p-2.5 text-right">Total Bayar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 bg-white">
                {(() => {
                  const filtered = previewData.filter((row) => {
                    if (!previewSearch.trim()) return true;
                    const q = previewSearch.toLowerCase();
                    return (
                      (row.id && row.id.toLowerCase().includes(q)) ||
                      (row.idpel && row.idpel.toLowerCase().includes(q)) ||
                      (row.namaPelanggan && row.namaPelanggan.toLowerCase().includes(q)) ||
                      (row.rincianTagihan && row.rincianTagihan.toLowerCase().includes(q))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-slate-400">
                          {isLoadingPreview ? (
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                              <span>Mengambil data dari Google Sheets...</span>
                            </div>
                          ) : (
                            <span>
                              {previewSearch.trim()
                                ? `Tidak ditemukan data untuk kata kunci "${previewSearch}".`
                                : gasUrl.trim()
                                ? 'Belum ada transaksi di sheet atau klik "Segarkan Data" untuk memuat.'
                                : 'Masukkan Web App URL di atas untuk memantau data di Google Sheets secara langsung.'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-2.5 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-2.5 font-mono text-[11px] text-slate-600">{row.id || '-'}</td>
                      <td className="p-2.5 text-slate-800">{row.tanggal || '-'}</td>
                      <td className="p-2.5 font-mono text-slate-800 font-medium">{row.idpel || '-'}</td>
                      <td className="p-2.5 text-slate-800 font-semibold uppercase">{row.namaPelanggan || '-'}</td>
                      <td className="p-2.5 text-slate-600">{row.rincianTagihan || '-'}</td>
                      <td className="p-2.5 text-right font-bold text-blue-700">
                        Rp {Number(row.totalBayar || 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Guide & Source Code Section (Collapsible - Hidden by default) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-blue-600" />
              <span>Kode Lengkap Google Apps Script (GAS) 2 Arah</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {showScriptCode
                ? 'Salin kode berikut ke editor Google Apps Script di spreadsheet Anda untuk mengaktifkan fitur sinkronisasi 2 arah.'
                : 'Kode script & petunjuk deploy Google Apps Script saat ini disembunyikan.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowScriptCode(!showScriptCode)}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border border-slate-300"
          >
            {showScriptCode ? (
              <>
                <ChevronDown className="w-4 h-4 text-slate-500" />
                <span>Sembunyikan Kode</span>
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4 text-slate-500" />
                <span>Tampilkan Kode & Petunjuk GAS</span>
              </>
            )}
          </button>
        </div>

        {showScriptCode && (
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-6">
            {/* Step-by-Step Instructions */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-5">
              <h3 className="font-bold text-blue-900 text-sm mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>Petunjuk Pemasangan & Deploy di Google Apps Script:</span>
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-xs text-blue-950 leading-relaxed">
                {gasData?.instructions ? (
                  gasData.instructions.map((step, idx) => <li key={idx}>{step}</li>)
                ) : (
                  <>
                    <li>Buka Google Sheets di Google Drive Anda.</li>
                    <li>Pilih menu <strong>Extensions &gt; Apps Script</strong>.</li>
                    <li>Paste file <code>Code.gs</code> dan buat file HTML bernama <code>Index</code>.</li>
                    <li>Deploy sebagai <strong>Web App</strong> dengan akses <em>Anyone</em>.</li>
                  </>
                )}
              </ol>
            </div>

            {/* Code.gs Box */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-600" />
                  <span>1. File: Code.gs (Backend Google Apps Script - Sinkron 2 Arah & Simpan)</span>
                </span>
                <button
                  onClick={() => gasData && copyToClipboard(gasData.codeGs, 'gs')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all"
                >
                  {copiedGs ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedGs ? 'Tersalin!' : 'Salin Code.gs'}</span>
                </button>
              </div>
              <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed">
                {gasData ? gasData.codeGs : 'Memuat kode Code.gs...'}
              </pre>
            </div>

            {/* Index.html Box */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-600" />
                  <span>2. File: Index.html (Frontend Web App di Apps Script)</span>
                </span>
                <button
                  onClick={() => gasData && copyToClipboard(gasData.indexHtml, 'html')}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all"
                >
                  {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedHtml ? 'Tersalin!' : 'Salin Index.html'}</span>
                </button>
              </div>
              <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed">
                {gasData ? gasData.indexHtml : 'Memuat kode Index.html...'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
