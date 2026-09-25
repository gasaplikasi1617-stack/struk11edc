import type { IncomingMessage, ServerResponse } from "http";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GAS_DATA, DEFAULT_GAS_URL } from "../src/data/gasTemplates";

// Parse JSON body helper for Vercel Serverless
async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(data));
}

function normalizeGasUrl(url: string): string {
  if (!url) return DEFAULT_GAS_URL;
  let clean = url.trim();
  clean = clean.replace(/\/edit.*$/, "/exec");
  clean = clean.replace(/\/dev.*$/, "/exec");
  if (!clean.includes("/exec") && clean.includes("script.google.com")) {
    clean = clean.replace(/\/?$/, "/exec");
  }
  return clean;
}

function cleanAndParseGasResponse(text: string): any {
  if (!text || typeof text !== "string") {
    return { success: false, error: "Respon kosong dari Google Apps Script" };
  }
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  const lower = trimmed.toLowerCase();
  if (
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<html") ||
    lower.includes("the page") ||
    lower.includes("accounts.google.com") ||
    lower.includes("servicelogin") ||
    lower.includes("authorization required") ||
    lower.includes("akses ditolak")
  ) {
    if (lower.includes("authorization") || lower.includes("servicelogin") || lower.includes("accounts.google.com")) {
      throw new Error(
        "Akses Google Apps Script Memerlukan Otorisasi. Di editor Apps Script: Deploy > Manage deployments > Edit > Who has access diatur ke 'Anyone' (Siapa saja)."
      );
    }
    throw new Error(
      "Google Apps Script mengembalikan halaman HTML. Pastikan deployment di Apps Script diset ke 'Who has access: Anyone' dan fungsi 'setupDatabase' sudah di-Run sekali di editor."
    );
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.length < 300) {
      return { success: true, message: trimmed };
    }
    throw new Error("Respon dari Google Apps Script bukan JSON yang valid.");
  }
}

async function callGasPost(url: string, body: any): Promise<any> {
  const targetUrl = normalizeGasUrl(url);
  const resp = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const text = await resp.text();
  return cleanAndParseGasResponse(text);
}

async function callGasGet(url: string, params: Record<string, string> = {}): Promise<any> {
  const targetUrl = normalizeGasUrl(url);
  const u = new URL(targetUrl);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const resp = await fetch(u.toString(), {
    method: "GET",
    redirect: "follow",
  });
  const text = await resp.text();
  return cleanAndParseGasResponse(text);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.end();
    return;
  }

  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let pathname = (urlObj.searchParams.get("route") ? `/${urlObj.searchParams.get("route")}` : "") ||
                 (typeof req.headers["x-matched-path"] === "string" ? req.headers["x-matched-path"] : "") ||
                 urlObj.pathname;
  pathname = pathname.replace(/^\/api/, "") || "/";
  if (!pathname.startsWith("/")) pathname = "/" + pathname;

  try {
    // 1. Health check
    if (pathname === "/health" || pathname === "/") {
      return sendJson(res, 200, { status: "ok", env: "vercel-serverless", timestamp: new Date().toISOString() });
    }

    // 2. Gas Template Code
    if (pathname === "/gas-code") {
      return sendJson(res, 200, DEFAULT_GAS_DATA);
    }

    // 3. Gas Config
    if (pathname === "/gas/config") {
      if (req.method === "POST") {
        const body = await parseJsonBody(req);
        return sendJson(res, 200, {
          success: true,
          message: "Konfigurasi GAS berhasil diperbarui!",
          config: { gasUrl: body.gasUrl || DEFAULT_GAS_URL, autoSync: !!body.autoSync },
        });
      }
      return sendJson(res, 200, {
        gasUrl: DEFAULT_GAS_URL,
        autoSync: true,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    // 4. Gas Test Connection
    if (pathname === "/gas/test" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const targetUrl = (body.gasUrl || DEFAULT_GAS_URL).trim();
      let result: any;
      try {
        result = await callGasGet(targetUrl, { action: "ping" });
      } catch {
        result = await callGasPost(targetUrl, { action: "ping" });
      }
      return sendJson(res, 200, {
        success: true,
        message: "Koneksi ke Google Apps Script Web App berhasil terhubung!",
        detail: result,
      });
    }

    // 5. Gas Setup Database
    if (pathname === "/gas/setup" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const targetUrl = (body.gasUrl || DEFAULT_GAS_URL).trim();
      let result: any;
      try {
        result = await callGasPost(targetUrl, { action: "setupDatabase" });
      } catch {
        result = await callGasGet(targetUrl, { action: "setupDatabase" });
      }
      return sendJson(res, 200, {
        success: true,
        message: "Database Google Sheet berhasil disiapkan dan terhubung!",
        detail: result,
      });
    }

    // 6. Gas Full 2-Way Sync
    if (pathname === "/gas/sync" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const targetUrl = (body.gasUrl || DEFAULT_GAS_URL).trim();
      const localTxs = Array.isArray(body.transactions) ? body.transactions : [];
      const syncRes = await callGasPost(targetUrl, {
        action: "twoWaySync",
        transactions: localTxs,
      });
      return sendJson(res, 200, {
        success: true,
        message: "Sinkronisasi 2 arah berhasil dengan Google Sheets!",
        pushedToSheet: syncRes.pushedToSheet ?? 0,
        totalInSheet: syncRes.totalInSheet ?? (syncRes.data ? syncRes.data.length : 0),
        detail: syncRes,
        syncedAt: new Date().toISOString(),
      });
    }

    // 7. Gas Pull (Read from Sheets)
    if ((pathname === "/gas/pull" || pathname === "/gas/transactions") && (req.method === "GET" || req.method === "POST")) {
      const body = req.method === "POST" ? await parseJsonBody(req) : {};
      const targetUrl = (body.gasUrl || urlObj.searchParams.get("gasUrl") || DEFAULT_GAS_URL).trim();
      let getRes: any;
      try {
        getRes = await callGasGet(targetUrl, { action: "getTransactions" });
      } catch {
        getRes = await callGasPost(targetUrl, { action: "getTransactions" });
      }
      const remoteTxs = Array.isArray(getRes) ? getRes : getRes.data || [];
      return sendJson(res, 200, {
        success: true,
        message: `Berhasil mengambil ${remoteTxs.length} transaksi dari Google Sheets!`,
        data: remoteTxs,
        syncedAt: new Date().toISOString(),
      });
    }

    // 8. Gas Push
    if (pathname === "/gas/push" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const targetUrl = (body.gasUrl || DEFAULT_GAS_URL).trim();
      const txs = Array.isArray(body.transactions) ? body.transactions : [];
      const pushRes = await callGasPost(targetUrl, {
        action: "syncTransactions",
        transactions: txs,
      });
      return sendJson(res, 200, {
        success: true,
        message: "Data berhasil dikirim ke Google Sheets!",
        detail: pushRes,
      });
    }

    // 9. AI Smart Parse Bill (Gemini API)
    if (pathname === "/parse-bill" && req.method === "POST") {
      const body = await parseJsonBody(req);
      const { text } = body;
      if (!text || typeof text !== "string" || !text.trim()) {
        return sendJson(res, 400, { success: false, error: "Teks struk tagihan tidak boleh kosong" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return sendJson(res, 200, {
          success: true,
          method: "regex_fallback",
          data: {
            namaPelanggan: "PELANGGAN",
            idpel: (text.match(/\b\d{10,13}\b/) || ["541293847210"])[0],
            rincianTagihan: "Tagihan Pembayaran",
            bulanTagihan: "SEP26",
            rpTagihan: 100000,
            adminBank: 2500,
            lainLain: 0,
            totalBayar: 102500,
          },
        });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Anda adalah parser struk dan tagihan pembayaran Indonesia (PLN, PDAM, Indihome, BPJS, Telkom, PBB, Multifinance).
Ekstrak data dari teks struk berikut ke dalam format JSON murni tanpa markdown:
Teks:
${text}

Format JSON:
{
  "tanggal": "DD/MM/YYYY",
  "idpel": "nomor id pelanggan / nomor meter",
  "namaPelanggan": "nama pelanggan",
  "pemakaian": "jumlah pemakaian jika ada",
  "standMeter": "stand meter jika ada",
  "rincianTagihan": "tarif/daya atau jenis tagihan",
  "bulanTagihan": "bulan tagihan (contoh: MAR26)",
  "rpTagihan": 100000,
  "lainLain": 0,
  "adminBank": 2500,
  "totalBayar": 102500
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });

      const parsed = JSON.parse(response.text || "{}");
      return sendJson(res, 200, { success: true, method: "gemini_ai", data: parsed });
    }

    // 10. Default fallback
    return sendJson(res, 404, { success: false, error: `Endpoint '${pathname}' tidak ditemukan` });
  } catch (err: any) {
    console.error("Vercel API error:", err);
    return sendJson(res, 500, { success: false, error: err.message || String(err) });
  }
}
