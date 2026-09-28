import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Lock,
  User,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { AppUser } from '../types';
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  getCurrentUser
} from '../services/userService';

export function UserManagementSection() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // Form Fields
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formNamaLengkap, setFormNamaLengkap] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'kasir' | 'petugas'>('kasir');
  const [formStatus, setFormStatus] = useState<'aktif' | 'nonaktif'>('aktif');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUser = getCurrentUser();

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      console.error('Failed loading users:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormNamaLengkap('');
    setFormRole('kasir');
    setFormStatus('aktif');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (u: AppUser) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword(u.password || '');
    setFormNamaLengkap(u.namaLengkap || '');
    setFormRole(u.role || 'kasir');
    setFormStatus(u.status || 'aktif');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setNotice(null);

    try {
      if (editingUser) {
        // Edit existing user
        await updateUser(editingUser.id, {
          username: formUsername,
          password: formPassword,
          namaLengkap: formNamaLengkap,
          role: formRole,
          status: formStatus,
        });
        setNotice({
          type: 'success',
          message: `User "${formUsername}" berhasil diperbarui!`,
        });
      } else {
        // Create new user
        if (!formPassword) {
          throw new Error('Password wajib diisi untuk user baru.');
        }
        await createUser({
          username: formUsername,
          password: formPassword,
          namaLengkap: formNamaLengkap,
          role: formRole,
        });
        setNotice({
          type: 'success',
          message: `User baru "${formUsername}" berhasil ditambahkan!`,
        });
      }

      await loadUsers();
      closeModal();
    } catch (err: any) {
      alert(`Gagal menyimpan user: ${err.message || String(err)}`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const handleDelete = async (userToDelete: AppUser) => {
    if (currentUser && currentUser.id === userToDelete.id) {
      alert('Anda tidak dapat menghapus akun yang sedang aktif Anda gunakan saat ini!');
      return;
    }

    const conf = confirm(
      `Apakah Anda yakin ingin menghapus user "${userToDelete.username}" (${userToDelete.namaLengkap})?\n\n` +
      `User yang dihapus tidak akan dapat login lagi ke sistem.`
    );
    if (!conf) return;

    try {
      await deleteUser(userToDelete.id);
      setNotice({
        type: 'success',
        message: `User "${userToDelete.username}" berhasil dihapus.`,
      });
      await loadUsers();
    } catch (err: any) {
      alert(`Gagal menghapus user: ${err.message || String(err)}`);
    } finally {
      setTimeout(() => setNotice(null), 5000);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      {/* Header Manajemen User */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>Manajemen User &amp; Hak Akses Kasir</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-full">
                {users.length} User
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur akun login untuk loket kasir, edit sandi, tambah user baru, atau hapus user.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadUsers}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all cursor-pointer"
            title="Refresh daftar user"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs inline-flex items-center gap-2 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah User Baru</span>
          </button>
        </div>
      </div>

      {/* Alert Notice */}
      {notice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 shadow-xs transition-all animate-fade-in ${
            notice.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="font-medium">{notice.message}</span>
        </div>
      )}

      {/* Tabel Daftar User */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <th className="p-3 w-12 text-center">No</th>
              <th className="p-3">Username</th>
              <th className="p-3">Nama Lengkap</th>
              <th className="p-3">Role / Jabatan</th>
              <th className="p-3">Password</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Users className="w-8 h-8 text-slate-300" />
                    <p className="font-semibold text-slate-600">Belum ada data user</p>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((u, idx) => {
                const isCurrent = currentUser?.id === u.id || currentUser?.username === u.username;
                return (
                  <tr key={u.id || idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 text-center text-slate-400 font-mono font-medium">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <span>{u.username}</span>
                        {isCurrent && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-blue-200">
                            Anda
                          </span>
                        )}
                        {u.username === 'kustana' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-200">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-slate-800">
                      {u.namaLengkap || '-'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          u.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : u.role === 'kasir'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        <span className="capitalize">{u.role || 'kasir'}</span>
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-700">
                        {u.password || '••••••'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          u.status === 'aktif'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.status === 'aktif' ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        />
                        <span className="capitalize">{u.status || 'aktif'}</span>
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
                          title={`Edit user ${u.username}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
                          disabled={isCurrent || users.length <= 1}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed p-1.5 rounded-lg transition-colors cursor-pointer border border-rose-200"
                          title={
                            isCurrent
                              ? 'Tidak bisa menghapus akun yang sedang Anda gunakan'
                              : `Hapus user ${u.username}`
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Info user card */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            Kelola akun user kasir dan administrator melalui tombol di atas. Anda dapat menambah akun baru, mengubah nama, role, maupun mengganti kata sandi.
          </span>
        </div>
      </div>

      {/* Modal Tambah / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs border border-white/20">
                  {editingUser ? <Edit2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-base">
                    {editingUser ? `Edit User "${editingUser.username}"` : 'Tambah User Kasir Baru'}
                  </h4>
                  <p className="text-xs text-indigo-100">
                    {editingUser ? 'Perbarui informasi dan sandi user' : 'Buat akun login baru untuk kasir'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Username <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Contoh: kasir1, budi, dll"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Lengkap Kasir / Petugas
                </label>
                <input
                  type="text"
                  value={formNamaLengkap}
                  onChange={(e) => setFormNamaLengkap(e.target.value)}
                  placeholder="Contoh: Kustana / Budi Santoso"
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Password {editingUser ? '(Kosongkan jika tidak diubah)' : <span className="text-rose-500">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!editingUser}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingUser ? 'Masukkan password baru' : 'Contoh: 222324'}
                    className="w-full px-3.5 pr-10 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Role / Jabatan
                  </label>
                  <select
                    value={formRole}
                    onChange={(e: any) => setFormRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-800 bg-white"
                  >
                    <option value="admin">Administrator</option>
                    <option value="kasir">Kasir Loket</option>
                    <option value="petugas">Petugas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Status Akun
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e: any) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-800 bg-white"
                  >
                    <option value="aktif">Aktif (Bisa Login)</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'Menyimpan...' : 'Simpan User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
