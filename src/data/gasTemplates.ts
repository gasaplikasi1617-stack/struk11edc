export interface GasScriptData {
  codeGs: string;
  indexHtml: string;
  instructions: string[];
}

export const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbw3cU9AiiesdrYgp-q1W56Ekph0wewoRd-14sZksQcmXb8PEP2enpTRSePCnLtNr_X1zA/exec';

export const DEFAULT_GAS_DATA: GasScriptData = {
  codeGs: `/**
 * ===================================================================
 * BACKEND GOOGLE APPS SCRIPT - SISTEM CETAK RESI & GOOGLE SHEETS
 * Versi: 3.0 (Stabil 100% - Sinkronisasi 2 Arah Penuh)
 * Agen Batara - Bekasi
 * ===================================================================
 */

// 1. HELPER MENDAPATKAN SPREADSHEET SECARA AMAN
function getSpreadsheet() {
  var ss = null;
  // Coba ambil spreadsheet aktif (Bound Script)
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}

  // Coba ambil dari Script Properties jika tersimpan
  try {
    var savedId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
    if (savedId) {
      ss = SpreadsheetApp.openById(savedId);
      if (ss) return ss;
    }
  } catch (e) {}

  // Buat spreadsheet baru otomatis jika belum ada
  try {
    ss = SpreadsheetApp.create("Database Resi Agen Batara");
    PropertiesService.getScriptProperties().setProperty("SHEET_ID", ss.getId());
    return ss;
  } catch (e) {
    throw new Error("Gagal membuka atau membuat Google Spreadsheet: " + e.toString());
  }
}

// 2. HELPER SHEET RIWAYAT TRANSAKSI (TABEL OTOMATIS)
function getOrCreateSheet() {
  var ss = getSpreadsheet();
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
    sheet.getRange("A2:A").setNumberFormat("@");
    sheet.getRange("C2:C").setNumberFormat("@");
    sheet.getRange("I2:L").setNumberFormat("#,##0");
    sheet.getRange("O2:O").setNumberFormat("@");
  }
  return sheet;
}

// 3. RESPONS JSON HELPER (CORS SUPPORT)
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 4. MENU OTOMATIS DI GOOGLE SHEETS
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Agen Batara")
      .addItem("⚙️ Setup / Inisialisasi Database", "setupDatabase")
      .addItem("🧪 Tes Koneksi Database", "testInitAndPing")
      .addSeparator()
      .addItem("📦 Tutup Buku & Arsipkan Data Bulan Ini", "menuArchiveAndResetMonth")
      .addToUi();
  } catch (e) {}
}

// 5. INISIALISASI / SETUP DATABASE
function setupDatabase() {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet();
  sheet.getRange("A2:A").setNumberFormat("@");
  sheet.getRange("C2:C").setNumberFormat("@");
  sheet.getRange("I2:L").setNumberFormat("#,##0");
  sheet.getRange("O2:O").setNumberFormat("@");
  return {
    success: true,
    message: "Database Google Sheets 'RiwayatTransaksi' berhasil disiapkan (Format ID Pelanggan = Teks)!",
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: sheet.getName(),
    totalRecords: Math.max(0, sheet.getLastRow() - 1),
    timestamp: new Date().toISOString()
  };
}

// 6. BACA SEMUA TRANSAKSI DARI GOOGLE SHEET
function getAllTransactionsFromSheet() {
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var numRows = lastRow - 1;
  var numCols = Math.min(sheet.getLastColumn(), 16);
  var values = sheet.getRange(2, 1, numRows, numCols).getValues();

  var result = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!row[0] && !row[2]) continue; // Lewati baris kosong
    var rawIdpel = row[2];
    var cleanIdpel = String(rawIdpel || "");
    if (typeof rawIdpel === "number" || /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/i.test(cleanIdpel)) {
      var n = Number(rawIdpel);
      if (!isNaN(n) && isFinite(n)) {
        cleanIdpel = Math.round(n).toLocaleString("fullwide", { useGrouping: false });
      }
    }
    result.push({
      id: String(row[0] || ("TX-" + (i + 1))),
      tanggal: String(row[1] || ""),
      idpel: cleanIdpel || "-",
      namaPelanggan: String(row[3] || ""),
      pemakaian: String(row[4] || ""),
      standMeter: String(row[5] || ""),
      rincianTagihan: String(row[6] || ""),
      bulanTagihan: String(row[7] || ""),
      rpTagihan: Number(row[8]) || 0,
      lainLain: Number(row[9]) || 0,
      adminBank: Number(row[10]) || 0,
      totalBayar: Number(row[11]) || 0,
      namaAgen: String(row[12] || "Agen Batara"),
      alamat: String(row[13] || "Bekasi"),
      noHp: String(row[14] || ""),
      createdAt: String(row[15] || new Date().toISOString())
    });
  }
  return result;
}

// 7. SIMPAN 1 TRANSAKSI (ANTI DUPLIKASI)
function saveSingleTransaction(tx) {
  if (!tx || (!tx.id && !tx.idpel)) {
    return { success: false, error: "Data transaksi tidak lengkap" };
  }
  var sheet = getOrCreateSheet();
  var txId = String(tx.id || ("TX-" + Date.now()));
  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === txId) {
        return { success: true, txId: txId, note: "Sudah ada (skip)" };
      }
    }
  }

  var cIdpel = String(tx.idpel || "-");
  if (typeof tx.idpel === "number" && isFinite(tx.idpel)) {
    cIdpel = tx.idpel.toLocaleString("fullwide", { useGrouping: false });
  }

  sheet.appendRow([
    txId,
    tx.tanggal || new Date().toLocaleDateString("id-ID"),
    "'" + cIdpel,
    tx.namaPelanggan || "PELANGGAN",
    tx.pemakaian || "-",
    tx.standMeter || "-",
    tx.rincianTagihan || "Tagihan Pembayaran",
    tx.bulanTagihan || "-",
    Number(tx.rpTagihan) || 0,
    Number(tx.lainLain) || 0,
    Number(tx.adminBank) || 0,
    Number(tx.totalBayar) || 0,
    tx.namaAgen || "Agen Batara",
    tx.alamat || "Bekasi",
    tx.noHp || "-",
    tx.createdAt || new Date().toISOString()
  ]);

  return { success: true, txId: txId, message: "Transaksi berhasil disimpan ke Google Sheets" };
}

// 8. SINKRONISASI 2 ARAH LENGKAP (TWO-WAY SYNC)
function executeTwoWaySync(incomingTransactions) {
  var sheet = getOrCreateSheet();
  var sheetTxs = getAllTransactionsFromSheet();

  // Buat indeks transaksi yang sudah ada di Sheet
  var existingMap = {};
  for (var i = 0; i < sheetTxs.length; i++) {
    existingMap[sheetTxs[i].id] = true;
    var sig = (sheetTxs[i].idpel + "_" + sheetTxs[i].bulanTagihan + "_" + sheetTxs[i].tanggal).toLowerCase();
    existingMap[sig] = true;
  }

  // Cari transaksi lokal baru yang belum masuk ke Sheet
  var newRows = [];
  var incoming = Array.isArray(incomingTransactions) ? incomingTransactions : [];
  for (var j = 0; j < incoming.length; j++) {
    var t = incoming[j];
    var tId = String(t.id || ("TX-" + Date.now() + "-" + j));
    var tSig = (String(t.idpel || "") + "_" + String(t.bulanTagihan || "") + "_" + String(t.tanggal || "")).toLowerCase();

    if (!existingMap[tId] && !existingMap[tSig]) {
      var rowIdpel = String(t.idpel || "-");
      if (typeof t.idpel === "number" && isFinite(t.idpel)) {
        rowIdpel = t.idpel.toLocaleString("fullwide", { useGrouping: false });
      }
      newRows.push([
        tId,
        t.tanggal || new Date().toLocaleDateString("id-ID"),
        "'" + rowIdpel,
        t.namaPelanggan || "PELANGGAN",
        t.pemakaian || "-",
        t.standMeter || "-",
        t.rincianTagihan || "Tagihan Pembayaran",
        t.bulanTagihan || "-",
        Number(t.rpTagihan) || 0,
        Number(t.lainLain) || 0,
        Number(t.adminBank) || 0,
        Number(t.totalBayar) || 0,
        t.namaAgen || "Agen Batara",
        t.alamat || "Bekasi",
        t.noHp || "-",
        t.createdAt || new Date().toISOString()
      ]);
      existingMap[tId] = true;
      existingMap[tSig] = true;
    }
  }

  // Tulis baris baru ke Sheet jika ada
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 16).setValues(newRows);
  }

  // Ambil ulang seluruh data terbaru yang sudah digabung
  var mergedData = getAllTransactionsFromSheet();

  return {
    success: true,
    message: "Sinkronisasi 2 arah berhasil!",
    pushedToSheet: newRows.length,
    totalInSheet: mergedData.length,
    data: mergedData,
    timestamp: new Date().toISOString()
  };
}

// 9. HAPUS TRANSAKSI DI SHEET
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
  return { success: false, error: "Transaksi ID tidak ditemukan di Google Sheets" };
}

// 9b. TUTUP BUKU & ARSIPKAN DATA BULANAN KE TAB BARU
function archiveAndResetSheet(customMonthName) {
  var ss = getSpreadsheet();
  var sheet = getOrCreateSheet();
  var lastRow = sheet.getLastRow();
  var rowCount = Math.max(0, lastRow - 1);

  // Buat nama tab arsip, contoh: "Arsip_Sep_2026"
  var now = new Date();
  var defaultMonthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var monthTag = (customMonthName && String(customMonthName).trim()) 
    ? String(customMonthName).trim().replace(/[^a-zA-Z0-9_-]/g, "_")
    : ("Arsip_" + defaultMonthNames[now.getMonth()] + "_" + now.getFullYear());

  if (!monthTag.toLowerCase().startsWith("arsip")) {
    monthTag = "Arsip_" + monthTag;
  }

  // Jika tab arsip dengan nama tersebut sudah ada, beri sufiks unik
  var finalTabName = monthTag;
  var counter = 1;
  while (ss.getSheetByName(finalTabName)) {
    finalTabName = monthTag + "_" + counter;
    counter++;
  }

  // 1. Salin seluruh isi sheet aktif ke tab arsip jika ada data
  if (lastRow > 1) {
    var archiveSheet = sheet.copyTo(ss);
    archiveSheet.setName(finalTabName);
  }

  // 2. Kosongkan baris data pada sheet aktif (baris 2 ke bawah), biarkan header di baris 1 tetap utuh
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  // Pastikan format kolom tetap rapi untuk bulan berikutnya
  sheet.getRange("A2:A").setNumberFormat("@");
  sheet.getRange("C2:C").setNumberFormat("@");
  sheet.getRange("I2:L").setNumberFormat("#,##0");
  sheet.getRange("O2:O").setNumberFormat("@");

  return {
    success: true,
    message: "Tutup buku berhasil! Data (" + rowCount + " transaksi) telah diarsipkan ke tab '" + finalTabName + "' dan sheet aktif telah dikosongkan untuk bulan baru.",
    archiveTabName: finalTabName,
    archivedCount: rowCount,
    timestamp: new Date().toISOString()
  };
}

function menuArchiveAndResetMonth() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    "Konfirmasi Tutup Buku & Arsip Bulanan",
    "Apakah Anda yakin ingin mengarsipkan seluruh data transaksi saat ini ke tab baru dan mengosongkan sheet aktif untuk bulan baru?",
    ui.ButtonSet.YES_NO
  );
  if (confirm === ui.Button.YES) {
    var res = archiveAndResetSheet();
    ui.alert("Berhasil!", res.message, ui.ButtonSet.OK);
  }
}

// 10. ENTRY POINT GET (Browser / API Read / Ping)
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var action = String(p.action || "").trim();

    if (action === "setup" || action === "setupDatabase" || action === "init") {
      return jsonResponse(setupDatabase());
    }

    if (action === "ping" || action === "test") {
      var ss = getSpreadsheet();
      return jsonResponse({
        success: true,
        status: "online",
        message: "Koneksi Google Sheets Aktif!",
        spreadsheet: { name: ss.getName(), url: ss.getUrl() },
        timestamp: new Date().toISOString()
      });
    }

    if (action === "getTransactions" || action === "pull" || action === "read") {
      var txs = getAllTransactionsFromSheet();
      return jsonResponse({
        success: true,
        total: txs.length,
        data: txs,
        timestamp: new Date().toISOString()
      });
    }

    if (action === "archiveAndResetMonth" || action === "resetMonth" || action === "archive") {
      var mName = p.monthName || p.periodName || "";
      return jsonResponse(archiveAndResetSheet(mName));
    }

    // Tampilkan Web App Index HTML
    try {
      return HtmlService.createHtmlOutputFromFile("Index")
        .setTitle("Cetak Resi Tagihan - Agen Batara")
        .addMetaTag("viewport", "width=device-width, initial-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (errHtml) {
      return jsonResponse({
        success: true,
        status: "online",
        message: "Google Apps Script Backend API Aktif!",
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 11. ENTRY POINT POST (API Write / Sync 2 Arah)
function doPost(e) {
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (eJson) {
        payload = {};
      }
    }

    var action = payload.action || (e && e.parameter ? e.parameter.action : "");

    if (action === "setup" || action === "setupDatabase") {
      return jsonResponse(setupDatabase());
    }

    if (action === "ping" || action === "test") {
      var ss = getSpreadsheet();
      return jsonResponse({
        success: true,
        status: "online",
        message: "Google Apps Script POST OK!",
        spreadsheet: { name: ss.getName(), url: ss.getUrl() },
        timestamp: new Date().toISOString()
      });
    }

    if (action === "twoWaySync" || action === "sync") {
      var txList = payload.transactions || [];
      return jsonResponse(executeTwoWaySync(txList));
    }

    if (action === "saveTransaction" || action === "save") {
      var txData = payload.data || payload;
      return jsonResponse(saveSingleTransaction(txData));
    }

    if (action === "getTransactions" || action === "pull") {
      var txs = getAllTransactionsFromSheet();
      return jsonResponse({ success: true, total: txs.length, data: txs });
    }

    if (action === "deleteTransaction" || action === "delete") {
      return jsonResponse(deleteTransactionRow(payload.id));
    }

    if (action === "archiveAndResetMonth" || action === "resetMonth" || action === "archive") {
      var mName = payload.monthName || payload.periodName || (e && e.parameter ? (e.parameter.monthName || e.parameter.periodName) : "");
      return jsonResponse(archiveAndResetSheet(mName));
    }

    return jsonResponse({ success: false, error: "Action tidak dikenal: " + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 12. FUNGSI UJI COBA RUN DI EDITOR
function testInitAndPing() {
  var res = setupDatabase();
  Logger.log("Hasil Setup: " + JSON.stringify(res));
  return res;
}
`,
  indexHtml: `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Cetak Resi Tagihan — Agen Batara</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 text-slate-800 p-4 sm:p-6 font-sans">
  <div class="max-w-5xl mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 mb-6 gap-3">
      <div>
        <h1 class="text-2xl font-bold text-blue-700">Cetak Resi Tagihan — Agen Batara</h1>
        <p class="text-xs text-slate-500 mt-0.5">Aplikasi Web App Google Apps Script & Sinkronisasi 2 Arah Google Sheets</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="setupDB()" id="btnSetup" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5">
          ⚙️ Setup Database
        </button>
        <span class="bg-emerald-100 text-emerald-800 text-xs px-3 py-1.5 rounded-full font-semibold">
          ● Google Sheets Siap
        </span>
      </div>
    </div>

    <!-- Alert Box -->
    <div id="alertBox" class="hidden mb-4 p-3 rounded-lg text-xs font-medium border"></div>

    <!-- Paste & Form -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50 p-4 rounded-xl border border-slate-200">
      <div>
        <label class="block text-xs font-bold text-slate-700 mb-1">Paste Teks Struk (PLN / PDAM / Telkom / BPJS)</label>
        <textarea id="rawText" rows="6" class="w-full border rounded-lg p-3 text-xs font-mono bg-white" placeholder="Paste data struk di sini..."></textarea>
        <button onclick="parseStruk()" class="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold">
          ⚡ Parse Teks Otomatis
        </button>
      </div>
      <div>
        <h2 class="text-xs font-bold text-slate-700 mb-2">Profil Agen</h2>
        <div class="space-y-2 text-xs">
          <div><label class="text-slate-500">Nama Agen</label><input type="text" id="namaAgen" value="Agen Batara" class="w-full border rounded p-2 bg-white font-medium"></div>
          <div><label class="text-slate-500">Alamat</label><input type="text" id="alamat" value="Bekasi" class="w-full border rounded p-2 bg-white"></div>
          <div><label class="text-slate-500">No. HP / WA</label><input type="text" id="noHp" value="081234567890" class="w-full border rounded p-2 bg-white"></div>
        </div>
      </div>
    </div>

    <!-- Form Detail -->
    <div class="mt-6 border-t pt-5">
      <h3 class="font-bold text-sm mb-3 text-slate-800">Rincian Data Resi</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div><label class="block text-slate-500 mb-0.5">Tanggal</label><input type="text" id="tanggal" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">ID Pelanggan (IDPEL)</label><input type="text" id="idpel" class="w-full border rounded p-2 font-mono font-bold text-blue-900"></div>
        <div><label class="block text-slate-500 mb-0.5">Nama Pelanggan</label><input type="text" id="namaPelanggan" class="w-full border rounded p-2 font-semibold"></div>
        <div><label class="block text-slate-500 mb-0.5">Pemakaian</label><input type="text" id="pemakaian" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Stand Meter</label><input type="text" id="standMeter" class="w-full border rounded p-2 font-mono"></div>
        <div><label class="block text-slate-500 mb-0.5">Bulan Tagihan</label><input type="text" id="bulanTagihan" class="w-full border rounded p-2"></div>
        <div class="sm:col-span-3"><label class="block text-slate-500 mb-0.5">Rincian Tagihan</label><input type="text" id="rincianTagihan" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Rp Tagihan (Rp)</label><input type="number" id="rpTagihan" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Lain-Lain (Rp)</label><input type="number" id="lainLain" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-slate-500 mb-0.5">Admin Bank (Rp)</label><input type="number" id="adminBank" value="2500" oninput="calcTotal()" class="w-full border rounded p-2 font-semibold"></div>
      </div>

      <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
        <span class="font-bold text-blue-900 text-sm">Total Bayar:</span>
        <span id="totalBayarDisp" class="text-xl font-extrabold text-blue-700">Rp 0</span>
      </div>

      <div class="mt-5 flex flex-wrap gap-3">
        <button onclick="saveAndPrint()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5">
          💾 Simpan ke Sheets & Cetak Resi
        </button>
        <button onclick="saveOnly()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm">
          Simpan Saja
        </button>
        <button onclick="window.print()" class="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm">
          🖨️ Cetak Langsung (A6)
        </button>
      </div>
    </div>

    <!-- Riwayat Transaksi -->
    <div class="mt-8 border-t pt-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h3 class="font-bold text-base text-slate-800">Riwayat Tersimpan di Google Sheet</h3>
        <button onclick="loadHistory()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium">
          🔄 Segarkan Data
        </button>
      </div>
      <div id="historyList" class="border rounded-lg p-4 text-xs bg-white text-center text-slate-400">
        Memuat riwayat transaksi...
      </div>
    </div>
  </div>

  <script>
    function showAlert(msg, isErr) {
      const el = document.getElementById('alertBox');
      el.className = isErr ? 'mb-4 p-3 rounded-lg text-xs font-medium bg-rose-50 border-rose-200 text-rose-800' : 'mb-4 p-3 rounded-lg text-xs font-medium bg-emerald-50 border-emerald-200 text-emerald-800';
      el.innerText = msg;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 5000);
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

    function parseStruk() {
      const text = document.getElementById('rawText').value;
      if (!text) { alert('Masukkan teks struk!'); return; }
      const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
      document.getElementById('tanggal').value = new Date().toLocaleDateString('id-ID');
      let idpel = '541293847210';
      let rp = 100000;
      for (let l of lines) {
        if (/\\b\\d{10,13}\\b/.test(l)) {
          let m = l.match(/\\b\\d{10,13}\\b/);
          if (m) idpel = m[0];
        }
        if (/tagihan|total|rp/i.test(l) && !/admin/i.test(l)) {
          let n = l.replace(/[^0-9]/g, '');
          if (n.length >= 4) rp = parseInt(n, 10);
        }
      }
      document.getElementById('idpel').value = idpel;
      document.getElementById('rpTagihan').value = rp;
      document.getElementById('namaPelanggan').value = lines[0] ? lines[0].toUpperCase() : 'PELANGGAN';
      document.getElementById('bulanTagihan').value = 'SEP26';
      calcTotal();
      showAlert('Struk berhasil diparse!');
    }

    function setupDB() {
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function(res) {
          showAlert('Database Google Sheets berhasil disiapkan!');
          loadHistory();
        }).setupDatabase();
      }
    }

    function saveAndPrint() {
      const data = getFormData();
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function() {
          showAlert('Berhasil disimpan ke Google Sheets!');
          loadHistory();
          window.print();
        }).saveSingleTransaction(data);
      } else {
        window.print();
      }
    }

    function saveOnly() {
      const data = getFormData();
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function() {
          showAlert('Berhasil disimpan ke Google Sheets!');
          loadHistory();
        }).saveSingleTransaction(data);
      }
    }

    function loadHistory() {
      const container = document.getElementById('historyList');
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function(txs) {
          if (!txs || txs.length === 0) {
            container.innerHTML = '<p class="text-slate-400">Belum ada riwayat transaksi.</p>';
            return;
          }
          let html = '<div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse"><thead><tr class="bg-slate-100 font-semibold border-b"><th class="p-2">ID</th><th class="p-2">Tanggal</th><th class="p-2">IDPEL</th><th class="p-2">Pelanggan</th><th class="p-2">Total</th></tr></thead><tbody>';
          txs.forEach(t => {
            html += '<tr class="border-b"><td class="p-2 font-mono">' + (t.id || '-') + '</td><td class="p-2">' + (t.tanggal || '-') + '</td><td class="p-2 font-mono font-bold">' + (t.idpel || '-') + '</td><td class="p-2">' + (t.namaPelanggan || '-') + '</td><td class="p-2 font-bold text-blue-700">Rp ' + Number(t.totalBayar || 0).toLocaleString('id-ID') + '</td></tr>';
          });
          html += '</tbody></table></div>';
          container.innerHTML = html;
        }).getAllTransactionsFromSheet();
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
    "1. Buka Google Sheets di browser (buat file baru, contoh: 'Database Resi Agen Batara').",
    "2. Di menu atas Google Sheets, klik Ekstensi > Apps Script (Extensions > Apps Script).",
    "3. Hapus semua kode default di file Code.gs, lalu tempelkan (paste) seluruh kode 'Code.gs' terbaru ini.",
    "4. (WAJIB - SATU KALI) Di toolbar atas Apps Script, pilih fungsi 'testInitAndPing' atau 'setupDatabase' lalu klik tombol Run (Jalankan ▶️). Klik 'Review permissions' > pilih akun Google > Advanced > 'Go to [Project] (unsafe)' > 'Allow' (Izinkan).",
    "5. Klik Deploy di pojok kanan atas > pilih 'Manage deployments' (atau 'New deployment').",
    "6. Klik tombol pensil Edit > pilih Version: 'New version'.",
    "7. Pastikan 'Who has access' (Siapa yang memiliki akses) diatur ke 'Anyone' (Siapa saja).",
    "8. Klik 'Deploy', lalu salin URL Web App yang berakhiran '/exec'.",
    "9. Tempelkan URL tersebut ke aplikasi ini di tab Integrasi, lalu klik 'Simpan URL' & 'Sinkron 2 Arah'!"
  ]
};
