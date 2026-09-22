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
  if (!input) return '';
  const upper = input.toUpperCase();
  const monthMap: Record<string, string> = {
    JANUARI: 'Jan', JAN: 'Jan',
    FEBRUARI: 'Feb', FEB: 'Feb',
    MARET: 'Mar', MAR: 'Mar',
    APRIL: 'Apr', APR: 'Apr',
    MEI: 'Mei', MAY: 'Mei',
    JUNI: 'Jun', JUN: 'Jun',
    JULI: 'Jul', JUL: 'Jul',
    AGUSTUS: 'Agu', AGUST: 'Agu', AGUS: 'Agu', AGT: 'Agu', AGS: 'Agu', AUG: 'Agu', AGU: 'Agu',
    SEPTEMBER: 'Sep', SEPT: 'Sep', SEP: 'Sep',
    OKTOBER: 'Okt', OKT: 'Okt', OCT: 'Okt',
    NOVEMBER: 'Nov', NOV: 'Nov',
    DESEMBER: 'Des', DES: 'Des', DEC: 'Des'
  };

  let mCode = '';
  // Sort keys by length descending to match longer keywords first
  const sortedKeys = Object.keys(monthMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (upper.includes(key)) {
      mCode = monthMap[key];
      break;
    }
  }

  const yearMatch = upper.match(/20(\d{2})|\b(\d{2})\b/);
  let yCode = '';
  if (yearMatch) {
    const y = yearMatch[1] || yearMatch[2];
    yCode = y.length === 4 ? y.slice(2) : y;
  }

  if (mCode && yCode) {
    return `${mCode}${yCode}`;
  }

  const numMatch = upper.match(/(\d{1,2})[\/\-](\d{2,4})/);
  if (numMatch) {
    const mNum = parseInt(numMatch[1], 10);
    const monthsArr = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    if (mNum >= 1 && mNum <= 12) {
      mCode = monthsArr[mNum];
      const y = numMatch[2];
      yCode = y.length === 4 ? y.slice(2) : y;
      return `${mCode}${yCode}`;
    }
  }

  if (mCode) {
    const currentYY = String(new Date().getFullYear()).slice(2);
    return `${mCode}${currentYY}`;
  }

  return '';
}

export function getCurrentMonthPeriod(dateObj: Date = new Date()): string {
  const monthsArr = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const m = dateObj.getMonth() + 1; // 1-12
  const yStr = String(dateObj.getFullYear()).slice(-2);
  return `${monthsArr[m]}${yStr}`;
}

export function getPreviousMonthPeriod(periodStr?: string): string {
  const monthsArr = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  
  let month = 0;
  let year = new Date().getFullYear();

  if (periodStr && periodStr.trim()) {
    const formatted = formatPeriod3Chars(periodStr);
    if (formatted) {
      const mStr = formatted.replace(/\d+$/, '');
      const yStr = formatted.slice(mStr.length);
      if (yStr) {
        year = 2000 + (parseInt(yStr, 10) || (year % 100));
      }

      const monthMap: Record<string, number> = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, Mei: 5, Jun: 6,
        Jul: 7, Agu: 8, Agust: 8, Agus: 8, Agt: 8, Sep: 9, Sept: 9, Okt: 10, Nov: 11, Des: 12
      };
      month = monthMap[mStr] || 0;
    }
  }

  // If no month found in input periodStr, default to current month
  if (month === 0) {
    const now = new Date();
    month = now.getMonth() + 1; // 1 to 12
    year = now.getFullYear();
  }

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const prevMStr = monthsArr[prevMonth];
  const prevYStr = String(prevYear).slice(-2);

  return `${prevMStr}${prevYStr}`;
}

export function getDefaultBulanTagihan(isPdam: boolean, extractedPeriod?: string): string {
  if (extractedPeriod && extractedPeriod.trim()) {
    const formatted = formatPeriod3Chars(extractedPeriod);
    if (formatted) {
      if (isPdam) {
        return getPreviousMonthPeriod(formatted);
      }
      return formatted;
    }
  }

  if (isPdam) {
    return getPreviousMonthPeriod(); // e.g. if current is Sep26 -> returns Agu26
  }
  return getCurrentMonthPeriod(); // e.g. if current is Sep26 -> returns Sep26
}

export function isPdamBill(t: {
  rincianTagihan?: string;
  pemakaian?: string;
  idpel?: string;
  standMeter?: string;
  rawText?: string;
}): boolean {
  const text = `${t.rincianTagihan || ''} ${t.pemakaian || ''} ${t.idpel || ''} ${t.standMeter || ''} ${t.rawText || ''}`.toLowerCase();
  return (
    text.includes('pdam') ||
    text.includes('air') ||
    text.includes('pam') ||
    text.includes('tirta') ||
    text.includes('meter air') ||
    text.includes('m3') ||
    text.includes('tirtanadi') ||
    text.includes('sambungan')
  );
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

/**
 * Generates the standard PPOB receipt header title in Bukopin format
 * (e.g., "STRUK PEMBAYARAN TAGIHAN LISTRIK" or "STRUK PEMBAYARAN TAGIHAN PDAM")
 * without any bank branding.
 */
export function getReceiptHeaderTitle(receipt: { rincianTagihan?: string; pemakaian?: string; idpel?: string; standMeter?: string }): string {
  const raw = (receipt.rincianTagihan || '').trim();

  // If title already explicitly starts with "STRUK", clean and return
  if (/^STRUK\s+/i.test(raw)) {
    return raw.toUpperCase();
  }

  const cat = getTransactionCategory(receipt);

  switch (cat) {
    case 'pln':
      return 'STRUK PEMBAYARAN TAGIHAN LISTRIK';
    case 'pdam':
      return 'STRUK PEMBAYARAN TAGIHAN PDAM';
    case 'bpjs':
      return 'STRUK PEMBAYARAN TAGIHAN BPJS';
    case 'telkom':
      return 'STRUK PEMBAYARAN TAGIHAN TELKOM / SPEEDY';
    case 'pascabayar':
      return 'STRUK PEMBAYARAN PASCABAYAR';
    case 'other':
    default: {
      const clean = raw.replace(/^info\s*tagihan/i, '').replace(/^tagihan/i, '').trim();
      const title = clean || 'PEMBAYARAN RESMI';
      return `STRUK PEMBAYARAN ${title.toUpperCase()}`;
    }
  }
}

