/** Hata kayıtları: statüler, önem dereceleri, biçimlendirme ve dışa aktarma yardımcıları. */

export const STATUSES = [
  { value: 'Open',        label: 'Açık',        tone: 'fail' },
  { value: 'In Progress', label: 'İnceleniyor', tone: 'blocked' },
  { value: 'Re-test',     label: 'Tekrar test', tone: 'info' },
  { value: 'Resolved',    label: 'Çözüldü',     tone: 'pass' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.value, s.label]));
export const STATUS_TONE  = Object.fromEntries(STATUSES.map(s => [s.value, s.tone]));
export const ACTIVE_STATUSES = new Set(['Open', 'In Progress', 'Re-test']);
/** Statü filtresinde "çözülmemiş tümü" anlamına gelen sanal değer */
export const ACTIVE = 'active';

export const SEVERITIES = ['Kritik', 'Yüksek', 'Orta', 'Düşük'];
export const SEVERITY_RANK = { 'Kritik': 4, 'Yüksek': 3, 'Orta': 2, 'Düşük': 1 };
export const SEVERITY_TONE = { 'Kritik': 'fail', 'Yüksek': 'blocked', 'Orta': 'pending', 'Düşük': 'draft' };

export const SOURCE_LABEL = { auto: 'Koşumdan', manual: 'Manuel' };

export const defectIdent = (id) => `BUG-${id}`;
/** URL'deki "BUG-12" (eski bağlantılarda "BUG-12-0") veya "12" → 12 */
export const parseDefectParam = (raw) => {
  const s = String(raw ?? '');
  const m = s.match(/^BUG-(\d+)/i) || s.match(/^(\d+)$/);
  return m ? Number(m[1]) : null;
};

export const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');

export const currentUser = () => {
  try { return JSON.parse(localStorage.getItem('user')) || null; } catch { return null; }
};

export const userName = (u) => u ? (u.full_name || u.username) : '';

export const matchesQuery = (d, q) => {
  const needle = trLower(q.trim());
  if (!needle) return true;
  if (defectIdent(d.id).toLowerCase() === needle || String(d.id) === needle.replace(/^#/, '')) return true;
  return [d.title, d.description, d.test_run_name, d.assignee_name, ...(d.failed_details || []).map(f => f.title)]
    .some(v => v && trLower(v).includes(needle));
};

export const compareDefects = (key) => (a, b) => {
  switch (key) {
    case 'severity': return (SEVERITY_RANK[a.severity] || 0) - (SEVERITY_RANK[b.severity] || 0);
    case 'status':   return STATUSES.findIndex(s => s.value === a.status) - STATUSES.findIndex(s => s.value === b.status);
    case 'title':    return trLower(a.title).localeCompare(trLower(b.title), 'tr');
    case 'assignee': return trLower(a.assignee_name || '~').localeCompare(trLower(b.assignee_name || '~'), 'tr');
    case 'updated':  return new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at);
    default:         return a.id - b.id;
  }
};

export const statusCounts = (defects) => {
  const c = Object.fromEntries(STATUSES.map(s => [s.value, 0]));
  defects.forEach(d => { if (d.status in c) c[d.status] += 1; });
  return c;
};

export const statusSegments = (counts) => STATUSES.map(s => ({ label: s.label, value: counts[s.value] || 0, tone: s.tone }));

/** Açık kaldığı süre: çözüldüyse çözülene kadar, değilse bugüne kadar */
export const ageDays = (d) => {
  const start = new Date(d.created_at).getTime();
  const end = d.status === 'Resolved' && d.resolved_at ? new Date(d.resolved_at).getTime() : Date.now();
  return Number.isNaN(start) ? null : Math.max(0, Math.floor((end - start) / 86400000));
};

/** Jira/Slack'e yapıştırmaya uygun düz metin rapor */
export const defectReport = (d) => {
  const lines = [
    `[${defectIdent(d.id)}] ${d.title}`,
    `Durum: ${STATUS_LABEL[d.status] || d.status} · Önem: ${d.severity} · Proje: ${d.project_name || '—'}`,
  ];
  if (d.assignee_name) lines.push(`Atanan: ${d.assignee_name}`);
  if (d.test_run_id) lines.push(`Koşum: KS-${d.test_run_id} ${d.test_run_name || ''}`.trim());
  if (d.description) lines.push('', d.description);
  if (d.failed_details?.length) {
    lines.push('', `Hatalı testler (${d.failed_details.length}):`);
    d.failed_details.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.case_id ? `TC-${f.case_id} ` : ''}${f.title || 'İsimsiz test'}${f.severity ? ` [${f.severity}]` : ''}`);
      if (f.error) lines.push(`   → ${String(f.error).split('\n')[0].slice(0, 300)}`);
    });
  }
  return lines.join('\n');
};

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const defectsToCsv = (defects) => {
  const head = ['ID', 'Başlık', 'Durum', 'Önem', 'Proje', 'Kaynak', 'Koşum', 'Hatalı test', 'Atanan', 'Açan', 'Oluşturuldu', 'Çözüldü', 'Güncellendi'];
  const rows = defects.map(d => [
    defectIdent(d.id), d.title, STATUS_LABEL[d.status] || d.status, d.severity, d.project_name,
    SOURCE_LABEL[d.source] || d.source, d.test_run_id ? `KS-${d.test_run_id}` : '', d.failed_count,
    d.assignee_name || '', d.created_by_name || '', d.created_at || '', d.resolved_at || '', d.updated_at || '',
  ]);
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
};

/** Test case açıklamasındaki adımları okur (JSON {steps:[...]} veya düz metin) */
export const caseSteps = (description) => {
  if (!description) return [];
  const text = String(description);
  if (text.trim().startsWith('{')) {
    try {
      const p = JSON.parse(text);
      return Array.isArray(p.steps) ? p.steps.filter(s => s && (s.action || s.expectedResult)) : [];
    } catch { /* düz metin */ }
  }
  return [{ action: text, expectedResult: '' }];
};
