import { ReceiptData } from '../types';
import { formatReceiptDateTime } from './dateFormatter';
import { getReceiptHeaderTitle } from './billParser';
import { formatTerbilang } from './terbilang';

/**
 * Pure HTML5 Canvas 2D renderer for A6 Receipt.
 * Serves as a rock-solid, zero-dependency guarantee for generating crisp PNG receipts
 * that never fails regardless of CSS frameworks, iframe restrictions, or DOM cloning issues.
 */
export function drawReceiptToCanvas(receipt: ReceiptData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // High-resolution canvas for crisp A6 print / WhatsApp sharing (approx 800x1160 px)
  const width = 800;
  const height = 1180;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // 1. Clean White Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Styling helpers
  const fontMono = 'Courier New, ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const padX = 50;
  const contentWidth = width - padX * 2;
  const rightX = width - padX;
  const leftX = padX;
  let curY = 45;

  const drawDashedLine = (y: number, lineWidth = 2) => {
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();
    ctx.restore();
  };

  const drawSolidLine = (y: number, lineWidth = 2) => {
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();
    ctx.restore();
  };

  // --- HEADER (Bukopin PPOB Style: Centered, Bold, Large Header Title at Very Top) ---
  const displayTitle = getReceiptHeaderTitle(receipt);
  
  ctx.font = `bold 30px ${fontMono}`;
  ctx.fillText(displayTitle, width / 2, curY);
  curY += 40;

  ctx.font = `bold 22px ${fontMono}`;
  ctx.fillText(`LOKET: ${(receipt.namaAgen || 'AGEN BATARA').toUpperCase()}`, width / 2, curY);
  curY += 30;

  if (receipt.alamat) {
    ctx.font = `18px ${fontMono}`;
    ctx.fillText(receipt.alamat, width / 2, curY);
    curY += 24;
  }
  if (receipt.noHp) {
    ctx.font = `18px ${fontMono}`;
    ctx.fillText(`Telp/WA: ${receipt.noHp}`, width / 2, curY);
    curY += 24;
  }

  curY += 10;
  drawDashedLine(curY);
  curY += 25;

  // Helper for left-right metadata row
  const drawRow = (label: string, val: string, isBold = false, fontSize = 20) => {
    ctx.save();
    ctx.font = `${isBold ? 'bold' : 'normal'} ${fontSize}px ${fontMono}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, leftX, curY);
    ctx.textAlign = 'right';
    ctx.fillText(val, rightX, curY);
    ctx.restore();
    curY += fontSize + 12;
  };

  // --- METADATA TRANSAKSI ---
  drawRow('ID Transaksi:', receipt.id || 'TRX-83920184', true);
  drawRow('Tgl/Waktu:', formatReceiptDateTime(receipt.tanggal));
  drawRow('ID Pelanggan:', receipt.idpel || '-', true);
  
  // Truncate name if too long
  let custName = (receipt.namaPelanggan || '-').toUpperCase();
  if (custName.length > 24) custName = custName.substring(0, 22) + '...';
  drawRow('Nama:', custName, true);

  drawRow('Bulan/Periode:', receipt.bulanTagihan || '-');
  drawRow('Pemakaian:', receipt.pemakaian || '-');
  if (receipt.standMeter) {
    drawRow('Stand Meter:', receipt.standMeter);
  }

  curY += 10;
  drawDashedLine(curY);
  curY += 22;

  // --- RINCIAN BIAYA ---
  ctx.save();
  ctx.font = `bold 20px ${fontMono}`;
  ctx.textAlign = 'left';
  ctx.fillText('Rincian Transaksi:', leftX, curY);
  ctx.restore();
  curY += 30;

  let serviceLabel = receipt.rincianTagihan || 'Tagihan Pembayaran';
  if (serviceLabel.length > 28) serviceLabel = serviceLabel.substring(0, 26) + '...';
  drawRow(serviceLabel, `Rp ${Number(receipt.rpTagihan || 0).toLocaleString('id-ID')}`);

  if (Number(receipt.lainLain) > 0) {
    drawRow('Biaya Lain-Lain', `Rp ${Number(receipt.lainLain || 0).toLocaleString('id-ID')}`);
  }

  drawRow('Admin Bank / Loket', `Rp ${Number(receipt.adminBank || 0).toLocaleString('id-ID')}`);

  curY += 10;
  drawDashedLine(curY);
  curY += 24;

  // --- TOTAL PEMBAYARAN BOX ---
  drawSolidLine(curY, 3);
  curY += 18;

  ctx.font = `bold 18px ${fontMono}`;
  ctx.textAlign = 'center';
  ctx.fillText('TOTAL PEMBAYARAN', width / 2, curY);
  curY += 28;

  ctx.font = `bold 36px ${fontMono}`;
  ctx.fillText(`Rp ${Number(receipt.totalBayar || 0).toLocaleString('id-ID')}`, width / 2, curY);
  curY += 46;

  drawSolidLine(curY, 3);
  curY += 16;

  // --- TERBILANG ---
  const terbilangStr = `Terbilang: ${formatTerbilang(Number(receipt.totalBayar || 0))}`;
  ctx.save();
  ctx.font = `italic 15px ${fontMono}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  if (terbilangStr.length > 58) {
    ctx.font = `italic 13px ${fontMono}`;
  }
  ctx.fillText(terbilangStr, width / 2, curY);
  ctx.restore();
  curY += 28;

  // --- FOOTER THANKS ---
  ctx.font = `bold 18px ${fontMono}`;
  ctx.textAlign = 'center';
  ctx.fillText('Terima Kasih Atas Pembayaran Anda', width / 2, curY);
  curY += 26;

  ctx.font = `16px ${fontMono}`;
  ctx.fillText('Simpan struk ini sebagai bukti pembayaran yang sah.', width / 2, curY);

  return canvas;
}
