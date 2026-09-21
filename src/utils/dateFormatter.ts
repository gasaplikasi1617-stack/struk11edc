export function formatReceiptDateTime(dateInput?: string | Date): string {
  if (!dateInput) {
    dateInput = new Date();
  }
  let d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    return String(dateInput);
  }
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const month = months[d.getMonth()] || 'Sep';
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hours}.${minutes}`;
}

/**
 * Generates a clean random transaction ID (e.g. TRX-84920184)
 */
export function generateRandomTransactionId(): string {
  const randomNum = Math.floor(10000000 + Math.random() * 90000000);
  return `TRX-${randomNum}`;
}

