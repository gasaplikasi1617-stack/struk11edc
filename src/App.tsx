import React, { useState, useEffect, useRef } from 'react';
import { AgentConfig, ReceiptData } from './types';
import { Navbar } from './components/Navbar';
import { ReceiptForm } from './components/ReceiptForm';
import { ReceiptPreview } from './components/ReceiptPreview';
import { HistoryTab } from './components/HistoryTab';
import { GasIntegrationTab } from './components/GasIntegrationTab';
import { DuplicateWarningModal } from './components/DuplicateWarningModal';
import { formatReceiptDateTime, generateRandomTransactionId } from './utils/dateFormatter';
import { getCurrentMonthPeriod } from './utils/billParser';
import { checkDuplicateTransaction, deduplicateTransactionList } from './utils/antiDuplicate';
import {
  getStoredTransactions,
  saveStoredTransactions,
  startAutoSync,
  executeTwoWaySync,
  addDeletedTransactionId,
  removeDeletedTransactionId,
  deleteGoogleSheetTransaction,
} from './services/gasClientSync';

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'gas'>('create');
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    namaAgen: 'Agen Batara',
    alamat: 'Bekasi',
    noHp: '081234567890',
  });

  const [receipt, setReceipt] = useState<ReceiptData>({
    id: generateRandomTransactionId(),
    tanggal: formatReceiptDateTime(),
    idpel: '541293847210',
    namaPelanggan: 'BUDI SANTOSO',
    pemakaian: '145 kWh',
    standMeter: '014230 - 014380',
    rincianTagihan: 'Tagihan Listrik PLN Pascabayar',
    bulanTagihan: getCurrentMonthPeriod(),
    rpTagihan: 150000,
    lainLain: 0,
    adminBank: 2500,
    totalBayar: 152500,
    namaAgen: 'Agen Batara',
    alamat: 'Bekasi',
    noHp: '081234567890',
  });

  const [transactions, setTransactions] = useState<ReceiptData[]>([]);
  const transactionsRef = useRef<ReceiptData[]>([]);
  transactionsRef.current = transactions;

  const [savedStatus, setSavedStatus] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Duplicate Warning State
  const [duplicateModal, setDuplicateModal] = useState<{
    isOpen: boolean;
    reason: string;
    incoming: Partial<ReceiptData>;
    matched?: ReceiptData;
  }>({
    isOpen: false,
    reason: '',
    incoming: {},
  });

  // Fetch transactions and start background 2-way auto-sync
  useEffect(() => {
    fetchTransactions();

    // Start background auto-sync orchestrator
    const stopSync = startAutoSync(
      () => transactionsRef.current,
      (merged) => {
        const { cleaned } = deduplicateTransactionList(merged);
        setTransactions(cleaned);
        saveStoredTransactions(cleaned);
      }
    );

    return stopSync;
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/transactions');
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const { cleaned } = deduplicateTransactionList(data);
          setTransactions(cleaned);
          saveStoredTransactions(cleaned);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to fetch transactions from server, using localStorage:', e);
    }
    // Fallback to localStorage
    try {
      const stored = getStoredTransactions();
      if (stored.length > 0) {
        const { cleaned } = deduplicateTransactionList(stored);
        setTransactions(cleaned);
        return;
      }
      const local = localStorage.getItem('agent_batara_txs');
      if (local) {
        const parsed = JSON.parse(local);
        const { cleaned } = deduplicateTransactionList(parsed);
        setTransactions(cleaned);
        saveStoredTransactions(cleaned);
      }
    } catch (err) {}
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTransaction = async (force: boolean = false): Promise<ReceiptData | null> => {
    let txId = receipt.id;
    // Jika force simpan (misalnya saat tombol Cetak ditekan) dan ID transaksi ini sudah ada di riwayat,
    // buat ID baru agar tidak bentrok dengan transaksi yang sudah dicetak sebelumnya
    if (!txId || (force && transactions.some((t) => t.id === txId))) {
      txId = generateRandomTransactionId();
      setReceipt((prev) => ({ ...prev, id: txId }));
    }

    const payload: ReceiptData = {
      ...receipt,
      id: txId,
      createdAt: receipt.createdAt || new Date().toISOString(),
      namaAgen: agentConfig.namaAgen,
      alamat: agentConfig.alamat,
      noHp: agentConfig.noHp,
    };

    // 1. Strict Anti-Duplicate Check (Hanya aktif jika user klik manual tombol "Simpan", bukan saat "Cetak")
    if (!force) {
      const dupResult = checkDuplicateTransaction(payload, transactions);
      if (dupResult.isDuplicate) {
        setIsSaving(false);
        setDuplicateModal({
          isOpen: true,
          reason: dupResult.reason || 'Data transaksi ini sudah pernah tersimpan di riwayat.',
          incoming: payload,
          matched: dupResult.matchedTransaction,
        });
        return null;
      }
    }

    // 2. Synchronous Immediate Local Persistence (PASTI tersimpan ke localStorage & state riwayat seketika!)
    try {
      removeDeletedTransactionId(payload.id);
      if (payload.idpel) removeDeletedTransactionId(payload.idpel);

      const current = [payload, ...transactions.filter((t) => t.id !== payload.id)];
      const { cleaned } = deduplicateTransactionList(current);
      const toKeep = cleaned.slice(0, 1000);
      setTransactions(toKeep);
      saveStoredTransactions(toKeep);
      try {
        localStorage.setItem('agent_batara_txs', JSON.stringify(toKeep));
      } catch {}
      setSavedStatus(true);
      setTimeout(() => setSavedStatus(false), 3000);
    } catch (localErr) {
      console.warn('Local persistence warning:', localErr);
    }

    // 3. Simpan ke Backend Server
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, force }),
      });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (data.isDuplicate && !force) {
          setIsSaving(false);
          setDuplicateModal({
            isOpen: true,
            reason: data.reason || data.message || 'Transaksi sudah ada di riwayat.',
            incoming: payload,
            matched: data.transaction,
          });
          return null;
        }
        if (data.success) {
          fetchTransactions();
          setResetTrigger((prev) => prev + 1);

          // Background sync to Google Sheets
          executeTwoWaySync(undefined, [payload, ...transactionsRef.current])
            .then((syncRes) => {
              if (syncRes && Array.isArray(syncRes.mergedTransactions)) {
                const { cleaned } = deduplicateTransactionList(syncRes.mergedTransactions);
                setTransactions(cleaned);
              }
            })
            .catch(() => {});
          return payload;
        }
      }
    } catch (e: any) {
      console.warn('Server save warning (transaksi aman di local persistence):', e);
    }

    // Background sync to Google Sheets
    executeTwoWaySync(undefined, [payload, ...transactionsRef.current]).catch(() => {});
    return payload;
  };

  const handlePrint = async () => {
    // 100% PASTI tersimpan ke riwayat sebelum browser membuka dialog cetak
    await handleSaveTransaction(true);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleDeleteTransaction = async (targetKey: string, txData?: ReceiptData) => {
    if (!targetKey) return;
    const targetTx = txData || transactions.find((t) => t.id === targetKey || t.idpel === targetKey || t.namaPelanggan === targetKey);
    const displayName = targetTx?.namaPelanggan || targetTx?.idpel || targetKey;
    const idpel = targetTx?.idpel && targetTx.idpel !== '-' ? targetTx.idpel : '';

    const confirmMsg =
      `Apakah Anda yakin ingin menghapus data transaksi "${displayName}" ${idpel ? `(ID Pelanggan: ${idpel})` : ''} dari riwayat?\n\n` +
      `Catatan: Data akan dihapus secara permanen dan DIJAMIN TIDAK AKAN MUNCUL KEMBALI saat disinkronkan ke Google Sheets.`;

    if (!confirm(confirmMsg)) return;

    const idToBlock = targetTx?.id || targetKey;
    const idpelToBlock = targetTx?.idpel;

    // Catat ID dan IDPEL ke tombstone agar tidak pernah ditarik kembali oleh sinkronisasi otomatis
    if (idToBlock) addDeletedTransactionId(idToBlock);
    if (idpelToBlock && idpelToBlock !== '-') addDeletedTransactionId(idpelToBlock);

    // Filter local state by id, idpel, or namaPelanggan
    const updated = transactions.filter((t) => {
      if (t.id && (t.id === targetKey || t.id === idToBlock)) return false;
      if (t.idpel && idpelToBlock && idpelToBlock !== '-' && t.idpel === idpelToBlock) return false;
      if (t.idpel && t.idpel === targetKey) return false;
      if (t.namaPelanggan && t.namaPelanggan === targetKey) return false;
      return true;
    });

    setTransactions(updated);
    saveStoredTransactions(updated);
    try {
      localStorage.setItem('agent_batara_txs', JSON.stringify(updated));
    } catch (err) {}

    // Hapus di server lokal
    try {
      const qParam = idpelToBlock && idpelToBlock !== '-' ? `?idpel=${encodeURIComponent(idpelToBlock)}` : '';
      await fetch(`/api/transactions/${encodeURIComponent(idToBlock)}${qParam}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Server delete error:', e);
    }

    // Hapus di Google Sheets (Cloud)
    deleteGoogleSheetTransaction(idToBlock, idpelToBlock).catch(() => {});
  };

  const handleToggleStatus = async (tx: ReceiptData) => {
    const targetKey = tx.id || tx.idpel;
    if (!targetKey) return;

    const currentStatus: 'aktif' | 'tidak_aktif' = tx.status === 'tidak_aktif' ? 'tidak_aktif' : 'aktif';
    const newStatus: 'aktif' | 'tidak_aktif' = currentStatus === 'aktif' ? 'tidak_aktif' : 'aktif';

    const updated: ReceiptData[] = transactions.map((t) => {
      const isMatch =
        (t.id && t.id === tx.id) ||
        (t.idpel && t.idpel === tx.idpel && t.tanggal === tx.tanggal);
      if (isMatch) {
        return { ...t, status: newStatus };
      }
      return t;
    });

    setTransactions(updated);
    saveStoredTransactions(updated);
    try {
      localStorage.setItem('agent_batara_txs', JSON.stringify(updated));
    } catch (err) {}

    try {
      const key = tx.id || tx.idpel || '';
      await fetch(`/api/transactions/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (e) {
      console.warn('Server update status error:', e);
    }
  };

  const handleSelectTransaction = (tx: ReceiptData) => {
    setReceipt(tx);
    if (tx.namaAgen && tx.alamat) {
      setAgentConfig({
        namaAgen: tx.namaAgen,
        alamat: tx.alamat,
        noHp: tx.noHp || agentConfig.noHp,
      });
    }
    setActiveTab('create');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        historyCount={transactions.length}
        onSyncTrigger={fetchTransactions}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'create' && (
          <div className="space-y-6">
            {/* Dashboard Brand Header with Logo */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-50 border border-slate-200/80 p-1.5 shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src="https://iili.io/nRihMkG.png"
                    alt="Logo Dashboard"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/logo.png';
                    }}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
                      Dashboard Cetak Resi Tagihan
                    </h2>
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                      Loket: {agentConfig.namaAgen || 'Agen Batara'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                    Sistem loket kasir &amp; pembayaran tagihan PPOB multi-institusi (PLN, PDAM, Telkom, BPJS). Input otomatis, cetak A6 &amp; Dot Matrix LX-310 langsung tersimpan ke riwayat.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status Loket</div>
                  <div className="text-xs font-bold text-emerald-600 flex items-center gap-1 justify-end">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Siap Cetak &amp; Simpan
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7">
                <ReceiptForm
                  receipt={receipt}
                  setReceipt={setReceipt}
                  agentConfig={agentConfig}
                  setAgentConfig={setAgentConfig}
                  onSave={handleSaveTransaction}
                  onPrint={handlePrint}
                  resetTrigger={resetTrigger}
                />
              </div>
              <div className="lg:col-span-5 sticky top-24">
                <ReceiptPreview
                  receipt={receipt}
                  onPrint={handlePrint}
                  onSave={handleSaveTransaction}
                  savedStatus={savedStatus}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryTab
            transactions={transactions}
            onSelectTransaction={handleSelectTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onToggleStatus={handleToggleStatus}
            onRefreshTransactions={fetchTransactions}
            onNavigateToGasTab={() => setActiveTab('gas')}
          />
        )}

        {activeTab === 'gas' && (
          <GasIntegrationTab
            onSyncSuccess={fetchTransactions}
            transactions={transactions}
            onRefreshTransactions={fetchTransactions}
          />
        )}
      </main>

      <DuplicateWarningModal
        isOpen={duplicateModal.isOpen}
        onClose={() => setDuplicateModal(prev => ({ ...prev, isOpen: false }))}
        reason={duplicateModal.reason}
        incoming={duplicateModal.incoming}
        matched={duplicateModal.matched}
        onForceSave={() => handleSaveTransaction(true)}
        onViewHistory={() => setActiveTab('history')}
      />

      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 mt-auto">
        <p>Cetak Resi Tagihan — Agen Batara &copy; 2026 | Didukung oleh Google Apps Script & Google Sheets</p>
      </footer>
    </div>
  );
}
