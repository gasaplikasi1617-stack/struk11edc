import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { extractIdpelFromLines, cleanExtractedId, formatPeriod3Chars } from "./src/utils/billParser";

const app = express();
const PORT = 3000;

app.use(express.json());

// Path for storing transaction history locally
const DATA_FILE = path.join(process.cwd(), "transactions.json");
const GAS_CONFIG_FILE = path.join(process.cwd(), "gas_config.json");
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwp7frqV8EM-14lPPeJS59HbkaKUEg_-nj0ksIa4zxNmPzVA2N2FYyZeRXveb1F5Yl6/exec";

interface GasConfig {
  gasUrl: string;
  autoSync: boolean;
  lastSyncedAt?: string;
}

function getGasConfig(): GasConfig {
  try {
    if (fs.existsSync(GAS_CONFIG_FILE)) {
      const data = fs.readFileSync(GAS_CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(data);
      return {
        gasUrl: parsed.gasUrl || process.env.GAS_WEB_APP_URL || DEFAULT_GAS_URL,
        autoSync: parsed.autoSync !== false,
        lastSyncedAt: parsed.lastSyncedAt || undefined,
      };
    }
  } catch (e) {
    console.error("Error reading gas_config:", e);
  }
  return {
    gasUrl: process.env.GAS_WEB_APP_URL || DEFAULT_GAS_URL,
    autoSync: true,
    lastSyncedAt: undefined,
  };
}

function saveGasConfig(cfg: Partial<GasConfig>): GasConfig {
  const current = getGasConfig();
  const updated: GasConfig = {
    ...current,
    ...cfg,
  };
  try {
    fs.writeFileSync(GAS_CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving gas_config:", e);
  }
  return updated;
}

// Helpers for calling Google Apps Script Web App
function parseGasResponse(text: string): any {
  if (!text || !text.trim()) {
    throw new Error("Google Apps Script mengembalikan respon kosong.");
  }
  const trimmed = text.trim();

  // Detect if Google returned an HTML page (e.g. login redirect, error 404, authorization required)
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.includes("accounts.google.com") ||
    trimmed.includes("ServiceLogin") ||
    trimmed.includes("The page cannot be found") ||
    trimmed.includes("Google Drive – Akses Ditolak") ||
    trimmed.includes("Sign in - Google Accounts")
  ) {
    throw new Error(
      "Akses Google Apps Script Ditolak / Meminta Login. " +
      "Penyebab: Web App belum di-deploy dengan izin 'Anyone' (Siapa saja). " +
      "Solusi: Di Google Apps Script, klik Deploy > Manage Deployments (atau New Deployment) > ubah 'Who has access' menjadi 'Anyone' (Siapa saja) > Deploy ulang."
    );
  }

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    if (trimmed.toLowerCase().includes("error") || trimmed.length < 300) {
      return { success: true, message: trimmed };
    }
    throw new Error(
      "Respon dari Google Apps Script bukan JSON yang valid. " +
      "Pastikan Web App di-deploy dengan opsi 'Who has access: Anyone' dan file Code.gs sudah disimpan."
    );
  }
}

async function callGasPost(url: string, body: any): Promise<any> {
  const cleanUrl = (url || "").trim();
  if (!cleanUrl) throw new Error("URL Google Apps Script belum diisi");

  if (cleanUrl.includes("/edit") || cleanUrl.includes("/dev")) {
    throw new Error("URL yang Anda masukkan adalah URL Editor/Dev. Silakan gunakan Web App URL yang berakhiran '/exec' dari menu Deploy.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const res = await fetch(cleanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    return parseGasResponse(text);
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("Koneksi ke Google Apps Script timeout (melebihi 20 detik)");
    }
    throw err;
  }
}

async function callGasGet(url: string, params: Record<string, string> = {}): Promise<any> {
  const cleanUrl = (url || "").trim();
  if (!cleanUrl) throw new Error("URL Google Apps Script belum diisi");

  if (cleanUrl.includes("/edit") || cleanUrl.includes("/dev")) {
    throw new Error("URL yang Anda masukkan adalah URL Editor/Dev. Silakan gunakan Web App URL yang berakhiran '/exec' dari menu Deploy.");
  }

  const u = new URL(cleanUrl);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(u.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    return parseGasResponse(text);
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("Koneksi ke Google Apps Script timeout (melebihi 20 detik)");
    }
    throw err;
  }
}

// Anti-duplicate normalization helpers
function cleanStr(str: any): string {
  if (!str) return "";
  return String(str).trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanPeriod(str: any): string {
  if (!str) return "";
  return String(str).toLowerCase().replace(/[\s\-_/.,]/g, "");
}

function cleanDate(str: any): string {
  if (!str) return "";
  return String(str).trim().toLowerCase().replace(/[-.]/g, "/");
}

function findDuplicateTransaction(incoming: any, existingList: any[]): { isDuplicate: boolean; reason?: string; matched?: any } {
  if (!incoming || !Array.isArray(existingList) || existingList.length === 0) {
    return { isDuplicate: false };
  }

  const incId = incoming.id ? String(incoming.id).trim() : "";
  const incIdpel = cleanStr(incoming.idpel);
  const incBulan = cleanPeriod(incoming.bulanTagihan);
  const incTotal = Number(incoming.totalBayar || 0);
  const incTanggal = cleanDate(incoming.tanggal);
  const incNama = cleanStr(incoming.namaPelanggan);
  const incRincian = cleanStr(incoming.rincianTagihan);

  for (const ex of existingList) {
    // 1. Direct ID match
    if (incId && ex.id && String(ex.id).trim() === incId) {
      return {
        isDuplicate: true,
        reason: `ID Transaksi '${incId}' sudah terdaftar di riwayat.`,
        matched: ex,
      };
    }

    const exIdpel = cleanStr(ex.idpel);
    const exBulan = cleanPeriod(ex.bulanTagihan);
    const exTotal = Number(ex.totalBayar || 0);
    const exTanggal = cleanDate(ex.tanggal);
    const exNama = cleanStr(ex.namaPelanggan);
    const exRincian = cleanStr(ex.rincianTagihan);

    // 2. Match by IDPEL (if valid IDPEL is present)
    const hasValidIdpel = incIdpel && incIdpel !== "-" && incIdpel.length >= 4;
    if (hasValidIdpel && incIdpel === exIdpel) {
      // 2a. Same Period
      const hasValidPeriod = incBulan && incBulan !== "-" && incBulan.length >= 3;
      if (hasValidPeriod && exBulan && incBulan === exBulan) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} dengan Periode Tagihan ${incoming.bulanTagihan || "-"} sudah pernah tersimpan di riwayat.`,
          matched: ex,
        };
      }

      // 2b. Same Total + Same Date
      if (incTotal > 0 && incTotal === exTotal && incTanggal && exTanggal && incTanggal === exTanggal) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} dengan Total Rp ${incTotal.toLocaleString("id-ID")} pada tanggal ${incoming.tanggal} sudah pernah tersimpan di riwayat.`,
          matched: ex,
        };
      }

      // 2c. Same Total + Same Service / Rincian
      if (incTotal > 0 && incTotal === exTotal && incRincian && exRincian && incRincian === exRincian) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} (${incoming.rincianTagihan}) dengan Total Rp ${incTotal.toLocaleString("id-ID")} sudah ada di riwayat.`,
          matched: ex,
        };
      }

      // 2d. Same Total + Same Customer Name
      if (incTotal > 0 && incTotal === exTotal && incNama && exNama && incNama === exNama) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} atas nama ${incoming.namaPelanggan} dengan Total Rp ${incTotal.toLocaleString("id-ID")} sudah ada di riwayat.`,
          matched: ex,
        };
      }
    }

    // 3. Fallback without IDPEL: Match Customer Name + Date + Total
    const hasValidNama = incNama && incNama !== "-" && incNama.length >= 3;
    if (hasValidNama && incNama === exNama && incTotal > 0 && incTotal === exTotal) {
      if (incTanggal && exTanggal && incTanggal === exTanggal) {
        return {
          isDuplicate: true,
          reason: `Pelanggan atas nama ${incoming.namaPelanggan} dengan Total Rp ${incTotal.toLocaleString("id-ID")} pada tanggal ${incoming.tanggal} sudah ada di riwayat.`,
          matched: ex,
        };
      }
    }
  }

  return { isDuplicate: false };
}

function deduplicateList(list: any[]): { cleaned: any[]; removedCount: number } {
  if (!Array.isArray(list)) return { cleaned: [], removedCount: 0 };
  const cleaned: any[] = [];
  let removedCount = 0;
  for (const item of list) {
    const check = findDuplicateTransaction(item, cleaned);
    if (check.isDuplicate) {
      removedCount++;
    } else {
      cleaned.push(item);
    }
  }
  return { cleaned, removedCount };
}

// Two-way merge helper without duplicates
function mergeTransactions(localList: any[], sheetList: any[]) {
  const localDedupe = deduplicateList(localList).cleaned;
  const sheetDedupe = deduplicateList(sheetList).cleaned;

  const merged: any[] = [...localDedupe];
  const newFromSheet: any[] = [];

  for (const s of sheetDedupe) {
    const dupCheck = findDuplicateTransaction(s, merged);
    if (!dupCheck.isDuplicate) {
      merged.push(s);
      newFromSheet.push(s);
    }
  }

  const newFromLocal: any[] = [];
  for (const l of localDedupe) {
    const dupCheck = findDuplicateTransaction(l, sheetDedupe);
    if (!dupCheck.isDuplicate) {
      newFromLocal.push(l);
    }
  }

  merged.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : (a.id && a.id.startsWith("TX-") ? Number(a.id.replace("TX-", "")) : 0);
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : (b.id && b.id.startsWith("TX-") ? Number(b.id.replace("TX-", "")) : 0);
    return timeB - timeA;
  });

  return {
    merged: merged.slice(0, 100),
    newFromSheet,
    newFromLocal,
  };
}

function getTransactions(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        const { cleaned, removedCount } = deduplicateList(list);
        if (removedCount > 0) {
          saveTransactions(cleaned);
        }
        return cleaned;
      }
    }
  } catch (e) {
    console.error("Error reading transactions:", e);
  }
  return [];
}

function saveTransactions(txs: any[]) {
  try {
    const { cleaned } = deduplicateList(txs);
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleaned, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving transactions:", e);
  }
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get all transactions (up to 100)
app.get("/api/transactions", (req, res) => {
  const txs = getTransactions();
  res.json(txs.slice(0, 100));
});

// Save a new transaction with strict anti-duplicate guarantee
app.post("/api/transactions", (req, res) => {
  const txs = getTransactions();
  const incoming = req.body;
  const force = Boolean(incoming.force);

  if (!force) {
    const dupCheck = findDuplicateTransaction(incoming, txs);
    if (dupCheck.isDuplicate) {
      return res.status(200).json({
        success: false,
        isDuplicate: true,
        message: "Data transaksi ini sudah pernah tersimpan di riwayat!",
        reason: dupCheck.reason,
        transaction: dupCheck.matched,
      });
    }
  }

  const now = Date.now();
  const newTx = {
    id: incoming.id || ("TX-" + now),
    createdAt: incoming.createdAt || new Date().toISOString(),
    ...incoming,
  };
  delete newTx.force;

  txs.unshift(newTx); // Add to beginning
  const { cleaned } = deduplicateList(txs);
  if (cleaned.length > 100) cleaned.splice(100);
  saveTransactions(cleaned);

  // Auto-sync to Google Apps Script if enabled and configured
  const gasCfg = getGasConfig();
  if (gasCfg.gasUrl && gasCfg.autoSync) {
    callGasPost(gasCfg.gasUrl, { action: "saveTransaction", data: newTx }).catch((err) => {
      console.warn("GAS background auto-push warning:", err.message);
    });
  }

  res.json({ success: true, transaction: newTx });
});

// Endpoint to deduplicate all transactions
app.post("/api/transactions/deduplicate", (req, res) => {
  const txs = getTransactions();
  const { cleaned, removedCount } = deduplicateList(txs);
  saveTransactions(cleaned);
  res.json({
    success: true,
    removedCount,
    remainingCount: cleaned.length,
    message: removedCount > 0
      ? `Berhasil membersihkan ${removedCount} data transaksi duplikat!`
      : "Data riwayat sudah bersih, tidak ditemukan data duplikat.",
  });
});

// Delete a transaction
app.delete("/api/transactions/:id", (req, res) => {
  let txs = getTransactions();
  const id = req.params.id;
  txs = txs.filter((t: any) => t.id !== id);
  saveTransactions(txs);
  res.json({ success: true });
});

// Parse raw bill text using Gemini or smart fallback
app.post("/api/parse-bill", async (req, res) => {
  const { rawText } = req.body;
  if (!rawText || typeof rawText !== "string") {
    return res.status(400).json({ error: "Teks mentah tidak boleh kosong" });
  }

  // Try Gemini API if key is available
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
Anda adalah sistem ekstraksi data resi pembayaran tagihan (PLN, PDAM, Indihome, BPJS Kesehatan / Ketenagakerjaan, Telkom, Leasing / Multifinance, PBB, dll).
Ekstrak data dari teks mentah berikut ke dalam format JSON murni.

Aturan Ekstraksi Sangat Penting:
1. "idpel": Ekstrak nomor identitas pelanggan / ID Pelanggan. PENTING: Setiap instansi memiliki penamaan yang berbeda-beda, SEMUANYA bernilai SAMA dan WAJIB diekstrak ke dalam field "idpel":
   - "Nomor Polis" / "No Polis" / "No. Polis" / "Polis" (Asuransi / BPJS Kesehatan)
   - "No Pelanggan" / "Nomor Pelanggan" / "ID Pelanggan" / "IDPEL" / "ID Pel" (PLN / PDAM)
   - "No Rekening" / "No. Rekening" / "No Rek" / "Nomor Rekening" (PDAM / Bank)
   - "No Sambungan" / "Nomor Sambungan" / "No Sambung" (PDAM)
   - "No Peserta" / "Nomor Peserta" / "No Kartu" / "No BPJS" (BPJS)
   - "Nomor Kontrak" / "No Kontrak" / "No Perjanjian" (Leasing / Multifinance / Cicilan)
   - "No Internet" / "No Telepon" / "No Telp" / "No IndiHome" / "No Speedy" (Telkom / IndiHome)
   - "Nomor VA" / "No VA" / "Virtual Account"
   - "NOP" / "Nomor Objek Pajak" (PBB)
   - "No Meter" / "Nomor Meter" (PLN)
   - "Customer ID" / "Cust ID" / "Account No"
   Ambil nomor/kodenya secara bersih dan akurat (tanpa menyertakan label atau kata keterangan tambahan).
2. "namaPelanggan": Ambil nama pelanggan / peserta / nasabah lengkap dalam SATU baris. Jika nama pelanggan pada teks terpotong dalam 2 baris, JANGAN abaikan baris kedua. Satukan kedua baris tersebut menjadi satu baris nama lengkap tanpa enter/patah baris.
3. "bulanTagihan": Ambil nama bulan dan tahun saja (contoh: "SEP26", "AGUSTUS 2026", "08/2026"). JANGAN sertakan kata "Rp" atau angka nominal uang setelahnya.
4. "pemakaian":
   - Jika teks adalah PLN / Listrik / Token: format "pemakaian" HARUS menyertakan daya dengan "VA", contoh: "R1M/900 VA".
   - Jika teks adalah PDAM / Air: format "pemakaian" HARUS mengandung "m3" (contoh: "23 m3"). Kosongkan jika tidak ada.
   - Untuk layanan lain, sesuaikan.
5. "rpTagihan": Isi dengan nominal angka tagihan murni.
6. "totalBayar": Isi dengan nominal total pembayaran asli.

Field JSON yang harus dikembalikan:
- tanggal: string
- idpel: string
- namaPelanggan: string
- pemakaian: string
- standMeter: string
- rincianTagihan: string
- bulanTagihan: string
- rpTagihan: number
- lainLain: number
- adminBank: number
- totalBayar: number

Teks Mentah:
"""
${rawText}
"""
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      let text = response.text || "";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedData = JSON.parse(text);

      parsedData.namaPelanggan = String(parsedData.namaPelanggan || "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

      // Ensure idpel is populated & clean
      let rawIdpel = parsedData.idpel ? String(parsedData.idpel).trim() : "";
      if (!rawIdpel || rawIdpel === "-") {
        rawIdpel = extractIdpelFromLines(rawText.split("\n"), rawText);
      }
      parsedData.idpel = cleanExtractedId(rawIdpel);

      const rpTagihan = Number(parsedData.rpTagihan) || 0;
      const lainLain = Number(parsedData.lainLain) || 0;
      const adminBank = Number(parsedData.adminBank) || 2500;
      const totalBayar = Number(parsedData.totalBayar) || (rpTagihan + lainLain + adminBank);
      parsedData.rpTagihan = rpTagihan;
      parsedData.lainLain = lainLain;
      parsedData.adminBank = adminBank;
      parsedData.totalBayar = totalBayar;

      return res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.error("Gemini parse error, falling back to smart regex:", err.message);
    }
  }

  // Fallback Smart Regex Parser
  try {
    const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const lowerText = rawText.toLowerCase();
    
    let idpel = extractIdpelFromLines(lines, rawText);
    let namaPelanggan = "";
    let rpTagihan = 0;
    let totalBayar = 0;
    let bulanTagihan = "";
    let standMeter = "";
    let rincianTagihan = "Tagihan Pembayaran";

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
      const rangeMatch = rawText.match(/(\d+\s*-\s*\d+)/);
      if (rangeMatch) standMeter = rangeMatch[0];
    }

    let pemakaian = "";
    if (isPln) {
      const vaMatch = rawText.match(/([Rr]1[Mm]?\s*\/\s*\d+\s*VA|\d+\s*VA)/i);
      pemakaian = vaMatch ? vaMatch[0].toUpperCase() : "R1M/900 VA";
    } else if (isPdam) {
      const m3Match = rawText.match(/(\d+\s*m3|\d+\s*M3)/i);
      pemakaian = m3Match ? m3Match[0].toLowerCase() : "";
    } else {
      const m3Match = rawText.match(/(\d+\s*m3|\d+\s*M3)/i);
      if (m3Match) {
        pemakaian = m3Match[0].toLowerCase();
      } else {
        const vaMatch = rawText.match(/(\d+\s*VA)/i);
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
          if (val > 1000 && rpTagihan === 0) rpTagihan = val;
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

    // Check line 1 (baris kedua) or any line for period
    for (const idx of [1, 0, 2]) {
      if (lines[idx] && /jan|feb|mar|apr|mei|jun|jul|agu|agt|ags|sep|okt|nov|des|aug|oct|dec|\d{1,2}\/\d{2,4}|\b202[0-9]\b/i.test(lines[idx])) {
        bulanTagihan = formatPeriod3Chars(lines[idx]);
        break;
      }
    }

    if (!bulanTagihan) {
      for (const line of lines) {
        if (/jan|feb|mar|apr|mei|jun|jul|agu|agt|ags|sep|okt|nov|des|aug|oct|dec|\d{1,2}\/\d{2,4}|\b202[0-9]\b/i.test(line)) {
          bulanTagihan = formatPeriod3Chars(line);
          break;
        }
      }
    }

    if (!bulanTagihan) {
      const periodMatch = rawText.match(/([A-Za-z]{3,9}\s*\d{2,4}|\d{2}\/\d{4})/);
      if (periodMatch) bulanTagihan = formatPeriod3Chars(periodMatch[0]);
      else bulanTagihan = "Sep26";
    }

    if (!idpel) {
      idpel = extractIdpelFromLines(lines, rawText);
    }

    if (!namaPelanggan && lines.length > 0) {
      for (const line of lines) {
        if (!/[:=]/.test(line) && !/^(info|struk|bukti|transaksi|pln|pdam|telkom|indihome|speedy|bpjs|pbb|\d+)/i.test(line) && line.length >= 3) {
          namaPelanggan = line.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
          break;
        }
      }
      if (!namaPelanggan) {
        namaPelanggan = lines[0].replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
      }
    }

    if (rpTagihan === 0) {
      for (const line of lines) {
        const clean = line.replace(/\./g, "").replace(/,/g, "");
        const match = clean.match(/\b\d{4,8}\b/);
        if (match) {
          const val = parseInt(match[0], 10);
          if (val > 1000) {
            rpTagihan = val;
            break;
          }
        }
      }
    }

    const today = new Date().toLocaleDateString("id-ID");
    const lainLain = 0;
    if (totalBayar === 0) {
      totalBayar = rpTagihan + lainLain + adminBank;
    }

    const fallbackData = {
      tanggal: today,
      idpel: idpel || "",
      namaPelanggan: namaPelanggan || "PELANGGAN UMUM",
      pemakaian: pemakaian,
      standMeter: standMeter,
      rincianTagihan: rincianTagihan || "Tagihan Layanan",
      bulanTagihan: bulanTagihan || "BULAN BERJALAN",
      rpTagihan: rpTagihan || 50000,
      lainLain,
      adminBank,
      totalBayar,
    };

    return res.json({ success: true, data: fallbackData, note: "Parsed via Smart Regex Fallback" });
  } catch (parseErr: any) {
    return res.status(500).json({ error: "Gagal memparsing teks: " + parseErr.message });
  }
});

// GAS Sync API Endpoints
app.get("/api/gas/config", (req, res) => {
  res.json(getGasConfig());
});

app.post("/api/gas/config", (req, res) => {
  const { gasUrl, autoSync } = req.body;
  const updated = saveGasConfig({
    gasUrl: typeof gasUrl === "string" ? gasUrl.trim() : undefined,
    autoSync: typeof autoSync === "boolean" ? autoSync : undefined,
  });
  res.json({ success: true, config: updated });
});

// Test connection to Google Apps Script Web App
app.post("/api/gas/test", async (req, res) => {
  try {
    const targetUrl = (req.body.gasUrl || getGasConfig().gasUrl || "").trim();
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "URL Web App Google Apps Script belum diisi." });
    }
    let result: any;
    try {
      result = await callGasGet(targetUrl, { action: "ping" });
    } catch {
      result = await callGasPost(targetUrl, { action: "ping" });
    }
    return res.json({
      success: true,
      message: "Koneksi ke Google Apps Script Web App berhasil terhubung!",
      detail: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal menghubungkan ke Google Apps Script: " + (err.message || String(err)),
    });
  }
});

// Full Two-Way Sync (Sinkron 2 Arah)
app.post("/api/gas/sync", async (req, res) => {
  try {
    const gasCfg = getGasConfig();
    const targetUrl = (req.body.gasUrl || gasCfg.gasUrl || "").trim();
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "URL Web App Google Apps Script belum dikonfigurasi." });
    }

    const localTxs = getTransactions();
    let remoteTxs: any[] = [];
    let pushedCount = 0;

    // 1. Try atomic twoWaySync POST to Google Apps Script
    try {
      const syncRes = await callGasPost(targetUrl, {
        action: "twoWaySync",
        transactions: localTxs,
      });

      if (syncRes && syncRes.success && Array.isArray(syncRes.data)) {
        remoteTxs = syncRes.data;
        pushedCount = typeof syncRes.pushedToSheet === "number" ? syncRes.pushedToSheet : localTxs.length;
      }
    } catch (e: any) {
      console.warn("GAS twoWaySync POST fallback:", e.message);
    }

    // 2. Fallback: If remoteTxs is empty, pull via GET
    if (remoteTxs.length === 0) {
      try {
        const getRes = await callGasGet(targetUrl, { action: "getTransactions" });
        if (getRes && Array.isArray(getRes.data)) {
          remoteTxs = getRes.data;
        } else if (Array.isArray(getRes)) {
          remoteTxs = getRes;
        }
      } catch (getErr: any) {
        console.warn("GAS getTransactions GET error:", getErr.message);
      }
    }

    // 3. Merge both datasets cleanly
    const { merged, newFromSheet, newFromLocal } = mergeTransactions(localTxs, remoteTxs);

    // 4. If there were local transactions not yet sent to Google Sheets, push them now
    if (newFromLocal.length > 0 && pushedCount === 0) {
      try {
        await callGasPost(targetUrl, {
          action: "syncTransactions",
          transactions: newFromLocal,
        });
        pushedCount = newFromLocal.length;
      } catch (pushErr: any) {
        console.warn("GAS push missing records error:", pushErr.message);
      }
    }

    // 5. Save unified result locally
    saveTransactions(merged);

    // 6. Update last sync time
    const now = new Date().toISOString();
    saveGasConfig({ lastSyncedAt: now });

    return res.json({
      success: true,
      message: `Sinkronisasi 2 arah berhasil! ${newFromSheet.length} transaksi ditarik dari Google Sheets, ${pushedCount} transaksi dikirim ke Google Sheets.`,
      pulledCount: newFromSheet.length,
      pushedCount: pushedCount,
      totalCount: merged.length,
      lastSyncedAt: now,
      data: merged,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal melakukan sinkronisasi 2 arah: " + (err.message || String(err)),
    });
  }
});

// Pull transactions from Google Sheets
app.post("/api/gas/pull", async (req, res) => {
  try {
    const gasCfg = getGasConfig();
    const targetUrl = (req.body.gasUrl || gasCfg.gasUrl || "").trim();
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "URL Web App Google Apps Script belum dikonfigurasi." });
    }
    const getRes = await callGasGet(targetUrl, { action: "getTransactions" });
    const sheetTxs = Array.isArray(getRes?.data) ? getRes.data : (Array.isArray(getRes) ? getRes : []);
    const localTxs = getTransactions();
    const { merged, newFromSheet } = mergeTransactions(localTxs, sheetTxs);
    saveTransactions(merged);
    const now = new Date().toISOString();
    saveGasConfig({ lastSyncedAt: now });
    return res.json({
      success: true,
      message: `Berhasil menarik ${newFromSheet.length} transaksi dari Google Sheets. Total data: ${merged.length}.`,
      pulledCount: newFromSheet.length,
      totalCount: merged.length,
      lastSyncedAt: now,
      data: merged,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal menarik data dari Google Sheets: " + (err.message || String(err)),
    });
  }
});

// Push local transactions to Google Sheets
app.post("/api/gas/push", async (req, res) => {
  try {
    const gasCfg = getGasConfig();
    const targetUrl = (req.body.gasUrl || gasCfg.gasUrl || "").trim();
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "URL Web App Google Apps Script belum dikonfigurasi." });
    }
    const localTxs = getTransactions();
    const pushRes = await callGasPost(targetUrl, {
      action: "syncTransactions",
      transactions: localTxs,
    });
    const now = new Date().toISOString();
    saveGasConfig({ lastSyncedAt: now });
    return res.json({
      success: true,
      message: `Berhasil mengirim ${localTxs.length} transaksi lokal ke Google Sheets.`,
      pushedCount: localTxs.length,
      lastSyncedAt: now,
      detail: pushRes,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal mengirim data ke Google Sheets: " + (err.message || String(err)),
    });
  }
});

// Endpoint to provide Google Apps Script complete code
app.get("/api/gas-code", (req, res) => {
  const codeGs = `/**
 * Google Apps Script - Backend Code.gs untuk Sistem Cetak Resi Tagihan & Google Sheets
 * Agen Batara - Bekasi
 * Mendukung Sinkronisasi 2 Arah Penuh (Two-Way Sync Web App <-> Google Sheets)
 */

// 1. Tangani Request GET (Browser View atau API Read)
function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    var format = e && e.parameter ? e.parameter.format : null;

    // Tes Koneksi (Ping)
    if (action === "ping") {
      return jsonResponse({
        success: true,
        status: "online",
        message: "Google Apps Script Web App Terhubung Aktif!",
        timestamp: new Date().toISOString()
      });
    }

    // Ambil Data Transaksi untuk Sinkronisasi ke Web App
    if (action === "getTransactions" || action === "pull" || format === "json") {
      var data = getLastTransactions();
      return jsonResponse({
        success: true,
        count: data.length,
        data: data
      });
    }

    // Tampilkan Web App Frontend jika dibuka langsung di Browser
    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('Cetak Resi Tagihan - Agen Batara')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 2. Tangani Request POST (API Sinkronisasi 2 Arah & Simpan Data)
function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = { text: e.postData.contents };
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    var action = payload.action || (e && e.parameter ? e.parameter.action : null);

    // Tes Koneksi (Ping via POST)
    if (action === "ping") {
      return jsonResponse({
        success: true,
        status: "online",
        message: "Koneksi POST Google Apps Script Aktif!"
      });
    }

    // SINKRONISASI 2 ARAH (Two-Way Sync):
    // Menggabungkan data dari Web App ke Sheet dan mengembalikan seluruh riwayat terkini
    if (action === "twoWaySync" || action === "syncTransactions") {
      var incomingTxs = payload.transactions || payload.data || [];
      var result = syncTwoWayTransactions(incomingTxs);
      return jsonResponse(result);
    }

    // Ambil Transaksi
    if (action === "getTransactions" || action === "pull") {
      var allData = getLastTransactions();
      return jsonResponse({ success: true, count: allData.length, data: allData });
    }

    // Simpan Transaksi Tunggal
    if (action === "saveTransaction") {
      var txData = payload.data || payload;
      var saveRes = saveTransaction(txData);
      return jsonResponse(saveRes);
    }

    // Hapus Transaksi
    if (action === "deleteTransaction") {
      var txId = payload.id || (e && e.parameter ? e.parameter.id : null);
      var delRes = deleteTransactionRow(txId);
      return jsonResponse(delRes);
    }

    // Fallback: jika payload langsung berupa objek transaksi
    if (payload.idpel || payload.namaPelanggan) {
      var directRes = saveTransaction(payload);
      return jsonResponse(directRes);
    }

    return jsonResponse({ success: false, error: "Aksi tidak dikenali: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// Helper JSON Response
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Inisialisasi Sheet "RiwayatTransaksi" dengan Header Rapi
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RiwayatTransaksi");
  if (!sheet) {
    sheet = ss.insertSheet("RiwayatTransaksi");
    var headers = [
      "ID Transaksi", "Tanggal", "ID Pelanggan", "Nama Pelanggan", 
      "Pemakaian", "Stand Meter", "Rincian Tagihan", "Bulan Tagihan", 
      "Rp Tagihan", "Lain-Lain", "Admin Bank", "Total Bayar", 
      "Nama Agen", "Alamat", "No HP", "Created At"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#1e40af")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Simpan 1 Transaksi ke Sheet
function saveTransaction(data) {
  var sheet = getOrCreateSheet();
  var txId = data.id || ("TX-" + new Date().getTime());
  
  // Cek jika ID sudah ada untuk mencegah duplikasi
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === txId) {
        return { success: true, txId: txId, note: "Transaksi sudah ada (skip duplikasi)" };
      }
    }
  }

  var rowData = [
    txId,
    data.tanggal || new Date().toLocaleDateString("id-ID"),
    data.idpel || "",
    data.namaPelanggan || "",
    data.pemakaian || "",
    data.standMeter || "",
    data.rincianTagihan || "",
    data.bulanTagihan || "",
    Number(data.rpTagihan) || 0,
    Number(data.lainLain) || 0,
    Number(data.adminBank) || 0,
    Number(data.totalBayar) || 0,
    data.namaAgen || "Agen Batara",
    data.alamat || "Bekasi",
    data.noHp || "-",
    data.createdAt || new Date().toISOString()
  ];

  sheet.appendRow(rowData);
  return { success: true, txId: txId };
}

// Fungsi Inti Sinkronisasi 2 Arah (Two-Way Sync)
function syncTwoWayTransactions(incomingList) {
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  
  // 1. Kumpulkan ID & Signature yang sudah ada di Sheet
  var existingIds = {};
  var existingSignatures = {};
  
  if (lastRow > 1) {
    var rangeValues = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    for (var r = 0; r < rangeValues.length; r++) {
      var row = rangeValues[r];
      var rId = String(row[0] || "").trim();
      var rTgl = String(row[1] || "").trim();
      var rIdpel = String(row[2] || "").trim();
      var rBulan = String(row[7] || "").trim();
      var rTotal = Number(row[11]) || 0;
      
      if (rId) existingIds[rId] = true;
      var sig = (rIdpel + "|" + rBulan + "|" + rTotal + "|" + rTgl).toLowerCase();
      existingSignatures[sig] = true;
    }
  }

  // 2. Masukkan data baru dari web app yang belum ada di Sheet
  var insertedCount = 0;
  if (Array.isArray(incomingList) && incomingList.length > 0) {
    var rowsToAdd = [];
    for (var i = 0; i < incomingList.length; i++) {
      var item = incomingList[i];
      var txId = item.id || ("TX-" + new Date().getTime() + "-" + i);
      var sig = (String(item.idpel||"") + "|" + String(item.bulanTagihan||"") + "|" + Number(item.totalBayar||0) + "|" + String(item.tanggal||"")).toLowerCase();
      
      if (existingIds[txId] || existingSignatures[sig]) {
        continue; // Sudah ada di sheet, lewati
      }

      existingIds[txId] = true;
      existingSignatures[sig] = true;

      rowsToAdd.push([
        txId,
        item.tanggal || new Date().toLocaleDateString("id-ID"),
        item.idpel || "",
        item.namaPelanggan || "",
        item.pemakaian || "",
        item.standMeter || "",
        item.rincianTagihan || "",
        item.bulanTagihan || "",
        Number(item.rpTagihan) || 0,
        Number(item.lainLain) || 0,
        Number(item.adminBank) || 0,
        Number(item.totalBayar) || 0,
        item.namaAgen || "Agen Batara",
        item.alamat || "Bekasi",
        item.noHp || "-",
        item.createdAt || new Date().toISOString()
      ]);
      insertedCount++;
    }

    if (rowsToAdd.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 16).setValues(rowsToAdd);
    }
  }

  // 3. Ambil data gabungan terkini dari Sheet untuk dikembalikan ke web app
  var allCurrent = getLastTransactions();

  return {
    success: true,
    pushedToSheet: insertedCount,
    totalInSheet: allCurrent.length,
    data: allCurrent,
    timestamp: new Date().toISOString()
  };
}

// Ambil Transaksi Terakhir dari Sheet (hingga 100 terakhir)
function getLastTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RiwayatTransaksi");
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var startRow = Math.max(2, lastRow - 99);
  var numRows = lastRow - startRow + 1;
  var numCols = Math.min(sheet.getLastColumn(), 16);
  var values = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  
  var headers = [
    "id", "tanggal", "idpel", "namaPelanggan", "pemakaian", 
    "standMeter", "rincianTagihan", "bulanTagihan", "rpTagihan", 
    "lainLain", "adminBank", "totalBayar", "namaAgen", "alamat", "noHp", "createdAt"
  ];
  
  var result = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j] !== undefined ? values[i][j] : "";
    }
    result.push(obj);
  }
  
  return result;
}

// Hapus Baris Transaksi Berdasarkan ID
function deleteTransactionRow(id) {
  if (!id) return { success: false, error: "ID tidak valid" };
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: "Sheet kosong" };

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: "Transaksi dengan ID tersebut tidak ditemukan di sheet" };
}
`;

  const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <title>Cetak Resi Tagihan - Agen Batara</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 p-4 font-sans">
  <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-6">
    <div class="flex items-center justify-between border-b pb-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-blue-600">Cetak Resi Tagihan - Agen Batara</h1>
        <p class="text-xs text-slate-500 mt-1">Web App Google Apps Script terintegrasi Google Sheets & Sinkronisasi 2 Arah.</p>
      </div>
      <span class="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
        ● Google Sheets Aktif
      </span>
    </div>
    
    <!-- Form & Paste Area -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm font-semibold mb-1">Paste Teks Mentah Struk / Tagihan</label>
        <textarea id="rawText" rows="6" class="w-full border border-slate-300 rounded-lg p-3 text-xs focus:ring-2 focus:ring-blue-500 font-mono" placeholder="Paste data tagihan PLN, PDAM, Indihome, BPJS di sini..."></textarea>
        <button onclick="parseText()" class="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all">Parse Otomatis</button>
      </div>
      <div>
        <h2 class="text-sm font-semibold mb-2">Pengaturan Agen</h2>
        <div class="space-y-3 text-xs">
          <div>
            <label class="block text-slate-500 mb-1">Nama Agen</label>
            <input type="text" id="namaAgen" value="Agen Batara" class="w-full border border-slate-300 rounded p-2">
          </div>
          <div>
            <label class="block text-slate-500 mb-1">Alamat</label>
            <input type="text" id="alamat" value="Bekasi" class="w-full border border-slate-300 rounded p-2">
          </div>
          <div>
            <label class="block text-slate-500 mb-1">No. HP / WA</label>
            <input type="text" id="noHp" value="081234567890" class="w-full border border-slate-300 rounded p-2">
          </div>
        </div>
      </div>
    </div>

    <!-- Data Detail Resi -->
    <div class="mt-6 border-t pt-5">
      <h3 class="font-bold text-base mb-3 text-slate-800">Rincian Data Resi</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div><label class="block text-slate-500 mb-0.5">Tanggal</label><input type="text" id="tanggal" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">ID Pelanggan</label><input type="text" id="idpel" class="w-full border rounded p-2 font-mono"></div>
        <div><label class="block text-slate-500 mb-0.5">Nama Pelanggan</label><input type="text" id="namaPelanggan" class="w-full border rounded p-2 font-semibold"></div>
        <div><label class="block text-slate-500 mb-0.5">Pemakaian</label><input type="text" id="pemakaian" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Stand Meter</label><input type="text" id="standMeter" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Bulan Tagihan</label><input type="text" id="bulanTagihan" class="w-full border rounded p-2"></div>
        <div class="sm:col-span-3"><label class="block text-slate-500 mb-0.5">Rincian Tagihan</label><input type="text" id="rincianTagihan" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Rp Tagihan (Rp)</label><input type="number" id="rpTagihan" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Lain-Lain (Rp)</label><input type="number" id="lainLain" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Admin Bank (Rp)</label><input type="number" id="adminBank" oninput="calcTotal()" class="w-full border rounded p-2"></div>
      </div>
      <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
        <span class="font-bold text-blue-900 text-sm">Total Bayar:</span>
        <span id="totalBayarDisp" class="text-lg font-extrabold text-blue-700">Rp 0</span>
      </div>
      <div class="mt-5 flex gap-3">
        <button onclick="saveAndPrint()" class="bg-emerald-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm">Simpan ke Sheets & Cetak</button>
        <button onclick="window.print()" class="bg-slate-700 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-sm">Cetak Langsung (A6)</button>
      </div>
    </div>

    <!-- Riwayat Terakhir dari Google Sheets -->
    <div class="mt-8 border-t pt-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-base text-slate-800">Riwayat Tersimpan di Google Sheet</h3>
        <button onclick="loadHistory()" class="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium">⟳ Segarkan</button>
      </div>
      <div id="historyList" class="space-y-2 max-h-60 overflow-y-auto text-xs">
        <p class="text-slate-400">Memuat data dari Google Sheets...</p>
      </div>
    </div>
  </div>

  <script>
    function parseText() {
      const text = document.getElementById('rawText').value;
      if (!text) { alert('Masukkan teks terlebih dahulu!'); return; }
      const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
      document.getElementById('tanggal').value = new Date().toLocaleDateString('id-ID');
      document.getElementById('namaPelanggan').value = lines[0] ? lines[0].toUpperCase() : 'PELANGGAN';
      document.getElementById('idpel').value = '1234567890';
      document.getElementById('rpTagihan').value = '100000';
      document.getElementById('adminBank').value = '2500';
      document.getElementById('lainLain').value = '0';
      document.getElementById('rincianTagihan').value = 'Tagihan Pembayaran';
      document.getElementById('bulanTagihan').value = 'SEP26';
      calcTotal();
    }

    function calcTotal() {
      const rp = Number(document.getElementById('rpTagihan').value) || 0;
      const lain = Number(document.getElementById('lainLain').value) || 0;
      const admin = Number(document.getElementById('adminBank').value) || 0;
      const total = rp + lain + admin;
      document.getElementById('totalBayarDisp').innerText = 'Rp ' + total.toLocaleString('id-ID');
    }

    function saveAndPrint() {
      const data = {
        tanggal: document.getElementById('tanggal').value,
        idpel: document.getElementById('idpel').value,
        namaPelanggan: document.getElementById('namaPelanggan').value,
        pemakaian: document.getElementById('pemakaian').value,
        standMeter: document.getElementById('standMeter').value,
        rincianTagihan: document.getElementById('rincianTagihan').value,
        bulanTagihan: document.getElementById('bulanTagihan').value,
        rpTagihan: Number(document.getElementById('rpTagihan').value) || 0,
        lainLain: Number(document.getElementById('lainLain').value) || 0,
        adminBank: Number(document.getElementById('adminBank').value) || 0,
        totalBayar: (Number(document.getElementById('rpTagihan').value)||0) + (Number(document.getElementById('lainLain').value)||0) + (Number(document.getElementById('adminBank').value)||0),
        namaAgen: document.getElementById('namaAgen').value,
        alamat: document.getElementById('alamat').value,
        noHp: document.getElementById('noHp').value
      };
      google.script.run.withSuccessHandler(function(res) {
        alert('Resi berhasil disimpan ke Google Sheets!');
        loadHistory();
        window.print();
      }).saveTransaction(data);
    }

    function loadHistory() {
      google.script.run.withSuccessHandler(function(txs) {
        const list = document.getElementById('historyList');
        if (!txs || txs.length === 0) {
          list.innerHTML = '<p class="text-slate-400">Belum ada riwayat transaksi di Google Sheets.</p>';
          return;
        }
        let html = '<table class="w-full text-left border-collapse"><thead><tr class="bg-slate-100 text-xs text-slate-700"> <th class="p-2">ID</th> <th class="p-2">Tanggal</th> <th class="p-2">IDPEL</th> <th class="p-2">Pelanggan</th> <th class="p-2">Total</th> </tr></thead><tbody>';
        txs.slice(0, 50).forEach(t => {
          html += '<tr class="border-b hover:bg-slate-50"><td class="p-2 font-mono text-[11px]">' + (t.id || '-') + '</td><td class="p-2">' + (t.tanggal || '-') + '</td><td class="p-2 font-mono">' + (t.idpel || '-') + '</td><td class="p-2 font-medium">' + (t.namaPelanggan || '-') + '</td><td class="p-2 font-semibold text-blue-700">Rp ' + Number(t.totalBayar || 0).toLocaleString('id-ID') + '</td></tr>';
        });
        html += '</tbody></table>';
        list.innerHTML = html;
      }).getLastTransactions();
    }

    window.onload = function() {
      calcTotal();
      loadHistory();
    };
  </script>
</body>
</html>
`;

  res.json({
    codeGs,
    indexHtml,
    instructions: [
      "1. Buka Google Sheets baru di Google Drive Anda (misalnya beri nama 'Database Resi Agen Batara').",
      "2. Di menu atas, klik **Extensions > Apps Script** (Ekstensi > Apps Script).",
      "3. Hapus seluruh isi default di file `Code.gs`, lalu salin (paste) kode `Code.gs` di atas.",
      "4. Klik ikon tanda tambah (+) di sebelah 'Files', pilih **HTML**, beri nama file **`Index`** (cukup tulis Index, jangan tambahkan .html), lalu paste kode `Index.html` di atas.",
      "5. Klik tombol biru **Deploy > New deployment** (Terapkan > Penerapan baru).",
      "6. Klik ikon roda gigi (Select type), pilih **Web app** (Aplikasi web).",
      "7. Isi Description: *Sinkronisasi Resi 2 Arah*.",
      "8. Atur **Execute as**: *Me (email akun Google Anda)*.",
      "9. Atur **Who has access**: *Anyone* (Siapa saja — ini penting agar aplikasi web dapat mengirim & mengambil data resi).",
      "10. Klik **Deploy**, klik **Authorize access** (Berikan izin akses ke akun Anda, klik Lanjutan / Advanced > Buka [Nama Project]), lalu salin **Web App URL** yang berakhiran `/exec`.",
      "11. Masukkan Web App URL tersebut ke form konfigurasi di atas, lalu klik **Simpan & Uji Koneksi**!"
    ]
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
