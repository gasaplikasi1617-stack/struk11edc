import { ReceiptData } from '../types';
import { generatePlainTextReceipt } from './dotMatrixPrinter';

declare global {
  interface Window {
    JSPM?: any;
  }
}

/**
 * Dynamically loads JSPrintManager JS library from CDN
 */
export async function loadJSPMScript(): Promise<boolean> {
  if (window.JSPM) return true;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsprintmanager@5.0.2/scripts/JSPrintManager.js';
    script.async = true;
    script.onload = () => {
      resolve(!!window.JSPM);
    };
    script.onerror = () => {
      // Try fallback JSPrintManager CDN version if needed
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsprintmanager/4.0.2/JSPrintManager.js';
      fallbackScript.onload = () => resolve(!!window.JSPM);
      fallbackScript.onerror = () => resolve(false);
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  });
}

/**
 * Connects to local JSPrintManager Client Service running on user's machine
 */
export async function connectJSPM(): Promise<boolean> {
  const loaded = await loadJSPMScript();
  if (!loaded || !window.JSPM) {
    throw new Error('Gagal memuat library JSPrintManager.');
  }

  return new Promise((resolve, reject) => {
    const JSPM = window.JSPM;
    if (JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open) {
      resolve(true);
      return;
    }

    JSPM.JSPrintManager.auto_reconnect = true;
    JSPM.JSPrintManager.start();

    JSPM.JSPrintManager.WS.onOpen = () => {
      resolve(true);
    };

    JSPM.JSPrintManager.WS.onClose = () => {
      reject(new Error('JSPrintManager belum aktif di Komputer Anda. Pastikan aplikasi JSPrintManager Client sudah terbuka.'));
    };

    JSPM.JSPrintManager.WS.onError = (evt: any) => {
      reject(new Error(`Gagal menghubungkan ke JSPrintManager: ${evt?.message || 'WebSocket Error'}`));
    };

    // Timeout check 3 seconds
    setTimeout(() => {
      if (JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open) {
        resolve(true);
      } else {
        reject(new Error('Koneksi ke JSPrintManager WsStatus time out. Pastikan JSPrintManager Client aktif.'));
      }
    }, 3000);
  });
}

/**
 * Retrieves connected printers using JSPrintManager
 */
export async function getJSPMPrinters(): Promise<string[]> {
  await connectJSPM();
  const JSPM = window.JSPM;

  return new Promise((resolve) => {
    JSPM.JSPrintManager.getPrinters().then((printers: string[]) => {
      resolve(printers || []);
    }).catch(() => {
      resolve([]);
    });
  });
}

/**
 * Prints RAW ESC/P ASCII text directly to Epson LX-310 using JSPrintManager
 */
export async function printDirectJSPM(
  receipt: ReceiptData,
  selectedPrinterName?: string
): Promise<string> {
  await connectJSPM();
  const JSPM = window.JSPM;

  const printers: string[] = await getJSPMPrinters();
  let targetPrinter = selectedPrinterName;

  if (!targetPrinter) {
    targetPrinter = printers.find(
      (p) =>
        p.toUpperCase().includes('LX-310') ||
        p.toUpperCase().includes('LX310') ||
        p.toUpperCase().includes('EPSON') ||
        p.toUpperCase().includes('GENERIC')
    );

    if (!targetPrinter && printers.length > 0) {
      targetPrinter = printers[0];
    }
  }

  const rawText = generatePlainTextReceipt(receipt);

  const cpj = new JSPM.ClientPrintJob();

  if (targetPrinter) {
    cpj.clientPrinter = new JSPM.InstalledPrinter(targetPrinter);
  } else {
    cpj.clientPrinter = new JSPM.DefaultPrinter();
    targetPrinter = 'Default Printer';
  }

  // ESC/P Commands: Init (\x1B\x40), Pitch 10cpi (\x1B\x50), Line Spacing 1/6" (\x1B\x32), Page Length 16 lines=6.95cm (\x1B\x43\x10), Draft Roman (\x1B\x6B\x00\x1B\x78\x00)
  const escInit = '\x1B\x40\x1B\x50\x1B\x32\x1B\x43\x10\x1B\x6B\x00\x1B\x78\x00';
  const escFormFeed = '\x0C';
  const fullTextToPrint = escInit + rawText + escFormFeed;

  const printFile = new JSPM.PrintFileTXT(fullTextToPrint, `struk_${receipt.id || 'transaksi'}.txt`);
  cpj.files.push(printFile);

  await cpj.sendToClient();

  return targetPrinter || 'Epson LX-310';
}
