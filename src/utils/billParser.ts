/**
 * Utility functions for parsing bill raw text across various agencies in Indonesia:
 * PLN, PDAM, BPJS Kesehatan / Ketenagakerjaan, Telkom / IndiHome, Multifinance / Leasing,
 * Pajak PBB, Virtual Account, Perbankan, dll.
 * 
 * Aturan penting:
 * Nomor Polis = No Pelanggan = Idpel = No Rekening = No Sambungan = No Peserta = No Kontrak
 * tergantung instansi yang menamainya.
 */

export function cleanExtractedId(val: string): string {
  if (!val) return '';
  // Strip trailing comments/units like " / R1M" or " (1 BULAN)" or " - BEKASI"
  let cleaned = val.split(/[\/\(]/)[0].trim();
  // Remove leading colons, equals, or spaces
  cleaned = cleaned.replace(/^[:=\s]+/, '').trim();
  
  // If there are space-separated words, but first token is alphanumeric ID (like "0001234567891 BPJS")
  const firstWord = cleaned.split(/\s+/)[0];
  if (/^[A-Za-z0-9\-\.\/]{3,}$/.test(firstWord)) {
    return firstWord;
  }
  return cleaned;
}

export function extractIdpelFromLines(lines: string[], rawText?: string): string {
  const p1Labels = [
    'nomor\\s*polis', 'no\\.?\\s*polis', 'polis',
    'idpel', 'id\\s*pelanggan', 'id\\s*pel\\b', 'no\\.?\\s*pelanggan', 'nomor\\s*pelanggan', 'no\\.?\\s*pel\\b',
    'no\\.?\\s*peserta', 'nomor\\s*peserta', 'no\\.?\\s*kartu', 'nomor\\s*kartu', 'no\\.?\\s*bpjs',
    'no\\.?\\s*kontrak', 'nomor\\s*kontrak', 'no\\.?\\s*perjanjian', 'nomor\\s*perjanjian',
    'no\\.?\\s*sambungan', 'nomor\\s*sambungan', 'no\\.?\\s*sambung', 'no\\.?\\s*samb\\b',
    'no\\.?\\s*rek(?:ening)?', 'nomor\\s*rek(?:ening)?',
    'no\\.?\\s*va\\b', 'nomor\\s*va\\b', 'virtual\\s*account',
    'nop\\b', 'nomor\\s*objek\\s*pajak', 'no\\.?\\s*objek\\s*pajak',
    'no\\.?\\s*internet', 'no\\.?\\s*indihome', 'no\\.?\\s*speedy', 'no\\.?\\s*telp(?:on)?', 'nomor\\s*telp(?:on)?',
    'cust(?:omer)?\\s*id', 'client\\s*id', 'subscriber\\s*id', 'acc(?:ount)?\\s*no'
  ];

  const p1Regex = new RegExp('(?:^|\\b)(' + p1Labels.join('|') + ')\\b', 'i');
  const p1InlineRegex = new RegExp('(?:^|\\b)(?:' + p1Labels.join('|') + ')\\s*[:=]?\\s*([A-Za-z0-9\\-\\.\\/]+)', 'i');

  // Pass 1: Check lines matching Priority 1 labels (Polis, Pelanggan, Rekening, Sambungan, Peserta, Kontrak, dll.)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (p1Regex.test(line)) {
      // 1a. Check separator : or =
      if (/[:=]/.test(line)) {
        const parts = line.split(/[:=]/);
        const val = cleanExtractedId(parts.slice(1).join(':'));
        if (val && val.length >= 3 && !/^(tagihan|rp|total|admin|adm|nama|bayar)/i.test(val)) {
          return val;
        }
      }

      // 1b. Check inline pattern without colon: "NOMOR POLIS 0001234567891" or "NO REK 0102030405"
      const inlineMatch = line.match(p1InlineRegex);
      if (inlineMatch && inlineMatch[1]) {
        const val = cleanExtractedId(inlineMatch[1]);
        if (val && val.length >= 3 && !/^(tagihan|rp|total|admin|adm|nama|bayar)/i.test(val)) {
          return val;
        }
      }

      // 1c. Check next line if label is alone on this line
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (
          nextLine.length >= 3 &&
          !/[:=]/.test(nextLine) &&
          !/^(info|struk|bukti|transaksi|pln|pdam|telkom|indihome|speedy|bpjs|pbb|nama|tagihan|rp|total|admin|adm|periode|tgl|tanggal)\b/i.test(nextLine) &&
          /[0-9]/.test(nextLine)
        ) {
          return cleanExtractedId(nextLine);
        }
      }
    }
  }

  // Pass 2: Secondary labels (No Meter, No Tagihan, ID Meter)
  const p2Regex = /^(?:no\.?\s*meter|nomor\s*meter|id\s*meter|no\.?\s*tagihan|nomor\s*tagihan|id\s*tagihan)/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (p2Regex.test(line)) {
      if (/[:=]/.test(line)) {
        const parts = line.split(/[:=]/);
        const val = cleanExtractedId(parts.slice(1).join(':'));
        if (val && val.length >= 3) return val;
      }
      const inlineMatch = line.match(/(?:no\.?\s*meter|nomor\s*meter|id\s*meter|no\.?\s*tagihan|nomor\s*tagihan|id\s*tagihan)\s*[:=]?\s*([A-Za-z0-9\-\.\/]+)/i);
      if (inlineMatch && inlineMatch[1]) {
        return cleanExtractedId(inlineMatch[1]);
      }
    }
  }

  // Pass 3: Search for isolated 8-16 digit numbers that aren't dates or phone numbers or monetary amounts
  for (const line of lines) {
    if (/^(info|struk|bukti|tgl|tanggal|total|rp|tagihan|admin|denda|subtotal)/i.test(line)) continue;
    const match = line.match(/\b\d{8,16}\b/);
    if (match) {
      const numStr = match[0];
      // Skip dates in YYYYMMDD or DDMMYYYY format
      if (/^(202[0-9]|19[0-9]{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(numStr)) continue;
      if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(202[0-9]|19[0-9]{2})$/.test(numStr)) continue;
      return numStr;
    }
  }

  return '';
}

export function formatPeriod3Chars(input: string): string {
  if (!input) return 'Sep26';
  const upper = input.toUpperCase();
  const monthMap: Record<string, string> = {
    JAN: 'Jan', JANUARI: 'Jan',
    FEB: 'Feb', FEBRUARI: 'Feb',
    MAR: 'Mar', MARET: 'Mar',
    APR: 'Apr', APRIL: 'Apr',
    MEI: 'Mei', MAY: 'Mei',
    JUN: 'Jun', JUNI: 'Jun',
    JUL: 'Jul', JULI: 'Jul',
    AGT: 'Agt', AGS: 'Agt', AGUSTUS: 'Agt', AUG: 'Agt',
    SEP: 'Sep', SEPTEMBER: 'Sep', SEPT: 'Sep',
    OKT: 'Okt', OKTOBER: 'Okt', OCT: 'Okt',
    NOV: 'Nov', NOVEMBER: 'Nov',
    DES: 'Des', DESEMBER: 'Des', DEC: 'Des'
  };

  let mCode = '';
  for (const [key, val] of Object.entries(monthMap)) {
    if (upper.includes(key)) {
      mCode = val;
      break;
    }
  }

  const yearMatch = upper.match(/20\d{2}|\d{2}/);
  let yCode = '';
  if (yearMatch) {
    const y = yearMatch[0];
    yCode = y.length === 4 ? y.slice(2) : y;
  }

  if (mCode && yCode) {
    return `${mCode}${yCode}`;
  }

  const numMatch = upper.match(/(\d{1,2})[\/\-](\d{2,4})/);
  if (numMatch) {
    const mNum = parseInt(numMatch[1], 10);
    const monthsArr = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    if (mNum >= 1 && mNum <= 12) {
      mCode = monthsArr[mNum];
      const y = numMatch[2];
      yCode = y.length === 4 ? y.slice(2) : y;
      return `${mCode}${yCode}`;
    }
  }
  return 'Sep26';
}

export type BillCategory = 'pln' | 'pdam' | 'bpjs' | 'telkom' | 'pascabayar' | 'other';

export function getTransactionCategory(t: {
  rincianTagihan?: string;
  pemakaian?: string;
  idpel?: string;
  standMeter?: string;
}): BillCategory {
  const text = `${t.rincianTagihan || ''} ${t.pemakaian || ''} ${t.idpel || ''} ${t.standMeter || ''}`.toLowerCase();
  
  if (
    text.includes('bpjs') ||
    text.includes('kesehatan') ||
    text.includes('ketenagakerjaan') ||
    text.includes('jkn') ||
    text.includes('polis') ||
    text.includes('asuransi')
  ) {
    return 'bpjs';
  }
  
  if (
    text.includes('pascabayar baru') || 
    text.includes('paskabayar baru') || 
    text.includes('kartu halo') || 
    text.includes('halo') || 
    text.includes('matrix') || 
    text.includes('xl prioritas') || 
    text.includes('myfren') || 
    text.includes('seluler pascabayar') ||
    ((text.includes('pascabayar') || text.includes('paskabayar') || text.includes('postpaid')) && !text.includes('pln') && !text.includes('listrik'))
  ) {
    return 'pascabayar';
  }

  if (
    text.includes('speedy') ||
    text.includes('telkom') ||
    text.includes('indihome') ||
    text.includes('wifi') ||
    text.includes('internet') ||
    text.includes('fiber') ||
    text.includes('telepon') ||
    text.includes('telp')
  ) {
    return 'telkom';
  }

  if (
    text.includes('pln') ||
    text.includes('listrik') ||
    text.includes('token') ||
    text.includes('kwh') ||
    text.includes('r1m') ||
    /\bva\b/i.test(text) ||
    text.includes('daya')
  ) {
    return 'pln';
  }

  if (
    text.includes('pdam') ||
    text.includes('air') ||
    text.includes('pam') ||
    text.includes('tirta') ||
    text.includes('meter air') ||
    text.includes('m3') ||
    text.includes('tirtanadi') ||
    text.includes('sambungan')
  ) {
    return 'pdam';
  }

  return 'other';
}

export function getCategoryLabel(cat: BillCategory): string {
  switch (cat) {
    case 'pln':
      return 'Listrik / PLN';
    case 'pdam':
      return 'PDAM / Air';
    case 'bpjs':
      return 'BPJS';
    case 'telkom':
      return 'Speedy / Telkom';
    case 'pascabayar':
      return 'Pascabayar Baru';
    case 'other':
    default:
      return 'Lain-lain';
  }
}

