import { ReceiptData } from '../types';

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

  // --- HEADER AGEN ---
  ctx.font = `bold 28px ${fontMono}`;
  ctx.fillText((receipt.namaAgen || 'AGEN BATARA').toUpperCase(), width / 2, curY);
  curY += 36;

  ctx.font = `19px ${fontMono}`;
  ctx.fillText(receipt.alamat || 'Bekasi', width / 2, curY);
  curY += 26;

  ctx.fillText(`Telp/WA: ${receipt.noHp || '-'}`, width / 2, curY);
  curY += 34;

  // Title Banner
  drawDashedLine(curY);
  curY += 16;

  const rawTitle = receipt.rincianTagihan || '';
  const cleanTitle = rawTitle.replace(/^info\s*tagihan/i, '').replace(/^tagihan/i, '').trim() || 'PEMBAYARAN RESMI';
  const displayTitle = cleanTitle.toUpperCase().includes('STRUK')
    ? cleanTitle.toUpperCase()
    : `STRUK PEMBAYARAN ${cleanTitle.toUpperCase()}`;

  ctx.font = `bold 20px ${fontMono}`;
  ctx.fillText(displayTitle, width / 2, curY);
  curY += 30;

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
  drawRow('Tgl/Waktu:', receipt.tanggal || new Date().toLocaleDateString('id-ID'));
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
  curY += 30;

  // --- FOOTER THANKS ---
  ctx.font = `bold 18px ${fontMono}`;
  ctx.textAlign = 'center';
  ctx.fillText('Terima Kasih Atas Pembayaran Anda', width / 2, curY);
  curY += 26;

  ctx.font = `16px ${fontMono}`;
  ctx.fillText('Simpan struk ini sebagai bukti pembayaran yang sah.', width / 2, curY);

  return canvas;
}

/**
 * Pure HTML5 Canvas 2D renderer for Dot Matrix (Continuous Form 21,6 x 6,95 cm)
 * Authentic PPOB Bank Bukopin style layout.
 */
export function drawDotMatrixToCanvas(receipt: ReceiptData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  // High-resolution canvas for 21.6cm x 6.95cm (approx 3.1:1 ratio, 1600x515 px)
  const width = 1600;
  const height = 515;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const fontMono = '"Courier New", Courier, Lucida Console, Monaco, monospace';
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const padX = 50;
  const contentWidth = width - padX * 2;
  const rightX = width - padX;
  const leftX = padX;
  let curY = 24;

  const drawDoubleBar = (y: number) => {
    ctx.font = `bold 16px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText('='.repeat(98), width / 2, y);
  };

  const drawDashedBar = (y: number) => {
    ctx.font = `bold 16px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText('-'.repeat(98), width / 2, y);
  };

  // Top border
  drawDoubleBar(curY);
  curY += 22;

  // Header 1: BANK BUKOPIN | SERVICE TITLE | PPOB BUKOPIN
  ctx.font = `bold 22px ${fontMono}`;
  ctx.textAlign = 'left';
  ctx.fillText('[BUKOPIN] BANK BUKOPIN', leftX, curY);

  ctx.textAlign = 'center';
  const cleanRincian = (receipt.rincianTagihan || 'TAGIHAN PEMBAYARAN')
    .replace(/^info\s*tagihan/i, '')
    .replace(/^tagihan/i, '')
    .trim()
    .toUpperCase();
  ctx.fillText(`STRUK PEMBAYARAN: ${cleanRincian}`, width / 2, curY);

  ctx.textAlign = 'right';
  ctx.fillText('PPOB BUKOPIN', rightX, curY);
  curY += 28;

  // Header 2: TGL/JAM | LOKET | NO REFF
  ctx.font = `18px ${fontMono}`;
  ctx.textAlign = 'left';
  ctx.fillText(`TGL/JAM: ${receipt.tanggal || '-'}`, leftX, curY);

  ctx.textAlign = 'center';
  ctx.fillText(`LOKET: ${(receipt.namaAgen || 'AGEN BATARA').toUpperCase()}`, width / 2, curY);

  const rawDate = (receipt.tanggal || '').replace(/[^0-9]/g, '');
  const rawId = (receipt.idpel || '12345').replace(/[^0-9]/g, '');
  const refCode = (rawDate + rawId).slice(-16).padEnd(16, '8');
  ctx.textAlign = 'right';
  ctx.fillText(`NO REFF: ${refCode}`, rightX, curY);
  curY += 26;

  // Divider
  drawDashedBar(curY);
  curY += 24;

  // 3-Column Body Grid
  // Col 1: leftX (width 480)
  // Col 2: leftX + 500 (width 480)
  // Col 3: leftX + 1000 (width 500)
  const col1X = leftX;
  const col2X = leftX + 500;
  const col3X = leftX + 1000;
  const rowH = 26;
  const gridStartY = curY;

  // Column 1
  ctx.font = `18px ${fontMono}`;
  ctx.textAlign = 'left';
  ctx.fillText(`IDPEL     : ${receipt.idpel || '-'}`, col1X, gridStartY);
  ctx.fillText(`NAMA      : ${(receipt.namaPelanggan || '-').substring(0, 22).toUpperCase()}`, col1X, gridStartY + rowH);
  ctx.fillText(`TRF/DY    : ${receipt.tarifDaya || '-'}`, col1X, gridStartY + rowH * 2);
  ctx.fillText(`BL/TH     : ${receipt.bulanTagihan || '-'}`, col1X, gridStartY + rowH * 3);

  // Column 2
  ctx.fillText(`STAND MTR : ${receipt.standMeter || '-'}`, col2X, gridStartY);
  ctx.fillText(`PEMAKAIAN : ${receipt.pemakaian || '-'}`, col2X, gridStartY + rowH);
  ctx.fillText(`NO TELP/HP: ${receipt.noHp || '-'}`, col2X, gridStartY + rowH * 2);
  ctx.fillText(`STATUS    : LUNAS`, col2X, gridStartY + rowH * 3);

  // Column 3
  const rpTagihan = Number(receipt.rpTagihan || 0).toLocaleString('id-ID');
  const lainLain = Number(receipt.lainLain || 0);
  const adminBank = Number(receipt.adminBank || 0).toLocaleString('id-ID');
  const totalBayar = Number(receipt.totalBayar || 0).toLocaleString('id-ID');

  ctx.fillText(`RP TAGIHAN: Rp ${rpTagihan}`, col3X, gridStartY);
  ctx.fillText(`BIAYA LAIN: Rp ${lainLain > 0 ? lainLain.toLocaleString('id-ID') : '0'}`, col3X, gridStartY + rowH);
  ctx.fillText(`ADMIN BANK: Rp ${adminBank}`, col3X, gridStartY + rowH * 2);

  ctx.font = `bold 20px ${fontMono}`;
  ctx.fillText(`TOTAL BYR : Rp ${totalBayar}`, col3X, gridStartY + rowH * 3);

  curY = gridStartY + rowH * 4 + 8;

  // Divider
  drawDashedBar(curY);
  curY += 22;

  // Terbilang
  // Simple terbilang inside drawer
  ctx.font = `bold 16px ${fontMono}`;
  ctx.textAlign = 'left';
  ctx.fillText(`TERBILANG : # TOTAL RP ${totalBayar} RUPIAH #`, leftX, curY);
  curY += 24;

  // Footer notes
  ctx.font = `15px ${fontMono}`;
  ctx.fillText('* PLN/BUKOPIN MENYATAKAN STRUK INI ADALAH BUKTI PEMBAYARAN YANG SAH & LUNAS *', leftX, curY);
  ctx.textAlign = 'right';
  ctx.fillText('KODE: BUKOPIN-PPOB-OK', rightX, curY);
  curY += 22;

  ctx.textAlign = 'left';
  ctx.font = `14px ${fontMono}`;
  ctx.fillText('INFO HUBUNGI CALL CENTER 123 ATAU LOKET TERDEKAT. TERIMA KASIH.', leftX, curY);
  if (receipt.alamat) {
    ctx.textAlign = 'right';
    ctx.fillText(`ALAMAT: ${receipt.alamat.substring(0, 45)}`, rightX, curY);
  }
  curY += 20;

  // Bottom border
  drawDoubleBar(curY);

  return canvas;
}

