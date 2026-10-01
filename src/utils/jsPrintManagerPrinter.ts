import JSPM from 'jsprintmanager';
import { ReceiptData } from '../types';
import { generatePlainTextReceipt } from './dotMatrixPrinter';

export interface JspmEndpoint {
  host: string;
  port: number;
  secure: boolean;
}

export interface JspmConnectionStatus {
  connected: boolean;
  endpoint?: JspmEndpoint;
  printers: string[];
  selectedPrinter?: string;
  message?: string;
}

const STORAGE_KEY_ENDPOINT = 'jspm_ai_auto_endpoint';
const STORAGE_KEY_PRINTER = 'jspm_ai_selected_printer';

// Candidate ports across various JSPrintManager releases (v2, v3, v4, v5, v6, v7, v8, v9)
const CANDIDATE_PORTS = [22443, 29443, 20001, 24443, 23443, 25443, 26443];
const CANDIDATE_HOSTS = ['localhost', '127.0.0.1', 'localhost.neodynamic.com'];

/**
 * Mendapatkan endpoint terakhir yang sukses disimpan
 */
export function getStoredEndpoint(): JspmEndpoint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENDPOINT);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function saveStoredEndpoint(endpoint: JspmEndpoint): void {
  try {
    localStorage.setItem(STORAGE_KEY_ENDPOINT, JSON.stringify(endpoint));
  } catch {}
}

export function getStoredSelectedPrinter(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_PRINTER);
  } catch {}
  return null;
}

export function saveStoredSelectedPrinter(printer: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PRINTER, printer);
  } catch {}
}

/**
 * Uji cepat WebSocket endpoint secara non-blocking
 */
async function testWebSocketCandidate(candidate: JspmEndpoint, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const proto = candidate.secure ? 'wss://' : 'ws://';
    const url = `${proto}${candidate.host}:${candidate.port}`;
    let ws: WebSocket | null = null;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws?.close(); } catch {}
        resolve(false);
      }
    }, timeoutMs);

    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { ws?.close(); } catch {}
          resolve(true);
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { ws?.close(); } catch {}
          resolve(false);
        }
      };
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }
  });
}

/**
 * Mencoba menghubungkan JSPM dengan parameter spesifik
 */
async function tryConnectWithEndpoint(
  endpoint: JspmEndpoint,
  timeoutMs = 2500
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open) {
        resolve(true);
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      JSPM.JSPrintManager.auto_reconnect = true;
      
      // Hook events
      (JSPM.JSPrintManager.WS as any).onOpen = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      };

      (JSPM.JSPrintManager.WS as any).onError = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      };

      (JSPM.JSPrintManager.WS as any).onClose = () => {
        // Biarkan timeout atau error menangani
      };

      // Mulai koneksi JSPM dengan endpoint spesifik
      JSPM.JSPrintManager.start(endpoint.secure, endpoint.host, endpoint.port).catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * AI Auto-Discovery: Otomatis mendeteksi port dan host aktif JSPrintManager
 * tanpa perlu seting manual oleh user.
 */
export async function aiAutoDiscoverJSPM(
  onProgress?: (msg: string) => void
): Promise<JspmEndpoint> {
  if (JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open) {
    const cached = getStoredEndpoint() || { host: 'localhost', port: 22443, secure: true };
    return cached;
  }

  const isHttps = typeof window !== 'undefined' && window.location.protocol.includes('https');

  // 1. Coba endpoint tersimpan terlebih dahulu jika ada
  const cached = getStoredEndpoint();
  if (cached) {
    onProgress?.(`Memeriksa koneksi sebelumnya (${cached.host}:${cached.port})...`);
    const isAlive = await testWebSocketCandidate(cached, 700);
    if (isAlive) {
      const ok = await tryConnectWithEndpoint(cached, 1500);
      if (ok) {
        onProgress?.(`Terhubung ke JSPrintManager di ${cached.host}:${cached.port}`);
        return cached;
      }
    }
  }

  // 2. Susun daftar kandidat prioritas
  onProgress?.('AI Scanner: Memindai port JSPrintManager secara otomatis...');

  const candidates: JspmEndpoint[] = [];

  // Prioritas 1: localhost dengan port standar
  for (const port of CANDIDATE_PORTS) {
    candidates.push({ host: 'localhost', port, secure: isHttps });
  }

  // Prioritas 2: 127.0.0.1
  for (const port of [22443, 29443, 20001, 24443]) {
    candidates.push({ host: '127.0.0.1', port, secure: isHttps });
  }

  // Prioritas 3: localhost.neodynamic.com (domain resmi dengan sertifikat SSL valid)
  for (const port of [22443, 29443, 20001]) {
    candidates.push({ host: 'localhost.neodynamic.com', port, secure: isHttps });
  }

  // Jika di lingkungan non-https (HTTP biasa), coba juga non-secure
  if (!isHttps) {
    candidates.push({ host: 'localhost', port: 20000, secure: false });
    candidates.push({ host: '127.0.0.1', port: 20000, secure: false });
  }

  // 3. Scan cepat via WebSocket Pre-flight dalam batch 3 kandidat
  const batchSize = 3;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    onProgress?.(`AI Scanner: Menguji port ${batch.map((b) => b.port).join(', ')}...`);

    const results = await Promise.all(batch.map((c) => testWebSocketCandidate(c, 700)));
    const foundIdx = results.findIndex((alive) => alive === true);

    if (foundIdx !== -1) {
      const matched = batch[foundIdx];
      onProgress?.(`AI mendeteksi respon aktif di port ${matched.port}! Menghubungkan...`);
      const ok = await tryConnectWithEndpoint(matched, 2000);
      if (ok) {
        saveStoredEndpoint(matched);
        onProgress?.(`Sukses terhubung otomatis ke JSPrintManager (${matched.host}:${matched.port})`);
        return matched;
      }
    }
  }

  // 4. Fallback terakhir: Coba default JSPM start() bawaan
  onProgress?.('AI Scanner: Mencoba koneksi default JSPrintManager...');
  const fallbackEndpoint: JspmEndpoint = { host: 'localhost', port: 22443, secure: isHttps };
  const defaultOk = await tryConnectWithEndpoint(fallbackEndpoint, 2000);
  if (defaultOk) {
    saveStoredEndpoint(fallbackEndpoint);
    return fallbackEndpoint;
  }

  throw new Error(
    'Aplikasi JSPrintManager belum aktif di komputer Anda. Silakan buka aplikasi JSPrintManager di Windows, lalu klik Deteksi Otomatis kembali.'
  );
}

/**
 * AI Smart Scorer: Memilih printer Epson LX-310 atau dot matrix terbaik secara cerdas
 */
export function aiSelectBestPrinter(printers: string[]): string {
  if (!printers || printers.length === 0) return 'Default Printer';

  // Cek apakah ada printer yang sebelumnya disimpan oleh pengguna
  const saved = getStoredSelectedPrinter();
  if (saved && printers.includes(saved)) {
    return saved;
  }

  // Hitung skor kecerdasan setiap printer
  let bestPrinter = printers[0];
  let maxScore = -1;

  for (const name of printers) {
    const upper = name.toUpperCase();
    let score = 0;

    // Prioritas Tertinggi: Epson LX-310
    if (upper.includes('LX-310') || upper.includes('LX310')) score += 100;
    else if (upper.includes('LX-300') || upper.includes('LX300')) score += 85;
    else if (upper.includes('LQ-310') || upper.includes('LQ310')) score += 80;
    else if (upper.includes('FX-890') || upper.includes('LQ')) score += 75;
    else if (upper.includes('EPSON') && upper.includes('LX')) score += 90;
    else if (upper.includes('EPSON')) score += 60;
    else if (upper.includes('DOT MATRIX') || upper.includes('MATRIX')) score += 55;
    else if (upper.includes('GENERIC') || upper.includes('TEXT ONLY')) score += 40;
    else if (upper.includes('POS') || upper.includes('RECEIPT') || upper.includes('STRUK')) score += 35;
    else if (upper.includes('PDF') || upper.includes('XPS') || upper.includes('ONENOTE')) score -= 50;

    if (score > maxScore) {
      maxScore = score;
      bestPrinter = name;
    }
  }

  saveStoredSelectedPrinter(bestPrinter);
  return bestPrinter;
}

/**
 * Mengambil daftar printer dari JSPrintManager secara otomatis
 */
export async function getJSPMPrinters(
  onProgress?: (msg: string) => void
): Promise<string[]> {
  await aiAutoDiscoverJSPM(onProgress);

  return new Promise((resolve) => {
    JSPM.JSPrintManager.getPrinters()
      .then((printers: any) => {
        if (Array.isArray(printers)) {
          resolve(printers as string[]);
        } else {
          resolve([]);
        }
      })
      .catch(() => {
        resolve([]);
      });
  });
}

/**
 * Mencetak struk langsung ke Epson LX-310 menggunakan RAW ESC/P via JSPrintManager
 */
export async function printDirectJSPM(
  receipt: ReceiptData,
  selectedPrinterName?: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.('AI Scanner: Menghubungkan ke JSPrintManager Client...');
  await aiAutoDiscoverJSPM(onProgress);

  onProgress?.('Membaca daftar printer yang tersedia...');
  const printers = await getJSPMPrinters();

  let targetPrinter = selectedPrinterName;
  if (!targetPrinter) {
    targetPrinter = aiSelectBestPrinter(printers);
  }

  onProgress?.(`Mengirim data cetak RAW ke: ${targetPrinter}...`);

  const rawText = generatePlainTextReceipt(receipt, true);

  const cpj = new JSPM.ClientPrintJob();

  if (targetPrinter && targetPrinter !== 'Default Printer') {
    cpj.clientPrinter = new JSPM.InstalledPrinter(targetPrinter);
  } else {
    cpj.clientPrinter = new JSPM.DefaultPrinter();
    targetPrinter = 'Default Printer';
  }

  // ESC/P Commands:
  // Init (\x1B\x40)
  // Pitch 10cpi (\x1B\x50)
  // Line Spacing 1/6" (\x1B\x32)
  // Page Length 16 lines = ~6.95cm (\x1B\x43\x10)
  // Roman Draft (\x1B\x6B\x00\x1B\x78\x00)
  const escInit = '\x1B\x40\x1B\x50\x1B\x32\x1B\x43\x10\x1B\x6B\x00\x1B\x78\x00';
  const escFormFeed = '\x0C';
  const fullTextToPrint = escInit + rawText + escFormFeed;

  const printFile = new JSPM.PrintFileTXT(
    fullTextToPrint,
    `struk_${receipt.id || 'transaksi'}.txt`
  );
  cpj.files.push(printFile);

  await cpj.sendToClient();

  // Simpan printer terpilih agar berikutnya langsung otomatis
  saveStoredSelectedPrinter(targetPrinter);

  return targetPrinter;
}
