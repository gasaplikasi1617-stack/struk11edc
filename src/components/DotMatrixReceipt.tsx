import React from 'react';
import { ReceiptData } from '../types';
import { terbilang } from '../utils/terbilang';

interface DotMatrixReceiptProps {
  receipt: ReceiptData;
  id?: string;
  showTractorHoles?: boolean;
}

export function generateDotMatrixText(receipt: ReceiptData): string {
  const line = "====================================================================================================";
  const dash = "----------------------------------------------------------------------------------------------------";
  const formatRupiah = (val: any) => Number(val || 0).toLocaleString('id-ID');
  const cleanRincian = (receipt.rincianTagihan || 'TAGIHAN PEMBAYARAN').toUpperCase();
  const dateStr = receipt.tanggal || new Date().toLocaleDateString('id-ID');
  const agentStr = (receipt.namaAgen || 'AGEN BATARA').toUpperCase();
  const rawDate = (receipt.tanggal || '').replace(/[^0-9]/g, '');
  const rawId = (receipt.idpel || '12345').replace(/[^0-9]/g, '');
  const refCode = (rawDate + rawId).slice(-16).padEnd(16, '8').toUpperCase();

  return [
    line,
    `[ PPOB RESMI ]                    STRUK PEMBAYARAN: ${cleanRincian}                    STATUS: LUNAS`,
    dash,
    `TGL/JAM: ${dateStr.padEnd(25, ' ')} LOKET: ${agentStr.padEnd(30, ' ')} NO REFF: ${refCode}`,
    dash,
    `IDPEL     : ${(receipt.idpel || '-').padEnd(20, ' ')} | STAND MTR : ${(receipt.standMeter || '-').padEnd(20, ' ')} | RP TAGIHAN: Rp ${formatRupiah(receipt.rpTagihan)}`,
    `NAMA      : ${(receipt.namaPelanggan || '-').toUpperCase().padEnd(20, ' ')} | PEMAKAIAN : ${(receipt.pemakaian || '-').padEnd(20, ' ')} | BIAYA LAIN: Rp ${Number(receipt.lainLain || 0) > 0 ? formatRupiah(receipt.lainLain) : '0'}`,
    `TRF/DY    : ${(receipt.tarifDaya || '-').padEnd(20, ' ')} | NO TELP/HP: ${(receipt.noHp || '-').padEnd(20, ' ')} | ADMIN BANK: Rp ${formatRupiah(receipt.adminBank)}`,
    `BL/TH     : ${(receipt.bulanTagihan || '-').padEnd(20, ' ')} | STATUS    : LUNAS                | TOTAL BYR : Rp ${formatRupiah(receipt.totalBayar)}`,
    dash,
    `TERBILANG : # ${terbilang(receipt.totalBayar)} #`,
    `* PLN/INSTANSI MENYATAKAN STRUK INI ADALAH BUKTI PEMBAYARAN YANG SAH & LUNAS *`,
    `INFO HUBUNGI CALL CENTER ATAU KANTOR LAYANAN TERDEKAT. TERIMA KASIH. ALAMAT: ${receipt.alamat || '-'}`,
    line
  ].join('\n');
}

export function DotMatrixReceipt({
  receipt,
  id = 'printable-dotmatrix-receipt',
  showTractorHoles = true,
}: DotMatrixReceiptProps) {
  const formatRupiah = (val: number | string | undefined): string => {
    const num = Number(val) || 0;
    return num.toLocaleString('id-ID');
  };

  const generateRef = () => {
    const rawDate = (receipt.tanggal || '').replace(/[^0-9]/g, '');
    const rawId = (receipt.idpel || '12345').replace(/[^0-9]/g, '');
    const seed = (rawDate + rawId).slice(-16);
    return seed.padEnd(16, '8').toUpperCase();
  };

  const refCode = generateRef();
  const terbilangText = terbilang(receipt.totalBayar);

  const cleanRincian = (receipt.rincianTagihan || 'TAGIHAN LISTRIK PLN')
    .replace(/^info\s*tagihan/i, '')
    .replace(/^tagihan/i, '')
    .trim()
    .toUpperCase();

  const isPln = /pln|listrik|token/i.test(receipt.rincianTagihan || '');
  const isPdam = /pdam|air/i.test(receipt.rincianTagihan || '');
  const isTelkom = /telkom|indihome|speedy/i.test(receipt.rincianTagihan || '');

  let serviceHeader = 'STRUK PEMBAYARAN TAGIHAN RESMI';
  if (isPln) serviceHeader = 'STRUK PEMBAYARAN TAGIHAN LISTRIK PLN';
  else if (isPdam) serviceHeader = 'STRUK PEMBAYARAN TAGIHAN AIR PDAM';
  else if (isTelkom) serviceHeader = 'STRUK PEMBAYARAN TAGIHAN TELEKOMUNIKASI';

  return (
    <div className="relative inline-block w-full max-w-[860px] mx-auto select-text font-mono">
      {/* Tractor feed holes for on-screen continuous paper simulation */}
      <div
        className={`relative bg-[#fcfbf7] text-[#000000] border border-slate-300 rounded-md shadow-md overflow-hidden ${
          showTractorHoles ? 'px-6 py-2 sm:px-8' : 'px-3 py-2'
        }`}
        style={{
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          fontFamily: '"Courier New", Courier, "Lucida Console", Monaco, monospace',
        }}
      >
        {/* Left Tractor Feed Margin (Screen only) */}
        {showTractorHoles && (
          <div className="absolute left-1.5 top-0 bottom-0 flex flex-col justify-between py-2 pointer-events-none select-none print:hidden opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`left-hole-${i}`}
                className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-white"
              />
            ))}
          </div>
        )}

        {/* Right Tractor Feed Margin (Screen only) */}
        {showTractorHoles && (
          <div className="absolute right-1.5 top-0 bottom-0 flex flex-col justify-between py-2 pointer-events-none select-none print:hidden opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`right-hole-${i}`}
                className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-white"
              />
            ))}
          </div>
        )}

        {/* PRINTABLE BOX (Exact Continuous Form layout container with High-Speed Draft Font #9) */}
        <div
          id={id}
          className="dotmatrix-content-box w-full text-black text-[9pt] leading-[1.2] tracking-tight print:text-[9pt] print:leading-[1.18]"
          style={{
            color: '#000000',
            fontSize: '9pt',
            fontFamily: '"Courier New", Courier, monospace',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          {/* Top Divider */}
          <div className="text-center font-bold tracking-tighter text-slate-800 print:text-black overflow-hidden whitespace-nowrap text-[9pt] leading-none mb-1">
            ====================================================================================================
          </div>

          {/* Header 1: Service Title (No Bukopin) */}
          <div
            className="flex justify-between items-center text-[9pt] font-bold uppercase tracking-wider mb-0.5"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}
          >
            <span style={{ fontWeight: 'bold' }}>[PPOB RESMI]</span>
            <span style={{ textAlign: 'center', fontWeight: 'bold' }}>
              {serviceHeader}
            </span>
            <span style={{ textAlign: 'right', fontWeight: 'bold' }}>
              STATUS: LUNAS
            </span>
          </div>

          {/* Header 2: Metadata Bar (Tanggal, Loket, No Reff) */}
          <div
            className="flex justify-between text-[9pt] font-semibold border-b border-dashed border-black pb-1 mb-1 text-slate-900 print:text-black"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderBottom: '1px dashed #000000',
              paddingBottom: '3px',
              marginBottom: '3px',
            }}
          >
            <div>
              <span>TGL/JAM: </span>
              <span style={{ fontWeight: 'bold' }}>{receipt.tanggal || '-'}</span>
            </div>
            <div>
              <span>LOKET: </span>
              <span style={{ fontWeight: 'bold' }}>{(receipt.namaAgen || 'AGEN BATARA').toUpperCase()}</span>
            </div>
            <div>
              <span>NO REFF: </span>
              <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{refCode}</span>
            </div>
          </div>

          {/* 3-Column Content Grid */}
          <div
            className="text-[9pt] leading-tight my-1"
            style={{
              display: 'flex',
              width: '100%',
              margin: '3px 0',
              fontSize: '9pt',
              lineHeight: 1.2,
            }}
          >
            {/* Column 1: Customer Data */}
            <div
              style={{
                flex: '1 1 33.3%',
                paddingRight: '6px',
                borderRight: '1px dashed #666666',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>IDPEL</span>
                <span style={{ fontWeight: 'bold' }}>: {receipt.idpel || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>NAMA</span>
                <span style={{ fontWeight: 'bold', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={receipt.namaPelanggan}>
                  : {(receipt.namaPelanggan || '-').toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>TRF/DY</span>
                <span style={{ fontWeight: 'bold' }}>: {receipt.tarifDaya || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>BL/TH</span>
                <span style={{ fontWeight: 'bold' }}>: {receipt.bulanTagihan || '-'}</span>
              </div>
            </div>

            {/* Column 2: Meter & Usage Details */}
            <div
              style={{
                flex: '1 1 33.3%',
                padding: '0 6px',
                borderRight: '1px dashed #666666',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>LAYANAN</span>
                <span style={{ fontWeight: 'bold', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cleanRincian}>
                  : {cleanRincian}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>STAND MTR</span>
                <span style={{ fontWeight: 'bold' }}>: {receipt.standMeter || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>PEMAKAIAN</span>
                <span style={{ fontWeight: 'bold' }}>: {receipt.pemakaian || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>NO HP/TELP</span>
                <span style={{ fontWeight: 'bold' }}>: {receipt.noHp || '-'}</span>
              </div>
            </div>

            {/* Column 3: Payment Breakdown */}
            <div
              style={{
                flex: '1 1 33.3%',
                paddingLeft: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>RP TAGIHAN</span>
                <span style={{ fontWeight: 'bold' }}>: Rp {formatRupiah(receipt.rpTagihan)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>BIAYA LAIN</span>
                <span style={{ fontWeight: 'bold' }}>: Rp {Number(receipt.lainLain || 0) > 0 ? formatRupiah(receipt.lainLain) : '0'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ADMIN BANK</span>
                <span style={{ fontWeight: 'bold' }}>: Rp {formatRupiah(receipt.adminBank)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #000000',
                  paddingTop: '2px',
                  marginTop: '2px',
                  fontWeight: 'bold',
                  fontSize: '9pt',
                }}
              >
                <span>TOTAL BAYAR</span>
                <span>: Rp {formatRupiah(receipt.totalBayar)}</span>
              </div>
            </div>
          </div>

          {/* Middle Divider */}
          <div className="text-center font-bold tracking-tighter text-slate-800 print:text-black overflow-hidden whitespace-nowrap text-[9pt] leading-none my-0.5">
            ----------------------------------------------------------------------------------------------------
          </div>

          {/* Terbilang Row */}
          <div className="text-[9pt] font-bold tracking-tight text-slate-900 print:text-black truncate">
            <span>TERBILANG : </span>
            <span className="uppercase italic"># {terbilangText} #</span>
          </div>

          {/* Footer Notice & Certification */}
          <div className="text-[9pt] leading-tight text-slate-800 print:text-black mt-0.5 space-y-0.5">
            <div className="flex justify-between items-center">
              <span>* PLN/INSTANSI MENYATAKAN STRUK INI SEBAGAI BUKTI PEMBAYARAN YANG SAH & LUNAS *</span>
              <span className="font-mono text-[9pt]">KODE: PPOB-OK</span>
            </div>
            <div className="flex justify-between text-[9pt] text-slate-600 print:text-black">
              <span>
                INFO HUBUNGI CALL CENTER ATAU KANTOR LAYANAN TERDEKAT. TERIMA KASIH.
              </span>
              <span className="truncate max-w-[200px]">
                {receipt.alamat ? `ALAMAT: ${receipt.alamat}` : ''}
              </span>
            </div>
          </div>

          {/* Bottom Divider */}
          <div className="text-center font-bold tracking-tighter text-slate-800 print:text-black overflow-hidden whitespace-nowrap text-[9pt] leading-none mt-1">
            ====================================================================================================
          </div>
        </div>
      </div>
    </div>
  );
}

