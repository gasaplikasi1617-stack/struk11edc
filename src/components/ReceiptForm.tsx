import React, { useState } from 'react';
import { AgentConfig, ReceiptData } from '../types';
import { Wand2, Sparkles, RefreshCw, CheckCircle2, Building, MapPin, Phone } from 'lucide-react';

interface ReceiptFormProps {
  receipt: ReceiptData;
  setReceipt: React.Dispatch<React.SetStateAction<ReceiptData>>;
  agentConfig: AgentConfig;
  setAgentConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  onSave: () => void;
  onPrint: () => void;
  resetTrigger?: number;
}

export function ReceiptForm({
  receipt,
  setReceipt,
  agentConfig,
  setAgentConfig,
  onSave,
  onPrint,
  resetTrigger,
}: ReceiptFormProps) {
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');

  // Clear rawText when resetTrigger changes
  React.useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setRawText('');
    }
  }, [resetTrigger]);

  const sampleTexts = [
    {
      label: "Contoh PLN Pascabayar",
      text: `STRUK PEMBAYARAN TAGIHAN LISTRIK PLN
IDPEL: 541293847210
NAMA: BUNG HATTA
BLN/THN: Sep26
STAND METER: 014230 - 014380
PEMAKAIAN: R1M/900 VA
RP TAGIHAN: 165500
ADMIN BANK: 4700
TOTAL: 170200`
    },
    {
      label: "Contoh PDAM",
      text: `PDAM TIRTA PATRIOT BEKASI
NO PELANGGAN: 88392011
NAMA: SITI AMINAH
PERIODE: SEP26
METER AWAL/AKHIR: 45 - 68 (23 m3)
TAGIHAN AIR: 115000
DENDA / LAIN: 0
ADMIN: 2500`
    },
    {
      label: "Contoh Indihome",
      text: `TELKOM INDIHOME FIBER
IDPEL: 122839401923
NAMA PELANGGAN: AHMAD FAUZI
LAYANAN: INTERNET + PHONE 30MBPS
PERIODE: SEP26
RP TAGIHAN: 315000
BIAYA LAIN: 0
ADMIN BANK: 2500`
    }
  ];

  const clientParse = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const lowerText = text.toLowerCase();
    
    let idpel = "541293847210";
    let namaPelanggan = "BUDI SANTOSO";
    let rpTagihan = 150000;
    let totalBayar = 0;
    let bulanTagihan = "";
    let standMeter = "";
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (/stand\s*meter|meter|sm|stand\s*awal|meter\s*awal/i.test(lower)) {
        const parts = line.split(/[:=]/);
        if (parts[1] && parts[1].trim().length > 2) {
          standMeter = parts[1].trim();
        } else {
          standMeter = line.replace(/stand\s*meter|meter|sm/gi, "").replace(/[:=]/g, "").trim();
        }
      }
    }
    let rincianTagihan = "Tagihan Pembayaran";

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (/info\s*tagihan|tagihan\s*pembayaran|pdam|pln|indihome|bpjs|pbb|token|pulsa|telkom/.test(lower)) {
        rincianTagihan = line.replace(/^info\s*tagihan/i, "").replace(/^tagihan/i, "").trim();
        break;
      }
    }
    if (rincianTagihan === "Tagihan Pembayaran" && lines.length > 0) {
      rincianTagihan = lines[0].replace(/^info\s*tagihan/i, "").replace(/^tagihan/i, "").trim();
    }

    const isPln = /pln|listrik|token|kwh|pascabayar|prabayar/.test(lowerText);
    const isPdam = /pdam|air|meter air/.test(lowerText);

    if (!standMeter && (isPln || isPdam)) {
      const rangeMatch = text.match(/(\d+\s*-\s*\d+)/);
      if (rangeMatch) standMeter = rangeMatch[0];
    }

    let pemakaian = "";
    if (isPln) {
      const vaMatch = text.match(/([Rr]1[Mm]?\s*\/\s*\d+\s*VA|\d+\s*VA)/i);
      pemakaian = vaMatch ? vaMatch[0].toUpperCase() : "R1M/900 VA";
    } else if (isPdam) {
      const m3Match = text.match(/(\d+\s*m3|\d+\s*M3)/i);
      pemakaian = m3Match ? m3Match[0].toLowerCase() : "";
    } else {
      const m3Match = text.match(/(\d+\s*m3|\d+\s*M3)/i);
      if (m3Match) {
        pemakaian = m3Match[0].toLowerCase();
      } else {
        const vaMatch = text.match(/(\d+\s*VA)/i);
        if (vaMatch) pemakaian = vaMatch[0].toUpperCase();
      }
    }

    let adminBank = isPln ? 4700 : 2500;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (/idpel|id\s*pelanggan|no\.?\s*pelanggan|nomor\s*pelanggan/.test(lower)) {
        const parts = line.split(/[:=]/);
        if (parts[1]) idpel = parts[1].trim();
      }
      if (/nama|pelanggan/.test(lower)) {
        const parts = line.split(/[:=]/);
        if (parts[1] && parts[1].trim().length > 2) namaPelanggan = parts[1].trim();
      }
      if (/rp\s*tagihan|tagihan\s*air|jml\s*tagihan|jumlah\s*tagihan|tagihan/.test(lower) && !/admin|total/.test(lower)) {
        const numbers = line.replace(/[^0-9]/g, "");
        if (numbers.length >= 4) {
          const val = parseInt(numbers, 10);
          if (val > 1000) rpTagihan = val;
        }
      }
      if (/admin|adm/.test(lower)) {
        const numbers = line.replace(/[^0-9]/g, "");
        if (numbers.length >= 3) {
          const val = parseInt(numbers, 10);
          if (val > 500 && val < 50000) adminBank = val;
        }
      }
      if (/total/.test(lower)) {
        const numbers = line.replace(/[^0-9]/g, "");
        if (numbers.length >= 4) {
          const val = parseInt(numbers, 10);
          if (val > 1000) totalBayar = val;
        }
      }
      if (/bln|bulan|periode|thn|tahun/.test(lower)) {
        const parts = line.split(/[:=]/);
        if (parts[1]) {
          bulanTagihan = parts[1].trim().toUpperCase();
        } else {
          bulanTagihan = line.replace(/bln|bulan|periode|thn|tahun/gi, "").replace(/[:=]/g, "").trim().toUpperCase();
        }
      }
    }

    if (!bulanTagihan) {
      for (const line of lines) {
        if (/jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des|\d{2}\/\d{4}|\b202[0-9]\b/i.test(line)) {
          bulanTagihan = line.replace(/periode|bulan|bln|thn|tahun/gi, "").replace(/[:=]/g, "").trim().toUpperCase();
          break;
        }
      }
    }

    if (!bulanTagihan) {
      const periodMatch = text.match(/([A-Za-z]{3,9}\s*\d{2,4}|\d{2}\/\d{4})/);
      if (periodMatch) bulanTagihan = periodMatch[0].toUpperCase();
      else bulanTagihan = "SEP26";
    }

    if (bulanTagihan) {
      const matchPeriod = bulanTagihan.match(/([A-Za-z]{3,9}\s*\d{2,4}|\d{2}\/\d{4})/);
      if (matchPeriod) {
        bulanTagihan = matchPeriod[0].toUpperCase();
      }
    }

    if (!idpel) {
      const match = text.match(/\b\d{8,15}\b/);
      if (match) idpel = match[0];
    }

    const lainLain = 0;
    if (totalBayar === 0) {
      totalBayar = rpTagihan + lainLain + adminBank;
    }

    return {
      tanggal: new Date().toLocaleDateString("id-ID"),
      idpel,
      namaPelanggan: namaPelanggan.toUpperCase(),
      pemakaian,
      standMeter,
      rincianTagihan: rincianTagihan || "Tagihan Listrik / Layanan",
      bulanTagihan,
      rpTagihan,
      lainLain,
      adminBank,
      totalBayar,
    };
  };

  const handleParse = async () => {
    if (!rawText.trim()) {
      alert("Silakan masukkan atau paste teks mentah tagihan terlebih dahulu!");
      return;
    }

    setIsParsing(true);
    setParseNote('');

    try {
      const res = await fetch('/api/parse-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const d = clientParse(rawText);
        setReceipt((prev) => ({ ...prev, ...d }));
        setParseNote('Berhasil diparsing (Client-side Fallback)');
        return;
      }

      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        setReceipt((prev) => ({
          ...prev,
          tanggal: d.tanggal || prev.tanggal,
          idpel: d.idpel || prev.idpel,
          namaPelanggan: d.namaPelanggan || prev.namaPelanggan,
          pemakaian: d.pemakaian || prev.pemakaian,
          standMeter: d.standMeter || prev.standMeter,
          rincianTagihan: d.rincianTagihan || prev.rincianTagihan,
          bulanTagihan: d.bulanTagihan || prev.bulanTagihan,
          rpTagihan: Number(d.rpTagihan) || 0,
          lainLain: Number(d.lainLain) || 0,
          adminBank: Number(d.adminBank) || 2500,
          totalBayar: (Number(d.rpTagihan) || 0) + (Number(d.lainLain) || 0) + (Number(d.adminBank) || 2500),
        }));
        setParseNote(data.note ? `Berhasil diparsing (${data.note})` : 'Berhasil diparsing otomatis!');
      } else {
        const d = clientParse(rawText);
        setReceipt((prev) => ({ ...prev, ...d }));
        setParseNote('Berhasil diparsing (Client-side Fallback)');
      }
    } catch (e: any) {
      const d = clientParse(rawText);
      setReceipt((prev) => ({ ...prev, ...d }));
      setParseNote('Berhasil diparsing (Offline / Fallback)');
    } finally {
      setIsParsing(false);
    }
  };

  const handleInputChange = (field: keyof ReceiptData, value: any) => {
    setReceipt((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'rpTagihan' || field === 'lainLain' || field === 'adminBank') {
        const rp = field === 'rpTagihan' ? Number(value) || 0 : prev.rpTagihan;
        const lain = field === 'lainLain' ? Number(value) || 0 : prev.lainLain;
        const admin = field === 'adminBank' ? Number(value) || 0 : prev.adminBank;
        updated.totalBayar = rp + lain + admin;
      }
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Paste & Parse Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">1. Input & Parsing Teks Mentah Otomatis</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {sampleTexts.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setRawText(s.text)}
                className="text-xs bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-all font-medium"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Paste teks struk mentah dari WhatsApp, SMS, atau sistem pembayaran tagihan (PLN, PDAM, Indihome, BPJS, dll.) di bawah ini. Aplikasi akan mengekstrak data secara otomatis.
        </p>

        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Tempel (Ctrl+V) data teks mentah tagihan di sini..."
          className="w-full font-mono text-xs sm:text-sm p-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
        />

        <div className="mt-3 flex items-center justify-between">
          <div>
            {parseNote && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {parseNote}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={isParsing}
            onClick={handleParse}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md transition-all disabled:opacity-50"
          >
            {isParsing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Memproses AI...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Parse Data Otomatis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Kustomisasi Header Agen */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Building className="w-5 h-5 text-blue-600" />
          <span>3. Kustomisasi Header Resi (Agen)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-slate-400" /> Nama Toko / Agen
            </label>
            <input
              type="text"
              value={receipt.namaAgen}
              onChange={(e) => {
                handleInputChange('namaAgen', e.target.value);
                setAgentConfig({ ...agentConfig, namaAgen: e.target.value });
              }}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> Alamat Agen
            </label>
            <input
              type="text"
              value={receipt.alamat}
              onChange={(e) => {
                handleInputChange('alamat', e.target.value);
                setAgentConfig({ ...agentConfig, alamat: e.target.value });
              }}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400" /> No. HP / WhatsApp
            </label>
            <input
              type="text"
              value={receipt.noHp}
              onChange={(e) => {
                handleInputChange('noHp', e.target.value);
                setAgentConfig({ ...agentConfig, noHp: e.target.value });
              }}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. Editor Data Resi Lengkap */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">2 & 3. Editor Detail Resi Tagihan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Transaksi</label>
            <input
              type="text"
              value={receipt.tanggal}
              onChange={(e) => handleInputChange('tanggal', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">ID Pelanggan (Idpel)</label>
            <input
              type="text"
              value={receipt.idpel}
              onChange={(e) => handleInputChange('idpel', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Pelanggan</label>
            <input
              type="text"
              value={receipt.namaPelanggan}
              onChange={(e) => handleInputChange('namaPelanggan', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-semibold uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Pemakaian</label>
            <input
              type="text"
              value={receipt.pemakaian}
              onChange={(e) => handleInputChange('pemakaian', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Stand Meter</label>
            <input
              type="text"
              value={receipt.standMeter}
              onChange={(e) => handleInputChange('standMeter', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Bulan Tagihan / Periode</label>
            <input
              type="text"
              value={receipt.bulanTagihan}
              onChange={(e) => handleInputChange('bulanTagihan', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rincian Tagihan</label>
            <input
              type="text"
              value={receipt.rincianTagihan}
              onChange={(e) => handleInputChange('rincianTagihan', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rp Tagihan (Pokok)</label>
            <input
              type="number"
              value={receipt.rpTagihan}
              onChange={(e) => handleInputChange('rpTagihan', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Lain-Lain (Denda/Admin)</label>
            <input
              type="number"
              value={receipt.lainLain}
              onChange={(e) => handleInputChange('lainLain', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Admin Bank / Loket</label>
            <input
              type="number"
              value={receipt.adminBank}
              onChange={(e) => handleInputChange('adminBank', e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Total calculation banner */}
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-wider text-blue-600 font-bold">Total Pembayaran Otomatis</span>
            <p className="text-xs text-slate-500">(Rp Tagihan + Lain-Lain + Admin Bank)</p>
          </div>
          <div className="text-2xl font-extrabold text-blue-700">
            Rp {Number(receipt.totalBayar || 0).toLocaleString('id-ID')}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl shadow transition-all flex items-center justify-center gap-2"
          >
            <span>Simpan ke Database Riwayat</span>
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow transition-all flex items-center justify-center gap-2"
          >
            <span>Cetak Resi A6 / Export PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
