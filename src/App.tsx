import React, { useState, useEffect, useRef } from 'react';
import { AgentConfig, ReceiptData, AppUser } from './types';
import { Navbar } from './components/Navbar';
import { ReceiptForm } from './components/ReceiptForm';
import { ReceiptPreview } from './components/ReceiptPreview';
import { HistoryTab } from './components/HistoryTab';
import { GasIntegrationTab } from './components/GasIntegrationTab';
import { DuplicateWarningModal } from './components/DuplicateWarningModal';
import { LoginScreen } from './components/LoginScreen';
import { getCurrentUser, logoutUser, fetchUsers, syncUsersWithServer } from './services/userService';
import { formatReceiptDateTime, generateRandomTransactionId } from './utils/dateFormatter';
import { getCurrentMonthPeriod, getDefaultBulanTagihan } from './utils/billParser';
import { checkDuplicateTransaction, deduplicateTransactionList } from './utils/antiDuplicate';
import {
  getStoredTransactions,
  saveStoredTransactions,
  startAutoSync,
  executeTwoWaySync,
  addDeletedTransactionId,
  removeDeletedTransactionId,
  deleteGoogleSheetTransaction,
  registerPendingSave,
  mergeTransactions,
} from './services/gasClientSync';

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'gas'>('create');
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    namaAgen: 'Agen Batara',
    alamat: '',
    noHp: '081234567890',
  });

  const [receipt, setReceipt] = useState<ReceiptData>({
    id: generateRandomTransactionId(),
    tanggal: formatReceiptDateTime(),
    idpel: '',
    namaPelanggan: '',
    pemakaian: '',
    standMeter: '',
    rincianTagihan: '',
    bulanTagihan: getDefaultBulanTagihan(false),
    rpTagihan: 0,
    lainLain: 0,
    adminBank: 0,
    totalBayar: 0,
    namaAgen: 'Agen Batara',
    alamat: '',
    noHp: '081234567890',
  });

  const [transactions, setTransactions] = useState<ReceiptData[]>([]);
  const transactionsRef = useRef<ReceiptData[]>([]);
  transactionsRef.current = transactions;

  const [savedStatus, setSavedStatus] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);

  // User Auth State
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => getCurrentUser());

  const handleLogout = () => {
    if (confirm('Apakah Anda yakin ingin keluar / logout dari sistem?')) {
      logoutUser();
      setCurrentUser(null);
    }
  };

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
    // Pastikan data sampel lama BUDI SANTOSO diblokir dari riwayat
    addDeletedTransactionId('541293847210');
    addDeletedTransactionId('TRX-85485204');

    fetchTransactions();
    syncUsersWithServer().catch(() => {});

    // Start background auto-sync orchestrator
    const stopSync = startAutoSync(
      () => transactionsRef.current,
      (merged) => {
        const filtered = merged.filter(
          (t) =>
            t.idpel !== '541293847210' &&
            t.id !== 'TRX-85485204' &&
            t.namaPelanggan !== 'BUDI SANTOSO'
        );
        const { cleaned } = deduplicateTransactionList(filtered);
        setTransactions((prev) => {
          // GABUNGKAN SECARA DINAMIS DENGAN STATE AKTIF SAAT INI (PREV)
          // Menjamin transaksi yang baru saja dicetak atau disimpan tidak akan terbuang/hilang!
          const combined = mergeTransactions(prev, cleaned);
          const finalCleaned = deduplicateTransactionList(combined).cleaned;
          transactionsRef.current = finalCleaned;
          saveStoredTransactions(finalCleaned);
          return finalCleaned;
        });
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
          const filtered = data.filter(
            (t) =>
              t.idpel !== '541293847210' &&
              t.id !== 'TRX-85485204' &&
              t.namaPelanggan !== 'BUDI SANTOSO'
          );
          const { cleaned } = deduplicateTransactionList(filtered);
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
        const filtered = stored.filter(
          (t) =>
            t.idpel !== '541293847210' &&
            t.id !== 'TRX-85485204' &&
            t.namaPelanggan !== 'BUDI SANTOSO'
        );
        const { cleaned } = deduplicateTransactionList(filtered);
        setTransactions(cleaned);
        return;
      }
      const local = localStorage.getItem('agent_batara_txs');
      if (local) {
        const parsed = JSON.parse(local);
        const filtered = Array.isArray(parsed)
          ? parsed.filter(
              (t: any) =>
                t.idpel !== '541293847210' &&
                t.id !== 'TRX-85485204' &&
                t.namaPelanggan !== 'BUDI SANTOSO'
            )
          : [];
        const { cleaned } = deduplicateTransactionList(filtered);
        setTransactions(cleaned);
        saveStoredTransactions(cleaned);
      }
    } catch (err) {}
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleResetForm = () => {
    setReceipt({
      id: generateRandomTransactionId(),
      tanggal: formatReceiptDateTime(),
      idpel: '',
      namaPelanggan: '',
      pemakaian: '',
      standMeter: '',
      rincianTagihan: '',
      bulanTagihan: getDefaultBulanTagihan(false),
      rpTagihan: 0,
      lainLain: 0,
      adminBank: 0,
      totalBayar: 0,
      namaAgen: agentConfig.namaAgen,
      alamat: agentConfig.alamat,
      noHp: agentConfig.noHp,
    });
    setResetTrigger((prev) => prev + 1);
  };

  const handleSaveTransaction = async (force: boolean = false): Promise<ReceiptData | null> => {
    // Validasi data kosong: jangan simpan form kosong ke riwayat
    const hasData =
      Boolean(receipt.namaPelanggan && receipt.namaPelanggan.trim()) ||
      Boolean(receipt.idpel && receipt.idpel.trim() && receipt.idpel !== '-') ||
      ((Number(receipt.rpTagihan) || 0) > 0) ||
      ((Number(receipt.totalBayar) || 0) > 0);

    if (!hasData) {
      console.warn('Form transaksi masih kosong, tidak disimpan ke riwayat.');
      return null;
    }

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

      // Amankan data ke antrean pending save di sync service agar kebal dari race condition
      registerPendingSave(payload);

      setTransactions((prev) => {
        const current = [payload, ...prev.filter((t) => t.id !== payload.id)];
        const { cleaned } = deduplicateTransactionList(current);
        const toKeep = cleaned.slice(0, 1000);
        transactionsRef.current = toKeep;
        saveStoredTransactions(toKeep);
        try {
          localStorage.setItem('agent_batara_txs', JSON.stringify(toKeep));
        } catch {}
        return toKeep;
      });
      setSavedStatus(true);
      setTimeout(() => setSavedStatus(false), 3000);
    } catch (localErr) {
      console.warn('Local persistence warning:', localErr);
    }

    // Jika dipanggil dari tombol "Simpan" biasa (!force), otomatis reset form & parsing agar langsung siap input baru
    if (!force) {
      handleResetForm();
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

          // Background sync to Google Sheets
          executeTwoWaySync(undefined, [payload, ...transactionsRef.current])
            .then((syncRes) => {
              if (syncRes && Array.isArray(syncRes.mergedTransactions)) {
                const { cleaned } = deduplicateTransactionList(syncRes.mergedTransactions);
                setTransactions((prev) => {
                  const combined = mergeTransactions(prev, cleaned);
                  const finalCleaned = deduplicateTransactionList(combined).cleaned;
                  transactionsRef.current = finalCleaned;
                  saveStoredTransactions(finalCleaned);
                  return finalCleaned;
                });
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
    const saved = await handleSaveTransaction(true);
    if (!saved) return;

    let resetTriggered = false;
    const doReset = () => {
      if (!resetTriggered) {
        resetTriggered = true;
        handleResetForm();
      }
    };

    window.addEventListener('afterprint', doReset, { once: true });
    setTimeout(doReset, 1500);

    setTimeout(() => {
      window.print();
    }, 150);
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

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        historyCount={transactions.length}
        onSyncTrigger={fetchTransactions}
        currentUser={currentUser}
        onLogout={handleLogout}
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
                      Sistem Pembayaran Online
                    </h2>
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-200">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                      Loket: {agentConfig.namaAgen || 'Agen Batara'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                    Sistem loket kasir &amp; pembayaran tagihan PPOB multi-institusi (PLN, PDAM, Telkom, BPJS). Input otomatis &amp; cetak A6.
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
                  onReset={handleResetForm}
                  savedStatus={savedStatus}
                  historyCount={transactions.length}
                  onViewHistory={() => setActiveTab('history')}
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
            agentConfig={agentConfig}
            setAgentConfig={setAgentConfig}
            receipt={receipt}
            setReceipt={setReceipt}
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
        <p>Sistem Pembayaran Online — Agen Batara &copy; 2026 | Didukung oleh Google Sheets</p>
      </footer>
    </div>
  );
}
