import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { RefreshCw, Plus, AlertCircle } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import api from '../api';
import {
  Button, PageHeader, Panel, ResultBar, ResultLegend, StatusBadge, EmptyState, Skeleton, Ident,
} from '../components/ui';

// ── Yardımcılar ───────────────────────────────────────────────
const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(dateStr)) / 1000));
  if (diff < 60)    return 'az önce';
  if (diff < 3600)  return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const safeList = (s) => {
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};

// Test case statüleri → sonuç şeridi bölümleri
const caseSegments = (cases) => [
  { label: 'Geçti',          value: cases.filter(c => c.status === 'Başarılı').length,      tone: 'pass' },
  { label: 'Kaldı',          value: cases.filter(c => c.status === 'Başarısız').length,     tone: 'fail' },
  { label: 'Koşulmadı',      value: cases.filter(c => c.status === 'Test Edilmedi').length, tone: 'pending' },
  { label: 'Taslak',         value: cases.filter(c => c.status === 'Taslak').length,        tone: 'draft' },
];

// Koşum sonuçları (results JSON) → bölümler
const runSegments = (run) => {
  const r = safeList(run.results);
  const is = (x, ...v) => v.includes(x.status) || v.includes(x.run_status);
  return [
    { label: 'Geçti',    value: r.filter(x => is(x, 'Passed', 'Başarılı')).length,   tone: 'pass' },
    { label: 'Kaldı',    value: r.filter(x => is(x, 'Failed', 'Başarısız')).length,  tone: 'fail' },
    { label: 'Bloklu',   value: r.filter(x => is(x, 'Blocked', 'Bloklandı')).length, tone: 'blocked' },
    { label: 'Bekliyor', value: r.filter(x => !is(x, 'Passed', 'Başarılı', 'Failed', 'Başarısız', 'Blocked', 'Bloklandı')).length, tone: 'pending' },
  ];
};

// Plan maddeleri → bölümler
const planSegments = (plan) => {
  const items = plan.items || [];
  const n = (s) => items.filter(i => i.run_status === s).length;
  return [
    { label: 'Geçti',    value: n('Başarılı'),  tone: 'pass' },
    { label: 'Kaldı',    value: n('Başarısız'), tone: 'fail' },
    { label: 'Atlandı',  value: n('Atlandı'),   tone: 'draft' },
    { label: 'Bekliyor', value: n('Bekliyor'),  tone: 'pending' },
  ];
};

const SEVERITY_DOT = { Kritik: 'bg-rose-600', Yüksek: 'bg-rose-400', Orta: 'bg-amber-500', Düşük: 'bg-slate-400' };
const DEFECT_STATUS = { 'Open': 'Açık', 'In Progress': 'İnceleniyor', 'Re-test': 'Tekrar test', 'Resolved': 'Çözüldü' };

const summarySentence = (segs, total) => {
  if (!total) return 'Henüz test case yok.';
  const [pass, fail, pending, draft] = segs.map(s => s.value);
  const parts = [`${pass} tanesi geçti`];
  if (fail)    parts.push(`${fail} tanesi kaldı`);
  if (pending) parts.push(`${pending} tanesi henüz koşulmadı`);
  if (draft)   parts.push(`${draft} tanesi taslak`);
  const last = parts.pop();
  return `${total} test case'in ${parts.length ? parts.join(', ') + ' ve ' : ''}${last}.`;
};

// Tüm panellerin verisi; izin olmayan uç noktalar (403) boş liste döner
const fetchDashboard = async () => {
  const [p, c, pl, r, d] = await Promise.allSettled([
    api.get('/projects'), api.get('/test-cases'), api.get('/test-plans'),
    api.get('/test-runs'), api.get('/defects'),
  ]);
  const val = (x) => (x.status === 'fulfilled' ? x.value.data : []);
  return {
    data: { projects: val(p), cases: val(c), plans: val(pl), runs: val(r), defects: val(d) },
    error: p.status === 'rejected' && c.status === 'rejected' ? 'Veriler yüklenemedi. Sunucu bağlantısını kontrol edin.' : null,
  };
};

// ── Sayfa ─────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const [data, setData]       = useState({ projects: [], cases: [], plans: [], runs: [], defects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const apply = useCallback((result) => {
    setData(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchDashboard().then(r => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [apply]);

  const fetchAll = () => { setLoading(true); fetchDashboard().then(apply); };

  const overall = useMemo(() => caseSegments(data.cases), [data.cases]);
  const tested  = overall[0].value + overall[1].value;
  const passRate = tested ? Math.round((overall[0].value / tested) * 100) : null;

  const projects = useMemo(() => data.projects.map(p => {
    const cases = data.cases.filter(c => c.project_id === p.id);
    const segs = caseSegments(cases);
    const t = segs[0].value + segs[1].value;
    return { ...p, total: cases.length, segs, rate: t ? Math.round((segs[0].value / t) * 100) : null };
  }).sort((a, b) => b.total - a.total), [data.projects, data.cases]);

  const openDefects = useMemo(() => data.defects.filter(d => d.status !== 'Resolved'), [data.defects]);
  const activePlans = useMemo(() => data.plans.filter(p => p.status !== 'Tamamlandı'), [data.plans]);
  const recentRuns  = useMemo(() => [...data.runs].sort((a, b) => b.id - a.id).slice(0, 6), [data.runs]);

  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Genel durum"
        description={today}
        actions={<>
          <Button variant="ghost" size="icon" onClick={fetchAll} aria-label="Yenile" title="Yenile"
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />} />
          {can('test_cases.create') && (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/test-cases')}>Yeni test case</Button>
          )}
        </>}
      />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle size={16} className="shrink-0" /> {error}
          <button onClick={fetchAll} className="ml-auto font-medium hover:underline">Tekrar dene</button>
        </div>
      )}

      {/* ── Genel sonuç ─────────────────────────────────────── */}
      <Panel bodyClassName="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
        <div className="min-w-0">
          {loading ? (
            <><Skeleton className="h-5 w-72" /><Skeleton className="mt-5 h-3 w-full" /><Skeleton className="mt-4 h-4 w-96" /></>
          ) : (
            <>
              <p className="text-base text-slate-700 dark:text-slate-200">{summarySentence(overall, data.cases.length)}</p>
              <ResultBar segments={overall} height="h-3" className="mt-4" />
              <ResultLegend segments={overall} className="mt-3" />
            </>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-t border-slate-200 pt-5 sm:grid-cols-4 lg:grid-cols-2 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0 dark:border-slate-800">
          <Readout label="Geçme oranı" value={passRate == null ? '—' : `%${passRate}`} hint="koşulanlar içinde" />
          <Readout label="Açık hata" value={openDefects.length} to={can('defects.view') ? '/defects' : null}
            tone={openDefects.length ? 'text-rose-600 dark:text-rose-400' : null} />
          <Readout label="Aktif plan" value={activePlans.length} to={can('test_plans.view') ? '/test-plans' : null} />
          <Readout label="Proje" value={data.projects.length} to={can('projects.view') ? '/projects' : null} />
        </dl>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* ── Projeler ─────────────────────────────────────── */}
        <Panel title="Projeler" className="lg:col-span-2"
          actions={can('projects.view') && <Link to="/projects" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">Tümü</Link>}>
          {loading ? <ListSkeleton /> : projects.length === 0 ? (
            <EmptyState title="Henüz proje yok" description="Test case'leri gruplamak için bir proje oluşturun."
              action={can('projects.create') && <Button variant="primary" size="sm" onClick={() => navigate('/projects')}>Proje oluştur</Button>} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-2 font-medium">Proje</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Sonuçlar</th>
                  <th className="px-4 py-2 text-right font-medium">Geçme</th>
                  <th className="px-4 py-2 text-right font-medium">Case</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {projects.slice(0, 8).map(p => (
                  <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                      {p.status && p.status !== 'Aktif' && <span className="ml-2 text-xs text-slate-500">{p.status}</span>}
                    </td>
                    <td className="hidden w-[40%] px-4 py-2.5 sm:table-cell"><ResultBar segments={p.segs} height="h-1.5" /></td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{p.rate == null ? '—' : `%${p.rate}`}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* ── Açık hatalar ─────────────────────────────────── */}
        <Panel title="Açık hatalar"
          actions={can('defects.view') && <Link to="/defects" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">Tümü</Link>}>
          {loading ? <ListSkeleton /> : !can('defects.view') ? (
            <EmptyState title="Hataları görüntüleme izniniz yok" />
          ) : openDefects.length === 0 ? (
            <EmptyState title="Açık hata yok" description="Koşumlarda kalan testler burada listelenir." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {openDefects.slice(0, 6).map(d => (
                <li key={d.id}>
                  <Link to={`/defects/${d.code}`} className="block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[d.severity] || 'bg-slate-400'}`} title={d.severity} />
                      <Ident>{d.code}</Ident>
                      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{DEFECT_STATUS[d.status] || d.status}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">{d.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{d.project_name} · {timeAgo(d.updated_at || d.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── Aktif planlar ────────────────────────────────── */}
        <Panel title="Aktif test planları" className="lg:col-span-2"
          actions={can('test_plans.view') && <Link to="/test-plans" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">Tümü</Link>}>
          {loading ? <ListSkeleton /> : activePlans.length === 0 ? (
            <EmptyState title="Aktif plan yok" description="Bir sürüm ya da sprint için test planı oluşturup case'leri ekleyin."
              action={can('test_plans.create') && <Button size="sm" onClick={() => navigate('/test-plans')}>Plan oluştur</Button>} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activePlans.slice(0, 5).map(plan => {
                const segs = planSegments(plan);
                const done = (plan.items || []).filter(i => i.run_status !== 'Bekliyor').length;
                return (
                  <li key={plan.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_40%_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{plan.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {data.projects.find(p => p.id === plan.project_id)?.name || '—'}
                        {plan.end_date && <> · bitiş {new Date(plan.end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</>}
                      </p>
                    </div>
                    <ResultBar segments={segs} height="h-1.5" className="col-span-2 sm:col-span-1" />
                    <span className="row-start-1 text-right text-sm text-slate-600 sm:row-start-auto dark:text-slate-300">
                      {done}<span className="text-slate-400">/{(plan.items || []).length}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* ── Son koşumlar ─────────────────────────────────── */}
        <Panel title="Son koşumlar"
          actions={can('test_runs.view') && <Link to="/test-runs" className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">Tümü</Link>}>
          {loading ? <ListSkeleton /> : recentRuns.length === 0 ? (
            <EmptyState title="Henüz koşum yok" description="Bir plan ya da otomasyon koşumu başlattığınızda sonuçlar burada görünür." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentRuns.map(run => (
                <li key={run.id}>
                  <Link to={`/test-runs/${run.id}`} className="block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-slate-900 dark:text-slate-100">{run.name}</span>
                      <StatusBadge status={run.status} />
                    </div>
                    <ResultBar segments={runSegments(run)} height="h-1" className="mt-2" />
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{timeAgo(run.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};

const Readout = ({ label, value, hint, to, tone }) => {
  const body = (
    <>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tracking-tight ${tone || 'text-slate-900 dark:text-white'}`}>{value}</dd>
      {hint && <dd className="text-xs text-slate-400 dark:text-slate-500">{hint}</dd>}
    </>
  );
  return to
    ? <Link to={to} className="-m-1 block rounded-md p-1 hover:bg-slate-50 dark:hover:bg-slate-800/50">{body}</Link>
    : <div>{body}</div>;
};

const ListSkeleton = () => (
  <div className="space-y-3 p-4">
    <Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" />
  </div>
);

export default Dashboard;
