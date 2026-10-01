/**
 * Fungsi Konversi Angka ke Kata-kata (Terbilang Rupiah Bahasa Indonesia)
 * Contoh: 35000 -> "Tiga Puluh Lima Ribu Rupiah"
 */

export function terbilang(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n.replace(/[^0-9.-]+/g, '')) : n;
  if (isNaN(num) || num === 0) return 'Nol Rupiah';

  const angka = Math.floor(Math.abs(num));
  const satuan = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas',
  ];

  function toWords(x: number): string {
    if (x < 12) {
      return satuan[x];
    } else if (x < 20) {
      return toWords(x - 10) + ' Belas';
    } else if (x < 100) {
      const rest = x % 10;
      return toWords(Math.floor(x / 10)) + ' Puluh' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else if (x < 200) {
      const rest = x - 100;
      return 'Seratus' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else if (x < 1000) {
      const rest = x % 100;
      return toWords(Math.floor(x / 100)) + ' Ratus' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else if (x < 2000) {
      const rest = x - 1000;
      return 'Seribu' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else if (x < 1000000) {
      const rest = x % 1000;
      return toWords(Math.floor(x / 1000)) + ' Ribu' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else if (x < 1000000000) {
      const rest = x % 1000000;
      return toWords(Math.floor(x / 1000000)) + ' Juta' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else if (x < 1000000000000) {
      const rest = x % 1000000000;
      return toWords(Math.floor(x / 1000000000)) + ' Miliar' + (rest !== 0 ? ' ' + toWords(rest) : '');
    } else {
      const rest = x % 1000000000000;
      return toWords(Math.floor(x / 1000000000000)) + ' Triliun' + (rest !== 0 ? ' ' + toWords(rest) : '');
    }
  }

  const result = toWords(angka).trim();
  return (num < 0 ? 'Minus ' : '') + result + ' Rupiah';
}

/**
 * Format terbilang resmi untuk struk resi
 * Contoh: "# Tiga Puluh Lima Ribu Rupiah #"
 */
export function formatTerbilang(amount: number | string): string {
  const words = terbilang(amount);
  return `# ${words} #`;
}
