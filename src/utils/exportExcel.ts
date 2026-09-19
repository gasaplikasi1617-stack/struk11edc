import * as XLSX from 'xlsx';
import { ReceiptData } from '../types';

export interface ExportExcelOptions {
  fileName?: string;
  sheetName?: string;
  sortDescription?: string;
  filterDescription?: string;
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

    return {
      'No': index + 1,
      'ID Transaksi': t.id || '-',
      'Tanggal': formattedDate,
      'Waktu Pencatatan': formattedTime,
      'ID Pelanggan': t.idpel || '-',
      'Nama Pelanggan': (t.namaPelanggan || '').toUpperCase(),
      'Layanan / Rincian Tagihan': t.rincianTagihan || '-',
      'Bulan / Periode': t.bulanTagihan || '-',
      'Pemakaian': t.pemakaian || '-',
      'Stand Meter': t.standMeter || '-',
      'Tagihan Murni (Rp)': Number(t.rpTagihan) || 0,
      'Biaya Lain-lain (Rp)': Number(t.lainLain) || 0,
      'Admin Bank (Rp)': Number(t.adminBank) || 0,
      'Total Bayar (Rp)': Number(t.totalBayar) || 0,
      'Nama Agen': t.namaAgen || 'Agen Batara',
      'Alamat Agen': t.alamat || 'Bekasi',
      'No HP Agen': t.noHp || '-',
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

  // Convert to worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  worksheet['!cols'] = [
    { wch: 6 },  // No
    { wch: 22 }, // ID Transaksi
    { wch: 14 }, // Tanggal
    { wch: 22 }, // Waktu Pencatatan
    { wch: 20 }, // ID Pelanggan
    { wch: 28 }, // Nama Pelanggan
    { wch: 32 }, // Layanan
    { wch: 18 }, // Bulan/Periode
    { wch: 14 }, // Pemakaian
    { wch: 20 }, // Stand Meter
    { wch: 18 }, // Tagihan Murni
    { wch: 18 }, // Biaya Lain
    { wch: 16 }, // Admin Bank
    { wch: 18 }, // Total Bayar
    { wch: 20 }, // Nama Agen
    { wch: 20 }, // Alamat Agen
    { wch: 16 }, // No HP Agen
  ];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  const sheetName = options?.sheetName || 'Riwayat Transaksi';
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Determine filename
  const today = new Date().toISOString().slice(0, 10);
  const fileName = options?.fileName || `Riwayat_Transaksi_100_${today}.xlsx`;

  // Trigger file download
  XLSX.writeFile(workbook, fileName);
}
