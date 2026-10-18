/**
 * Koşum veri modeli: statüler, sonuçların okunması/yazılması, özetler.
 *
 * Sonuçlar sunucuda JSON metin olarak durur ve iki kaynaktan gelir:
 *   manuel koşucu  → { test_case_id, status, actual_result }
 *   otomasyon      → { case_id, status, error }
 * Arayüz ikisini tek biçime çevirir; kaydederken alanlar korunur.
 */

export const RUN_STATUSES = ['Aktif', 'Beklemede', 'Tamamlandı', 'Başarısız'];
export const EDITABLE_RUN_STATUSES = ['Aktif', 'Beklemede', 'Tamamlandı'];
export const FINISHED = new Set(['Tamamlandı', 'Başarısız']);

// Koşum statüsü tonları (StatusBadge)
export const RUN_STATUS_TONE = { 'Aktif': 'accent', 'Beklemede': 'blocked', 'Tamamlandı': 'pass', 'Başarısız': 'fail' };
// "Başarısız" otomasyonun bitmiş ama hata içeren koşumu demek; kullanıcıya böyle anlatılır
export const RUN_STATUS_LABEL = { 'Aktif': 'Sürüyor', 'Beklemede': 'Beklemede', 'Tamamlandı': 'Tamamlandı', 'Başarısız': 'Hatalarla bitti' };

export const RESULTS = ['Passed', 'Failed', 'Skipped', 'Pending'];
export const RESULT_LABEL = { Passed: 'Geçti', Failed: 'Kaldı', Skipped: 'Atlandı', Pending: 'Bekliyor' };
export const RESULT_TONE = { Passed: 'pass', Failed: 'fail', Skipped: 'blocked', Pending: 'pending' };

const RESULT_ALIASES = {
  Passed: 'Passed', 'Başarılı': 'Passed', Failed: 'Failed', 'Başarısız': 'Failed',
  Skipped: 'Skipped', 'Atlandı': 'Skipped', Pending: 'Pending', 'Bekliyor': 'Pending', Untested: 'Pending',
};

export const runIdent = (id) => `KS-${id}`;

/** Ham sonuç listesini { caseId, status, note, raw } biçimine çevirir. */
export const parseResults = (raw) => {
  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch { list = []; }
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && typeof r === 'object').map(r => ({
    caseId: Number(r.test_case_id ?? r.case_id),
    status: RESULT_ALIASES[r.status || r.run_status] || 'Pending',
    note: r.actual_result || r.error || '',
    raw: r,
  })).filter(r => Number.isFinite(r.caseId));
};

/** Arayüz biçimini sunucuya yazılacak JSON'a çevirir (bilinmeyen alanlar korunur). */
export const serializeResults = (results) => JSON.stringify(results.map(({ caseId, status, note, raw }) => {
  const { case_id: _drop, ...rest } = raw || {};
  void _drop;
  return { ...rest, test_case_id: caseId, status, actual_result: note || '' };
}));

export const summarize = (results) => {
  const s = { total: results.length, Passed: 0, Failed: 0, Skipped: 0, Pending: 0 };
  results.forEach(r => { s[r.status] += 1; });
  s.done = s.Passed + s.Failed + s.Skipped;
  s.progress = s.total ? Math.round((s.done / s.total) * 100) : 0;
  // Tüm uygulamada aynı tanım: geçen / koşulan
  s.rate = s.Passed + s.Failed ? Math.round((s.Passed / (s.Passed + s.Failed)) * 100) : null;
  return s;
};

export const segmentsOf = (s) => [
  { label: 'Geçti', value: s.Passed, tone: 'pass' },
  { label: 'Kaldı', value: s.Failed, tone: 'fail' },
  { label: 'Atlandı', value: s.Skipped, tone: 'blocked' },
  { label: 'Bekliyor', value: s.Pending, tone: 'pending' },
];

export const toPayload = (run, patch = {}) => ({
  name: run.name,
  description: run.description || null,
  status: run.status,
  project_id: Number(run.project_id),
  test_plan_id: run.test_plan_id ? Number(run.test_plan_id) : null,
  results: run.results ?? '[]',
  ...patch,
});

export const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');

export const formatDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', withTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};

/** "3 dk önce" gibi göreli zaman */
export const relativeTime = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} gün önce`;
  return formatDate(iso);
};
