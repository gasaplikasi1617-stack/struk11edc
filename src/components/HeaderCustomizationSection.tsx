import React, { useState, useEffect } from 'react';
import { AgentConfig, ReceiptData } from '../types';
import { Building, MapPin, Phone, CheckCircle2, Store, Save, Eye, Sparkles, RefreshCw } from 'lucide-react';

interface HeaderCustomizationSectionProps {
  agentConfig: AgentConfig;
  setAgentConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  receipt?: ReceiptData;
  setReceipt?: React.Dispatch<React.SetStateAction<ReceiptData>>;
}

export function HeaderCustomizationSection({
  agentConfig,
  setAgentConfig,
  receipt,
  setReceipt,
}: HeaderCustomizationSectionProps) {
  const [formData, setFormData] = useState<AgentConfig>({
    namaAgen: agentConfig.namaAgen || 'Agen Batara',
    alamat: agentConfig.alamat || '',
    noHp: agentConfig.noHp || '081234567890',
  });

  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Sync if parent agentConfig changes
  useEffect(() => {
    setFormData({
      namaAgen: agentConfig.namaAgen || 'Agen Batara',
      alamat: agentConfig.alamat || '',
      noHp: agentConfig.noHp || '081234567890',
    });
  }, [agentConfig]);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated: AgentConfig = {
      namaAgen: formData.namaAgen.trim() || 'Agen Batara',
      alamat: formData.alamat.trim() || '',
      noHp: formData.noHp.trim() || '081234567890',
    };

    setAgentConfig(updated);
    try {
      localStorage.setItem('agent_batara_config', JSON.stringify(updated));
    } catch {}

    if (setReceipt) {
      setReceipt((prev) => ({
        ...prev,
        namaAgen: updated.namaAgen,
        alamat: updated.alamat,
        noHp: updated.noHp,
      }));
    }

    setSavedNotice(`Identitas Loket "${updated.namaAgen}" berhasil disimpan & diterapkan ke seluruh format resi (A6 & Dot Matrix)!`);
    setTimeout(() => setSavedNotice(null), 5000);
  };

  const handleResetDefault = () => {
    const defaultVal: AgentConfig = {
      namaAgen: 'Agen Batara',
      alamat: '',
      noHp: '081234567890',
    };
    setFormData(defaultVal);
    setAgentConfig(defaultVal);
    try {
      localStorage.setItem('agent_batara_config', JSON.stringify(defaultVal));
    } catch {}
    if (setReceipt) {
      setReceipt((prev) => ({
        ...prev,
        namaAgen: defaultVal.namaAgen,
        alamat: defaultVal.alamat,
        noHp: defaultVal.noHp,
      }));
    }
    setSavedNotice('Pengaturan identitas header dikembalikan ke bawaan (Agen Batara).');
    setTimeout(() => setSavedNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-xs">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                3. Kustomisasi Header Resi (Agen &amp; Loket)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Atur identitas resmi loket kasir / toko Anda. Nama, alamat, dan nomor kontak ini akan otomatis tercetak di bagian paling atas seluruh struk resi (A6, Dot Matrix LX-310, WhatsApp, dan PDF).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Aktif: {agentConfig.namaAgen}
            </span>
          </div>
        </div>

        {savedNotice && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 shadow-xs transition-all animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{savedNotice}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form Inputs (Left) */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-600" />
              <span>Formulir Pengaturan Header Resi</span>
            </h3>
            <button
              type="button"
              onClick={handleResetDefault}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset ke bawaan (Agen Batara)"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset Default</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-600" />
                <span>Nama Toko / Agen / Loket PPOB</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.namaAgen}
                onChange={(e) => setFormData({ ...formData, namaAgen: e.target.value })}
                placeholder="Contoh: AGEN BATARA / LOKET PEMBAYARAN RESMI"
                className="w-full text-sm font-semibold border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 shadow-2xs"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Dicetak dengan huruf kapital tebal di baris kedua header struk (LOKET: {formData.namaAgen.toUpperCase() || 'AGEN'}).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>Alamat Lengkap Loket / Kota</span>
              </label>
              <input
                type="text"
                value={formData.alamat}
                onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                placeholder="Contoh: Jl. Ahmad Yani No. 12, Bekasi"
                className="w-full text-sm font-semibold border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 shadow-2xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Alamat fisik atau wilayah operasional loket yang tercetak di bawah nama loket.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-blue-600" />
                <span>No. HP / WhatsApp Resmi</span>
              </label>
              <input
                type="text"
                value={formData.noHp}
                onChange={(e) => setFormData({ ...formData, noHp: e.target.value })}
                placeholder="Contoh: 081234567890 / 0812-3456-7890"
                className="w-full text-sm font-semibold border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800 shadow-2xs font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Kontak bantuan atau layanan pelanggan untuk pelanggan Anda.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Kustomisasi Header Resi</span>
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview Box (Right) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-600" />
                <span>Pratinjau Langsung Header Resi</span>
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                Live Preview
              </span>
            </div>

            {/* Simulating Receipt Header in Courier/Mono font */}
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5 font-mono text-center space-y-1 shadow-2xs">
              <div className="text-xs font-black text-slate-900 uppercase tracking-wide">
                STRUK BUKTI PEMBAYARAN PPOB
              </div>
              <div className="text-[13px] font-bold text-slate-900 uppercase tracking-wider">
                LOKET: {(formData.namaAgen || 'AGEN BATARA').toUpperCase()}
              </div>
              {formData.alamat && (
                <div className="text-[11px] text-slate-700">
                  {formData.alamat}
                </div>
              )}
              {formData.noHp && (
                <div className="text-[11px] text-slate-700">
                  Telp/WA: {formData.noHp}
                </div>
              )}
              <div className="pt-2 text-slate-400 text-[10px] border-b border-dashed border-slate-300"></div>
              <div className="pt-2 text-[10px] text-slate-400 italic">
                (Data rincian transaksi &amp; tagihan pelanggan tercetak di bawah garis ini)
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200/80 rounded-xl p-3.5 text-xs text-blue-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Otomatis Tersinkronisasi</span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-700">
                Setelah tombol <strong>Simpan</strong> ditekan, identitas loket akan otomatis langsung digunakan saat Anda mencetak struk A6, dot matrix Epson LX-310, share WhatsApp, maupun ekspor riwayat transaksi.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
