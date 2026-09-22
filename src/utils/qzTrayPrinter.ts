import { ReceiptData } from '../types';
import { generatePlainTextReceipt } from './dotMatrixPrinter';

// QZ Tray JavaScript Client Helper
declare global {
  interface Window {
    qz?: any;
  }
}

/**
 * Loads qz-tray.js library dynamically from CDN if not already loaded
 */
export async function loadQZTrayScript(): Promise<boolean> {
  if (window.qz) return true;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js';
    script.async = true;
    script.onload = () => {
      resolve(!!window.qz);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

/**
 * Connects to QZ Tray WebSocket running locally on user's machine
 */
export async function connectQZTray(): Promise<boolean> {
  const loaded = await loadQZTrayScript();
  if (!loaded || !window.qz) {
    throw new Error('Gagal memuat library QZ Tray.');
  }

  if (window.qz.websocket.isActive()) {
    return true;
  }

  try {
    await window.qz.websocket.connect();
    return true;
  } catch (err: any) {
    console.error('QZ Tray Connection Error:', err);
    throw new Error('QZ Tray belum berjalan di Komputer Anda. Pastikan ikon QZ Tray hijau aktif di dekat jam Windows.');
  }
}

/**
 * Gets the list of printers connected to the local PC via QZ Tray
 */
export async function getQZTrayPrinters(): Promise<string[]> {
  await connectQZTray();
  const printers = await window.qz.printers.find();
  return printers || [];
}

/**
 * Sends RAW ESC/P ASCII text directly to Epson LX-310 via QZ Tray
 * Jaminan 100% Tajam tanpa melalui dialog Chrome / tanpa konversi gambar!
 */
export async function printDirectQZTray(
  receipt: ReceiptData,
  selectedPrinterName?: string
): Promise<string> {
  await connectQZTray();

  const printers: string[] = await window.qz.printers.find();
  let targetPrinter = selectedPrinterName;

  if (!targetPrinter) {
    // Auto-detect printer containing 'LX' or '310' or 'EPSON' or 'Generic'
    targetPrinter = printers.find(
      (p) =>
        p.toUpperCase().includes('LX-310') ||
        p.toUpperCase().includes('LX310') ||
        p.toUpperCase().includes('EPSON') ||
        p.toUpperCase().includes('GENERIC')
    );

    if (!targetPrinter && printers.length > 0) {
      targetPrinter = printers[0]; // fallback to default printer
    }
  }

  if (!targetPrinter) {
    throw new Error('Printer Epson LX-310 tidak ditemukan di komputer. Pastikan kabel USB terhubung.');
  }

  const rawText = generatePlainTextReceipt(receipt);

  // ESC/P Commands specifically tuned for Continuous Form 21.6 cm x 6.95 cm (8.5" x 2.73")
  const data = [
    '\x1B\x40',     // ESC @ (Initialize printer)
    '\x1B\x50',     // ESC P (Select 10 CPI pitch -> 80 characters per line = 21.6 cm width)
    '\x1B\x32',     // ESC 2 (Select 1/6-inch line spacing)
    '\x1B\x43\x10', // ESC C 16 (Set Page Length to 16 lines = 2.67 inches = 6.95 cm tear-off line)
    '\x1B\x6B\x00', // ESC k 0 (Select Draft Roman font)
    '\x1B\x78\x00', // ESC x 0 (Select High-Speed Draft mode)
    rawText,
    '\x0C',         // Form Feed (Advances paper exactly to top of next 6.95 cm page)
  ];

  const config = window.qz.configs.create(targetPrinter, {
    encoding: 'CP437',
    altPrinting: true,
    size: { width: 8.5, height: 2.73 }, // 21.6cm x 6.95cm exact continuous form
    units: 'in',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  await window.qz.print(config, data);
  return targetPrinter;
}
