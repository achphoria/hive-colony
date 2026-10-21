// Panggilan "Queen Bea" di kalimat rapat. Dipakai rapat suara (LiveKit) dan ruang video (Cloudflare).
// Pengenal suara sering menulis "Queen" sebagai "kuin"/"quin"/"kwin", jadi semuanya diterima.
const WAKE = /\b(queen|kuin|quin|quinn|kwin)\b/i;

// null = bukan panggilan; { wakeOnly: true } = hanya memanggil nama (pertanyaan menyusul di kalimat
// berikutnya); { wakeOnly: false } = kalimat ini sendiri pertanyaannya.
export function queenCall(text) {
  let m = String(text || '').match(WAKE);
  // "Queen Bea ..." di mana saja, atau "Queen, ..." di awal kalimat (bukan "queen size bed")
  if (m) {
    const named = /^[\s,.:!?-]*(bea|bee|bi|b)\b/i.test(text.slice(m.index + m[0].length));
    const atStart = text.slice(0, m.index).trim().split(/\s+/).filter(Boolean).length <= 1;
    if (!named && !atStart) m = null;
  }
  if (!m) return null;
  const rest = text
    .slice(m.index + m[0].length)
    .replace(/^[\s,.:!?-]*(bea|bee|bi|b)?\b[\s,.:!?-]*/i, '')
    .trim();
  return { wakeOnly: rest.split(/\s+/).filter(Boolean).length < 3 };
}
