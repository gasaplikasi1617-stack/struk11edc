export interface AgentConfig {
  namaAgen: string;
  alamat: string;
  noHp: string;
}

export interface ReceiptData {
  id?: string;
  tanggal: string;
  idpel: string;
  namaPelanggan: string;
  pemakaian: string;
  standMeter: string;
  rincianTagihan: string;
  bulanTagihan: string;
  rpTagihan: number;
  lainLain: number;
  adminBank: number;
  totalBayar: number;
  namaAgen: string;
  alamat: string;
  noHp: string;
  status?: 'aktif' | 'tidak_aktif';
  createdAt?: string;
}

export interface GasSyncConfig {
  gasUrl: string;
  autoSync: boolean;
  lastSyncedAt?: string;
}

export interface GasSyncResult {
  success: boolean;
  message?: string;
  pulledCount?: number;
  pushedCount?: number;
  totalCount?: number;
  lastSyncedAt?: string;
  error?: string;
  data?: ReceiptData[];
}

export interface AppUser {
  id: string;
  username: string;
  password?: string;
  namaLengkap: string;
  role: 'admin' | 'kasir' | 'petugas';
  status: 'aktif' | 'nonaktif';
  createdAt: string;
  lastLogin?: string;
}

export interface AuthSession {
  user: AppUser;
  token: string;
  loginAt: string;
}
