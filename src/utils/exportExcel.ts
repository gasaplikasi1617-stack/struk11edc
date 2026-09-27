import * as XLSX from 'xlsx';
import { ReceiptData } from '../types';
import { getTransactionCategory, getCategoryLabel } from './billParser';

export interface ExportExcelOptions {
  fileName?: string;
  sheetName?: string;
  sortDescription?: string;
  filterDescription?: string;
}

/**
 * Normalisasi ID Pelanggan agar menjadi format teks murni tanpa notasi ilmiah (scientific notation).
 * Contoh perbaikan: 520550138761 (number) atau '5.2055E+11' -> '520550138761'
 */
export function formatIdpelAsText(val: any): string {
  if (val === null || val === undefined || val === '') return '-';

  // Jika bertipe number murni (misal 520550138761)
  if (typeof val === 'number') {
    if (Number.isFinite(val)) {
      if (Number.isInteger(val)) {
        return val.toLocaleString('fullwide', { useGrouping: false });
      }
      try {
        return BigInt(Math.round(val)).toString();
      } catch {
        return val.toLocaleString('fullwide', { useGrouping: false });
      }
    }
    return String(val);
  }

  let s = String(val).trim();
  if (!s || s === '-') return '-';

  // Jika string dalam bentuk notasi ilmiah seperti 5.2055E+11 atau 5.20550138761E+11
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(s)) {
    const num = Number(s);
    if (!isNaN(num) && Number.isFinite(num)) {
      try {
        return BigInt(Math.round(num)).toString();
      } catch {
        return num.toLocaleString('fullwide', { useGrouping: false });
      }
    }
  }

  return s;
}

/**
 * Normalisasi No HP agar tetap berupa teks dengan angka 0 di depan
 */
export function formatPhoneAsText(val: any): string {
  if (val === null || val === undefined || val === '') return '-';
  let s = String(val).trim();
  if (/^\d{9,13}$/.test(s) && !s.startsWith('0')) {
    s = '0' + s;
  }
  return s || '-';
}

export function exportTransactionsToExcel(
  transactions: ReceiptData[],
  options?: ExportExcelOptions
): void {
  if (!transactions || transactions.length === 0) {
    alert('Tidak ada data transaksi untuk diekspor!');
    return;
  }

  // Format the rows for Excel
  const rows = transactions.map((t) => {
    const formattedDate = t.tanggal || '-';
    const cat = getTransactionCategory(t);
    const categoryName = getCategoryLabel(cat);
    const idpelText = formatIdpelAsText(t.idpel);

    return {
      'Tanggal': formattedDate,
      'Kategori': categoryName,
      'Idpel': idpelText,
      'Nama': (t.namaPelanggan || '').toUpperCase(),
      'Bln/Periode': t.bulanTagihan || '-',
      'Pemakaian': t.pemakaian || '-',
      'Stan Meter': String(t.standMeter || '-'),
      'Tagihan Murni': Number(t.rpTagihan) || 0,
      'Biaya Lain-lain': Number(t.lainLain) || 0,
      'Admin Bank': Number(t.adminBank) || 0,
      'Total Bayar': Number(t.totalBayar) || 0,
    };
  });

  // Calculate totals
  const totalTagihan = transactions.reduce((sum, t) => sum + (Number(t.rpTagihan) || 0), 0);
  const totalLainLain = transactions.reduce((sum, t) => sum + (Number(t.lainLain) || 0), 0);
  const totalAdmin = transactions.reduce((sum, t) => sum + (Number(t.adminBank) || 0), 0);
  const grandTotal = transactions.reduce((sum, t) => sum + (Number(t.totalBayar) || 0), 0);

  // Append Total Row
  rows.push({
    'Tanggal': '',
    'Kategori': 'TOTAL' as any,
    'Idpel': `(${transactions.length} Data)`,
    'Nama': 'TOTAL KESELURUHAN',
    'Bln/Periode': '',
    'Pemakaian': '',
    'Stan Meter': '',
    'Tagihan Murni': totalTagihan,
    'Biaya Lain-lain': totalLainLain,
    'Admin Bank': totalAdmin,
    'Total Bayar': grandTotal,
  });

  // Convert to worksheet with explicit text preservation
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Decode worksheet range to strictly format cell types
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  
  // Identify column indices by header name
  const textColIndices: number[] = [];
  const currencyColIndices: number[] = [];
  let idpelCol = -1;

  for (let C = range.s.c; C <= range.e.c; ++C) {
    const headerCell = worksheet[XLSX.utils.encode_cell({ r: 0, c: C })];
    const headerTitle = headerCell ? String(headerCell.v || '') : '';

    if (headerTitle === 'Idpel' || headerTitle === 'ID Pelanggan') {
      idpelCol = C;
      textColIndices.push(C);
    } else if (
      headerTitle.includes('Meter') ||
      headerTitle.includes('Tanggal') ||
      headerTitle.includes('Bulan') ||
      headerTitle.includes('Periode') ||
      headerTitle.includes('Bln') ||
      headerTitle.includes('Pemakaian') ||
      headerTitle.includes('Nama') ||
      headerTitle.includes('Kategori') ||
      headerTitle.includes('Kategory')
    ) {
      textColIndices.push(C);
    } else if (
      headerTitle.includes('(Rp)') ||
      headerTitle.includes('Tagihan') ||
      headerTitle.includes('Biaya') ||
      headerTitle.includes('Admin') ||
      headerTitle.includes('Total')
    ) {
      currencyColIndices.push(C);
    }
  }

  // Iterate over all data rows and apply explicit Excel cell formatting
  for (let R = 1; R <= range.e.r; ++R) {
    // 1. Text format (@) for Idpel and text columns
    for (const C of textColIndices) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[cellRef];
      if (cell) {
        let textVal = cell.v != null ? String(cell.v) : '';
        if (C === idpelCol && R < range.e.r) {
          textVal = formatIdpelAsText(cell.v);
        }
        cell.t = 's'; // Excel string / text type
        cell.v = textVal;
        cell.w = textVal;
        cell.z = '@'; // Excel '@' text number format
      }
    }

    // 2. Currency format (#,##0) for monetary amount columns
    for (const C of currencyColIndices) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[cellRef];
      if (cell && cell.v !== '') {
        const numVal = Number(cell.v) || 0;
        cell.t = 'n';
        cell.v = numVal;
        cell.z = '#,##0'; // Excel currency thousand separator
      }
    }
  }

  // Set column widths for comfortable reading (11 columns matching exact requested order)
  worksheet['!cols'] = [
    { wch: 16 }, // 1. Tanggal
    { wch: 18 }, // 2. Kategori
    { wch: 22 }, // 3. Idpel
    { wch: 28 }, // 4. Nama
    { wch: 16 }, // 5. Bln/Periode
    { wch: 16 }, // 6. Pemakaian
    { wch: 18 }, // 7. Stan Meter
    { wch: 18 }, // 8. Tagihan Murni
    { wch: 18 }, // 9. Biaya Lain-lain
    { wch: 16 }, // 10. Admin Bank
    { wch: 18 }, // 11. Total Bayar
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  const sheetName = options?.sheetName || 'Riwayat Transaksi';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Determine filename
  const today = new Date().toISOString().slice(0, 10);
  const fileName = options?.fileName || `Riwayat_Transaksi_${today}.xlsx`;

  // Trigger file download with cell styles enabled
  XLSX.writeFile(workbook, fileName, { cellStyles: true });
}
