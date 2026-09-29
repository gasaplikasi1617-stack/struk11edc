import React, { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, LogIn, AlertCircle, KeyRound, Shield, Check } from 'lucide-react';
import { loginUser, syncUsersWithServer } from '../services/userService';
import { AppUser } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: AppUser) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [publicUsers, setPublicUsers] = useState<Array<{ username: string; role: string; namaLengkap: string }>>([]);

  // Otomatis sinkronkan daftar akun dari server & cloud saat layar login dibuka
  useEffect(() => {
    syncUsersWithServer().catch(() => {});
    fetch('/api/users/public')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPublicUsers(data);
      })
      .catch(() => {});
  }, []);

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = await loginUser(username, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(
        err.message ||
          'Login gagal. Silakan periksa kembali username dan password Anda atau klik opsi login cepat di bawah.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md">
        {/* Card Login */}
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden backdrop-blur-xs">
          {/* Header Brand */}
          <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white text-center relative">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl shadow-lg p-2 border-2 border-white/60 mb-3 mx-auto overflow-hidden">
              <img
                src="https://iili.io/nRihMkG.png"
                alt="Logo Agen Batara"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/logo.png';
                }}
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              PPOB Agen11EDC
            </h1>
            <p className="text-xs text-blue-100 font-medium mt-1">
              Agen Batara — Sistem Loket Pembayaran &amp; Kasir PPOB
            </p>
          </div>

          {/* Form Login */}
          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-slate-800">Silakan Masuk</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Masukkan akun pengguna Anda untuk mengakses sistem loket
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex flex-col gap-2 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{error}</span>
                </div>
                <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-rose-700">Masuk cepat:</span>
                  <button
                    type="button"
                    onClick={() => handleQuickFill('kustana', '222324')}
                    className="font-bold underline text-blue-700 hover:text-blue-900 cursor-pointer text-xs"
                  >
                    Gunakan kustana / 222324
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError(null);
                    }}
                    placeholder="Masukkan username"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Masukkan password"
                    className="w-full pl-10 pr-11 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-800 font-medium"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    tabIndex={-1}
                    title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Memverifikasi Akun...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Masuk ke Dashboard</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Fill Buttons & Akun Bawaan */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pilihan Akun Siap Pakai:</span>
                </span>
                <span className="text-[10px] text-slate-400">Klik untuk isi otomatis</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('kustana', '222324')}
                  className="p-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-left transition-all cursor-pointer group"
                >
                  <div className="font-bold text-xs text-blue-900 group-hover:text-blue-950 flex items-center justify-between">
                    <span>kustana</span>
                    <span className="text-[9px] bg-blue-200 text-blue-800 px-1.5 py-0.2 rounded-full font-semibold">Admin</span>
                  </div>
                  <div className="text-[10px] text-blue-600 font-mono mt-0.5">Sandi: 222324</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('admin', '222324')}
                  className="p-2 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-left transition-all cursor-pointer group"
                >
                  <div className="font-bold text-xs text-indigo-900 group-hover:text-indigo-950 flex items-center justify-between">
                    <span>admin</span>
                    <span className="text-[9px] bg-indigo-200 text-indigo-800 px-1.5 py-0.2 rounded-full font-semibold">Admin</span>
                  </div>
                  <div className="text-[10px] text-indigo-600 font-mono mt-0.5">Sandi: 222324</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('kasir', '222324')}
                  className="p-2 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-left transition-all cursor-pointer group"
                >
                  <div className="font-bold text-xs text-emerald-900 group-hover:text-emerald-950 flex items-center justify-between">
                    <span>kasir</span>
                    <span className="text-[9px] bg-emerald-200 text-emerald-800 px-1.5 py-0.2 rounded-full font-semibold">Kasir</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 font-mono mt-0.5">Sandi: 222324</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('kasir1', '222324')}
                  className="p-2 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-left transition-all cursor-pointer group"
                >
                  <div className="font-bold text-xs text-amber-900 group-hover:text-amber-950 flex items-center justify-between">
                    <span>kasir1</span>
                    <span className="text-[9px] bg-amber-200 text-amber-800 px-1.5 py-0.2 rounded-full font-semibold">Kasir</span>
                  </div>
                  <div className="text-[10px] text-amber-600 font-mono mt-0.5">Sandi: 222324</div>
                </button>
              </div>

              {publicUsers.filter(u => !['kustana', 'admin', 'kasir', 'kasir1'].includes(u.username)).length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-100">
                  <div className="text-[11px] text-slate-500 mb-1.5 font-medium">Akun Custom Terdaftar Lainnya:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {publicUsers
                      .filter(u => !['kustana', 'admin', 'kasir', 'kasir1'].includes(u.username))
                      .map((u) => (
                        <button
                          key={u.username}
                          type="button"
                          onClick={() => handleQuickFill(u.username, '')}
                          className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg font-medium cursor-pointer"
                        >
                          {u.username} ({u.role})
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          PPOB Agen11EDC &copy; 2026 Agen Batara — Bekasi
        </p>
      </div>
    </div>
  );
}

