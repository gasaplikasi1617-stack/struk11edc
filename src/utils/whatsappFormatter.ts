import { ReceiptData } from '../types';

export function formatReceiptForWhatsApp(receipt: ReceiptData): string {
  const namaAgen = (receipt.namaAgen || 'AGEN BATARA').toUpperCase();
  const alamat = receipt.alamat ? `\n📍 ${receipt.alamat}` : '';
  const noHp = receipt.noHp ? `\n📞 Telp/WA: ${receipt.noHp}` : '';

  const rpTagihan = Number(receipt.rpTagihan || 0).toLocaleString('id-ID');
  const lainLain = Number(receipt.lainLain || 0);
  const adminBank = Number(receipt.adminBank || 0).toLocaleString('id-ID');
  const totalBayar = Number(receipt.totalBayar || 0).toLocaleString('id-ID');

  const cleanTitle = (receipt.rincianTagihan || 'TAGIHAN PEMBAYARAN')
    .replace(/^info\s*tagihan/i, '')
    .replace(/^tagihan/i, '')
    .trim();

  let text = `*STRUK PEMBAYARAN RESMI*
*${namaAgen}*${alamat}${noHp}
━━━━━━━━━━━━━━━━━━━━
📅 *Tgl/Waktu:* ${receipt.tanggal || '-'}
🆔 *ID Pelanggan:* \`${receipt.idpel || '-'}\`
👤 *Nama:* *${(receipt.namaPelanggan || '-').toUpperCase()}*
📋 *Layanan:* ${receipt.rincianTagihan || cleanTitle}
🗓️ *Periode:* ${receipt.bulanTagihan || '-'}`;

  if (receipt.pemakaian) {
    text += `\n⚡ *Pemakaian:* ${receipt.pemakaian}`;
  }
  if (receipt.standMeter) {
    text += `\n🔢 *Stand Meter:* ${receipt.standMeter}`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━
💵 *Tagihan:* Rp ${rpTagihan}`;

  if (lainLain > 0) {
    text += `\n➕ *Biaya Lain:* Rp ${lainLain.toLocaleString('id-ID')}`;
  }

  text += `\n🏛️ *Admin Bank/Loket:* Rp ${adminBank}
━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL BAYAR:* *Rp ${totalBayar}*
━━━━━━━━━━━━━━━━━━━━
_Terima kasih atas pembayaran Anda._
_Struk ini adalah bukti pembayaran yang sah._`;

  return text;
}

export function getWhatsAppShareUrl(receipt: ReceiptData, targetPhone?: string): string {
  const text = formatReceiptForWhatsApp(receipt);
  const encodedText = encodeURIComponent(text);
  if (targetPhone && targetPhone.trim()) {
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '').replace(/^0/, '62');
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

export async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  if (navigator.clipboard && typeof (window as any).ClipboardItem !== 'undefined') {
    try {
      const item = new (window as any).ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return true;
    } catch (err) {
      console.warn('Direct ClipboardItem write failed:', err);
    }
  }
  return false;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed:', err);
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.warn('execCommand copy fallback failed:', err);
    return false;
  }
}
