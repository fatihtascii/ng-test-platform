/** Kullanıcı ekranı yardımcıları (bileşen dışı). */
export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Şifre kuralları — sunucudaki doğrulamayla aynı. */
export const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, label: 'En az 8 karakter' },
  { test: (p) => /[A-ZÇĞİÖŞÜ]/.test(p), label: 'Bir büyük harf' },
  { test: (p) => /\d/.test(p), label: 'Bir rakam' },
];

export const passwordOk = (p) => p.length >= 8 && /[A-ZÇĞİÖŞÜ]/.test(p) && /\d/.test(p);

/** Kurallara uyan, okunması kolay rastgele şifre (karışan karakterler yok). */
export const generatePassword = (len = 14) => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghijkmnopqrstuvwxyz', digit = '23456789', sym = '!@#$%*?';
  const all = upper + lower + digit + sym;
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const chars = [upper[rnd(upper.length)], lower[rnd(lower.length)], digit[rnd(digit.length)], sym[rnd(sym.length)]];
  while (chars.length < len) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
};

export const relativeTime = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');
