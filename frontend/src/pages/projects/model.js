/** Proje statüleri ve yardımcılar */
export const PROJECT_STATUSES = ['Aktif', 'Beklemede', 'Tamamlandı'];
export const PROJECT_STATUS_TONE = { 'Aktif': 'accent', 'Beklemede': 'blocked', 'Tamamlandı': 'pass' };

export const CASE_STATUS_ORDER = ['Başarılı', 'Başarısız', 'Test Edilmedi', 'Taslak'];
export const CASE_STATUS_TONE = { 'Başarılı': 'pass', 'Başarısız': 'fail', 'Test Edilmedi': 'pending', 'Taslak': 'draft' };
export const CASE_STATUS_LABEL = { 'Başarılı': 'Geçti', 'Başarısız': 'Kaldı', 'Test Edilmedi': 'Koşulmadı', 'Taslak': 'Taslak' };

export const caseSegments = (byStatus = {}) => CASE_STATUS_ORDER.map(s => ({ label: CASE_STATUS_LABEL[s], value: byStatus[s] || 0, tone: CASE_STATUS_TONE[s] }));

/** Case son durumlarına göre geçme oranı: geçti / (geçti + kaldı) */
export const caseRate = (byStatus = {}) => {
  const p = byStatus['Başarılı'] || 0, f = byStatus['Başarısız'] || 0;
  return p + f ? Math.round((p / (p + f)) * 100) : null;
};

export const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');

export const SORTS = [
  ['activity', 'Son etkinlik'],
  ['name', 'Ad'],
  ['cases', 'Case sayısı'],
  ['defects', 'Açık hata'],
  ['created', 'Oluşturulma'],
];

const lastActivity = (p) => Math.max(new Date(p.stats?.last_run_at || 0).getTime(), new Date(p.updated_at || p.created_at || 0).getTime());

export const compareProjects = (key) => (a, b) => {
  switch (key) {
    case 'name':    return trLower(a.name).localeCompare(trLower(b.name), 'tr');
    case 'cases':   return (b.stats?.cases || 0) - (a.stats?.cases || 0);
    case 'defects': return (b.stats?.open_defects || 0) - (a.stats?.open_defects || 0) || (b.stats?.critical_defects || 0) - (a.stats?.critical_defects || 0);
    case 'created': return b.id - a.id;
    default:        return lastActivity(b) - lastActivity(a);
  }
};
