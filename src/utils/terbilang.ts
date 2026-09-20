/**
 * Utility untuk konversi angka ke format terbilang dalam bahasa Indonesia.
 * Contoh: 187500 -> "SERATUS DELAPAN PULUH TUJUH RIBU LIMA RATUS RUPIAH"
 */
export function terbilang(angka: number | string): string {
  const cleanStr = String(angka).replace(/[^0-9]/g, '');
  const num = parseInt(cleanStr, 10);
  if (isNaN(num) || num <= 0) return 'NOL RUPIAH';

  const satuan = [
    '',
    'SATU',
    'DUA',
    'TIGA',
    'EMPAT',
    'LIMA',
    'ENAM',
    'TUJUH',
    'DELAPAN',
    'SEMBILAN',
    'SEPULUH',
    'SEBELAS',
  ];

  function konversi(n: number): string {
    if (n < 12) {
      return satuan[n];
    } else if (n < 20) {
      return konversi(n - 10) + ' BELAS';
    } else if (n < 100) {
      return konversi(Math.floor(n / 10)) + ' PULUH' + (n % 10 !== 0 ? ' ' + konversi(n % 10) : '');
    } else if (n < 200) {
      return 'SERATUS' + (n - 100 !== 0 ? ' ' + konversi(n - 100) : '');
    } else if (n < 1000) {
      return konversi(Math.floor(n / 100)) + ' RATUS' + (n % 100 !== 0 ? ' ' + konversi(n % 100) : '');
    } else if (n < 2000) {
      return 'SERIBU' + (n - 1000 !== 0 ? ' ' + konversi(n - 1000) : '');
    } else if (n < 1000000) {
      return konversi(Math.floor(n / 1000)) + ' RIBU' + (n % 1000 !== 0 ? ' ' + konversi(n % 1000) : '');
    } else if (n < 1000000000) {
      return konversi(Math.floor(n / 1000000)) + ' JUTA' + (n % 1000000 !== 0 ? ' ' + konversi(n % 1000000) : '');
    } else if (n < 1000000000000) {
      return konversi(Math.floor(n / 1000000000)) + ' MILYAR' + (n % 1000000000 !== 0 ? ' ' + konversi(n % 1000000000) : '');
    } else {
      return konversi(Math.floor(n / 1000000000000)) + ' TRILIUN' + (n % 1000000000000 !== 0 ? ' ' + konversi(n % 1000000000000) : '');
    }
  }

  return konversi(num).trim() + ' RUPIAH';
}
