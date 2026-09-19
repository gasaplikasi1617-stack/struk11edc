import React, { useState, useEffect } from 'react';
import { AgentConfig, ReceiptData } from './types';
import { Navbar } from './components/Navbar';
import { ReceiptForm } from './components/ReceiptForm';
import { ReceiptPreview } from './components/ReceiptPreview';
import { HistoryTab } from './components/HistoryTab';
import { GasIntegrationTab } from './components/GasIntegrationTab';
import { DuplicateWarningModal } from './components/DuplicateWarningModal';
import { checkDuplicateTransaction, deduplicateTransactionList } from './utils/antiDuplicate';

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'gas'>('create');
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    namaAgen: 'Agen Batara',
    alamat: 'Bekasi',
    noHp: '081234567890',
  });

  const [receipt, setReceipt] = useState<ReceiptData>({
    tanggal: new Date().toLocaleDateString('id-ID'),
    idpel: '541293847210',
    namaPelanggan: 'BUDI SANTOSO',
    pemakaian: '145 kWh',
    standMeter: '014230 - 014380',
    rincianTagihan: 'Tagihan Listrik PLN Pascabayar',
    bulanTagihan: 'AGUSTUS 2026',
    rpTagihan: 150000,
    lainLain: 0,
    adminBank: 2500,
    totalBayar: 152500,
    namaAgen: 'Agen Batara',
    alamat: 'Bekasi',
    noHp: '081234567890',
  });

  const [transactions, setTransactions] = useState<ReceiptData[]>([]);
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

  // Fetch transactions on mount
  useEffect(() => {
    fetchTransactions();
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
          return;
        }
      }
    } catch (e) {
      console.error('Failed to fetch transactions from server, using localStorage:', e);
    }
    // Fallback to localStorage
    try {
      const local = localStorage.getItem('agent_batara_txs');
      if (local) {
        const parsed = JSON.parse(local);
        const { cleaned } = deduplicateTransactionList(parsed);
        setTransactions(cleaned);
      }
    } catch (err) {}
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTransaction = async (force: boolean = false) => {
    if (isSaving) return;
    setIsSaving(true);

    const payload: ReceiptData = {
      id: "TX-" + Date.now(),
      createdAt: new Date().toISOString(),
      ...receipt,
      namaAgen: agentConfig.namaAgen,
      alamat: agentConfig.alamat,
      noHp: agentConfig.noHp,
    };

    // 1. Strict Anti-Duplicate Check
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
        return;
      }
    }

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
          return;
        }
        if (data.success) {
          setSavedStatus(true);
          fetchTransactions();
          setResetTrigger(prev => prev + 1);
          setTimeout(() => setSavedStatus(false), 3000);
          setIsSaving(false);
          return;
        }
      }
    } catch (e: any) {
      console.error('Server save error, falling back to localStorage:', e);
    }

    // LocalStorage fallback with deduplication
    try {
      const current = [payload, ...transactions];
      const { cleaned } = deduplicateTransactionList(current);
      setTransactions(cleaned.slice(0, 100));
      localStorage.setItem('agent_batara_txs', JSON.stringify(cleaned.slice(0, 100)));
      setSavedStatus(true);
      setResetTrigger(prev => prev + 1);
      setTimeout(() => setSavedStatus(false), 3000);
    } catch (err) {}
    setIsSaving(false);
  };

  const handlePrint = () => {
    // Check if it's already in history before saving on print
    const dupResult = checkDuplicateTransaction(receipt, transactions);
    if (!dupResult.isDuplicate) {
      handleSaveTransaction(false);
    }
    window.print();
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    try {
      await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    } catch (e) {}

    const updated = transactions.filter((t) => t.id !== id);
    setTransactions(updated);
    try {
      localStorage.setItem('agent_batara_txs', JSON.stringify(updated));
    } catch (err) {}
    fetchTransactions();
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
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'create' && (
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
        )}

        {activeTab === 'history' && (
          <HistoryTab
            transactions={transactions}
            onSelectTransaction={handleSelectTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onRefreshTransactions={fetchTransactions}
            onNavigateToGasTab={() => setActiveTab('gas')}
          />
        )}

        {activeTab === 'gas' && (
          <GasIntegrationTab onSyncSuccess={fetchTransactions} />
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
