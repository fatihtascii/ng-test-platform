/** Arayüz sabitleri ve yardımcıları (bileşen dosyası yalnızca bileşen export etsin diye ayrı). */

// ── Sonuç tonları ─────────────────────────────────────────────
export const TONES = {
  pass:    { bar: 'bg-emerald-500',                    dot: 'bg-emerald-500',             text: 'text-emerald-700 dark:text-emerald-400', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  fail:    { bar: 'bg-rose-500',                       dot: 'bg-rose-500',                text: 'text-rose-700 dark:text-rose-400',       soft: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' },
  blocked: { bar: 'bg-amber-500',                      dot: 'bg-amber-500',               text: 'text-amber-700 dark:text-amber-400',     soft: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400' },
  pending: { bar: 'bg-slate-300 dark:bg-slate-600',    dot: 'bg-slate-400',               text: 'text-slate-600 dark:text-slate-400',     soft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  draft:   { bar: 'bg-slate-200 dark:bg-slate-700',    dot: 'ring-1 ring-inset ring-slate-400 bg-transparent', text: 'text-slate-500 dark:text-slate-400', soft: 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-transparent dark:ring-slate-700 dark:text-slate-400' },
  info:    { bar: 'bg-blue-500',                       dot: 'bg-blue-500',                text: 'text-blue-700 dark:text-blue-400',       soft: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' },
  accent:  { bar: 'bg-indigo-600',                     dot: 'bg-indigo-600',              text: 'text-indigo-700 dark:text-indigo-300',   soft: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' },
};

// Uygulamadaki farklı statü adlarını tek bir tona eşler
const STATUS_TONE = {
  'Başarılı': 'pass', 'Passed': 'pass', 'Geçti': 'pass', 'Tamamlandı': 'pass', 'Resolved': 'pass',
  'Başarısız': 'fail', 'Failed': 'fail', 'Kaldı': 'fail', 'Open': 'fail',
  'Bloklandı': 'blocked', 'Blocked': 'blocked', 'In Progress': 'blocked', 'Beklemede': 'blocked',
  'Bekliyor': 'pending', 'Test Edilmedi': 'pending', 'Untested': 'pending', 'Atlandı': 'pending', 'Re-test': 'info',
  'Taslak': 'draft', 'Aktif': 'accent',
};
export const toneOf = (status) => STATUS_TONE[status] || 'pending';

export const initialsOf = (name = '', username = '') => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toLocaleUpperCase('tr-TR');
  if (parts.length === 1) return parts[0][0].toLocaleUpperCase('tr-TR');
  return (username?.[0] || '?').toLocaleUpperCase('tr-TR');
};

export const ROLE_LABELS = { admin: 'Admin', manager: 'Test yöneticisi', tester: 'Test uzmanı', viewer: 'İzleyici' };

// Standart metin girişi (form alanları)
export const inputCls =
  'block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-white';

// Çok satırlı metin alanı
export const textareaCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-white';

// Rol renkleri: anlam taşımayan kimlik rengi, yalnızca küçük bir nokta olarak kullanılır
export const ROLE_DOT = {
  rose: 'bg-rose-500', amber: 'bg-amber-500', indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500', violet: 'bg-slate-500', slate: 'bg-slate-400',
};
export const ROLE_COLORS = Object.keys(ROLE_DOT);
