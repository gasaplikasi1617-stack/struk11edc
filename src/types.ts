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
  createdAt?: string;
}
