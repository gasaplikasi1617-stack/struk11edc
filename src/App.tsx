import React, { useState, useEffect } from 'react';
import { AgentConfig, ReceiptData } from './types';
import { Navbar } from './components/Navbar';
import { ReceiptForm } from './components/ReceiptForm';
import { ReceiptPreview } from './components/ReceiptPreview';
import { HistoryTab } from './components/HistoryTab';
import { GasIntegrationTab } from './components/GasIntegrationTab';

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
          setTransactions(data);
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
        setTransactions(JSON.parse(local));
      }
    } catch (err) {}
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveTransaction = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const payload = {
      id: "TX-" + Date.now(),
      createdAt: new Date().toISOString(),
      ...receipt,
      namaAgen: agentConfig.namaAgen,
      alamat: agentConfig.alamat,
      noHp: agentConfig.noHp,
    };

    // Client-side anti-duplicate check within last 60 seconds
    const recentDuplicate = transactions.find((t) => {
      const isSameIdpel = t.idpel === payload.idpel;
      const isSameTotal = Number(t.totalBayar) === Number(payload.totalBayar);
      const timeDiff = Math.abs(new Date(payload.createdAt).getTime() - new Date(t.createdAt || 0).getTime());
      return isSameIdpel && isSameTotal && timeDiff < 60000;
    });

    if (recentDuplicate) {
      setIsSaving(false);
      setSavedStatus(true);
      setResetTrigger(prev => prev + 1);
      setTimeout(() => setSavedStatus(false), 3000);
      return;
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
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

    // LocalStorage fallback
    try {
      const current = [payload, ...transactions];
      setTransactions(current);
      localStorage.setItem('agent_batara_txs', JSON.stringify(current));
      setSavedStatus(true);
      setResetTrigger(prev => prev + 1);
      setTimeout(() => setSavedStatus(false), 3000);
    } catch (err) {}
    setIsSaving(false);
  };

  const handlePrint = () => {
    // Automatically save upon print/export as requested ("Setiap kali resi dicetak/disimpan, data otomatis tersimpan")
    handleSaveTransaction();
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
          />
        )}

        {activeTab === 'gas' && <GasIntegrationTab />}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 mt-auto">
        <p>Cetak Resi Tagihan — Agen Batara &copy; 2026 | Didukung oleh Google Apps Script & Google Sheets</p>
      </footer>
    </div>
  );
}
