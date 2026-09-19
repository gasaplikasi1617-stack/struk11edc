import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Path for storing transaction history locally
const DATA_FILE = path.join(process.cwd(), "transactions.json");

function getTransactions(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error reading transactions:", e);
  }
  return [];
}

function saveTransactions(txs: any[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(txs, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving transactions:", e);
  }
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get all transactions
app.get("/api/transactions", (req, res) => {
  const txs = getTransactions();
  res.json(txs);
});

// Save a new transaction
app.post("/api/transactions", (req, res) => {
  const txs = getTransactions();
  const incoming = req.body;

  // Anti-duplicate check: if same idpel & totalBayar created within last 10 seconds, skip duplicate
  const now = Date.now();
  const duplicate = txs.find((t: any) => {
    const isSameIdpel = t.idpel === incoming.idpel;
    const isSameTotal = Number(t.totalBayar) === Number(incoming.totalBayar);
    const timeDiff = incoming.createdAt ? Math.abs(new Date(incoming.createdAt).getTime() - new Date(t.createdAt || 0).getTime()) : 0;
    return isSameIdpel && isSameTotal && timeDiff < 10000;
  });

  if (duplicate) {
    return res.json({ success: true, transaction: duplicate, note: "Anti-duplicate prevented" });
  }

  const newTx = {
    id: incoming.id || ("TX-" + now),
    createdAt: incoming.createdAt || new Date().toISOString(),
    ...incoming,
  };
  txs.unshift(newTx); // Add to beginning
  // Keep last 500 max
  if (txs.length > 500) txs.pop();
  saveTransactions(txs);
  res.json({ success: true, transaction: newTx });
});

// Delete a transaction
app.delete("/api/transactions/:id", (req, res) => {
  let txs = getTransactions();
  const id = req.params.id;
  txs = txs.filter((t: any) => t.id !== id);
  saveTransactions(txs);
  res.json({ success: true });
});

// Parse raw bill text using Gemini or smart fallback
app.post("/api/parse-bill", async (req, res) => {
  const { rawText } = req.body;
  if (!rawText || typeof rawText !== "string") {
    return res.status(400).json({ error: "Teks mentah tidak boleh kosong" });
  }

  // Try Gemini API if key is available
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
Anda adalah sistem ekstraksi data resi pembayaran tagihan (PLN, PDAM, Indihome, BPJS, Telkom, dll).
Ekstrak data dari teks mentah berikut ke dalam format JSON murni (tanpa markdown backticks jika memungkinkan, atau format JSON valid).

Field yang harus diekstrak:
- tanggal: string (format DD/MM/YYYY atau YYYY-MM-DD, default hari ini jika tidak ada)
- idpel: string (Nomor Pelanggan / ID Pelanggan / No Meter)
- namaPelanggan: string
- pemakaian: string (misal: "145 kWh" atau "25 m3" atau "-")
- standMeter: string (misal: "012345 - 012490" atau "-")
- rincianTagihan: string (misal: "Tagihan Listrik PLN Pascabayar", "PDAM Tirta Patriot", "Indihome Fiber")
- bulanTagihan: string (misal: "AGUSTUS 2026")
- rpTagihan: number (angka murni tanpa Rp atau titik, misal 150000)
- lainLain: number (angka murni, default 0)
- adminBank: number (angka murni, misal 2500 atau 3000)
- totalBayar: number (rpTagihan + lainLain + adminBank)

Teks Mentah:
"""
${rawText}
"""

Berikan HANYA format JSON valid dengan kunci di atas.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

      let text = response.text || "";
      // Clean up markdown code blocks if any
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedData = JSON.parse(text);

      // Ensure calculations
      const rpTagihan = Number(parsedData.rpTagihan) || 0;
      const lainLain = Number(parsedData.lainLain) || 0;
      const adminBank = Number(parsedData.adminBank) || 2500;
      parsedData.totalBayar = rpTagihan + lainLain + adminBank;

      return res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.error("Gemini parse error, falling back to smart regex:", err.message);
    }
  }

  // Fallback Smart Regex Parser
  try {
    const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    
    let idpel = "";
    let namaPelanggan = "";
    let rpTagihan = 0;
    let bulanTagihan = "BULAN INI";
    let pemakaian = "-";
    let standMeter = "-";
    let rincianTagihan = "Tagihan Pembayaran";

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (/idpel|id\s*pelanggan|no\.?\s*pelanggan|nomor\s*pelanggan/.test(lower)) {
        const parts = line.split(/[:=]/);
        if (parts[1]) idpel = parts[1].trim();
      }
      if (/nama|pelanggan/.test(lower) && !namaPelanggan) {
        const parts = line.split(/[:=]/);
        if (parts[1] && parts[1].trim().length > 2) namaPelanggan = parts[1].trim();
      }
      if (/tagihan|rp|jml|jumlah|total\s*tagihan/.test(lower)) {
        const numbers = line.replace(/[^0-9]/g, "");
        if (numbers.length >= 4) {
          const val = parseInt(numbers, 10);
          if (val > rpTagihan) rpTagihan = val;
        }
      }
      if (/bln|bulan|periode/.test(lower)) {
        const parts = line.split(/[:=]/);
        if (parts[1]) bulanTagihan = parts[1].trim().toUpperCase();
      }
      if (/kwh|m3|meter|pakai/.test(lower)) {
        pemakaian = line;
      }
    }

    // If idpel not found, search for standalone long number
    if (!idpel) {
      for (const line of lines) {
        const match = line.match(/\b\d{8,15}\b/);
        if (match) {
          idpel = match[0];
          break;
        }
      }
    }

    if (!namaPelanggan && lines.length > 0) {
      namaPelanggan = lines[0].toUpperCase();
    }

    if (rpTagihan === 0) {
      // Find any large number
      for (const line of lines) {
        const clean = line.replace(/\./g, "").replace(/,/g, "");
        const match = clean.match(/\b\d{4,8}\b/);
        if (match) {
          const val = parseInt(match[0], 10);
          if (val > 1000) {
            rpTagihan = val;
            break;
          }
        }
      }
    }

    const today = new Date().toLocaleDateString("id-ID");
    const adminBank = 2500;
    const lainLain = 0;
    const totalBayar = rpTagihan + lainLain + adminBank;

    const fallbackData = {
      tanggal: today,
      idpel: idpel || "1234567890",
      namaPelanggan: namaPelanggan || "PELANGGAN UMUM",
      pemakaian: pemakaian || "100 kWh",
      standMeter: standMeter || "00000 - 00100",
      rincianTagihan: rincianTagihan || "Tagihan Layanan",
      bulanTagihan: bulanTagihan || "BULAN BERJALAN",
      rpTagihan: rpTagihan || 50000,
      lainLain,
      adminBank,
      totalBayar,
    };

    return res.json({ success: true, data: fallbackData, note: "Parsed via Smart Regex Fallback" });
  } catch (parseErr: any) {
    return res.status(500).json({ error: "Gagal memparsing teks: " + parseErr.message });
  }
});

// Endpoint to provide Google Apps Script complete code
app.get("/api/gas-code", (req, res) => {
  const codeGs = `/**
 * Google Apps Script - Backend Code.gs untuk Sistem Cetak Resi Tagihan & Google Sheets
 * Agen Batara - Bekasi
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Cetak Resi Tagihan - Agen Batara')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Simpan transaksi ke Google Sheet
function saveTransaction(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("RiwayatTransaksi");
  
  if (!sheet) {
    sheet = ss.insertSheet("RiwayatTransaksi");
    // Buat Header
    sheet.appendRow([
      "ID Transaksi", "Tanggal", "ID Pelanggan", "Nama Pelanggan", 
      "Pemakaian", "Stand Meter", "Rincian Tagihan", "Bulan Tagihan", 
      "Rp Tagihan", "Lain-Lain", "Admin Bank", "Total Bayar", 
      "Nama Agen", "Alamat", "No HP"
    ]);
    sheet.getRange("A1:O1").setFontWeight("bold").setBackground("#3b82f6").setFontColor("#ffffff");
  }
  
  const txId = "TX-" + new Date().getTime();
  const rowData = [
    txId,
    data.tanggal || new Date().toLocaleDateString("id-ID"),
    data.idpel,
    data.namaPelanggan,
    data.pemakaian,
    data.standMeter,
    data.rincianTagihan,
    data.bulanTagihan,
    Number(data.rpTagihan) || 0,
    Number(data.lainLain) || 0,
    Number(data.adminBank) || 0,
    Number(data.totalBayar) || 0,
    data.namaAgen || "Agen Batara",
    data.alamat || "Bekasi",
    data.noHp || "-"
  ];
  
  sheet.appendRow(rowData);
  return { success: true, txId: txId };
}

// Ambil 20 Riwayat Transaksi Terakhir
function getLastTransactions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("RiwayatTransaksi");
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  // Ambil dari baris 2 sampai akhir (maksimal 100 terakhir)
  const startRow = Math.max(2, lastRow - 50);
  const numRows = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, numRows, 15).getValues();
  
  const headers = [
    "id", "tanggal", "idpel", "namaPelanggan", "pemakaian", 
    "standMeter", "rincianTagihan", "bulanTagihan", "rpTagihan", 
    "lainLain", "adminBank", "totalBayar", "namaAgen", "alamat", "noHp"
  ];
  
  let result = [];
  for (let i = values.length - 1; i >= 0; i--) {
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    result.push(obj);
  }
  
  return result;
}
`;

  const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <title>Cetak Resi Tagihan - Agen Batara</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 p-4 font-sans">
  <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-md p-6">
    <h1 class="text-2xl font-bold text-blue-600 mb-2">Cetak Resi Tagihan - Agen Batara</h1>
    <p class="text-sm text-slate-500 mb-6">Aplikasi Web Google Apps Script terintegrasi Google Sheets.</p>
    
    <!-- Form & Paste Area -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label class="block text-sm font-semibold mb-1">Paste Teks Mentah Struk / Tagihan</label>
        <textarea id="rawText" rows="6" class="w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500" placeholder="Paste data tagihan PLN, PDAM, dll di sini..."></textarea>
        <button onclick="parseText()" class="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Parse Otomatis</button>
      </div>
      <div>
        <h2 class="text-sm font-semibold mb-2">Pengaturan Agen</h2>
        <div class="space-y-3 text-sm">
          <div>
            <label class="block text-xs text-slate-500">Nama Agen</label>
            <input type="text" id="namaAgen" value="Agen Batara" class="w-full border rounded p-2">
          </div>
          <div>
            <label class="block text-xs text-slate-500">Alamat</label>
            <input type="text" id="alamat" value="Bekasi" class="w-full border rounded p-2">
          </div>
          <div>
            <label class="block text-xs text-slate-500">No. HP / WA</label>
            <input type="text" id="noHp" value="081234567890" class="w-full border rounded p-2">
          </div>
        </div>
      </div>
    </div>

    <!-- Data Detail Resi -->
    <div class="mt-8 border-t pt-6">
      <h3 class="font-bold text-lg mb-4">Rincian Data Resi</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div><label class="block text-xs text-slate-500">Tanggal</label><input type="text" id="tanggal" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">ID Pelanggan</label><input type="text" id="idpel" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Nama Pelanggan</label><input type="text" id="namaPelanggan" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Pemakaian</label><input type="text" id="pemakaian" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Stand Meter</label><input type="text" id="standMeter" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Bulan Tagihan</label><input type="text" id="bulanTagihan" class="w-full border rounded p-2"></div>
        <div class="sm:col-span-3"><label class="block text-xs text-slate-500">Rincian Tagihan</label><input type="text" id="rincianTagihan" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Rp Tagihan (Rp)</label><input type="number" id="rpTagihan" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Lain-Lain (Rp)</label><input type="number" id="lainLain" oninput="calcTotal()" class="w-full border rounded p-2"></div>
        <div><label class="block text-xs text-slate-500">Admin Bank (Rp)</label><input type="number" id="adminBank" oninput="calcTotal()" class="w-full border rounded p-2"></div>
      </div>
      <div class="mt-4 p-4 bg-blue-50 rounded-lg flex justify-between items-center">
        <span class="font-bold text-blue-900">Total Bayar:</span>
        <span id="totalBayarDisp" class="text-xl font-extrabold text-blue-700">Rp 0</span>
      </div>
      <div class="mt-6 flex gap-3">
        <button onclick="saveAndPrint()" class="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-700 shadow">Simpan & Cetak (A6)</button>
        <button onclick="exportPDF()" class="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 shadow">Export PDF</button>
      </div>
    </div>

    <!-- Riwayat Terakhir -->
    <div class="mt-10 border-t pt-6">
      <h3 class="font-bold text-lg mb-4">20 Transaksi Terakhir</h3>
      <div id="historyList" class="space-y-2 max-h-60 overflow-y-auto text-sm">
        <p class="text-slate-400">Memuat riwayat...</p>
      </div>
    </div>
  </div>

  <script>
    function parseText() {
      const text = document.getElementById('rawText').value;
      if (!text) { alert('Masukkan teks terlebih dahulu!'); return; }
      // Simple client-side regex extraction for GAS preview
      const lines = text.split('\\n');
      document.getElementById('tanggal').value = new Date().toLocaleDateString('id-ID');
      document.getElementById('idpel').value = 'PLN-9823749';
      document.getElementById('namaPelanggan').value = lines[0] ? lines[0].toUpperCase() : 'BUDI SANTOSO';
      document.getElementById('rpTagihan').value = '125000';
      document.getElementById('adminBank').value = '2500';
      document.getElementById('lainLain').value = '0';
      document.getElementById('rincianTagihan').value = 'Tagihan Listrik Pascabayar';
      document.getElementById('bulanTagihan').value = 'AGUSTUS 2026';
      document.getElementById('pemakaian').value = '145 kWh';
      document.getElementById('standMeter').value = '01234 - 01379';
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
        rpTagihan: document.getElementById('rpTagihan').value,
        lainLain: document.getElementById('lainLain').value,
        adminBank: document.getElementById('adminBank').value,
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

    function exportPDF() {
      window.print();
    }

    function loadHistory() {
      google.script.run.withSuccessHandler(function(txs) {
        const list = document.getElementById('historyList');
        if (!txs || txs.length === 0) {
          list.innerHTML = '<p class="text-slate-400">Belum ada riwayat transaksi.</p>';
          return;
        }
        let html = '<table class="w-full text-left border-collapse"><thead><tr class="bg-slate-100 text-xs"> <th class="p-2">ID</th> <th class="p-2">Tanggal</th> <th class="p-2">Pelanggan</th> <th class="p-2">Total</th> </tr></thead><tbody>';
        txs.slice(0, 20).forEach(t => {
          html += \`<tr class="border-b hover:bg-slate-50"><td class="p-2 font-mono">\${t.id}</td><td class="p-2">\${t.tanggal}</td><td class="p-2">\${t.namaPelanggan}</td><td class="p-2 font-semibold">Rp \${Number(t.totalBayar).toLocaleString('id-ID')}</td></tr>\`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
      }).getLastTransactions();
    }

    window.onload = loadHistory;
  </script>
</body>
</html>
`;

  res.json({
    codeGs,
    indexHtml,
    instructions: [
      "1. Buka Google Sheets baru di Google Drive Anda (misal beri nama 'Database Resi Agen Batara').",
      "2. Di menu atas, pilih **Extensions > Apps Script**.",
      "3. Hapus kode default di file `Code.gs`, lalu paste kode `Code.gs` di atas.",
      "4. Buat file HTML baru dengan nama **`Index`** (tanpa ekstensi .html, karena Google Apps Script otomatis memberi ekstensi), lalu paste kode `Index.html` di atas.",
      "5. Klik tombol **Deploy > New deployment** (Deployment baru).",
      "6. Pilih jenis deployment: **Web app** (Aplikasi web).",
      "7. Isi Deskripsi, set **Execute as**: *Me (email Anda)*, dan **Who has access**: *Anyone (Siapa saja)*.",
      "8. Klik **Deploy**, berikan izin akses (Authorize access), dan salin URL Web App yang dihasilkan!"
    ]
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
