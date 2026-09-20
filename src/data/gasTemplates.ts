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
 * Versi: 2.5 (Super Robust - Two-Way Sync + Auto Database Setup)
 */

// ==========================================
// PENGATURAN DATABASE SPREADSHEET
// ==========================================
// Jika script ini dibuat dari Google Sheets (menu Ekstensi > Apps Script), biarkan kosong "".
// Jika script dibuat standalone dari script.google.com, Anda bisa menempelkan Link Spreadsheet atau ID Spreadsheet di sini.
var SPREADSHEET_ID_OR_URL = "";

// Helper untuk mendapatkan Google Spreadsheet secara otomatis & aman
function getSpreadsheet() {
  var ss = null;

  // 1. Coba ambil spreadsheet yang terhubung (Bound Script)
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}

  // 2. Coba ambil dari variabel SPREADSHEET_ID_OR_URL jika diisi
  if (SPREADSHEET_ID_OR_URL && SPREADSHEET_ID_OR_URL.trim() !== "") {
    var rawInput = SPREADSHEET_ID_OR_URL.trim();
    try {
      if (rawInput.indexOf("http") === 0) {
        ss = SpreadsheetApp.openByUrl(rawInput);
      } else {
        ss = SpreadsheetApp.openById(rawInput);
      }
      if (ss) return ss;
    } catch (e1) {
      // Coba ekstrak ID dari URL jika format URL panjang
      var idMatch = rawInput.match(/\\/d\\/([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        try {
          ss = SpreadsheetApp.openById(idMatch[1]);
          if (ss) return ss;
        } catch (e2) {}
      }
    }
  }

  // 3. Coba ambil ID dari ScriptProperties jika pernah disimpan sebelumnya
  try {
    var props = PropertiesService.getScriptProperties();
    var savedId = props.getProperty("DB_SPREADSHEET_ID");
    if (savedId) {
      ss = SpreadsheetApp.openById(savedId);
      if (ss) return ss;
    }
  } catch (e3) {}

  // 4. Fallback Cerdas: Buatkan file Google Spreadsheet baru di Google Drive
  try {
    ss = SpreadsheetApp.create("Database Resi Agen Batara");
    PropertiesService.getScriptProperties().setProperty("DB_SPREADSHEET_ID", ss.getId());
    Logger.log("Berhasil membuat Spreadsheet baru: " + ss.getUrl());
    return ss;
  } catch (e4) {
    throw new Error("Gagal mengakses atau membuat Spreadsheet: " + e4.toString());
  }
}

// Inisialisasi Sheet "RiwayatTransaksi" dengan Header Rapi & Otomatis
function getOrCreateSheet(customSs) {
  var ss = customSs || getSpreadsheet();
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

    // Format kolom angka
    sheet.getRange("I2:L").setNumberFormat("#,##0");
  }

  return sheet;
}

// 1. Tangani Request GET (Browser View, API Read, atau Setup)
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : "";
    var format = (e && e.parameter && e.parameter.format) ? String(e.parameter.format).trim() : "";

    // Inisialisasi / Setup Database
    if (action === "setup" || action === "setupDatabase" || action === "init") {
      var setupRes = setupDatabase();
      return jsonResponse(setupRes);
    }

    // Tes Koneksi (Ping)
    if (action === "ping" || action === "test") {
      var ssInfo = null;
      try {
        var s = getSpreadsheet();
        ssInfo = { name: s.getName(), url: s.getUrl() };
      } catch (errSs) {}

      return jsonResponse({
        success: true,
        status: "online",
        message: "Google Apps Script Web App Terhubung Aktif!",
        spreadsheet: ssInfo,
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
      return HtmlService.createHtmlOutput(getFallbackIndexHtml())
          .setTitle('Cetak Resi Tagihan - Agen Batara (Web App)')
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 2. Tangani Request POST (API Sinkronisasi 2 Arah, Simpan, Hapus & Setup)
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

    // Setup Database via POST
    if (action === "setup" || action === "setupDatabase" || action === "init") {
      var setupRes = setupDatabase();
      return jsonResponse(setupRes);
    }

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

// Fungsi Inisialisasi Database Lengkap
function setupDatabase() {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet(ss);
  
  var headers = [
    "ID Transaksi", "Tanggal", "ID Pelanggan", "Nama Pelanggan", 
    "Pemakaian", "Stand Meter", "Rincian Tagihan", "Bulan Tagihan", 
    "Rp Tagihan", "Lain-Lain", "Admin Bank", "Total Bayar", 
    "Nama Agen", "Alamat", "No HP", "Created At"
  ];
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#1e40af")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  return {
    success: true,
    message: "Database Google Sheet berhasil disiapkan dan siap digunakan!",
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: sheet.getName(),
    totalRecords: Math.max(0, sheet.getLastRow() - 1),
    timestamp: new Date().toISOString()
  };
}

// Menu Otomatis jika dibuka langsung di Google Spreadsheet
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Agen Batara")
      .addItem("⚙️ Setup / Inisialisasi Database", "setupDatabase")
      .addItem("🧪 Tes Koneksi (Ping)", "testInitAndPing")
      .addToUi();
  } catch (e) {}
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
      if (String(ids[i][0]) === String(txId)) {
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
    var rangeValues = sheet.getRange(2, 1, lastRow - 1, Math.min(sheet.getLastColumn(), 12)).getValues();
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

// Ambil Transaksi Terakhir dari Sheet (hingga 1000 data)
function getLastTransactions() {
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var startRow = Math.max(2, lastRow - 999);
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
  if (lastRow <= 1) return { success: false, error: "Sheet masih kosong" };

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return { success: true, deletedId: id };
    }
  }
  return { success: false, error: "Transaksi ID " + id + " tidak ditemukan di Sheet" };
}

// Fungsi Uji Coba Langsung di Editor Apps Script
function testInitAndPing() {
  var ss = getSpreadsheet();
  var res = setupDatabase();
  Logger.log("=== PENGUJIAN DATABASE BERHASIL ===");
  Logger.log("Spreadsheet Nama: " + res.spreadsheetName);
  Logger.log("Spreadsheet URL: " + res.spreadsheetUrl);
  Logger.log("Total Transaksi: " + res.totalRecords);
  return res;
}

// Fallback HTML jika Index.html tidak dibuat
function getFallbackIndexHtml() {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cetak Resi Tagihan - Agen Batara</title><style>body{font-family:system-ui,sans-serif;padding:30px;background:#f8fafc;color:#1e293b;text-align:center;} .card{max-width:540px;margin:20px auto;background:#fff;padding:28px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;} .badge{background:#dcfce7;color:#166534;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:14px;}</style></head><body><div class="card"><span class="badge">● Web App Google Apps Script Online</span><h2 style="margin:0 0 8px;color:#1e40af;">API Backend Resi Agen Batara</h2><p style="font-size:14px;color:#64748b;line-height:1.6;">Layanan sinkronisasi 2 arah aktif dan terhubung ke Google Sheets.</p></div></body></html>';
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
  <div class="max-w-5xl mx-auto bg-white rounded-xl shadow-md p-6 border border-slate-200">
    
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 mb-6 gap-3">
      <div>
        <h1 class="text-2xl font-bold text-blue-700">Cetak Resi Tagihan — Agen Batara</h1>
        <p class="text-xs text-slate-500 mt-1">Web App Google Apps Script & Sinkronisasi 2 Arah Google Sheets</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="runDatabaseSetup()" id="btnSetup" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-all">
          ⚙️ Inisialisasi Database
        </button>
        <span id="statusBadge" class="bg-emerald-100 text-emerald-800 text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1">
          ● Google Sheets Siap
        </span>
      </div>
    </div>

    <!-- Alert / Notifikasi -->
    <div id="alertBox" class="hidden mb-4 p-3 rounded-lg text-xs font-medium border"></div>

    <!-- Grid Input Struk & Profil Agen -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Paste Teks Struk / Tagihan (PLN, PDAM, Indihome, BPJS)</label>
        <textarea id="rawText" rows="6" class="w-full border border-slate-300 rounded-lg p-3 text-xs focus:ring-2 focus:ring-blue-500 font-mono bg-white" placeholder="Contoh:\n541293847210\nBUDI SANTOSO\nR1/900VA\nBLN: AGU26\nRP TAGIHAN: 150000\nADMIN: 2500\nTOTAL: 152500"></textarea>
        <button onclick="parseText()" class="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all">
          ⚡ Parse Data Struk Otomatis
        </button>
      </div>
      <div>
        <h2 class="text-xs font-bold text-slate-700 mb-2">Pengaturan Identitas Agen</h2>
        <div class="space-y-2 text-xs">
          <div>
            <label class="block text-slate-500 mb-0.5">Nama Agen</label>
            <input type="text" id="namaAgen" value="Agen Batara" class="w-full border border-slate-300 rounded p-2 bg-white font-medium">
          </div>
          <div>
            <label class="block text-slate-500 mb-0.5">Alamat / Lokasi</label>
            <input type="text" id="alamat" value="Bekasi" class="w-full border border-slate-300 rounded p-2 bg-white">
          </div>
          <div>
            <label class="block text-slate-500 mb-0.5">No. WhatsApp / HP</label>
            <input type="text" id="noHp" value="081234567890" class="w-full border border-slate-300 rounded p-2 bg-white">
          </div>
        </div>
      </div>
    </div>

    <!-- Data Detail Form Resi -->
    <div class="mt-6 border-t pt-5">
      <h3 class="font-bold text-sm mb-3 text-slate-800 flex items-center justify-between">
        <span>Rincian Tagihan Resi</span>
        <span class="text-xs font-normal text-slate-400">Siap dicetak & disimpan ke database</span>
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div><label class="block text-slate-500 mb-0.5">Tanggal</label><input type="text" id="tanggal" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">ID Pelanggan (IDPEL)</label><input type="text" id="idpel" class="w-full border rounded p-2 font-mono font-semibold"></div>
        <div><label class="block text-slate-500 mb-0.5">Nama Pelanggan</label><input type="text" id="namaPelanggan" class="w-full border rounded p-2 font-bold text-blue-900"></div>
        <div><label class="block text-slate-500 mb-0.5">Pemakaian</label><input type="text" id="pemakaian" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Stand Meter</label><input type="text" id="standMeter" class="w-full border rounded p-2 font-mono"></div>
        <div><label class="block text-slate-500 mb-0.5">Bulan Tagihan</label><input type="text" id="bulanTagihan" class="w-full border rounded p-2 font-medium"></div>
        <div class="sm:col-span-3"><label class="block text-slate-500 mb-0.5">Rincian Tagihan</label><input type="text" id="rincianTagihan" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Rp Tagihan (Rp)</label><input type="number" id="rpTagihan" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Lain-Lain (Rp)</label><input type="number" id="lainLain" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Admin Bank (Rp)</label><input type="number" id="adminBank" oninput="calcTotal()" class="w-full border rounded p-2"></div>
      </div>
      
      <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
        <span class="font-bold text-blue-900 text-sm">Total Bayar:</span>
        <span id="totalBayarDisp" class="text-xl font-extrabold text-blue-700">Rp 0</span>
      </div>

      <div class="mt-5 flex flex-wrap gap-3">
        <button onclick="saveAndPrint()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all">
          💾 Simpan ke Sheets & Cetak Resi
        </button>
        <button onclick="saveOnly()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-all">
          Simpan Saja (Tanpa Cetak)
        </button>
        <button onclick="window.print()" class="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-all">
          🖨️ Cetak Langsung (Format A6)
        </button>
      </div>
    </div>

    <!-- Riwayat Transaksi Tersimpan -->
    <div class="mt-8 border-t pt-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div>
          <h3 class="font-bold text-base text-slate-800">Riwayat Tersimpan di Google Sheet</h3>
          <p class="text-xs text-slate-500">Menampilkan data sinkron langsung dari Google Spreadsheet</p>
        </div>
        <div class="flex items-center gap-2">
          <input type="text" id="searchInput" oninput="filterHistory()" placeholder="Cari IDPEL / Nama..." class="border rounded-lg px-3 py-1.5 text-xs">
          <button onclick="loadHistory()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1">
            🔄 Segarkan
          </button>
        </div>
      </div>
      
      <div id="historyContainer" class="border rounded-lg overflow-hidden bg-white">
        <div id="historyList" class="p-4 text-xs text-slate-400 text-center">
          Memuat riwayat transaksi dari Google Sheets...
        </div>
      </div>
    </div>
  </div>

  <script>
    let allTransactions = [];

    function showAlert(msg, isError = false) {
      const el = document.getElementById('alertBox');
      el.className = isError 
        ? 'mb-4 p-3 rounded-lg text-xs font-medium bg-rose-50 border-rose-200 text-rose-800' 
        : 'mb-4 p-3 rounded-lg text-xs font-medium bg-emerald-50 border-emerald-200 text-emerald-800';
      el.innerText = msg;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 5000);
    }

    function runDatabaseSetup() {
      const btn = document.getElementById('btnSetup');
      btn.innerText = 'Menyiapkan...';
      btn.disabled = true;

      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            btn.innerText = '⚙️ Database Siap';
            btn.disabled = false;
            showAlert('Database Google Sheet berhasil disiapkan! Sheet: ' + (res.sheetName || 'RiwayatTransaksi'));
            loadHistory();
          })
          .withFailureHandler(function(err) {
            btn.innerText = '⚙️ Inisialisasi Database';
            btn.disabled = false;
            showAlert('Gagal inisialisasi: ' + err.toString(), true);
          })
          .setupDatabase();
      } else {
        fetch('?action=setupDatabase')
          .then(r => r.json())
          .then(res => {
            btn.innerText = '⚙️ Database Siap';
            btn.disabled = false;
            showAlert('Database berhasil diinisialisasi!');
            loadHistory();
          })
          .catch(e => {
            btn.innerText = '⚙️ Inisialisasi Database';
            btn.disabled = false;
            showAlert('Error setup: ' + e.message, true);
          });
      }
    }

    function parseText() {
      const text = document.getElementById('rawText').value;
      if (!text || !text.trim()) {
        alert('Masukkan teks struk terlebih dahulu!');
        return;
      }
      const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
      document.getElementById('tanggal').value = new Date().toLocaleDateString('id-ID');
      
      // Auto extract
      let nama = 'PELANGGAN';
      let idpel = '541293847210';
      let rp = 100000;
      let admin = 2500;
      let rincian = 'Tagihan Pembayaran Listrik';
      let bulan = 'SEP26';

      for (let l of lines) {
        let low = l.toLowerCase();
        if (/\\b\\d{10,13}\\b/.test(l)) {
          let m = l.match(/\\b\\d{10,13}\\b/);
          if (m) idpel = m[0];
        }
        if (/nama|plg|cust/.test(low)) {
          let parts = l.split(/[:=]/);
          if (parts[1]) nama = parts[1].trim().toUpperCase();
        }
        if (/tagihan|total|rp/.test(low) && !/admin/.test(low)) {
          let num = l.replace(/[^0-9]/g, '');
          if (num.length >= 4) rp = parseInt(num, 10);
        }
      }

      document.getElementById('namaPelanggan').value = nama;
      document.getElementById('idpel').value = idpel;
      document.getElementById('rpTagihan').value = rp;
      document.getElementById('adminBank').value = admin;
      document.getElementById('lainLain').value = 0;
      document.getElementById('rincianTagihan').value = rincian;
      document.getElementById('bulanTagihan').value = bulan;
      calcTotal();
      showAlert('Teks struk berhasil diparse otomatis!');
    }

    function calcTotal() {
      const rp = Number(document.getElementById('rpTagihan').value) || 0;
      const lain = Number(document.getElementById('lainLain').value) || 0;
      const admin = Number(document.getElementById('adminBank').value) || 0;
      const total = rp + lain + admin;
      document.getElementById('totalBayarDisp').innerText = 'Rp ' + total.toLocaleString('id-ID');
    }

    function getFormData() {
      const rp = Number(document.getElementById('rpTagihan').value) || 0;
      const lain = Number(document.getElementById('lainLain').value) || 0;
      const admin = Number(document.getElementById('adminBank').value) || 0;
      return {
        id: 'TX-' + Date.now(),
        tanggal: document.getElementById('tanggal').value || new Date().toLocaleDateString('id-ID'),
        idpel: document.getElementById('idpel').value || '-',
        namaPelanggan: document.getElementById('namaPelanggan').value || 'PELANGGAN',
        pemakaian: document.getElementById('pemakaian').value || '-',
        standMeter: document.getElementById('standMeter').value || '-',
        rincianTagihan: document.getElementById('rincianTagihan').value || 'Tagihan Pembayaran',
        bulanTagihan: document.getElementById('bulanTagihan').value || 'SEP26',
        rpTagihan: rp,
        lainLain: lain,
        adminBank: admin,
        totalBayar: rp + lain + admin,
        namaAgen: document.getElementById('namaAgen').value || 'Agen Batara',
        alamat: document.getElementById('alamat').value || 'Bekasi',
        noHp: document.getElementById('noHp').value || '-',
        createdAt: new Date().toISOString()
      };
    }

    function saveAndPrint() {
      const data = getFormData();
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            showAlert('Resi berhasil disimpan ke Google Sheets!');
            loadHistory();
            window.print();
          })
          .withFailureHandler(function(err) {
            showAlert('Gagal simpan: ' + err.toString(), true);
          })
          .saveTransaction(data);
      } else {
        window.print();
      }
    }

    function saveOnly() {
      const data = getFormData();
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            showAlert('Resi berhasil disimpan ke Google Sheets!');
            loadHistory();
          })
          .withFailureHandler(function(err) {
            showAlert('Gagal simpan: ' + err.toString(), true);
          })
          .saveTransaction(data);
      }
    }

    function deleteTx(id) {
      if (!confirm('Hapus transaksi ' + id + ' dari Google Sheet?')) return;
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(res) {
            showAlert('Transaksi berhasil dihapus dari Google Sheets.');
            loadHistory();
          })
          .deleteTransactionRow(id);
      }
    }

    function renderTable(list) {
      const container = document.getElementById('historyList');
      if (!list || list.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-slate-400">Belum ada riwayat transaksi tersimpan di Google Sheets.</div>';
        return;
      }
      let html = '<div class="overflow-x-auto"><table class="w-full text-left border-collapse text-xs"><thead><tr class="bg-slate-100 text-slate-700 font-semibold border-b"><th class="p-2.5">ID</th><th class="p-2.5">Tanggal</th><th class="p-2.5">IDPEL</th><th class="p-2.5">Pelanggan</th><th class="p-2.5">Bulan</th><th class="p-2.5">Total Bayar</th><th class="p-2.5 text-center">Aksi</th></tr></thead><tbody>';
      list.forEach(t => {
        const tot = Number(t.totalBayar || 0).toLocaleString('id-ID');
        html += '<tr class="border-b hover:bg-blue-50/50 transition-colors">' +
          '<td class="p-2.5 font-mono text-[11px] text-slate-500">' + (t.id || '-') + '</td>' +
          '<td class="p-2.5 text-slate-700">' + (t.tanggal || '-') + '</td>' +
          '<td class="p-2.5 font-mono font-semibold text-slate-900">' + (t.idpel || '-') + '</td>' +
          '<td class="p-2.5 font-medium text-slate-900">' + (t.namaPelanggan || '-') + '</td>' +
          '<td class="p-2.5 text-slate-600">' + (t.bulanTagihan || '-') + '</td>' +
          '<td class="p-2.5 font-bold text-blue-700">Rp ' + tot + '</td>' +
          '<td class="p-2.5 text-center"><button onclick="deleteTx(\\'' + (t.id || '') + '\\')" class="text-rose-600 hover:text-rose-800 text-[11px] font-medium">Hapus</button></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }

    function filterHistory() {
      const q = (document.getElementById('searchInput').value || '').toLowerCase();
      if (!q) {
        renderTable(allTransactions);
        return;
      }
      const filtered = allTransactions.filter(t => 
        (t.idpel && t.idpel.toLowerCase().includes(q)) ||
        (t.namaPelanggan && t.namaPelanggan.toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q))
      );
      renderTable(filtered);
    }

    function loadHistory() {
      const container = document.getElementById('historyList');
      container.innerHTML = '<div class="p-4 text-center text-slate-400">Menghubungkan ke Google Sheets...</div>';
      
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function(txs) {
            allTransactions = Array.isArray(txs) ? txs : [];
            renderTable(allTransactions);
          })
          .withFailureHandler(function(err) {
            container.innerHTML = '<div class="p-4 text-center text-rose-500">Gagal memuat: ' + err.toString() + '</div>';
          })
          .getLastTransactions();
      } else {
        fetch('?action=getTransactions')
          .then(r => r.json())
          .then(res => {
            allTransactions = (res && Array.isArray(res.data)) ? res.data : [];
            renderTable(allTransactions);
          })
          .catch(e => {
            container.innerHTML = '<div class="p-4 text-center text-slate-400">Riwayat siap dimuat saat terhubung ke Google Apps Script.</div>';
          });
      }
    }

    window.onload = function() {
      document.getElementById('tanggal').value = new Date().toLocaleDateString('id-ID');
      calcTotal();
      loadHistory();
    };
  </script>
</body>
</html>
`,
  instructions: [
    "1. Buka Google Sheets baru di Google Drive Anda (beri nama misalnya 'Database Resi Agen Batara').",
    "2. Di menu atas Google Sheets, klik Extensions > Apps Script (Ekstensi > Apps Script).",
    "3. Hapus seluruh isi default di file Code.gs, lalu salin (paste) kode Code.gs di tab ini.",
    "4. (PENTING SEKALI) Di toolbar atas Apps Script, pilih fungsi 'testInitAndPing' atau 'setupDatabase', lalu klik tombol 'Run' (Jalankan ▶️). Klik 'Review permissions' > pilih akun Google Anda > klik 'Advanced' (Lanjutan) > klik 'Go to [Nama Project] (unsafe)' > 'Allow' (Izinkan). Ini wajib agar Google mengaktifkan izin akses database Sheets.",
    "5. (Opsional untuk Web App) Klik tanda (+) di samping Files > pilih HTML > beri nama 'Index' > paste kode Index.html.",
    "6. Di pojok kanan atas, klik Deploy > Manage deployments (atau New deployment).",
    "7. Pastikan 'Who has access' diatur ke 'Anyone' (Siapa saja — WAJIB agar sinkronisasi tidak terblokir).",
    "8. Klik Deploy, salin Web App URL yang berakhiran /exec.",
    "9. Tempel Web App URL ke aplikasi ini, lalu klik 'Simpan & Uji Koneksi'!"
  ]
};

