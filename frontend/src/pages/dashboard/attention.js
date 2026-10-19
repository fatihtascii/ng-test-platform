/**
 * Genel durum: "Dikkat gerektirenler" — panellere dağılmış verilerden tek listede yapılacaklar çıkarır.
 * Saf fonksiyon; yetkisi olmayan veriler zaten boş liste gelir, bağlantılar yetkiye göre süzülür.
 *
 * Her madde: { key, tone: 'fail'|'warn'|'info', title, detail?, to, count? }
 */
const ACTIVE = new Set(['Open', 'In Progress', 'Re-test']);
const DAY = 86400000;
const RANK = { fail: 0, warn: 1, info: 2 };

const parse = (raw) => {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const failedIn = (run) => parse(run.results).filter(r => ['Failed', 'Başarısız'].includes(r.status || r.run_status)).length;
const localDay = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

export const attentionItems = ({ cases, plans, runs, defects, projects, suites, me, can, now = Date.now() }) => {
  const out = [];
  const projectName = (id) => projects.find(p => p.id === id)?.name || '—';
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  // 1) Projelerin son otomasyon koşumunda kalanlar
  if (can('test_runs.view')) {
    const latest = new Map();
    runs.filter(r => r.source === 'automation' && !r.is_defect)
      .forEach(r => { if (!latest.has(r.project_id) || latest.get(r.project_id).id < r.id) latest.set(r.project_id, r); });
    [...latest.values()].sort((a, b) => b.id - a.id).forEach(r => {
      const n = failedIn(r);
      if (!n) return;
      out.push({
        key: `run-${r.id}`, tone: 'fail', count: n,
        title: `KS-${r.id} son otomasyon koşumunda ${n} test kaldı`, detail: projectName(r.project_id),
        to: can('test_cases.view') ? `/test-cases?run=${r.id}&runres=Failed` : `/test-runs/${r.id}`,
      });
    });
  }

  // 2) Hata kayıtları
  if (can('defects.view')) {
    const open = defects.filter(d => ACTIVE.has(d.status));
    const critical = open.filter(d => d.severity === 'Kritik');
    if (critical.length) out.push({ key: 'bug-critical', tone: 'fail', count: critical.length, title: `${critical.length} kritik hata açık`, to: '/defects?status=active&severity=Kritik' });
    const mine = me ? open.filter(d => d.assignee_id === me.id) : [];
    if (mine.length) out.push({ key: 'bug-mine', tone: 'warn', count: mine.length, title: `Size atanmış ${mine.length} açık hata`, to: '/defects?status=active&assignee=me' });
    const retest = open.filter(d => d.status === 'Re-test');
    if (retest.length) out.push({ key: 'bug-retest', tone: 'warn', count: retest.length, title: `${retest.length} hata tekrar test bekliyor`, detail: 'Düzeltildi denen kayıtları doğrulayın', to: '/defects?status=Re-test' });
    const unassigned = open.filter(d => d.assignee_id == null);
    if (unassigned.length) out.push({ key: 'bug-unassigned', tone: 'info', count: unassigned.length, title: `${unassigned.length} açık hata kimseye atanmamış`, to: '/defects?status=active&assignee=none' });
  }

  // 3) Planlar: süresi geçen / yaklaşan, kalan kalemi olan
  if (can('test_plans.view')) {
    plans.filter(p => p.status !== 'Tamamlandı').forEach(p => {
      const items = p.items || [];
      const pending = items.filter(i => i.run_status === 'Bekliyor').length;
      const failed = items.filter(i => i.run_status === 'Başarısız').length;
      if (p.end_date && pending) {
        const left = Math.round((localDay(p.end_date) - today.getTime()) / DAY);
        if (left < 0) out.push({ key: `plan-late-${p.id}`, tone: 'fail', count: pending, title: `TP-${p.id} planının süresi ${-left} gün önce doldu`, detail: `${p.title} · ${pending} case bekliyor`, to: `/test-plans/${p.id}` });
        else if (left <= 3) out.push({ key: `plan-soon-${p.id}`, tone: 'warn', count: pending, title: `TP-${p.id} planı ${left === 0 ? 'bugün' : `${left} gün içinde`} bitiyor`, detail: `${p.title} · ${pending} case bekliyor`, to: `/test-plans/${p.id}` });
      }
      if (failed) out.push({ key: `plan-fail-${p.id}`, tone: 'warn', count: failed, title: `TP-${p.id} planında ${failed} case kaldı`, detail: p.title, to: `/test-plans/${p.id}` });
    });
  }

  // 4) Otomasyon: hiç koşulmamış otomasyon case'leri, hatalı depolar
  if (can('test_cases.view')) {
    const neverRun = cases.filter(c => c.execution_type === 'Automated' && c.status === 'Test Edilmedi').length;
    if (neverRun) out.push({ key: 'auto-never', tone: 'info', count: neverRun, title: `${neverRun} otomasyon case'i hiç koşulmadı`, to: '/test-cases?exec=Automated&status=Test%20Edilmedi' });
    const drafts = cases.filter(c => c.status === 'Taslak').length;
    if (drafts) out.push({ key: 'case-draft', tone: 'info', count: drafts, title: `${drafts} case taslak durumda`, detail: 'Gözden geçirip koşuma hazırlayın', to: '/test-cases?status=Taslak' });
  }
  if (can('automation.view')) {
    suites.filter(s => s.sync_status === 'error' && !s.syncing).forEach(s => out.push({
      key: `suite-${s.id}`, tone: 'fail', title: `"${s.name}" deposu okunamadı`, detail: 'Senkronizasyon hatası', to: '/automation?tab=depolar',
    }));
  }

  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
};
