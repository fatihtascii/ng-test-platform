/**
 * Rapor hesapları — saf fonksiyonlar (bileşenden bağımsız, aynı girdiye aynı çıktı).
 * Geçme oranı her yerde aynı tanımla: geçen / (geçen + kalan); atlanan ve bekleyen paydaya girmez.
 */
import { parseResults } from '../test-runs/model';

const DAY = 86400000;

export const RANGES = [
  { value: '7', label: 'Son 7 gün', days: 7 },
  { value: '30', label: 'Son 30 gün', days: 30 },
  { value: '90', label: 'Son 90 gün', days: 90 },
  { value: 'all', label: 'Tüm zamanlar', days: null },
];
export const DEFAULT_RANGE = '30';
export const rangeOf = (value) => RANGES.find(r => r.value === value) || RANGES.find(r => r.value === DEFAULT_RANGE);

const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** Pazartesi başlangıçlı hafta */
const startOfWeek = (t) => { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * DAY; };
const ts = (iso) => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? null : t; };

export const rate = (p, f) => (p + f ? (p / (p + f)) * 100 : null);

/** Seçili aralığın [başlangıç, bitiş) zaman damgaları ve bir önceki eşit aralık */
export const periodOf = (rangeValue, now = Date.now()) => {
  const r = rangeOf(rangeValue);
  if (!r.days) return { from: null, to: null, prevFrom: null, prevTo: null, days: null };
  const to = startOfDay(now) + DAY;
  const from = to - r.days * DAY;
  return { from, to, prevFrom: from - r.days * DAY, prevTo: from, days: r.days };
};

const inPeriod = (t, from, to) => t != null && (from == null || t >= from) && (to == null || t < to);

const emptyCounts = () => ({ Passed: 0, Failed: 0, Skipped: 0, Pending: 0 });

/** Koşumları sonuçlarıyla bir kez çözümler */
export const prepareRuns = (runs) => runs.map(r => ({ ...r, t: ts(r.created_at), results: parseResults(r.results) }));

const countResults = (runs) => {
  const c = emptyCounts();
  runs.forEach(r => r.results.forEach(x => { c[x.status] += 1; }));
  return c;
};

/** Zaman serisi kovaları: ≤31 gün → günlük, aksi halde haftalık */
export const buildTrend = (runs, period) => {
  if (!runs.length) return [];
  const weekly = !period.days || period.days > 31;
  const key = weekly ? startOfWeek : startOfDay;
  const first = period.from ?? key(Math.min(...runs.map(r => r.t)));
  const last = period.to ? period.to - 1 : Date.now();
  const buckets = new Map();
  for (let t = key(first); t <= last; t = weekly ? t + 7 * DAY : startOfDay(t + DAY + 3600000)) {
    buckets.set(t, { t, runs: 0, ...emptyCounts() });
  }
  runs.forEach(r => {
    const b = buckets.get(key(r.t));
    if (!b) return;
    b.runs += 1;
    r.results.forEach(x => { b[x.status] += 1; });
  });
  const fmt = weekly ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short' };
  return [...buckets.values()].map(b => ({
    ...b,
    label: new Date(b.t).toLocaleDateString('tr-TR', fmt) + (weekly ? ' haftası' : ''),
    short: new Date(b.t).toLocaleDateString('tr-TR', fmt),
    rate: rate(b.Passed, b.Failed),
  }));
};

/** En çok kalan testler; geçti ve kaldı sonucu birlikte olanlar "kararsız" işaretlenir */
export const failingCases = (runs, caseById, limit = 8) => {
  const map = new Map();
  [...runs].sort((a, b) => a.t - b.t).forEach(run => run.results.forEach(x => {
    if (x.status === 'Pending') return;
    const e = map.get(x.caseId) || { caseId: x.caseId, Passed: 0, Failed: 0, Skipped: 0, lastFail: null, lastStatus: null, history: [] };
    e[x.status] += 1;
    e.lastStatus = x.status;
    e.history.push(x.status);
    if (x.status === 'Failed') e.lastFail = { runId: run.id, runName: run.name, at: run.created_at, note: x.note };
    map.set(x.caseId, e);
  }));
  return [...map.values()]
    .filter(e => e.Failed > 0)
    .map(e => {
      const tc = caseById.get(e.caseId);
      // Durum değişimi sayısı: art arda gelen geçti/kaldı farklılıkları
      const pf = e.history.filter(s => s !== 'Skipped');
      let flips = 0;
      for (let i = 1; i < pf.length; i += 1) if (pf[i] !== pf[i - 1]) flips += 1;
      return {
        ...e,
        title: tc?.title || e.lastFail?.note?.slice(0, 60) || `Silinmiş case #${e.caseId}`,
        priority: tc?.priority, projectId: tc?.project_id, exists: Boolean(tc),
        executions: e.Passed + e.Failed + e.Skipped,
        failRate: rate(e.Failed, e.Passed),
        flaky: e.Passed > 0 && flips >= 2,
        history: e.history.slice(-12),
      };
    })
    .sort((a, b) => b.Failed - a.Failed || (b.failRate ?? 0) - (a.failRate ?? 0) || b.executions - a.executions)
    .slice(0, limit);
};

const ACTIVE = new Set(['Open', 'In Progress', 'Re-test']);

export const defectMetrics = (defects, period) => {
  const opened = defects.filter(d => inPeriod(ts(d.created_at), period.from, period.to));
  const resolved = defects.filter(d => d.resolved_at && inPeriod(ts(d.resolved_at), period.from, period.to));
  const open = defects.filter(d => ACTIVE.has(d.status));
  const durations = resolved.map(d => (ts(d.resolved_at) - ts(d.created_at)) / DAY).filter(x => x >= 0);
  const bySeverity = ['Kritik', 'Yüksek', 'Orta', 'Düşük'].map(s => ({ severity: s, count: open.filter(d => d.severity === s).length }));
  const oldest = [...open].sort((a, b) => ts(a.created_at) - ts(b.created_at)).slice(0, 5)
    .map(d => ({ ...d, ageDays: Math.floor((Date.now() - ts(d.created_at)) / DAY) }));
  return {
    opened: opened.length, resolved: resolved.length, open: open.length,
    critical: open.filter(d => d.severity === 'Kritik').length,
    unassigned: open.filter(d => d.assignee_id == null).length,
    avgResolveDays: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    bySeverity, oldest,
  };
};

/** Tüm rapor — filtrelenmiş koşum/case/hata üzerinden */
export const buildReport = ({ runs, cases, defects, projects, plans }, { project, range }) => {
  const period = periodOf(range);
  const pid = project ? Number(project) : null;
  const byProject = (x) => pid == null || x.project_id === pid;

  const projRuns = runs.filter(byProject);
  const projCases = cases.filter(byProject);
  const projDefects = defects.filter(byProject);
  const current = projRuns.filter(r => inPeriod(r.t, period.from, period.to));
  const previous = period.from != null ? projRuns.filter(r => inPeriod(r.t, period.prevFrom, period.prevTo)) : [];

  const counts = countResults(current);
  const prevCounts = countResults(previous);
  const caseById = new Map(cases.map(c => [c.id, c]));

  const executed = new Set();
  current.forEach(r => r.results.forEach(x => { if (x.status !== 'Pending') executed.add(x.caseId); }));
  const projectCaseIds = new Set(projCases.map(c => c.id));
  const coveredCount = [...executed].filter(id => projectCaseIds.has(id)).length;

  const projectRows = projects.map(p => {
    const pr = runs.filter(r => r.project_id === p.id && inPeriod(r.t, period.from, period.to));
    const c = countResults(pr);
    const pc = cases.filter(x => x.project_id === p.id);
    const ex = new Set();
    pr.forEach(r => r.results.forEach(x => { if (x.status !== 'Pending') ex.add(x.caseId); }));
    const pcIds = new Set(pc.map(x => x.id));
    const lastRun = pr.reduce((m, r) => (!m || r.t > m.t ? r : m), null);
    return {
      id: p.id, name: p.name, runs: pr.length, counts: c, rate: rate(c.Passed, c.Failed),
      cases: pc.length, covered: [...ex].filter(id => pcIds.has(id)).length,
      openDefects: defects.filter(d => d.project_id === p.id && ACTIVE.has(d.status)).length,
      lastRun,
    };
  }).sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name, 'tr'));

  const caseStatus = ['Başarılı', 'Başarısız', 'Test Edilmedi', 'Taslak'].map(s => ({ status: s, count: projCases.filter(c => c.status === s).length }));
  const automated = projCases.filter(c => c.execution_type === 'Automated').length;

  const activePlans = plans.filter(p => byProject(p) && p.status !== 'Tamamlandı');

  return {
    period, counts, prevCounts,
    rate: rate(counts.Passed, counts.Failed),
    prevRate: previous.length ? rate(prevCounts.Passed, prevCounts.Failed) : null,
    runs: current.length, prevRuns: previous.length,
    automationRuns: current.filter(r => r.source === 'automation').length,
    executedResults: counts.Passed + counts.Failed + counts.Skipped,
    totalCases: projCases.length, coveredCount,
    coverage: projCases.length ? (coveredCount / projCases.length) * 100 : null,
    trend: buildTrend(current, period),
    failing: failingCases(current, caseById),
    defects: defectMetrics(projDefects, period),
    projectRows, caseStatus, automated, activePlans,
    recentRuns: [...current].sort((a, b) => b.t - a.t),
  };
};

export const fmtPct = (v, digits = 0) => (v == null ? '—' : `%${v.toFixed(digits)}`);
