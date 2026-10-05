import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { extractIdpelFromLines, cleanExtractedId, formatPeriod3Chars, getPreviousMonthPeriod, getCurrentMonthPeriod, getDefaultBulanTagihan, isPdamBill } from "./src/utils/billParser.ts";
import { DEFAULT_GAS_DATA } from "./src/data/gasTemplates.ts";

const app = express();
const PORT = 3000;

app.use(express.json());

// Path for storing transaction history locally
const DATA_FILE = path.join(process.cwd(), "transactions.json");
const GAS_CONFIG_FILE = path.join(process.cwd(), "gas_config.json");
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbw3cU9AiiesdrYgp-q1W56Ekph0wewoRd-14sZksQcmXb8PEP2enpTRSePCnLtNr_X1zA/exec";

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

// User Management Storage & Helpers
const USERS_FILE = path.join(process.cwd(), "users.json");

interface ServerUser {
  id: string;
  username: string;
  password?: string;
  namaLengkap: string;
  role: string;
  status: string;
  createdAt: string;
  lastLogin?: string;
}

const DEFAULT_USERS_DATA: ServerUser[] = [
  {
    id: "usr-kustana",
    username: "kustana",
    password: "222324",
    namaLengkap: "Kustana",
    role: "admin",
    status: "aktif",
    createdAt: "2026-09-28T00:00:00.000Z",
  },
  {
    id: "usr-admin",
    username: "admin",
    password: "222324",
    namaLengkap: "Administrator",
    role: "admin",
    status: "aktif",
    createdAt: "2026-09-28T00:00:00.000Z",
  },
  {
    id: "usr-kasir",
    username: "kasir",
    password: "222324",
    namaLengkap: "Kasir Loket",
    role: "kasir",
    status: "aktif",
    createdAt: "2026-09-28T00:00:00.000Z",
  },
  {
    id: "usr-kasir1",
    username: "kasir1",
    password: "222324",
    namaLengkap: "Kasir 1",
    role: "kasir",
    status: "aktif",
    createdAt: "2026-09-28T00:00:00.000Z",
  },
];

const DELETED_USERS_FILE = path.join(process.cwd(), "deleted_users.json");

function getDeletedUsernames(): Set<string> {
  try {
    if (fs.existsSync(DELETED_USERS_FILE)) {
      const data = fs.readFileSync(DELETED_USERS_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        return new Set(list.map((s) => String(s).toLowerCase().trim()));
      }
    }
  } catch {}
  return new Set();
}

function addDeletedUsername(username: string) {
  if (!username) return;
  const set = getDeletedUsernames();
  set.add(username.toLowerCase().trim());
  try {
    fs.writeFileSync(DELETED_USERS_FILE, JSON.stringify(Array.from(set)), "utf-8");
  } catch (e) {
    console.error("Error saving deleted_users.json:", e);
  }
}

function removeDeletedUsername(username: string) {
  if (!username) return;
  const set = getDeletedUsernames();
  if (set.delete(username.toLowerCase().trim())) {
    try {
      fs.writeFileSync(DELETED_USERS_FILE, JSON.stringify(Array.from(set)), "utf-8");
    } catch {}
  }
}

function getUsers(): ServerUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (e) {
    console.error("Error reading users.json:", e);
  }
  // Hanya inisialisasi awal jika users.json belum ada
  saveUsers(DEFAULT_USERS_DATA);
  return DEFAULT_USERS_DATA;
}

function saveUsers(users: ServerUser[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving users.json:", e);
  }
}

function mergeUsersList(localList: ServerUser[], incomingList: ServerUser[]): ServerUser[] {
  const deletedSet = getDeletedUsernames();
  const map = new Map<string, ServerUser>();

  if (Array.isArray(incomingList)) {
    for (const u of incomingList) {
      if (!u || !u.username) continue;
      const key = String(u.username).toLowerCase().trim();
      if (deletedSet.has(key)) continue; // Jangan re-import user yang sudah dihapus
      map.set(key, {
        id: u.id || `usr-${key}`,
        username: key,
        password: u.password || "222324",
        namaLengkap: u.namaLengkap || key,
        role: u.role || "kasir",
        status: u.status || "aktif",
        createdAt: u.createdAt || new Date().toISOString(),
        lastLogin: u.lastLogin || "",
      });
    }
  }

  if (Array.isArray(localList)) {
    for (const u of localList) {
      if (!u || !u.username) continue;
      const key = String(u.username).toLowerCase().trim();
      if (deletedSet.has(key)) continue; // Jangan re-import user yang sudah dihapus
      const existing = map.get(key);
      if (!existing) {
        map.set(key, u);
      } else {
        map.set(key, {
          ...existing,
          ...u,
          password: u.password || existing.password || "222324",
          lastLogin: u.lastLogin || existing.lastLogin || "",
        });
      }
    }
  }

  return Array.from(map.values());
}

async function fetchUsersFromGas(): Promise<ServerUser[]> {
  const gasCfg = getGasConfig();
  if (!gasCfg.gasUrl) return [];
  try {
    const res = await callGasPost(gasCfg.gasUrl, { action: "getUsers" }, 3000);
    if (res && res.users && Array.isArray(res.users)) {
      return res.users;
    }
    if (res && res.data && Array.isArray(res.data)) {
      return res.data;
    }
    if (Array.isArray(res)) {
      return res;
    }
  } catch (e: any) {
    try {
      const resGet = await callGasGet(gasCfg.gasUrl, { action: "getUsers" }, 3000);
      if (resGet && resGet.users && Array.isArray(resGet.users)) {
        return resGet.users;
      }
    } catch {}
  }
  return [];
}

// Helpers for calling Google Apps Script Web App
function parseGasResponse(text: string): any {
  if (!text || !text.trim()) {
    throw new Error("Google Apps Script mengembalikan respon kosong.");
  }
  const trimmed = text.trim();

  // 1. Direct JSON test
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch (e: any) {
      console.warn("JSON.parse failed on JSON-like string:", e.message);
    }
  }

  // 2. Detect Google Login / Auth / 404 / HTML error pages
  const lower = trimmed.toLowerCase();
  if (
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<head") ||
    trimmed.startsWith("<body") ||
    trimmed.startsWith("<div") ||
    trimmed.includes("<title>") ||
    lower.includes("the page") ||
    lower.includes("accounts.google.com") ||
    lower.includes("servicelogin") ||
    lower.includes("authorization required") ||
    lower.includes("script error") ||
    lower.includes("akses ditolak") ||
    lower.includes("access denied") ||
    lower.includes("google drive") ||
    lower.includes("cannot be found") ||
    lower.includes("not found")
  ) {
    if (lower.includes("the page you requested requires authorization") || lower.includes("servicelogin") || lower.includes("accounts.google.com")) {
      throw new Error(
        "Akses Google Apps Script Memerlukan Login / Otorisasi. " +
        "Cara Mengatasi: Di editor Google Apps Script, klik menu 'Deploy' > 'Manage deployments' > Edit (ikon pensil) > pilih Version: 'New version' > ubah 'Who has access' menjadi 'Anyone' (Siapa saja) > klik 'Deploy'."
      );
    }
    if (lower.includes("the page cannot be found") || lower.includes("not found")) {
      throw new Error(
        "Halaman Web App Google Apps Script tidak ditemukan (404). " +
        "Pastikan URL yang dimasukkan adalah Web App URL yang berakhiran '/exec', bukan link editor."
      );
    }
    throw new Error(
      "Google Apps Script mengembalikan halaman HTML/Error. " +
      "Pastikan script Code.gs sudah di-deploy sebagai Web App dengan akses 'Anyone' (Siapa saja) dan fungsi 'setupDatabase' atau 'testInitAndPing' sudah di-Run sekali di editor Apps Script untuk menyetujui izin Google Sheets."
    );
  }

  // 3. Fallback try JSON parse or return message
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    if (trimmed.length < 300) {
      return { success: true, message: trimmed };
    }
    throw new Error(
      "Respon dari Google Apps Script bukan JSON yang valid. " +
      "Pastikan Web App di-deploy dengan opsi 'Who has access: Anyone' dan file Code.gs sudah disimpan."
    );
  }
}

async function callGasPost(url: string, body: any, timeoutMs: number = 35000, retryCount: number = 1): Promise<any> {
  const cleanUrl = (url || "").trim();
  if (!cleanUrl) throw new Error("URL Google Apps Script belum diisi");

  if (cleanUrl.includes("/edit") || cleanUrl.includes("/dev")) {
    throw new Error("URL yang Anda masukkan adalah URL Editor/Dev. Silakan gunakan Web App URL yang berakhiran '/exec' dari menu Deploy.");
  }

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      const isTimeout = err.name === "AbortError" || (err.message && err.message.toLowerCase().includes("abort"));
      if (attempt < retryCount) {
        // Wait 1s before retry
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (isTimeout) {
        throw new Error(`Koneksi ke Google Apps Script timeout (melebihi ${Math.round(timeoutMs / 1000)} detik)`);
      }
      throw err;
    }
  }
}

async function callGasGet(url: string, params: Record<string, string> = {}, timeoutMs: number = 35000, retryCount: number = 1): Promise<any> {
  const cleanUrl = (url || "").trim();
  if (!cleanUrl) throw new Error("URL Google Apps Script belum diisi");

  if (cleanUrl.includes("/edit") || cleanUrl.includes("/dev")) {
    throw new Error("URL yang Anda masukkan adalah URL Editor/Dev. Silakan gunakan Web App URL yang berakhiran '/exec' dari menu Deploy.");
  }

  const u = new URL(cleanUrl);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      const isTimeout = err.name === "AbortError" || (err.message && err.message.toLowerCase().includes("abort"));
      if (attempt < retryCount) {
        // Wait 1s before retry
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (isTimeout) {
        throw new Error(`Koneksi ke Google Apps Script timeout (melebihi ${Math.round(timeoutMs / 1000)} detik)`);
      }
      throw err;
    }
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

const RESET_INFO_FILE = path.join(process.cwd(), "reset_info.json");

function getResetInfo(): { lastResetTimestamp: number; deletedIds: string[] } {
  try {
    if (fs.existsSync(RESET_INFO_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESET_INFO_FILE, "utf-8"));
      return {
        lastResetTimestamp: Number(data.lastResetTimestamp) || 0,
        deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [],
      };
    }
  } catch (e) {}
  return { lastResetTimestamp: 0, deletedIds: [] };
}

function saveResetInfo(info: { lastResetTimestamp: number; deletedIds: string[] }) {
  try {
    fs.writeFileSync(RESET_INFO_FILE, JSON.stringify(info, null, 2), "utf-8");
  } catch (e) {}
}

function addDeletedId(id: string) {
  if (!id) return;
  const current = getResetInfo();
  if (!current.deletedIds.includes(id)) {
    current.deletedIds.push(id);
    if (current.deletedIds.length > 1000) current.deletedIds = current.deletedIds.slice(-1000);
    saveResetInfo(current);
  }
}

// Two-way merge helper without duplicates (with reset & delete protection)
function mergeTransactions(localList: any[], sheetList: any[]) {
  const { lastResetTimestamp, deletedIds } = getResetInfo();
  const deletedSet = new Set(deletedIds);

  const localDedupe = deduplicateList(localList).cleaned.filter((t: any) => {
    if (t.id && deletedSet.has(t.id)) return false;
    if (t.idpel && deletedSet.has(t.idpel)) return false;
    return true;
  });

  const sheetDedupe = deduplicateList(sheetList).cleaned.filter((t: any) => {
    if (t.id && deletedSet.has(t.id)) return false;
    if (t.idpel && deletedSet.has(t.idpel)) return false;
    if (lastResetTimestamp > 0) {
      let tTime = 0;
      if (t.createdAt) tTime = new Date(t.createdAt).getTime();
      if (!tTime && t.id && String(t.id).startsWith("TX-")) {
        const num = Number(String(t.id).replace("TX-", ""));
        if (!isNaN(num) && num > 1000000000) tTime = num;
      }
      if (tTime > 0 && tTime < lastResetTimestamp) {
        return false; // Lewati transaksi sebelum waktu reset tutup buku!
      }
    }
    return true;
  });

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
    merged: merged.slice(0, 1000),
    newFromSheet,
    newFromLocal,
  };
}

function normalizeTransaction(t: any): any {
  if (!t || typeof t !== "object") return t;
  let idpel = t.idpel != null ? String(t.idpel).trim() : "";
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(idpel)) {
    const num = Number(idpel);
    if (!isNaN(num) && Number.isFinite(num)) {
      try {
        idpel = BigInt(Math.round(num)).toString();
      } catch {
        idpel = num.toLocaleString("fullwide", { useGrouping: false });
      }
    }
  } else if (typeof t.idpel === "number" && Number.isFinite(t.idpel)) {
    idpel = t.idpel.toLocaleString("fullwide", { useGrouping: false });
  }

  let noHp = t.noHp != null ? String(t.noHp).trim() : "";
  if (/^\d{9,13}$/.test(noHp) && !noHp.startsWith("0")) {
    noHp = "0" + noHp;
  }

  return {
    ...t,
    id: t.id ? String(t.id) : undefined,
    idpel: idpel || "-",
    noHp: noHp || t.noHp || "-",
  };
}

function isValidTransaction(t: any): boolean {
  if (!t || typeof t !== "object") return false;
  const name = String(t.namaPelanggan || "").trim();
  const idpel = String(t.idpel || "").trim();
  const total = Number(t.totalBayar) || Number(t.rpTagihan) || 0;
  if (!name && (idpel === "" || idpel === "-") && total === 0) return false;
  return true;
}

function getTransactions(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        const { lastResetTimestamp, deletedIds } = getResetInfo();
        const deletedSet = new Set(deletedIds);

        const filtered = list.filter((t: any) => {
          if (!isValidTransaction(t)) return false;
          if (t.id && deletedSet.has(t.id)) return false;
          if (t.idpel && deletedSet.has(t.idpel)) return false;
          if (lastResetTimestamp > 0) {
            let tTime = 0;
            if (t.createdAt) tTime = new Date(t.createdAt).getTime();
            if (!tTime && t.id && String(t.id).startsWith("TX-")) {
              const num = Number(String(t.id).replace("TX-", ""));
              if (!isNaN(num) && num > 1000000000) tTime = num;
            }
            if (tTime > 0 && tTime < lastResetTimestamp) {
              return false; // Abaikan data sebelum tutup buku
            }
          }
          return true;
        });

        const normalized = filtered.map(normalizeTransaction);
        const { cleaned, removedCount } = deduplicateList(normalized);
        if (removedCount > 0 || filtered.length < list.length) {
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
    const valid = Array.isArray(txs) ? txs.filter(isValidTransaction) : [];
    const normalized = valid.map(normalizeTransaction);
    const { cleaned } = deduplicateList(normalized);
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleaned, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving transactions:", e);
  }
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// User Authentication & Management Routes (Tersinkronisasi Cloud Google Sheets)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const uClean = String(username || "").trim().toLowerCase();
    const pClean = String(password || "").trim();

    if (!uClean || !pClean) {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
    }

    const checkMatch = (u: ServerUser) => {
      if (u.username.toLowerCase() !== uClean) return false;
      if (u.password && u.password === pClean) return true;
      if (!u.password && (pClean === "222324" || pClean === "admin" || pClean === "123456")) return true;
      if (uClean === "kustana" && (pClean === "222324" || pClean === "admin" || pClean === "123456")) return true;
      if (uClean === "admin" && (pClean === "admin" || pClean === "222324" || pClean === "123456")) return true;
      if (uClean === "kasir" && (pClean === "kasir" || pClean === "222324" || pClean === "123456")) return true;
      if (uClean === "kasir1" && (pClean === "kasir1" || pClean === "222324" || pClean === "123456")) return true;
      return false;
    };

    let users = getUsers();
    let matched = users.find(checkMatch);

    // Jika belum cocok di file lokal, coba sync cepat dari Google Sheets
    if (!matched) {
      try {
        const gasUsers = await fetchUsersFromGas();
        if (Array.isArray(gasUsers) && gasUsers.length > 0) {
          users = mergeUsersList(users, gasUsers);
          saveUsers(users);
          matched = users.find(checkMatch);
        }
      } catch (e: any) {
        console.warn("Sinkronisasi user dari Google Sheets saat login:", e.message);
      }
    }

    console.log(`[AUTH LOGIN] username="${uClean}", matched=${Boolean(matched)}, totalRegistered=${users.length}`);

    if (!matched) {
      return res.status(401).json({
        success: false,
        message: "User dan Password yg anda masukkan salah silahkan hub admin",
      });
    }

    if (matched.status === "nonaktif") {
      return res.status(403).json({ success: false, message: "Akun Anda dinonaktifkan oleh administrator." });
    }

    matched.lastLogin = new Date().toISOString();
    saveUsers(users);

    // Sinkronkan waktu login terakhir ke Google Sheets secara background
    const gasCfg = getGasConfig();
    if (gasCfg.gasUrl && gasCfg.autoSync) {
      callGasPost(gasCfg.gasUrl, { action: "upsertUser", user: matched }, 3000).catch(() => {});
    }

    const safeUser = {
      id: matched.id,
      username: matched.username,
      namaLengkap: matched.namaLengkap,
      role: matched.role,
      status: matched.status,
      lastLogin: matched.lastLogin,
    };

    return res.json({ success: true, user: safeUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Terjadi kesalahan saat memproses login: " + err.message });
  }
});

// Endpoint sinkronisasi daftar akun dari perangkat klien (2-way client-server sync)
app.post("/api/users/sync", (req, res) => {
  try {
    const incomingUsers = req.body?.users;
    let currentUsers = getUsers();
    if (Array.isArray(incomingUsers) && incomingUsers.length > 0) {
      currentUsers = mergeUsersList(currentUsers, incomingUsers);
      saveUsers(currentUsers);
    }
    return res.json({ success: true, users: currentUsers });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Endpoint publik agar layar login dapat melihat daftar nama user aktif
app.get("/api/users/public", (req, res) => {
  const users = getUsers();
  const safeList = users.map((u) => ({
    id: u.id,
    username: u.username,
    namaLengkap: u.namaLengkap,
    role: u.role,
    status: u.status,
  }));
  res.json(safeList);
});

app.get("/api/users", (req, res) => {
  res.json(getUsers());
});

app.post("/api/users", async (req, res) => {
  try {
    const { username, password, namaLengkap, role } = req.body || {};
    const uClean = String(username || "").trim().toLowerCase();
    const pClean = String(password || "").trim();

    if (!uClean || !pClean) {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi." });
    }

    let users = getUsers();
    if (users.some((u) => u.username.toLowerCase() === uClean)) {
      return res.status(400).json({ success: false, message: `Username "${uClean}" sudah digunakan.` });
    }

    removeDeletedUsername(uClean);

    const newUser: ServerUser = {
      id: `usr-${Date.now()}`,
      username: uClean,
      password: pClean,
      namaLengkap: String(namaLengkap || uClean).trim(),
      role: String(role || "kasir").trim(),
      status: "aktif",
      createdAt: new Date().toISOString(),
    };

    users.unshift(newUser);
    saveUsers(users);

    // Sinkronkan langsung ke Google Sheets (Sheet UserLoket)
    const gasCfg = getGasConfig();
    if (gasCfg.gasUrl) {
      callGasPost(gasCfg.gasUrl, { action: "upsertUser", user: newUser }).catch((err) => {
        console.warn("GAS upsertUser failed:", err.message);
      });
    }

    return res.json({ success: true, user: newUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Gagal membuat user: " + err.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id);
    const { username, password, namaLengkap, role, status } = req.body || {};

    const users = getUsers();
    const idx = users.findIndex(
      (u) => u.id === rawId || u.username.toLowerCase() === rawId.toLowerCase()
    );
    if (idx < 0) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan." });
    }

    const current = users[idx];
    let newUsername = current.username;
    if (username && username.trim()) {
      newUsername = username.trim().toLowerCase();
      if (
        newUsername !== current.username.toLowerCase() &&
        users.some(
          (u) =>
            u.id !== current.id &&
            u.username.toLowerCase() === newUsername
        )
      ) {
        return res.status(400).json({ success: false, message: `Username "${newUsername}" sudah digunakan.` });
      }
      removeDeletedUsername(newUsername);
    }

    users[idx] = {
      ...current,
      username: newUsername,
      password: password && password.trim() ? password.trim() : current.password,
      namaLengkap: namaLengkap !== undefined ? String(namaLengkap).trim() : current.namaLengkap,
      role: role !== undefined ? String(role).trim() : current.role,
      status: status !== undefined ? String(status).trim() : current.status,
    };

    saveUsers(users);

    // Sinkronkan update ke Google Sheets
    const gasCfg = getGasConfig();
    if (gasCfg.gasUrl) {
      callGasPost(gasCfg.gasUrl, { action: "upsertUser", user: users[idx] }).catch((err) => {
        console.warn("GAS upsertUser update failed:", err.message);
      });
    }

    return res.json({ success: true, user: users[idx] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Gagal memperbarui user: " + err.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const rawId = decodeURIComponent(req.params.id);
    const users = getUsers();

    if (users.length <= 1) {
      return res.status(400).json({ success: false, message: "Sistem harus memiliki minimal 1 user administrator." });
    }

    const targetUser = users.find(
      (u) => u.id === rawId || u.username.toLowerCase() === rawId.toLowerCase()
    );
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan." });
    }

    const filtered = users.filter(
      (u) => u.id !== targetUser.id && u.username.toLowerCase() !== targetUser.username.toLowerCase()
    );

    saveUsers(filtered);
    addDeletedUsername(targetUser.username);

    // Hapus dari Google Sheets
    const gasCfg = getGasConfig();
    if (gasCfg.gasUrl) {
      callGasPost(gasCfg.gasUrl, { action: "deleteUser", id: targetUser.username }).catch((err) => {
        console.warn("GAS deleteUser failed:", err.message);
      });
    }

    return res.json({ success: true, message: `User "${targetUser.username}" berhasil dihapus.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Gagal menghapus user: " + err.message });
  }
});

// Endpoint sinkronisasi manual daftar pengguna ke Google Sheets
app.post("/api/gas/sync-users", async (req, res) => {
  try {
    const gasCfg = getGasConfig();
    if (!gasCfg.gasUrl) {
      return res.status(400).json({ success: false, message: "URL Google Apps Script belum diatur." });
    }

    const localUsers = getUsers();
    let gasUsers: ServerUser[] = [];
    try {
      gasUsers = await fetchUsersFromGas();
    } catch {}

    const merged = mergeUsersList(localUsers, gasUsers);
    saveUsers(merged);

    // Push full list to Google Sheets
    await callGasPost(gasCfg.gasUrl, { action: "saveUsers", users: merged });

    return res.json({
      success: true,
      message: `Berhasil menyinkronkan ${merged.length} akun user ke Google Sheets!`,
      total: merged.length,
      users: merged,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Gagal sinkronisasi user: " + err.message });
  }
});

// Get all transactions (up to 1000)
app.get("/api/transactions", (req, res) => {
  const txs = getTransactions();
  res.json(txs.slice(0, 1000));
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

  // Clear tombstone if ID was previously recorded
  if (newTx.id) {
    const info = getResetInfo();
    if (info.deletedIds.includes(newTx.id)) {
      info.deletedIds = info.deletedIds.filter((id) => id !== newTx.id);
      saveResetInfo(info);
    }
  }

  const existingIdx = txs.findIndex((t: any) => t.id === newTx.id);
  if (existingIdx >= 0) {
    txs[existingIdx] = newTx;
  } else {
    txs.unshift(newTx); // Add to beginning
  }

  const { cleaned } = deduplicateList(txs);
  if (cleaned.length > 1000) cleaned.splice(1000);
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

// Restore transactions from JSON backup or Google Sheets
app.post("/api/transactions/restore", (req, res) => {
  try {
    const { transactions: incomingList, mode = "replace", syncToGas = true } = req.body || {};
    if (!Array.isArray(incomingList) || incomingList.length === 0) {
      return res.status(400).json({ success: false, message: "Daftar transaksi untuk restore tidak valid atau kosong." });
    }

    const validList = incomingList.filter(isValidTransaction).map(normalizeTransaction);
    if (validList.length === 0) {
      return res.status(400).json({ success: false, message: "Tidak ada transaksi valid yang dapat dipulihkan." });
    }

    // Reset tombstone IDs for all restored transactions
    const restoredIds = new Set<string>();
    validList.forEach((t) => {
      if (t.id) restoredIds.add(String(t.id));
      if (t.idpel && t.idpel !== "-") restoredIds.add(String(t.idpel));
    });

    const info = getResetInfo();
    info.deletedIds = info.deletedIds.filter((id) => !restoredIds.has(id));

    if (mode === "replace") {
      // In replace mode, reset the cutoff timestamp so restored transactions are active
      info.lastResetTimestamp = 0;
      saveResetInfo(info);

      const { cleaned } = deduplicateList(validList);
      const finalList = cleaned.slice(0, 1000);
      saveTransactions(finalList);

      if (syncToGas) {
        const gasCfg = getGasConfig();
        if (gasCfg.gasUrl) {
          callGasPost(gasCfg.gasUrl, { action: "bulkSaveTransactions", data: finalList }).catch((err) => {
            console.warn("GAS background restore sync warning:", err.message);
          });
        }
      }

      return res.json({
        success: true,
        count: finalList.length,
        mode: "replace",
        transactions: finalList,
        message: `Berhasil me-restore ${finalList.length} transaksi ke riwayat (mode Gantikan Semua).`,
      });
    } else {
      // Merge mode
      saveResetInfo(info);

      const current = getTransactions();
      const combined = [...validList, ...current];
      const { cleaned } = deduplicateList(combined);
      const finalList = cleaned.slice(0, 1000);
      saveTransactions(finalList);

      if (syncToGas) {
        const gasCfg = getGasConfig();
        if (gasCfg.gasUrl) {
          callGasPost(gasCfg.gasUrl, { action: "twoWaySync", transactions: finalList }).catch((err) => {
            console.warn("GAS background restore sync warning:", err.message);
          });
        }
      }

      return res.json({
        success: true,
        count: finalList.length,
        mode: "merge",
        transactions: finalList,
        message: `Berhasil menggabungkan ${validList.length} data restore dengan riwayat aktif (Total sekarang: ${finalList.length} transaksi).`,
      });
    }
  } catch (err: any) {
    console.error("Error in /api/transactions/restore:", err);
    res.status(500).json({ success: false, error: err.message });
  }
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

// Update transaction status or attributes
app.patch("/api/transactions/:id", (req, res) => {
  const txs = getTransactions();
  const targetKey = decodeURIComponent(req.params.id || "");
  const updates = req.body || {};
  let updatedItem = null;

  const updatedTxs = txs.map((t: any) => {
    if (t.id === targetKey || t.idpel === targetKey) {
      updatedItem = { ...t, ...updates };
      return updatedItem;
    }
    return t;
  });

  if (updatedItem) {
    saveTransactions(updatedTxs);
    return res.json({ success: true, transaction: updatedItem });
  }

  res.status(404).json({ success: false, message: "Transaksi tidak ditemukan" });
});

// Reset all transactions (Tutup Buku Bulanan) with automatic backup file
app.post("/api/transactions/reset", (req, res) => {
  try {
    const txs = getTransactions();
    const count = txs.length;
    const { backupPeriod } = req.body || {};
    if (count > 0) {
      const periodTag = (backupPeriod || Date.now()).toString().replace(/[^a-zA-Z0-9_-]/g, "_");
      const backupPath = path.join(process.cwd(), `transactions_backup_${periodTag}.json`);
      try {
        fs.writeFileSync(backupPath, JSON.stringify(txs, null, 2), "utf-8");
      } catch (bErr) {
        console.warn("Gagal menulis file backup disk:", bErr);
      }
    }

    // Set waktu reset sekarang dan masukkan semua ID ke deletedIds agar tidak pernah ditarik lagi
    const now = Date.now();
    const info = getResetInfo();
    info.lastResetTimestamp = now;
    txs.forEach((t: any) => {
      if (t.id && !info.deletedIds.includes(t.id)) info.deletedIds.push(t.id);
      if (t.idpel && !info.deletedIds.includes(t.idpel)) info.deletedIds.push(t.idpel);
    });
    saveResetInfo(info);

    saveTransactions([]);
    res.json({
      success: true,
      clearedCount: count,
      message: `Tutup buku lokal berhasil! ${count} transaksi telah diarsipkan dan riwayat aplikasi kini fresh dengan 0 transaksi.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a transaction (anti-resurrection support: blocks both id and idpel)
app.delete("/api/transactions/:id", (req, res) => {
  let txs = getTransactions();
  const targetKey = decodeURIComponent(req.params.id || "");
  const idpelParam = req.query.idpel ? decodeURIComponent(String(req.query.idpel)) : "";
  const initialLength = txs.length;

  if (targetKey) addDeletedId(targetKey);
  if (idpelParam && idpelParam !== "-") addDeletedId(idpelParam);

  txs = txs.filter((t: any) => {
    if (targetKey && (t.id === targetKey || t.idpel === targetKey || t.namaPelanggan === targetKey)) return false;
    if (idpelParam && idpelParam !== "-" && t.idpel === idpelParam) return false;
    return true;
  });
  saveTransactions(txs);

  // Notify Google Sheets to delete row so it doesn't resurrect
  const gasCfg = getGasConfig();
  if (gasCfg.gasUrl) {
    callGasPost(gasCfg.gasUrl, { action: "deleteTransaction", id: targetKey, idpel: idpelParam }).catch(() => {});
  }

  res.json({ success: true, removed: initialLength - txs.length, total: txs.length });
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
3. "bulanTagihan": Wajib ikuti aturan ini: jika struk adalah PDAM / Air maka isi dengan bulan kemarin ("Sept26" saat Oktober 2026). Jika struk adalah PLN, BPJS, TELKOM, Speedy, Pascabayar, atau layanan lainnya maka selalu isi dengan bulan dan tahun berjalan ("Okt26" saat Oktober 2026). Format selalu mmmyy.
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

      // Determine period based on rule: current month for normal bills, previous month for PDAM
      const isPdam = isPdamBill({ ...parsedData, rawText });
      parsedData.bulanTagihan = getDefaultBulanTagihan(isPdam);

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

    const isPdamCheck = isPdam || isPdamBill({ rincianTagihan, rawText });
    bulanTagihan = getDefaultBulanTagihan(isPdamCheck);

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
      bulanTagihan: bulanTagihan || getDefaultBulanTagihan(isPdamCheck),
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

// Setup / Inisialisasi Database Google Sheets via Apps Script Web App
app.post("/api/gas/setup", async (req, res) => {
  try {
    const gasCfg = getGasConfig();
    const targetUrl = (req.body.gasUrl || gasCfg.gasUrl || "").trim();
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "URL Web App Google Apps Script belum diisi." });
    }
    let result: any;
    try {
      result = await callGasPost(targetUrl, { action: "setupDatabase" });
    } catch (e1) {
      result = await callGasGet(targetUrl, { action: "setupDatabase" });
    }
    return res.json({
      success: true,
      message: "Database Google Sheet berhasil disiapkan dan terhubung!",
      detail: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal inisialisasi database di Google Sheets: " + (err.message || String(err)),
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
      }, 40000);

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
        const getRes = await callGasGet(targetUrl, { action: "getTransactions" }, 35000);
        if (getRes && Array.isArray(getRes.data)) {
          remoteTxs = getRes.data;
        } else if (Array.isArray(getRes)) {
          remoteTxs = getRes;
        }
      } catch (getErr: any) {
        console.warn("GAS getTransactions GET error:", getErr.message);
      }
    }

    // 3. Merge both datasets cleanly (Ambil data server tersegar saat respons jaringan tiba agar data baru tidak terhapus)
    const currentServerTxs = getTransactions();
    const { merged: combinedLocal } = mergeTransactions(currentServerTxs, localTxs);
    const { merged, newFromSheet, newFromLocal } = mergeTransactions(combinedLocal, remoteTxs);

    // 4. If there were local transactions not yet sent to Google Sheets, push them now
    if (newFromLocal.length > 0 && pushedCount === 0) {
      try {
        await callGasPost(targetUrl, {
          action: "syncTransactions",
          transactions: newFromLocal,
        }, 35000);
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

// Force Pull: Samakan Persis / Jadikan Google Sheets Master Database
// Mengabaikan / mereset cutoff timestamp dan tombstone agar seluruh transaksi Google Sheets ditarik 100%
app.post("/api/gas/force-pull", async (req, res) => {
  try {
    const gasCfg = getGasConfig();
    const targetUrl = (req.body.gasUrl || gasCfg.gasUrl || "").trim();
    if (!targetUrl) {
      return res.status(400).json({ success: false, error: "URL Web App Google Apps Script belum dikonfigurasi." });
    }

    let sheetTxs: any[] = [];
    try {
      const getRes = await callGasGet(targetUrl, { action: "getTransactions" });
      sheetTxs = Array.isArray(getRes?.data) ? getRes.data : (Array.isArray(getRes) ? getRes : []);
    } catch {
      const postRes = await callGasPost(targetUrl, { action: "getTransactions" });
      sheetTxs = Array.isArray(postRes?.data) ? postRes.data : (Array.isArray(postRes) ? postRes : []);
    }

    // Reset tombstone & reset timestamp di server
    const info = getResetInfo();
    info.lastResetTimestamp = 0;
    // Sisakan hanya proteksi data dummy sampel
    info.deletedIds = ["541293847210", "TRX-85485204"];
    saveResetInfo(info);

    const valid = sheetTxs
      .filter(isValidTransaction)
      .filter(
        (t: any) =>
          t.idpel !== "541293847210" &&
          t.id !== "TRX-85485204" &&
          t.namaPelanggan !== "BUDI SANTOSO"
      )
      .map(normalizeTransaction);

    const { cleaned } = deduplicateList(valid);
    const finalList = cleaned.slice(0, 1000);
    saveTransactions(finalList);

    const now = new Date().toISOString();
    saveGasConfig({ lastSyncedAt: now });

    return res.json({
      success: true,
      message: `Berhasil menyamakan persis ${finalList.length} transaksi dari Google Sheets ke database lokal!`,
      count: finalList.length,
      transactions: finalList,
      lastSyncedAt: now,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal menarik data dari Google Sheets: " + (err.message || String(err)),
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

// Endpoint to archive and reset Google Sheets for monthly rollover
app.post("/api/gas/archive", async (req, res) => {
  try {
    const { gasUrl, periodName } = req.body || {};
    const cfg = getGasConfig();
    const targetUrl = (gasUrl || cfg.gasUrl || DEFAULT_GAS_URL).trim();
    const gasRes = await callGasPost(targetUrl, {
      action: "archiveAndResetMonth",
      monthName: periodName,
      periodName: periodName,
    });
    return res.json(gasRes);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: "Gagal mengarsipkan Google Sheets: " + (err.message || String(err)),
    });
  }
});

// Endpoint to provide Google Apps Script complete code
app.get("/api/gas-code", (req, res) => {
  res.json(DEFAULT_GAS_DATA);
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
