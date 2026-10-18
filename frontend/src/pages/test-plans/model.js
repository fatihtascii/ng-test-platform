/** Test planı veri modeli: statüler, kalem sonuçları, özet ve tarih yardımcıları. */

export const PLAN_STATUSES = ['Aktif', 'Beklemede', 'Tamamlandı'];
export const PLAN_STATUS_TONE = { 'Aktif': 'accent', 'Beklemede': 'blocked', 'Tamamlandı': 'pass' };

export const ITEM_STATUSES = ['Bekliyor', 'Başarılı', 'Başarısız', 'Atlandı'];
export const ITEM_LABEL = { 'Bekliyor': 'Bekliyor', 'Başarılı': 'Geçti', 'Başarısız': 'Kaldı', 'Atlandı': 'Atlandı' };
export const ITEM_TONE = { 'Bekliyor': 'pending', 'Başarılı': 'pass', 'Başarısız': 'fail', 'Atlandı': 'blocked' };

export const planIdent = (id) => `TP-${id}`;

export const planStats = (plan) => {
  const s = { total: 0, 'Bekliyor': 0, 'Başarılı': 0, 'Başarısız': 0, 'Atlandı': 0 };
  (plan?.items || []).forEach(i => { s.total += 1; s[i.run_status] = (s[i.run_status] || 0) + 1; });
  s.done = s['Başarılı'] + s['Başarısız'] + s['Atlandı'];
  s.progress = s.total ? Math.round((s.done / s.total) * 100) : 0;
  s.rate = s['Başarılı'] + s['Başarısız'] ? Math.round((s['Başarılı'] / (s['Başarılı'] + s['Başarısız'])) * 100) : null;
  return s;
};

export const planSegments = (s) => [
  { label: 'Geçti', value: s['Başarılı'], tone: 'pass' },
  { label: 'Kaldı', value: s['Başarısız'], tone: 'fail' },
  { label: 'Atlandı', value: s['Atlandı'], tone: 'blocked' },
  { label: 'Bekliyor', value: s['Bekliyor'], tone: 'pending' },
];

const dayMs = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const formatDay = (ymd) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const dateRange = (plan) => {
  if (!plan.start_date && !plan.end_date) return '';
  if (plan.start_date && plan.end_date) return `${formatDay(plan.start_date)} – ${formatDay(plan.end_date)}`;
  return plan.start_date ? `${formatDay(plan.start_date)} başlangıç` : `${formatDay(plan.end_date)} bitiş`;
};

/** Bitiş tarihine göre durum: { text, tone } | null. Tamamlanan planda gösterilmez. */
export const deadlineOf = (plan) => {
  if (!plan.end_date || plan.status === 'Tamamlandı') return null;
  const end = new Date(`${plan.end_date}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const days = Math.round((end - startOfDay(new Date())) / dayMs);
  if (days < 0) return { text: `${-days} gün gecikti`, tone: 'fail' };
  if (days === 0) return { text: 'Bugün bitiyor', tone: 'blocked' };
  if (days <= 3) return { text: `${days} gün kaldı`, tone: 'blocked' };
  return { text: `${days} gün kaldı`, tone: 'pending' };
};

export const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');
