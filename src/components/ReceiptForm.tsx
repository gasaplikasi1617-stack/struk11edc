import React, { useState } from 'react';
import { AgentConfig, ReceiptData } from '../types';
import { Wand2, Sparkles, RefreshCw, CheckCircle2, CheckCircle, Building, MapPin, Phone, Printer, RotateCcw, Trash2, Zap } from 'lucide-react';
import { formatReceiptDateTime, generateRandomTransactionId } from '../utils/dateFormatter';
import { extractIdpelFromLines, cleanExtractedId, formatPeriod3Chars, getPreviousMonthPeriod, getCurrentMonthPeriod, getDefaultBulanTagihan, isPdamBill } from '../utils/billParser';
import { formatTerbilang } from '../utils/terbilang';
import { printDirectQZTray } from '../utils/qzTrayPrinter';

interface ReceiptFormProps {
  receipt: ReceiptData;
  setReceipt: React.Dispatch<React.SetStateAction<ReceiptData>>;
  agentConfig: AgentConfig;
  setAgentConfig: React.Dispatch<React.SetStateAction<AgentConfig>>;
  onSave: (force?: boolean) => any | Promise<any>;
  onPrint: () => void;
  onReset?: () => void;
  resetTrigger?: number;
}

export function ReceiptForm({
  receipt,
  setReceipt,
  agentConfig,
  setAgentConfig,
  onSave,
  onPrint,
  onReset,
  resetTrigger,
}: ReceiptFormProps) {
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');

  const handleClearAll = () => {
    setRawText('');
    setParseNote('');
    setReceipt((prev) => ({
      ...prev,
      id: generateRandomTransactionId(),
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
    }));
  };

  // Clear rawText, parseNote, and assign fresh empty values when resetTrigger changes
  React.useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger > 0) {
      setRawText('');
      setParseNote('');
      setReceipt((prev) => ({
        ...prev,
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
      }));
    }
  }, [resetTrigger]);

  const clientParse = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const lowerText = text.toLowerCase();
    
    let idpel = extractIdpelFromLines(lines, text);
    let namaPelanggan = "";
    let rpTagihan = 0;
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      
      if (!idpel) {
        idpel = extractIdpelFromLines([line], line);
      }

      const isIdLine = /(?:^|\b)(?:no\.?|nomor|id|idpel|kode)\s*(?:pelanggan|peserta|nasabah|konsumen|polis|rekening|rek|kontrak|sambungan|meter)/i.test(lower);
      const isNameCandidate = !isIdLine && (/\bnama\b/i.test(lower) || /^(?:pelanggan|peserta|nasabah|konsumen)\s*[:=]/i.test(line));

      if (isNameCandidate && !namaPelanggan) {
        const parts = line.split(/[:=]/);
        let firstPart = parts.length > 1 ? parts.slice(1).join(":").trim() : "";
        if (!firstPart && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (!/[:=]/.test(nextLine) && !/^(info|struk|bukti|transaksi|pln|pdam|telkom|indihome|speedy|bpjs|pbb|idpel|no|rek|periode|bln|thn|tarif|daya|stand|meter|rp|total|admin|polis|peserta|kartu|kontrak)/i.test(nextLine)) {
            firstPart = nextLine;
            i++;
          }
        }
        if (/^\d{5,}$/.test(firstPart.replace(/[^0-9]/g, "")) && firstPart.length < 15 && !/[a-zA-Z]/.test(firstPart)) {
          firstPart = "";
        }

        if (firstPart) {
          namaPelanggan = firstPart;
          // Check if there is a 2nd line of the name (tidak abaikan jika nama ada 2 baris)
          while (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            const lowerNext = nextLine.toLowerCase();
            const isLabelOrField = /[:=]/.test(nextLine) ||
              /^(info|struk|bukti|transaksi|pln|pdam|telkom|indihome|speedy|bpjs|pbb|idpel|id\s*pelanggan|no|nomor|polis|kontrak|peserta|kartu|nop|rek|rekening|periode|bln|bulan|thn|tahun|tarif|daya|kwh|va|gol|golongan|stand|meter|sm|rp|tagihan|total|admin|adm|denda|biaya|lain|alamat|jl|jalan|kec|kel|tgl|tanggal|jam|waktu|terbilang|status|petugas|sn|token)\b/i.test(lowerNext) ||
              /^\d+([\.,]\d+)*$/.test(nextLine.replace(/\s+/g, "")) ||
              /^(rp\.?|idr)\s*\d+/i.test(nextLine);

            if (!isLabelOrField && nextLine.length > 0 && nextLine.length < 50) {
              namaPelanggan = `${namaPelanggan} ${nextLine}`;
              i++;
            } else {
              break;
            }
          }
        }
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
    }

    if (namaPelanggan) {
      namaPelanggan = namaPelanggan.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
    }

    const isPdamCheck = isPdam || isPdamBill({ rincianTagihan, rawText: text });
    bulanTagihan = getDefaultBulanTagihan(isPdamCheck);

    if (!idpel) {
      idpel = extractIdpelFromLines(lines, text);
    }

    if (!namaPelanggan && lines.length > 0) {
      for (const line of lines) {
        if (!/[:=]/.test(line) && !/^(info|struk|bukti|transaksi|pln|pdam|telkom|indihome|speedy|bpjs|pbb|\d+)/i.test(line) && line.length >= 3) {
          namaPelanggan = line.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
          break;
        }
      }
      if (!namaPelanggan) {
        namaPelanggan = "";
      }
    }

    const lainLain = 0;
    if (totalBayar === 0) {
      totalBayar = rpTagihan + lainLain + adminBank;
    }

    return {
      tanggal: formatReceiptDateTime(),
      idpel: cleanExtractedId(idpel),
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
        let finalIdpel = d.idpel ? String(d.idpel).trim() : '';
        if (!finalIdpel || finalIdpel === '-') {
          finalIdpel = extractIdpelFromLines(rawText.split('\n'), rawText);
        }
        finalIdpel = cleanExtractedId(finalIdpel);

        setReceipt((prev) => {
          const isPdam = isPdamBill({ ...d, rawText });
          let finalBulanTagihan = getDefaultBulanTagihan(isPdam);

          return {
            ...prev,
            tanggal: d.tanggal || prev.tanggal,
            idpel: finalIdpel || prev.idpel,
            namaPelanggan: (d.namaPelanggan || prev.namaPelanggan || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase(),
            pemakaian: d.pemakaian || prev.pemakaian,
            standMeter: d.standMeter || prev.standMeter,
            rincianTagihan: d.rincianTagihan || prev.rincianTagihan,
            bulanTagihan: finalBulanTagihan,
            rpTagihan: Number(d.rpTagihan) || 0,
            lainLain: Number(d.lainLain) || 0,
            adminBank: Number(d.adminBank) || 2500,
            totalBayar: (Number(d.rpTagihan) || 0) + (Number(d.lainLain) || 0) + (Number(d.adminBank) || 2500),
          };
        });
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
      if (field === 'rincianTagihan') {
        const isPdam = isPdamBill({ rincianTagihan: String(value) });
        updated.bulanTagihan = getDefaultBulanTagihan(isPdam);
      }
      return updated;
    });
  };

  const [isQzPrinting, setIsQzPrinting] = useState(false);

  const handleQzTrayAction = async () => {
    let currentReceipt = { ...receipt };
    if (rawText.trim() && (!currentReceipt.namaPelanggan || currentReceipt.namaPelanggan === 'PELANGGAN' || !currentReceipt.totalBayar)) {
      const d = clientParse(rawText);
      currentReceipt = { ...currentReceipt, ...d };
      setReceipt(currentReceipt);
    }

    if (!currentReceipt.namaPelanggan && !currentReceipt.idpel && (!currentReceipt.totalBayar || currentReceipt.totalBayar <= 0)) {
      alert("Silakan masukkan teks mentah atau isi data tagihan terlebih dahulu sebelum mencetak!");
      return;
    }

    setIsQzPrinting(true);
    setParseNote('Menyimpan ke riwayat & menghubungkan ke QZ Tray...');

    try {
      // 1. Simpan ke database / riwayat
      await onSave(true);

      // 2. Cetak langsung via QZ Tray (Epson LX-310)
      const printedTo = await printDirectQZTray(currentReceipt);
      setParseNote(`SUKSES! Data tersimpan & struk dikirim ke ${printedTo} via QZ Tray.`);

      // 3. Reset form
      if (onReset) {
        onReset();
      } else {
        handleClearAll();
      }
    } catch (err: any) {
      console.warn('QZ Tray direct print warning:', err);
      alert(
        `Data transaksi BERHASIL DISIMPAN ke riwayat.\n\n` +
        `Untuk mencetak via QZ Tray: Pastikan program QZ Tray sudah terbuka dan aktif (ikon hijau di dekat jam Windows).\n\n` +
        `Detail: ${err.message || String(err)}`
      );
    } finally {
      setIsQzPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Paste & Parse Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-800">1. Input</h2>
        </div>

        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Tempel (Ctrl+V) data teks mentah tagihan di sini..."
          className="w-full font-mono text-xs sm:text-sm p-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-slate-50/50"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {parseNote && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {parseNote}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 1. QZ/Tray */}
            <button
              type="button"
              disabled={isQzPrinting}
              onClick={handleQzTrayAction}
              className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer border border-emerald-500/70 active:scale-[0.98]"
              title="Cetak langsung ke Epson LX-310 via QZ Tray & Otomatis Simpan ke Riwayat"
            >
              {isQzPrinting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Mencetak QZ...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>QZ/Tray</span>
                </>
              )}
            </button>

            {/* 2. Clear / Reset */}
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border border-slate-300 shadow-2xs cursor-pointer active:scale-[0.98]"
              title="Bersihkan teks input dan kosongkan isian form"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>Clear / Reset</span>
            </button>

            {/* 3. Input (Background Menarik & Eye-Catching) */}
            <button
              type="button"
              disabled={isParsing}
              onClick={handleParse}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:shadow-indigo-500/30 transition-all disabled:opacity-50 cursor-pointer border border-indigo-400/40 active:scale-[0.98]"
              title="Proses teks tagihan otomatis ke form"
            >
              {isParsing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                  <span>Memproses AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span className="tracking-wide">Input</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Editor Data Resi Lengkap */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">2. Editor Detail Resi Tagihan</h2>
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-all"
            title="Kosongkan seluruh isian form resi"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Bersihkan Form</span>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              ID Transaksi
            </label>
            <input
              type="text"
              value={receipt.id || ''}
              onChange={(e) => handleInputChange('id', e.target.value)}
              placeholder="TRX-83920184"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono font-semibold text-blue-900 bg-slate-50"
            />
          </div>

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
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bulan Tagihan / Periode
            </label>
            <input
              type="text"
              value={receipt.bulanTagihan || ''}
              onChange={(e) => handleInputChange('bulanTagihan', e.target.value)}
              placeholder="Bulan Tagihan / Periode"
              className="w-full text-sm border-2 border-blue-300 focus:border-blue-500 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-400 outline-none font-semibold text-blue-900 bg-blue-50/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              ID Pelanggan (Idpel)
            </label>
            <input
              type="text"
              value={receipt.idpel}
              onChange={(e) => handleInputChange('idpel', e.target.value)}
              placeholder="Nomor Polis / IDPEL / No. Sambungan"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Pelanggan</label>
            <input
              type="text"
              value={receipt.namaPelanggan}
              onChange={(e) => handleInputChange('namaPelanggan', e.target.value)}
              placeholder="NAMA LENGKAP PELANGGAN"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-semibold uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Pemakaian</label>
            <input
              type="text"
              value={receipt.pemakaian}
              onChange={(e) => handleInputChange('pemakaian', e.target.value)}
              placeholder="Contoh: R1M/900 VA atau 29 m3"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Stand Meter</label>
            <input
              type="text"
              value={receipt.standMeter}
              onChange={(e) => handleInputChange('standMeter', e.target.value)}
              placeholder="Contoh: 014230 - 014380"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rincian Tagihan</label>
            <input
              type="text"
              value={receipt.rincianTagihan}
              onChange={(e) => handleInputChange('rincianTagihan', e.target.value)}
              placeholder="Contoh: Tagihan Listrik PLN Pascabayar / PDAM"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rp Tagihan (Pokok)</label>
            <input
              type="number"
              value={receipt.rpTagihan === 0 ? '' : receipt.rpTagihan}
              onChange={(e) => handleInputChange('rpTagihan', e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Lain-Lain (Denda/Admin)</label>
            <input
              type="number"
              value={receipt.lainLain === 0 ? '' : receipt.lainLain}
              onChange={(e) => handleInputChange('lainLain', e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Admin Bank / Loket</label>
            <input
              type="number"
              value={receipt.adminBank === 0 ? '' : receipt.adminBank}
              onChange={(e) => handleInputChange('adminBank', e.target.value === '' ? 0 : Number(e.target.value))}
              placeholder="0"
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Total calculation banner */}
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider text-blue-600 font-bold">Total Pembayaran Otomatis</span>
              <p className="text-xs text-slate-500">(Rp Tagihan + Lain-Lain + Admin Bank)</p>
            </div>
            <div className="text-2xl font-extrabold text-blue-700">
              Rp {Number(receipt.totalBayar || 0).toLocaleString('id-ID')}
            </div>
          </div>
          {Number(receipt.totalBayar || 0) > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200/60 text-xs text-blue-900 italic font-semibold">
              Terbilang: {formatTerbilang(Number(receipt.totalBayar || 0))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
