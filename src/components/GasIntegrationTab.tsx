import React, { useState, useEffect } from 'react';
import { FileCode2, Copy, Check, Terminal, ExternalLink, BookOpen } from 'lucide-react';

export function GasIntegrationTab() {
  const [gasData, setGasData] = useState<{ codeGs: string; indexHtml: string; instructions: string[] } | null>(null);
  const [copiedGs, setCopiedGs] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);

  useEffect(() => {
    fetch('/api/gas-code')
      .then((res) => res.json())
      .then((data) => setGasData(data))
      .catch((err) => console.error("Failed to load GAS code:", err));
  }, []);

  const copyToClipboard = (text: string, type: 'gs' | 'html') => {
    navigator.clipboard.writeText(text);
    if (type === 'gs') {
      setCopiedGs(true);
      setTimeout(() => setCopiedGs(false), 2000);
    } else {
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileCode2 className="w-6 h-6 text-blue-600" />
              <span>Kode Lengkap Google Apps Script (GAS)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Sesuai permintaan Anda, berikut adalah kode lengkap <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">Code.gs</code> dan <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">Index.html</code> untuk di-deploy ke Google Sheets Web App.
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="font-bold text-blue-900 text-sm mb-2 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span>Petunjuk Cara Pemasangan & Deploy di Google Apps Script:</span>
          </h3>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-blue-900">
            {gasData?.instructions ? (
              gasData.instructions.map((step, idx) => <li key={idx}>{step}</li>)
            ) : (
              <>
                <li>Buka Google Sheets di Google Drive Anda.</li>
                <li>Pilih menu <strong>Extensions &gt; Apps Script</strong>.</li>
                <li>Paste file <code>Code.gs</code> dan buat file HTML bernama <code>Index</code>.</li>
                <li>Deploy sebagai <strong>Web App</strong> dengan akses <em>Anyone</em>.</li>
              </>
            )}
          </ol>
        </div>

        {/* Code.gs Section */}
        <div className="space-y-3 mb-8">
          <div className="flex justify-between items-center">
            <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-600" />
              <span>1. File: Code.gs (Backend Google Apps Script)</span>
            </span>
            <button
              onClick={() => gasData && copyToClipboard(gasData.codeGs, 'gs')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all"
            >
              {copiedGs ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedGs ? 'Tersalin!' : 'Salin Code.gs'}</span>
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96">
            {gasData ? gasData.codeGs : 'Memuat kode...'}
          </pre>
        </div>

        {/* Index.html Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-600" />
              <span>2. File: Index.html (Frontend Web App di Apps Script)</span>
            </span>
            <button
              onClick={() => gasData && copyToClipboard(gasData.indexHtml, 'html')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all"
            >
              {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedHtml ? 'Tersalin!' : 'Salin Index.html'}</span>
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96">
            {gasData ? gasData.indexHtml : 'Memuat kode...'}
          </pre>
        </div>
      </div>
    </div>
  );
}
