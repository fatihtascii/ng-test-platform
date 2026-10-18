/**
 * Proje özeti: case durumu, son koşumlar, süren planlar, açık hatalar ve ortamlar.
 * Her panel ilgili listeye proje filtresiyle bağlanır (?project=ID).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, MoreHorizontal, PlayCircle, BarChart3, FolderKanban, Plus } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useCrumbLabel } from '../hooks/useCrumbLabel';
import { Button, Panel, ResultBar, ResultLegend, StatusBadge, EmptyState, Skeleton, Ident } from '../components/ui';
import { Menu, MenuItem } from '../components/ui/overlay';
import { TONES } from '../components/ui/tokens';
import { projectsApi, testPlansApi, defectsApi, environmentsApi, fetchAllTestRuns, fetchAllTestCases } from '../api';
import { parseResults, summarize, segmentsOf, relativeTime, formatDate, RUN_STATUS_LABEL, RUN_STATUS_TONE } from './test-runs/model';
import { planStats, planSegments, planIdent } from './test-plans/model';
import { STATUS_LABEL as DEFECT_STATUS_LABEL, STATUS_TONE as DEFECT_STATUS_TONE, SEVERITY_TONE, ACTIVE_STATUSES } from './defects/model';
import { KpiTile } from './reports/parts';
import ProjectFormDrawer from './projects/ProjectFormDrawer';
import DeleteProjectDialog from './projects/DeleteProjectDialog';
import { PROJECT_STATUS_TONE, caseSegments, caseRate } from './projects/model';

const DAY = 86400000;
const PRIORITIES = ['Kritik', 'Yüksek', 'Orta', 'Düşük'];
const PRIORITY_TONE = { 'Kritik': 'fail', 'Yüksek': 'blocked', 'Orta': 'pending', 'Düşük': 'draft' };

const More = ({ to, children = 'Tümü' }) => (
  <Link to={to} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">{children}</Link>
);

const Empty = ({ children, action }) => (
  <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{children}{action && <div className="mt-3">{action}</div>}</div>
);

const ProjectDetail = () => {
  const { id } = useParams();
  const pid = Number(id);
  const navigate = useNavigate();
  const { can } = usePermission();

  const [state, setState] = useState({ loading: true, error: null, notFound: false });
  const [project, setProject] = useState(null);
  const [data, setData] = useState({ runs: [], cases: [], plans: [], defects: [], envs: [], loadedAt: 0 });
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => Promise.all([
    projectsApi.getOne(pid, { with_stats: true }).then(r => r.data),
    fetchAllTestRuns({ project_id: pid }).catch(() => []),
    fetchAllTestCases({ project_id: pid }).catch(() => []),
    testPlansApi.getAll().then(r => r.data.filter(p => p.project_id === pid)).catch(() => []),
    can('defects.view') ? defectsApi.getAll({ project_id: pid }).then(r => r.data).catch(() => []) : Promise.resolve([]),
    can('environments.view') ? environmentsApi.getAll({ project_id: pid }).then(r => r.data).catch(() => []) : Promise.resolve([]),
  ]), [pid, can]);

  useEffect(() => {
    let alive = true;
    if (!Number.isInteger(pid) || pid <= 0) return undefined;
    load().then(([p, runs, cases, plans, defects, envs]) => {
      if (!alive) return;
      setProject(p);
      setData({ runs, cases, plans, defects, envs, loadedAt: Date.now() });
      setState({ loading: false, error: null, notFound: false });
    }).catch(e => { if (alive) setState({ loading: false, error: e.message, notFound: e.status === 404 }); });
    return () => { alive = false; };
  }, [pid, load]);

  useCrumbLabel(project?.name);

  const view = useMemo(() => {
    const runs = [...data.runs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(r => ({ ...r, summary: summarize(parseResults(r.results)) }));
    // Son 30 gün geçme oranı ve önceki 30 güne göre fark
    const now = data.loadedAt;
    const sumRange = (from, to) => runs.filter(r => { const t = new Date(r.created_at).getTime(); return t >= from && t < to; })
      .reduce((s, r) => ({ p: s.p + r.summary.Passed, f: s.f + r.summary.Failed, n: s.n + 1 }), { p: 0, f: 0, n: 0 });
    const cur = sumRange(now - 30 * DAY, now + DAY), prev = sumRange(now - 60 * DAY, now - 30 * DAY);
    const rate = cur.p + cur.f ? (cur.p / (cur.p + cur.f)) * 100 : null;
    const prevRate = prev.p + prev.f ? (prev.p / (prev.p + prev.f)) * 100 : null;
    const openDefects = data.defects.filter(d => ACTIVE_STATUSES.has(d.status))
      .sort((a, b) => (PRIORITIES.indexOf(a.severity) - PRIORITIES.indexOf(b.severity)) || b.id - a.id);
    const priorities = PRIORITIES.map(p => {
      const list = data.cases.filter(c => c.priority === p);
      return { p, total: list.length, failed: list.filter(c => c.status === 'Başarısız').length };
    });
    const activePlans = data.plans.filter(p => p.status !== 'Tamamlandı');
    return { runs, rate, prevRate, cur, openDefects, priorities, activePlans };
  }, [data]);

  if (!Number.isInteger(pid) || pid <= 0 || state.notFound || (state.error && !project)) {
    return (
      <EmptyState icon={<FolderKanban size={24} />} className="py-20"
        title={state.notFound || !(pid > 0) ? 'Proje bulunamadı' : 'Proje yüklenemedi'}
        description={state.notFound || !(pid > 0) ? 'Proje silinmiş ya da bağlantı hatalı olabilir.' : state.error}
        action={<Button icon={<ArrowLeft size={14} />} onClick={() => navigate('/projects')}>Projelere dön</Button>} />
    );
  }

  if (state.loading || !project) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-1/2" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    );
  }

  const s = project.stats || {};
  const caseSegs = caseSegments(s.cases_by_status);
  const cRate = caseRate(s.cases_by_status);
  const q = `?project=${pid}`;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft size={14} /> Projeler
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-semibold text-slate-900 dark:text-white">{project.name}</h1>
              <StatusBadge tone={PROJECT_STATUS_TONE[project.status]}>{project.status}</StatusBadge>
            </div>
            {project.description && <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{project.description}</p>}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Oluşturuldu {formatDate(project.created_at)}{s.last_run_at && <> · son koşum {relativeTime(s.last_run_at)}</>}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {can('test_runs.create') && <Button variant="primary" icon={<PlayCircle size={14} />} onClick={() => navigate(`/test-runs?new=1&project_id=${pid}`)} disabled={!s.cases}>Koşum oluştur</Button>}
            {can('reports.view') && <Button icon={<BarChart3 size={14} />} onClick={() => navigate(`/reports${q}`)}>Rapor</Button>}
            {(can('projects.edit') || can('projects.delete')) && (
              <Menu trigger={({ ref, toggle, open }) => (
                <Button ref={ref} size="icon" onClick={toggle} aria-label="Diğer işlemler" aria-haspopup="menu" aria-expanded={open}><MoreHorizontal size={16} /></Button>
              )}>
                {can('projects.edit') && <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>Düzenle</MenuItem>}
                {can('projects.delete') && <MenuItem icon={Trash2} tone="danger" onSelect={() => setRemoving(true)}>Projeyi sil</MenuItem>}
              </Menu>
            )}
          </div>
        </div>
      </div>

      <section aria-label="Özet göstergeler" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Test case" value={s.cases || 0} sub={s.cases ? `${s.automated} otomasyon · ${s.cases - s.automated} manuel` : 'henüz yok'} />
        <KpiTile label="Geçme oranı (30 gün)" value={view.rate == null ? '—' : `%${view.rate.toFixed(1)}`}
          delta={view.rate != null && view.prevRate != null ? view.rate - view.prevRate : null} deltaUnit="pp"
          sub={`${view.cur.n} koşum`} hint="Son 30 gündeki koşum sonuçları: geçen / (geçen + kalan)" />
        {can('defects.view')
          ? <KpiTile label="Açık hata" value={s.open_defects || 0} sub={s.critical_defects ? `${s.critical_defects} kritik` : 'kritik yok'} />
          : <KpiTile label="Koşum" value={s.runs || 0} />}
        <KpiTile label="Süren plan" value={s.active_plans || 0} sub={`toplam ${s.plans || 0} plan`} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="space-y-5">
        <Panel title="Case'ler" actions={<More to={`/test-cases${q}`} />} bodyClassName="space-y-4 p-4">
          {s.cases ? (
            <>
              <div>
                <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  Son sonuçlarına göre{cRate != null && <> · <b className="font-semibold text-slate-900 dark:text-white">%{cRate}</b> geçiyor</>}
                </p>
                <ResultBar height="h-2.5" segments={caseSegs} />
                <ResultLegend segments={caseSegs} className="mt-2 text-xs" />
              </div>
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Önceliğe göre</p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {view.priorities.map(x => (
                    <li key={x.p}>
                      <Link to={`/test-cases${q}&priority=${encodeURIComponent(x.p)}`} className="block rounded-lg border border-slate-200 px-3 py-2 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700">
                        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${TONES[PRIORITY_TONE[x.p]].dot}`} />{x.p}</span>
                        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{x.total}</span>
                        {x.failed > 0 && <span className="ml-1 text-xs text-rose-700 dark:text-rose-400">{x.failed} kaldı</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <Empty action={can('test_cases.create') && <Button size="sm" icon={<Plus size={13} />} onClick={() => navigate(`/test-cases${q}`)}>Case ekle</Button>}>
              Projede henüz test case yok.
            </Empty>
          )}
        </Panel>

        <Panel title="Süren planlar" bodyClassName="p-0" actions={<More to={`/test-plans${q}`} />}>
          {view.activePlans.length === 0 ? <Empty>Süren plan yok.</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {view.activePlans.slice(0, 5).map(p => {
                const st = planStats(p);
                return (
                  <li key={p.id}>
                    <Link to={`/test-plans/${p.id}`} className="block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <span className="flex items-baseline gap-2">
                        <Ident className="shrink-0">{planIdent(p.id)}</Ident>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-white">{p.title}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">%{st.progress} · {st.done}/{st.total}</span>
                      </span>
                      <ResultBar height="h-1" className="mt-1.5" segments={planSegments(st)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {can('environments.view') && (
          <Panel title="Ortamlar" bodyClassName="p-0" actions={<More to={`/environments${q}`} />}>
            {data.envs.length === 0 ? <Empty>Bu projeye tanımlı ortam yok.</Empty> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.envs.map(e => (
                  <li key={e.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                    <span className="shrink-0 font-medium text-slate-900 dark:text-white">{e.name}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{e.url || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        </div>
        <div className="space-y-5">
        <Panel title="Son koşumlar" bodyClassName="p-0" actions={s.runs > 0 && <More to={`/test-runs${q}`}>Tümü ({s.runs})</More>}>
          {view.runs.length === 0 ? <Empty>Henüz koşum yok.</Empty> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {view.runs.slice(0, 6).map(r => (
                <li key={r.id}>
                  <Link to={`/test-runs/${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <span className="min-w-0 truncate text-sm text-slate-900 dark:text-white"><Ident className="mr-2">KS-{r.id}</Ident>{r.name}</span>
                    <StatusBadge tone={RUN_STATUS_TONE[r.status]}>{RUN_STATUS_LABEL[r.status] || r.status}</StatusBadge>
                    <ResultBar height="h-1" segments={segmentsOf(r.summary)} />
                    <span className="text-right text-xs tabular-nums text-slate-500 dark:text-slate-400" title={formatDate(r.created_at, true)}>
                      {r.summary.rate != null ? `%${r.summary.rate} · ` : ''}{relativeTime(r.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {can('defects.view') && (
          <Panel title="Açık hatalar" bodyClassName="p-0" actions={<More to={`/defects${q}&status=active`} />}>
            {view.openDefects.length === 0 ? <Empty>Açık hata kaydı yok.</Empty> : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {view.openDefects.slice(0, 6).map(d => (
                  <li key={d.id}>
                    <Link to={`/defects/BUG-${d.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <Ident className="shrink-0">BUG-{d.id}</Ident>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-white">{d.title}</span>
                      <StatusBadge tone={SEVERITY_TONE[d.severity]} className="hidden sm:inline-flex">{d.severity}</StatusBadge>
                      <StatusBadge tone={DEFECT_STATUS_TONE[d.status]}>{DEFECT_STATUS_LABEL[d.status]}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        </div>
      </div>

      {editing && (
        <ProjectFormDrawer project={project} onClose={() => setEditing(false)}
          onSaved={saved => { setEditing(false); setProject(p => ({ ...p, ...saved, stats: p.stats })); }} />
      )}
      {removing && <DeleteProjectDialog project={project} onClose={() => setRemoving(false)} onDeleted={() => navigate('/projects')} />}
    </div>
  );
};

export default ProjectDetail;
