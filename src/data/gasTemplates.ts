export interface GasScriptData {
  codeGs: string;
  indexHtml: string;
  instructions: string[];
}

export const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzDItaqK1ZwUEJZfXdYwdlB5FG4pL-eONdVxawEBFImbZxd0psRHFKfaF3ZDX7zJFk/exec';

export const DEFAULT_GAS_DATA: GasScriptData = {
  codeGs: `/**
 * Google Apps Script - Backend Code.gs untuk Sistem Cetak Resi Tagihan & Google Sheets
 * Agen Batara - Bekasi
 * Mendukung Sinkronisasi 2 Arah Penuh (Two-Way Sync Web App <-> Google Sheets)
 */

// 1. Tangani Request GET (Browser View atau API Read)
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
    var format = (e && e.parameter && e.parameter.format) ? String(e.parameter.format) : "";

    // Tes Koneksi (Ping)
    if (action === "ping" || action === "test") {
      return jsonResponse({
        success: true,
        status: "online",
        message: "Google Apps Script Web App Terhubung Aktif!",
        timestamp: new Date().toISOString()
      });
    }

    // Ambil Data Transaksi untuk Sinkronisasi ke Web App
    if (action === "getTransactions" || action === "pull" || action === "read" || format === "json") {
      var data = getLastTransactions();
      return jsonResponse({
        success: true,
        count: data.length,
        data: data
      });
    }

    // Tampilkan Web App Frontend jika dibuka langsung di Browser
    try {
      return HtmlService.createHtmlOutputFromFile('Index')
          .setTitle('Cetak Resi Tagihan - Agen Batara')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (htmlErr) {
      // Fallback aman jika file Index.html belum dibuat oleh pengguna
      var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>API Resi Agen Batara</title><style>body{font-family:system-ui,sans-serif;padding:40px;background:#f8fafc;color:#1e293b;text-align:center;} .box{max-width:540px;margin:30px auto;background:#fff;padding:28px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;} .badge{background:#dcfce7;color:#166534;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:14px;}</style></head><body><div class="box"><span class="badge">● Web App Google Apps Script Online</span><h2 style="margin:0 0 10px;color:#1e40af;">API Backend Resi Agen Batara</h2><p style="font-size:14px;color:#64748b;line-height:1.6;">Endpoint ini aktif dan siap menerima sinkronisasi data transaksi 2 arah dari aplikasi cetak resi.</p></div></body></html>';
      return HtmlService.createHtmlOutput(html)
          .setTitle('API Resi Agen Batara - Online')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 2. Tangani Request POST (API Sinkronisasi 2 Arah & Simpan Data)
function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = { text: e.postData.contents };
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    var action = payload.action || (e && e.parameter ? e.parameter.action : "");

    // Tes Koneksi (Ping via POST)
    if (action === "ping" || action === "test") {
      return jsonResponse({
        success: true,
        status: "online",
        message: "Koneksi POST Google Apps Script Aktif!"
      });
    }

    // SINKRONISASI 2 ARAH (Two-Way Sync):
    if (action === "twoWaySync" || action === "syncTransactions") {
      var incomingTxs = payload.transactions || payload.data || [];
      var result = syncTwoWayTransactions(incomingTxs);
      return jsonResponse(result);
    }

    // Ambil Transaksi
    if (action === "getTransactions" || action === "pull") {
      var allData = getLastTransactions();
      return jsonResponse({ success: true, count: allData.length, data: allData });
    }

    // Simpan Transaksi Tunggal
    if (action === "saveTransaction") {
      var txData = payload.data || payload;
      var saveRes = saveTransaction(txData);
      return jsonResponse(saveRes);
    }

    // Hapus Transaksi
    if (action === "deleteTransaction") {
      var txId = payload.id || (e && e.parameter ? e.parameter.id : null);
      var delRes = deleteTransactionRow(txId);
      return jsonResponse(delRes);
    }

    // Fallback: jika payload langsung berupa objek transaksi
    if (payload.idpel || payload.namaPelanggan) {
      var directRes = saveTransaction(payload);
      return jsonResponse(directRes);
    }

    return jsonResponse({ success: false, error: "Aksi tidak dikenali: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// Helper JSON Response
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Inisialisasi Sheet "RiwayatTransaksi" dengan Header Rapi
function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RiwayatTransaksi");
  if (!sheet) {
    sheet = ss.insertSheet("RiwayatTransaksi");
    var headers = [
      "ID Transaksi", "Tanggal", "ID Pelanggan", "Nama Pelanggan", 
      "Pemakaian", "Stand Meter", "Rincian Tagihan", "Bulan Tagihan", 
      "Rp Tagihan", "Lain-Lain", "Admin Bank", "Total Bayar", 
      "Nama Agen", "Alamat", "No HP", "Created At"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#1e40af")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Simpan 1 Transaksi ke Sheet
function saveTransaction(data) {
  var sheet = getOrCreateSheet();
  var txId = data.id || ("TX-" + new Date().getTime());
  
  // Cek jika ID sudah ada untuk mencegah duplikasi
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === txId) {
        return { success: true, txId: txId, note: "Transaksi sudah ada (skip duplikasi)" };
      }
    }
  }

  var rowData = [
    txId,
    data.tanggal || new Date().toLocaleDateString("id-ID"),
    data.idpel || "",
    data.namaPelanggan || "",
    data.pemakaian || "",
    data.standMeter || "",
    data.rincianTagihan || "",
    data.bulanTagihan || "",
    Number(data.rpTagihan) || 0,
    Number(data.lainLain) || 0,
    Number(data.adminBank) || 0,
    Number(data.totalBayar) || 0,
    data.namaAgen || "Agen Batara",
    data.alamat || "Bekasi",
    data.noHp || "-",
    data.createdAt || new Date().toISOString()
  ];

  sheet.appendRow(rowData);
  return { success: true, txId: txId };
}

// Fungsi Inti Sinkronisasi 2 Arah (Two-Way Sync)
function syncTwoWayTransactions(incomingList) {
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  
  // 1. Kumpulkan ID & Signature yang sudah ada di Sheet
  var existingIds = {};
  var existingSignatures = {};
  
  if (lastRow > 1) {
    var rangeValues = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    for (var r = 0; r < rangeValues.length; r++) {
      var row = rangeValues[r];
      var rId = String(row[0] || "").trim();
      var rTgl = String(row[1] || "").trim();
      var rIdpel = String(row[2] || "").trim();
      var rBulan = String(row[7] || "").trim();
      var rTotal = Number(row[11]) || 0;
      
      if (rId) existingIds[rId] = true;
      var sig = (rIdpel + "|" + rBulan + "|" + rTotal + "|" + rTgl).toLowerCase();
      existingSignatures[sig] = true;
    }
  }

  // 2. Masukkan data baru dari web app yang belum ada di Sheet
  var insertedCount = 0;
  if (Array.isArray(incomingList) && incomingList.length > 0) {
    var rowsToAdd = [];
    for (var i = 0; i < incomingList.length; i++) {
      var item = incomingList[i];
      var txId = item.id || ("TX-" + new Date().getTime() + "-" + i);
      var sig = (String(item.idpel||"") + "|" + String(item.bulanTagihan||"") + "|" + Number(item.totalBayar||0) + "|" + String(item.tanggal||"")).toLowerCase();
      
      if (existingIds[txId] || existingSignatures[sig]) {
        continue; // Sudah ada di sheet, lewati
      }

      existingIds[txId] = true;
      existingSignatures[sig] = true;

      rowsToAdd.push([
        txId,
        item.tanggal || new Date().toLocaleDateString("id-ID"),
        item.idpel || "",
        item.namaPelanggan || "",
        item.pemakaian || "",
        item.standMeter || "",
        item.rincianTagihan || "",
        item.bulanTagihan || "",
        Number(item.rpTagihan) || 0,
        Number(item.lainLain) || 0,
        Number(item.adminBank) || 0,
        Number(item.totalBayar) || 0,
        item.namaAgen || "Agen Batara",
        item.alamat || "Bekasi",
        item.noHp || "-",
        item.createdAt || new Date().toISOString()
      ]);
      insertedCount++;
    }

    if (rowsToAdd.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 16).setValues(rowsToAdd);
    }
  }

  // 3. Ambil data gabungan terkini dari Sheet untuk dikembalikan ke web app
  var allCurrent = getLastTransactions();

  return {
    success: true,
    pushedToSheet: insertedCount,
    totalInSheet: allCurrent.length,
    data: allCurrent,
    timestamp: new Date().toISOString()
  };
}

// Ambil Transaksi Terakhir dari Sheet (hingga 100 terakhir)
function getLastTransactions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RiwayatTransaksi");
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var startRow = Math.max(2, lastRow - 99);
  var numRows = lastRow - startRow + 1;
  var numCols = Math.min(sheet.getLastColumn(), 16);
  var values = sheet.getRange(startRow, 1, numRows, numCols).getValues();
  
  var headers = [
    "id", "tanggal", "idpel", "namaPelanggan", "pemakaian", 
    "standMeter", "rincianTagihan", "bulanTagihan", "rpTagihan", 
    "lainLain", "adminBank", "totalBayar", "namaAgen", "alamat", "noHp", "createdAt"
  ];
  
  var result = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j] !== undefined ? values[i][j] : "";
    }
    result.push(obj);
  }
  
  return result;
}

// Hapus Baris Transaksi Berdasarkan ID
function deleteTransactionRow(id) {
  if (!id) return { success: false, error: "ID tidak valid" };
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: "Sheet kosong" };

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: "Transaksi dengan ID tersebut tidak ditemukan di sheet" };
}

// Fungsi Uji Coba Langsung di Editor Apps Script
function testInitAndPing() {
  var sheet = getOrCreateSheet();
  Logger.log("Sheet berhasil disiapkan: " + sheet.getName());
  var res = doGet({ parameter: { action: "ping" } });
  Logger.log("Hasil Ping: " + res.getContent());
}
`,
  indexHtml: `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <title>Cetak Resi Tagihan - Agen Batara</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 p-4 font-sans">
  <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-6">
    <div class="flex items-center justify-between border-b pb-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-blue-600">Cetak Resi Tagihan - Agen Batara</h1>
        <p class="text-xs text-slate-500 mt-1">Web App Google Apps Script terintegrasi Google Sheets & Sinkronisasi 2 Arah.</p>
      </div>
      <span class="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
        ● Google Sheets Aktif
      </span>
    </div>
    
    <!-- Form & Paste Area -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm font-semibold mb-1">Paste Teks Mentah Struk / Tagihan</label>
        <textarea id="rawText" rows="6" class="w-full border border-slate-300 rounded-lg p-3 text-xs focus:ring-2 focus:ring-blue-500 font-mono" placeholder="Paste data tagihan PLN, PDAM, Indihome, BPJS di sini..."></textarea>
        <button onclick="parseText()" class="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all">Parse Otomatis</button>
      </div>
      <div>
        <h2 class="text-sm font-semibold mb-2">Pengaturan Agen</h2>
        <div class="space-y-3 text-xs">
          <div>
            <label class="block text-slate-500 mb-1">Nama Agen</label>
            <input type="text" id="namaAgen" value="Agen Batara" class="w-full border border-slate-300 rounded p-2">
          </div>
          <div>
            <label class="block text-slate-500 mb-1">Alamat</label>
            <input type="text" id="alamat" value="Bekasi" class="w-full border border-slate-300 rounded p-2">
          </div>
          <div>
            <label class="block text-slate-500 mb-1">No. HP / WA</label>
            <input type="text" id="noHp" value="081234567890" class="w-full border border-slate-300 rounded p-2">
          </div>
        </div>
      </div>
    </div>

    <!-- Data Detail Resi -->
    <div class="mt-6 border-t pt-5">
      <h3 class="font-bold text-base mb-3 text-slate-800">Rincian Data Resi</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div><label class="block text-slate-500 mb-0.5">Tanggal</label><input type="text" id="tanggal" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">ID Pelanggan</label><input type="text" id="idpel" class="w-full border rounded p-2 font-mono"></div>
        <div><label class="block text-slate-500 mb-0.5">Nama Pelanggan</label><input type="text" id="namaPelanggan" class="w-full border rounded p-2 font-semibold"></div>
        <div><label class="block text-slate-500 mb-0.5">Pemakaian</label><input type="text" id="pemakaian" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Stand Meter</label><input type="text" id="standMeter" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Bulan Tagihan</label><input type="text" id="bulanTagihan" class="w-full border rounded p-2"></div>
        <div class="sm:col-span-3"><label class="block text-slate-500 mb-0.5">Rincian Tagihan</label><input type="text" id="rincianTagihan" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Rp Tagihan (Rp)</label><input type="number" id="rpTagihan" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Lain-Lain (Rp)</label><input type="number" id="lainLain" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Admin Bank (Rp)</label><input type="number" id="adminBank" oninput="calcTotal()" class="w-full border rounded p-2"></div>
      </div>
      <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
        <span class="font-bold text-blue-900 text-sm">Total Bayar:</span>
        <span id="totalBayarDisp" class="text-lg font-extrabold text-blue-700">Rp 0</span>
      </div>
      <div class="mt-5 flex gap-3">
        <button onclick="saveAndPrint()" class="bg-emerald-600 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm">Simpan ke Sheets & Cetak</button>
        <button onclick="window.print()" class="bg-slate-700 text-white px-5 py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 shadow-sm">Cetak Langsung (A6)</button>
      </div>
    </div>

    <!-- Riwayat Terakhir dari Google Sheets -->
    <div class="mt-8 border-t pt-5">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-base text-slate-800">Riwayat Tersimpan di Google Sheet</h3>
        <button onclick="loadHistory()" class="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium">⟳ Segarkan</button>
      </div>
      <div id="historyList" class="space-y-2 max-h-60 overflow-y-auto text-xs">
        <p class="text-slate-400">Memuat data dari Google Sheets...</p>
      </div>
    </div>
  </div>

  <script>
    function parseText() {
      const text = document.getElementById('rawText').value;
      if (!text) { alert('Masukkan teks terlebih dahulu!'); return; }
      const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
      document.getElementById('tanggal').value = new Date().toLocaleDateString('id-ID');
      document.getElementById('namaPelanggan').value = lines[0] ? lines[0].toUpperCase() : 'PELANGGAN';
      document.getElementById('idpel').value = '1234567890';
      document.getElementById('rpTagihan').value = '100000';
      document.getElementById('adminBank').value = '2500';
      document.getElementById('lainLain').value = '0';
      document.getElementById('rincianTagihan').value = 'Tagihan Pembayaran';
      document.getElementById('bulanTagihan').value = 'SEP26';
      calcTotal();
    }

    function calcTotal() {
      const rp = Number(document.getElementById('rpTagihan').value) || 0;
      const lain = Number(document.getElementById('lainLain').value) || 0;
      const admin = Number(document.getElementById('adminBank').value) || 0;
      const total = rp + lain + admin;
      document.getElementById('totalBayarDisp').innerText = 'Rp ' + total.toLocaleString('id-ID');
    }

    function saveAndPrint() {
      const data = {
        tanggal: document.getElementById('tanggal').value,
        idpel: document.getElementById('idpel').value,
        namaPelanggan: document.getElementById('namaPelanggan').value,
        pemakaian: document.getElementById('pemakaian').value,
        standMeter: document.getElementById('standMeter').value,
        rincianTagihan: document.getElementById('rincianTagihan').value,
        bulanTagihan: document.getElementById('bulanTagihan').value,
        rpTagihan: Number(document.getElementById('rpTagihan').value) || 0,
        lainLain: Number(document.getElementById('lainLain').value) || 0,
        adminBank: Number(document.getElementById('adminBank').value) || 0,
        totalBayar: (Number(document.getElementById('rpTagihan').value)||0) + (Number(document.getElementById('lainLain').value)||0) + (Number(document.getElementById('adminBank').value)||0),
        namaAgen: document.getElementById('namaAgen').value,
        alamat: document.getElementById('alamat').value,
        noHp: document.getElementById('noHp').value
      };
      google.script.run.withSuccessHandler(function(res) {
        alert('Resi berhasil disimpan ke Google Sheets!');
        loadHistory();
        window.print();
      }).saveTransaction(data);
    }

    function loadHistory() {
      google.script.run.withSuccessHandler(function(txs) {
        const list = document.getElementById('historyList');
        if (!txs || txs.length === 0) {
          list.innerHTML = '<p class="text-slate-400">Belum ada riwayat transaksi di Google Sheets.</p>';
          return;
        }
        let html = '<table class="w-full text-left border-collapse"><thead><tr class="bg-slate-100 text-xs text-slate-700"> <th class="p-2">ID</th> <th class="p-2">Tanggal</th> <th class="p-2">IDPEL</th> <th class="p-2">Pelanggan</th> <th class="p-2">Total</th> </tr></thead><tbody>';
        txs.slice(0, 50).forEach(t => {
          html += '<tr class="border-b hover:bg-slate-50"><td class="p-2 font-mono text-[11px]">' + (t.id || '-') + '</td><td class="p-2">' + (t.tanggal || '-') + '</td><td class="p-2 font-mono">' + (t.idpel || '-') + '</td><td class="p-2 font-medium">' + (t.namaPelanggan || '-') + '</td><td class="p-2 font-semibold text-blue-700">Rp ' + Number(t.totalBayar || 0).toLocaleString('id-ID') + '</td></tr>';
        });
        html += '</tbody></table>';
        list.innerHTML = html;
      }).getLastTransactions();
    }

    window.onload = function() {
      calcTotal();
      loadHistory();
    };
  </script>
</body>
</html>
`,
  instructions: [
    "1. Buka Google Sheets baru di Google Drive Anda (beri nama misalnya 'Database Resi Agen Batara').",
    "2. Di menu atas, klik Extensions > Apps Script (Ekstensi > Apps Script).",
    "3. Hapus seluruh isi default di file Code.gs, lalu salin (paste) kode Code.gs di tab ini.",
    "4. (PENTING) Di toolbar atas Apps Script, pilih fungsi 'testInitAndPing' lalu klik tombol 'Run' (Jalankan) sekali. Klik 'Review permissions' > pilih akun Google > klik 'Advanced' (Lanjutan) > klik 'Go to [Nama Project] (unsafe)' > 'Allow' (Izinkan). Ini wajib agar Google mengaktifkan izin akses database Sheets.",
    "5. (Opsional) Klik ikon (+) di sebelah Files > pilih HTML > beri nama Index > paste kode Index.html.",
    "6. Di pojok kanan atas, klik tombol biru Deploy > New deployment (Terapkan > Penerapan baru).",
    "7. Klik ikon roda gigi (Select type), pilih Web app (Aplikasi web).",
    "8. Atur Execute as: Me (email akun Google Anda).",
    "9. Atur Who has access: Anyone (Siapa saja — WAJIB 'Anyone' agar tidak terblokir login Google).",
    "10. Klik Deploy, salin Web App URL yang berakhiran /exec.",
    "11. Tempel Web App URL tersebut ke form di atas, lalu klik 'Simpan URL' atau 'Uji Koneksi'!"
  ]
};
