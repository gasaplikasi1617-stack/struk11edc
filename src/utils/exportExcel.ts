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
  const rows = transactions.map((t, index) => {
    let formattedDate = t.tanggal || '-';
    let formattedTime = '-';
    if (t.createdAt) {
      try {
        const d = new Date(t.createdAt);
        formattedTime = d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } catch (err) {}
    }

    const cat = getTransactionCategory(t);
    const categoryName = getCategoryLabel(cat);
    const idpelText = formatIdpelAsText(t.idpel);
    const noHpText = formatPhoneAsText(t.noHp);
    const idTransaksiText = String(t.id || '-');

    return {
      'No': index + 1,
      'Status': t.status === 'tidak_aktif' ? 'Tidak Aktif' : 'Aktif',
      'Kategori': categoryName,
      'ID Transaksi': idTransaksiText,
      'Tanggal': formattedDate,
      'Waktu Pencatatan': formattedTime,
      'ID Pelanggan': idpelText,
      'Nama Pelanggan': (t.namaPelanggan || '').toUpperCase(),
      'Layanan / Rincian Tagihan': t.rincianTagihan || '-',
      'Bulan / Periode': t.bulanTagihan || '-',
      'Pemakaian': t.pemakaian || '-',
      'Stand Meter': String(t.standMeter || '-'),
      'Tagihan Murni (Rp)': Number(t.rpTagihan) || 0,
      'Biaya Lain-lain (Rp)': Number(t.lainLain) || 0,
      'Admin Bank (Rp)': Number(t.adminBank) || 0,
      'Total Bayar (Rp)': Number(t.totalBayar) || 0,
      'Nama Agen': t.namaAgen || 'Agen Batara',
      'Alamat Agen': t.alamat || 'Bekasi',
      'No HP Agen': noHpText,
    };
  });

  // Calculate totals
  const totalTagihan = transactions.reduce((sum, t) => sum + (Number(t.rpTagihan) || 0), 0);
  const totalLainLain = transactions.reduce((sum, t) => sum + (Number(t.lainLain) || 0), 0);
  const totalAdmin = transactions.reduce((sum, t) => sum + (Number(t.adminBank) || 0), 0);
  const grandTotal = transactions.reduce((sum, t) => sum + (Number(t.totalBayar) || 0), 0);

  // Append Total Row
  rows.push({
    'No': '' as any,
    'Status': '',
    'Kategori': 'TOTAL' as any,
    'ID Transaksi': 'TOTAL KESELURUHAN',
    'Tanggal': '',
    'Waktu Pencatatan': '',
    'ID Pelanggan': `(${transactions.length} Data)`,
    'Nama Pelanggan': '',
    'Layanan / Rincian Tagihan': '',
    'Bulan / Periode': '',
    'Pemakaian': '',
    'Stand Meter': '',
    'Tagihan Murni (Rp)': totalTagihan,
    'Biaya Lain-lain (Rp)': totalLainLain,
    'Admin Bank (Rp)': totalAdmin,
    'Total Bayar (Rp)': grandTotal,
    'Nama Agen': '',
    'Alamat Agen': '',
    'No HP Agen': '',
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

    if (headerTitle === 'ID Pelanggan') {
      idpelCol = C;
      textColIndices.push(C);
    } else if (
      headerTitle === 'ID Transaksi' ||
      headerTitle === 'No HP Agen' ||
      headerTitle === 'Stand Meter' ||
      headerTitle === 'Tanggal' ||
      headerTitle === 'Waktu Pencatatan' ||
      headerTitle === 'Bulan / Periode' ||
      headerTitle === 'Pemakaian' ||
      headerTitle === 'Layanan / Rincian Tagihan' ||
      headerTitle === 'Nama Pelanggan' ||
      headerTitle === 'Nama Agen' ||
      headerTitle === 'Alamat Agen' ||
      headerTitle === 'Status' ||
      headerTitle === 'Kategori'
    ) {
      textColIndices.push(C);
    } else if (headerTitle.includes('(Rp)')) {
      currencyColIndices.push(C);
    }
  }

  // Iterate over all data rows and apply explicit Excel cell formatting
  for (let R = 1; R <= range.e.r; ++R) {
    // 1. Text format (@) for ID Pelanggan and text columns
    for (const C of textColIndices) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[cellRef];
      if (cell) {
        let textVal = cell.v != null ? String(cell.v) : '';
        if (C === idpelCol) {
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

  // Set column widths for comfortable reading (all 19 columns)
  worksheet['!cols'] = [
    { wch: 6 },  // 0: No
    { wch: 14 }, // 1: Status
    { wch: 18 }, // 2: Kategori
    { wch: 22 }, // 3: ID Transaksi
    { wch: 16 }, // 4: Tanggal
    { wch: 22 }, // 5: Waktu Pencatatan
    { wch: 24 }, // 6: ID Pelanggan (lebar lapang agar angka panjang terbaca sempurna)
    { wch: 28 }, // 7: Nama Pelanggan
    { wch: 30 }, // 8: Layanan / Rincian Tagihan
    { wch: 18 }, // 9: Bulan / Periode
    { wch: 16 }, // 10: Pemakaian
    { wch: 20 }, // 11: Stand Meter
    { wch: 18 }, // 12: Tagihan Murni (Rp)
    { wch: 18 }, // 13: Biaya Lain-lain (Rp)
    { wch: 16 }, // 14: Admin Bank (Rp)
    { wch: 18 }, // 15: Total Bayar (Rp)
    { wch: 20 }, // 16: Nama Agen
    { wch: 22 }, // 17: Alamat Agen
    { wch: 18 }, // 18: No HP Agen
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  const sheetName = options?.sheetName || 'Riwayat Transaksi';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Determine filename
  const today = new Date().toISOString().slice(0, 10);
  const fileName = options?.fileName || `Riwayat_Transaksi_100_${today}.xlsx`;

  // Trigger file download with cell styles enabled
  XLSX.writeFile(workbook, fileName, { cellStyles: true });
}
