import { ReceiptData } from '../types';

/**
 * Normalizes strings for comparison: trims, removes double spaces, lowercases
 */
function cleanStr(str: any): string {
  if (!str) return '';
  return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalizes billing period (e.g. "AGUSTUS 2026", "Agustus-2026", "08/2026")
 */
function cleanPeriod(str: any): string {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[\s\-_/.,]/g, '');
}

/**
 * Normalizes date string (e.g. "19/09/2026" or "19-09-2026")
 */
function cleanDate(str: any): string {
  if (!str) return '';
  return String(str).trim().toLowerCase().replace(/[-.]/g, '/');
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
  matchedTransaction?: ReceiptData;
}

/**
 * Robust anti-duplicate check for bill payment transactions.
 * Returns { isDuplicate: true, reason, matchedTransaction } if a match is found.
 */
export function checkDuplicateTransaction(
  incoming: Partial<ReceiptData>,
  existingList: ReceiptData[]
): DuplicateCheckResult {
  if (!incoming || !Array.isArray(existingList) || existingList.length === 0) {
    return { isDuplicate: false };
  }

  const incId = incoming.id ? String(incoming.id).trim() : '';
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
        matchedTransaction: ex,
      };
    }

    const exIdpel = cleanStr(ex.idpel);
    const exBulan = cleanPeriod(ex.bulanTagihan);
    const exTotal = Number(ex.totalBayar || 0);
    const exTanggal = cleanDate(ex.tanggal);
    const exNama = cleanStr(ex.namaPelanggan);
    const exRincian = cleanStr(ex.rincianTagihan);

    // 2. Match by IDPEL (if IDPEL is provided and valid)
    const hasValidIdpel = incIdpel && incIdpel !== '-' && incIdpel.length >= 4;
    if (hasValidIdpel && incIdpel === exIdpel) {
      // 2a. Monthly Bill with same billing period (PLN, BPJS, PDAM, Indihome, etc.)
      const hasValidPeriod = incBulan && incBulan !== '-' && incBulan.length >= 3;
      if (hasValidPeriod && exBulan && incBulan === exBulan) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} dengan Periode Tagihan ${incoming.bulanTagihan || '-'} sudah pernah tersimpan di riwayat.`,
          matchedTransaction: ex,
        };
      }

      // 2b. Same IDPEL + Same Total Payment + Same Transaction Date
      if (incTotal > 0 && incTotal === exTotal && incTanggal && exTanggal && incTanggal === exTanggal) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} dengan Total Rp ${incTotal.toLocaleString('id-ID')} pada tanggal ${incoming.tanggal} sudah pernah tersimpan di riwayat.`,
          matchedTransaction: ex,
        };
      }

      // 2c. Same IDPEL + Same Total Payment + Same Service/Rincian
      if (incTotal > 0 && incTotal === exTotal && incRincian && exRincian && incRincian === exRincian) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} untuk layanan ${incoming.rincianTagihan} dengan Total Rp ${incTotal.toLocaleString('id-ID')} sudah ada di riwayat.`,
          matchedTransaction: ex,
        };
      }

      // 2d. Same IDPEL + Same Total Payment + Same Customer Name
      if (incTotal > 0 && incTotal === exTotal && incNama && exNama && incNama === exNama) {
        return {
          isDuplicate: true,
          reason: `ID Pelanggan ${incoming.idpel} atas nama ${incoming.namaPelanggan} dengan Total Rp ${incTotal.toLocaleString('id-ID')} sudah ada di riwayat.`,
          matchedTransaction: ex,
        };
      }
    }

    // 3. Fallback if IDPEL is empty or missing: match by Customer Name + Date + Total
    const hasValidNama = incNama && incNama !== '-' && incNama.length >= 3;
    if (hasValidNama && incNama === exNama && incTotal > 0 && incTotal === exTotal) {
      if (incTanggal && exTanggal && incTanggal === exTanggal) {
        return {
          isDuplicate: true,
          reason: `Pelanggan atas nama ${incoming.namaPelanggan} dengan Total Rp ${incTotal.toLocaleString('id-ID')} pada tanggal ${incoming.tanggal} sudah ada di riwayat.`,
          matchedTransaction: ex,
        };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Deduplicates a list of transactions so that each unique transaction appears only once.
 * Keeps the most recent occurrence.
 */
export function deduplicateTransactionList(list: ReceiptData[]): {
  cleaned: ReceiptData[];
  removedCount: number;
} {
  if (!Array.isArray(list)) return { cleaned: [], removedCount: 0 };

  const cleaned: ReceiptData[] = [];
  let removedCount = 0;

  for (const item of list) {
    const dup = checkDuplicateTransaction(item, cleaned);
    if (dup.isDuplicate) {
      removedCount++;
    } else {
      cleaned.push(item);
    }
  }

  return { cleaned, removedCount };
}
