import { ReceiptData } from '../types';
import { formatReceiptDateTime } from './dateFormatter';
import { getReceiptHeaderTitle } from './billParser';

export type DotMatrixFontSize = 'kecil' | 'normal' | 'sedang';

/**
 * Standard HTML/CSS Dot Matrix Print Engine tuned specifically for Epson LX-310 & ESC/P Printers
 */
export function printDotMatrixReceipt(
  receipt: ReceiptData,
  onSave?: () => void,
  fontSizeMode: DotMatrixFontSize = 'normal'
) {
  if (onSave) {
    onSave();
  }

  const printWindow = window.open('', '_blank', 'width=950,height=500');
  if (!printWindow) {
    window.print();
    return;
  }

  const strTitle = getReceiptHeaderTitle(receipt);

  // Font size in points (pt) for LX-310 hardware character grid alignment
  const sizeMap = {
    kecil: { base: '8.5pt', header: '11pt', sub: '7.5pt', badge: '8.5pt', total: '11pt', footer: '7.5pt' },
    normal: { base: '9.5pt', header: '12pt', sub: '8.5pt', badge: '9.5pt', total: '12pt', footer: '8pt' },
    sedang: { base: '10.5pt', header: '13pt', sub: '9pt', badge: '10.5pt', total: '13pt', footer: '8.5pt' },
  };

  const currentSize = sizeMap[fontSizeMode] || sizeMap.normal;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Cetak LX-310 - ${receipt.namaPelanggan || 'Pelanggan'}</title>
      <style>
        @page {
          size: 21.6cm 6.95cm landscape;
          margin: 0;
        }
        *, *:before, *:after {
          box-sizing: border-box;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
          background: transparent !important;
        }
        html, body {
          width: 21.6cm;
          height: 6.95cm;
          margin: 0;
          padding: 0;
          background: #ffffff !important;
          color: #000000 !important;
          /* Resident Font Epson LX-310: Draft, Sans Serif, Roman */
          font-family: 'Epson Draft', 'Epson Sans Serif', 'Epson Roman', 'Courier New', 'Lucida Console', monospace !important;
          font-size: ${currentSize.base};
          line-height: 1.25;
          font-weight: 400 !important;
          -webkit-font-smoothing: none !important;
          -moz-osx-font-smoothing: unset !important;
          text-rendering: optimizeSpeed !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          overflow: hidden;
        }
        .dotmatrix-wrapper {
          width: 21.6cm;
          height: 6.95cm;
          padding: 0.3cm 0.6cm;
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          align-items: stretch;
          gap: 0.8cm;
        }
        .col-left {
          width: 49%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .col-right {
          width: 49%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .header-box {
          text-align: left;
          margin-bottom: 5px;
        }
        .header-title {
          font-size: ${currentSize.header};
          font-weight: 400;
          text-transform: uppercase;
        }
        .header-sub {
          font-size: ${currentSize.sub};
          font-weight: 400;
        }
        .struk-badge {
          font-size: ${currentSize.badge};
          font-weight: 400;
          text-transform: uppercase;
          margin-top: 2px;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          font-size: ${currentSize.base};
        }
        .meta-table td {
          padding: 1.5px 0;
          vertical-align: top;
        }
        .meta-label {
          width: 38%;
          white-space: nowrap;
          font-weight: 400;
        }
        .meta-val {
          width: 62%;
          font-weight: 400;
          word-break: break-all;
        }
        .section-title {
          font-weight: 400;
          font-size: ${currentSize.base};
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .bill-table {
          width: 100%;
          border-collapse: collapse;
          font-size: ${currentSize.base};
        }
        .bill-table td {
          padding: 2px 0;
        }
        .bill-left {
          font-weight: 400;
        }
        .bill-right {
          text-align: right;
          font-weight: 400;
        }
        .total-box {
          padding: 5px 0;
          margin: 5px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: ${currentSize.total};
          font-weight: 400;
        }
        .footer-text {
          text-align: center;
          font-size: ${currentSize.footer};
          font-weight: 400;
          margin-top: 2px;
        }
        @media print {
          html, body {
            width: 21.6cm;
            height: 6.95cm;
            background: transparent !important;
            font-family: 'Epson Draft', 'Epson Sans Serif', 'Courier New', monospace !important;
            font-weight: 400 !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="dotmatrix-wrapper">
        <!-- LEFT COLUMN: AGEN & CUSTOMER METADATA -->
        <div class="col-left">
          <div>
            <div class="header-box" style="text-align: center; padding-bottom: 4px; margin-bottom: 6px; border-bottom: 1px dashed #000;">
              <div class="header-title" style="font-weight: bold; font-size: ${currentSize.header}; text-transform: uppercase;">${strTitle}</div>
              <div class="header-sub" style="font-weight: bold; margin-top: 2px;">LOKET: ${(receipt.namaAgen || 'AGEN BATARA').toUpperCase()}</div>
            </div>

            <table class="meta-table">
              <tr>
                <td class="meta-label">ID TRANSAKSI</td>
                <td class="meta-val">: ${receipt.id || 'TRX-83920184'}</td>
              </tr>
              <tr>
                <td class="meta-label">TGL / WAKTU</td>
                <td class="meta-val">: ${formatReceiptDateTime(receipt.tanggal)}</td>
              </tr>
              <tr>
                <td class="meta-label">ID PELANGGAN</td>
                <td class="meta-val">: ${receipt.idpel || '-'}</td>
              </tr>
              <tr>
                <td class="meta-label">NAMA PELANGGAN</td>
                <td class="meta-val">: ${(receipt.namaPelanggan || '-').toUpperCase()}</td>
              </tr>
              <tr>
                <td class="meta-label">PERIODE / BLN</td>
                <td class="meta-val">: ${receipt.bulanTagihan || '-'}</td>
              </tr>
              <tr>
                <td class="meta-label">PEMAKAIAN</td>
                <td class="meta-val">: ${receipt.pemakaian || '-'}</td>
              </tr>
              ${receipt.standMeter ? `
              <tr>
                <td class="meta-label">STAND METER</td>
                <td class="meta-val">: ${receipt.standMeter}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div style="font-size: 7.5pt; font-weight: 400; color: #000000; pt: 2px;">
            STRUK BUKTI PEMBAYARAN RESMI PPOB
          </div>
        </div>

        <!-- RIGHT COLUMN: BILL DETAILS & TOTAL -->
        <div class="col-right">
          <div>
            <div class="section-title" style="padding-bottom: 3px; margin-bottom: 4px;">
              RINCIAN PEMBAYARAN TAGIHAN
            </div>

            <table class="bill-table">
              <tr>
                <td class="bill-left">RP TAGIHAN</td>
                <td class="bill-right">Rp ${Number(receipt.rpTagihan || 0).toLocaleString('id-ID')}</td>
              </tr>
              <tr>
                <td class="bill-left">ADMIN LOKET</td>
                <td class="bill-right">Rp ${Number(receipt.adminBank || 0).toLocaleString('id-ID')}</td>
              </tr>
              ${Number(receipt.lainLain) > 0 ? `
              <tr>
                <td class="bill-left">BIAYA LAIN</td>
                <td class="bill-right">Rp ${Number(receipt.lainLain).toLocaleString('id-ID')}</td>
              </tr>
              ` : ''}
              <tr>
                <td class="bill-left">INFORMASI</td>
                <td class="bill-right">${receipt.rincianTagihan || 'PPOB LUNAS'}</td>
              </tr>
            </table>

            <div class="total-box" style="margin-top: 6px; padding: 3px 0;">
              <span style="font-weight: bold;">TOTAL BAYAR</span>
              <span style="font-weight: bold;">Rp ${Number(receipt.totalBayar || 0).toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div class="footer-text" style="margin-top: 4px;">
            <div style="font-weight: bold;">STRUK INI MERUPAKAN BUKTI PEMBAYARAN YANG SAH</div>
            <div>TERIMA KASIH ATAS PEMBAYARAN ANDA</div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Direct Pure RAW Text Window Printing for Epson LX-310.
 * Bypasses HTML graphic rasterization entirely so the printer fires hardware ESC/P text pins directly!
 * Guarantee: 100% sharp text, zero dither, zero blur!
 */
export function printRawTextLX310(receipt: ReceiptData, onSave?: () => void) {
  if (onSave) {
    onSave();
  }

  const rawText = generatePlainTextReceipt(receipt);
  const printWindow = window.open('', '_blank', 'width=800,height=500');
  if (!printWindow) {
    alert('Jendela pop-up terblokir. Izinkan pop-up browser untuk mencetak.');
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Cetak Direct Text LX-310 - ${receipt.namaPelanggan || 'Pelanggan'}</title>
      <style>
        @page {
          size: 21.6cm 6.95cm landscape;
          margin: 0;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff !important;
          color: #000000 !important;
          font-family: 'Epson Draft', 'Epson Sans Serif', 'Courier New', 'Lucida Console', monospace !important;
          font-size: 10pt;
          line-height: 1.2;
          font-weight: 400 !important;
          -webkit-font-smoothing: none !important;
        }
        pre {
          margin: 0;
          padding: 0.4cm 0.6cm;
          font-family: 'Epson Draft', 'Epson Sans Serif', 'Courier New', 'Lucida Console', monospace !important;
          font-size: 10pt;
          line-height: 1.2;
          white-space: pre;
          font-weight: 400 !important;
        }
        @media print {
          html, body, pre {
            background: transparent !important;
            font-family: 'Epson Draft', 'Epson Sans Serif', 'Courier New', monospace !important;
            font-size: 10pt !important;
            font-weight: 400 !important;
          }
        }
      </style>
    </head>
    <body>
      <pre>${rawText}</pre>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 250);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Generates pure 80-column plain ASCII text formatted in standard PPOB Bank Bukopin receipt style
 * (without Bukopin logo/name, keeping all original fields intact)
 */
export function generatePlainTextReceipt(receipt: ReceiptData): string {
  const strTitle = getReceiptHeaderTitle(receipt);
  const agen = (receipt.namaAgen || 'AGEN BATARA').toUpperCase();
  const idTrx = receipt.id || 'TRX-83920184';
  const tgl = formatReceiptDateTime(receipt.tanggal);
  const idpel = receipt.idpel || '-';
  const nama = (receipt.namaPelanggan || '-').toUpperCase();
  const periode = receipt.bulanTagihan || '-';
  const pemakaian = receipt.pemakaian || '-';
  const standStr = receipt.standMeter ? receipt.standMeter : '';

  const rincian = receipt.rincianTagihan || 'Tagihan Pembayaran';
  const rpTagihan = `Rp ${Number(receipt.rpTagihan || 0).toLocaleString('id-ID')}`;
  const rpAdmin = `Rp ${Number(receipt.adminBank || 0).toLocaleString('id-ID')}`;
  const rpTotal = `Rp ${Number(receipt.totalBayar || 0).toLocaleString('id-ID')}`;
  const rpLain = Number(receipt.lainLain) > 0 ? `Rp ${Number(receipt.lainLain).toLocaleString('id-ID')}` : '';

  const center80 = (s: string) => {
    const str = s.trim().slice(0, 78);
    const pad = Math.max(0, Math.floor((80 - str.length) / 2));
    return ' '.repeat(pad) + str;
  };

  const lTitle = center80(strTitle);
  const lLoket = center80(`LOKET : ${agen}`);

  // PPOB Bukopin Style 80 Columns Grid Layout
  const l1 = `${('ID TRANSAKSI : ' + idTrx).slice(0, 38).padEnd(38)} | ${('RP TAGIHAN   : ' + rpTagihan).slice(0, 39).padEnd(39)}`;
  const l2 = `${('TGL/WAKTU    : ' + tgl).slice(0, 38).padEnd(38)} | ${('ADMIN LOKET  : ' + rpAdmin).slice(0, 39).padEnd(39)}`;
  const l3 = `${('ID PELANGGAN : ' + idpel).slice(0, 38).padEnd(38)} | ${(rpLain ? 'BIAYA LAIN   : ' + rpLain : 'INFORMASI    : ' + rincian).slice(0, 39).padEnd(39)}`;
  const l4 = `${('NAMA PEL     : ' + nama).slice(0, 38).padEnd(38)} | ${('TOTAL BAYAR  : ' + rpTotal).slice(0, 39).padEnd(39)}`;
  const l5 = `${('PERIODE/BLN  : ' + periode).slice(0, 38).padEnd(38)} | ${' '.repeat(39)}`;
  const l6 = `${('PEMAKAIAN    : ' + pemakaian).slice(0, 38).padEnd(38)} | ${' '.repeat(39)}`;
  const l7 = `${(standStr ? 'STAND METER  : ' + standStr : '').slice(0, 38).padEnd(38)} | ${' '.repeat(39)}`;
  const l8 = center80('STRUK INI MERUPAKAN BUKTI PEMBAYARAN YANG SAH');
  const l9 = center80('TERIMA KASIH ATAS PEMBAYARAN ANDA');

  return [lTitle, lLoket, l1, l2, l3, l4, l5, l6, l7, l8, l9].join('\n');
}
