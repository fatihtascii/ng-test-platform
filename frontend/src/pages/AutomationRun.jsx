/**
 * Otomasyon: seçilen case'lerin Playwright script'lerini sunucuda koşturur, durumu canlı izler.
 * Koşumu sunucu kaydeder (source=automation). Parçalar ./automation altında.
 * ?project=1&cases=3,5 ile ön seçimli açılabilir (Test case'ler sayfasındaki toplu işlem).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, RotateCcw, Cpu, ExternalLink, Bug } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { PageHeader, Button, Panel, ResultBar, StatusBadge, EmptyState, Skeleton } from '../components/ui';
import { Field } from '../components/ui/data';
import { inputCls } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { projectsApi, environmentsApi, fetchAllTestCases, fetchAllTestRuns } from '../api';
import { useAutomationRun } from './automation/useAutomationRun';
import CasePicker from './automation/CasePicker';
import LiveCaseList from './automation/LiveCaseList';
import RunConsole from './automation/RunConsole';
import RecentRuns from './automation/RecentRuns';

const BROWSERS = ['Chrome', 'Firefox', 'Safari', 'Edge'];
const PHASE = {
  connecting: { label: 'Bağlanıyor', tone: 'info' },
  running:    { label: 'Koşuyor', tone: 'accent' },
  finished:   { label: 'Tamamlandı', tone: 'pass' },
  stopped:    { label: 'Durduruldu', tone: 'blocked' },
  error:      { label: 'Başarısız', tone: 'fail' },
};

const fmtElapsed = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const isAutomated = (tc) => {
  if (tc.execution_type === 'Automated') return true;
  try { return JSON.parse(tc.description || '{}').execution_type === 'Automated'; } catch { return false; }
};

const AutomationRun = () => {
  const { can } = usePermission();
  const canRun = can('automation.execute');
  const run = useAutomationRun();

  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(initialParams.get('project') || '');
  const [environmentId, setEnvironmentId] = useState('');
  const [browser, setBrowser] = useState('Chrome');
  const [headless, setHeadless] = useState(true);
  const [selected, setSelected] = useState(() => new Set((initialParams.get('cases') || '').split(',').map(Number).filter(Boolean)));
  const [recent, setRecent] = useState([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([projectsApi.getAll(), fetchAllTestCases(), environmentsApi.getAll().catch(() => ({ data: [] }))])
      .then(([p, cases, envs]) => {
        if (!alive) return;
        setData({
          projects: p.data, envs: envs.data,
          cases: cases.filter(isAutomated).map(c => ({ ...c, hasScript: Boolean(c.automation_script?.trim()) })),
        });
        // Tek proje varsa ya da adresle gelinmediyse ilk otomasyon case'i olan proje seçilsin
        setProject(cur => cur || String((p.data.find(x => cases.some(c => c.project_id === x.id && isAutomated(c))) || p.data[0])?.id || ''));
      })
      .catch(e => { if (alive) setError(e.message || 'Veriler yüklenemedi.'); });
    return () => { alive = false; };
  }, []);

  const loadRecent = useCallback(() => {
    if (!project) return Promise.resolve();
    return fetchAllTestRuns({ project_id: project, source: 'automation' })
      .then(r => setRecent(r.slice(0, 6))).catch(() => setRecent([]));
  }, [project]);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  // Koşum bitince son koşumları ve case'lerin "son sonuç" etiketlerini tazele
  const finishedCases = run.phase === 'finished' ? run.cases : null;
  useEffect(() => {
    if (!finishedCases) return;
    loadRecent();
  }, [finishedCases, loadRecent]);
  const latest = useMemo(() => new Map((finishedCases || []).filter(c => c.status === 'passed' || c.status === 'failed')
    .map(c => [c.case_id, c.status === 'passed' ? 'Başarılı' : 'Başarısız'])), [finishedCases]);

  // Süre sayacı
  useEffect(() => {
    if (!run.busy) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [run.busy]);

  // Koşum sürerken sayfadan ayrılmaya karşı uyar (ayrılınca sunucu koşumu durdurur)
  useEffect(() => {
    if (!run.busy) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [run.busy]);

  const projectCases = useMemo(() => (data ? data.cases.filter(c => String(c.project_id) === project)
    .map(c => (latest.has(c.id) ? { ...c, status: latest.get(c.id) } : c)) : []), [data, project, latest]);
  const projectEnvs = useMemo(() => (data ? data.envs.filter(e => String(e.project_id) === project) : []), [data, project]);
  const selectedIds = useMemo(() => projectCases.filter(c => c.hasScript && selected.has(c.id)).map(c => c.id), [projectCases, selected]);
  const env = projectEnvs.find(e => String(e.id) === environmentId);

  const changeProject = (v) => { setProject(v); setEnvironmentId(''); setSelected(new Set()); };

  const start = (ids = selectedIds) => {
    if (!ids.length) { toast.error('En az bir test seçin.'); return; }
    run.start({ cases: ids, browser, headless, environmentId: environmentId ? Number(environmentId) : null, project });
  };
  const rerun = (ids) => {
    const runnable = ids.filter(id => projectCases.some(c => c.id === id && c.hasScript));
    if (!runnable.length) { toast.error('Bu case\'lerin script\'i artık yok.'); return; }
    setSelected(new Set(runnable));
    start(runnable);
  };

  if (error && !data) {
    return <EmptyState icon={<Cpu size={24} />} title="Otomasyon verisi yüklenemedi" description={error} action={<Button onClick={() => window.location.reload()}>Tekrar dene</Button>} />;
  }

  const counts = run.cases.reduce((c, x) => { c[x.status] = (c[x.status] || 0) + 1; return c; }, {});
  const phase = PHASE[run.phase];
  const elapsed = run.startedAt ? (run.endedAt || now || run.startedAt) - run.startedAt : 0;
  const failedIds = run.cases.filter(c => c.status === 'failed').map(c => c.case_id);

  return (
    <div className="space-y-5">
      <PageHeader title="Otomasyon"
        description="Case'lerin Playwright script'lerini sunucuda koşturun. Sonuçlar koşum olarak kaydedilir; kalan testler için hata kaydı açılır." />

      {!data ? (
        <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]"><Skeleton className="h-[32rem]" /><Skeleton className="h-[32rem]" /></div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Panel title="Koşum ayarları" bodyClassName="space-y-4 p-4" className="lg:sticky lg:top-4">
            <Field label="Proje" htmlFor="a-project">
              <select id="a-project" value={project} onChange={e => changeProject(e.target.value)} disabled={run.busy} className={inputCls}>
                {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Ortam" htmlFor="a-env" hint={env ? <span className="font-mono">{env.url}</span> : projectEnvs.length ? 'Seçilirse adresi ve değişkenleri teste aktarılır.' : <>Bu projede ortam yok. <Link to={`/environments?project=${project}`} className="text-indigo-600 hover:underline dark:text-indigo-400">Ortam ekle</Link></>}>
              <select id="a-env" value={environmentId} onChange={e => setEnvironmentId(e.target.value)} disabled={run.busy || !projectEnvs.length} className={inputCls}>
                <option value="">Ortamsız (script'teki adres)</option>
                {projectEnvs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <Field label="Tarayıcı" htmlFor="a-browser">
                <select id="a-browser" value={browser} onChange={e => setBrowser(e.target.value)} disabled={run.busy} className={inputCls}>
                  {BROWSERS.map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>
              <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300" title="Kapalıyken tarayıcı sunucuda görünür açılır (yalnızca masaüstü sunucuda işe yarar)">
                <input type="checkbox" checked={!headless} onChange={e => setHeadless(!e.target.checked)} disabled={run.busy} className="h-4 w-4 accent-indigo-600" />
                Görünür
              </label>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Testler</p>
              <CasePicker cases={projectCases} selected={selected} onChange={setSelected} disabled={run.busy} />
            </div>
            {canRun ? (
              run.busy ? (
                <Button variant="danger" className="w-full justify-center" icon={<Square size={14} />} onClick={run.stop} disabled={run.phase === 'connecting'}>Durdur</Button>
              ) : (
                <Button variant="primary" size="lg" className="w-full justify-center" icon={<Play size={15} />} onClick={() => start()} disabled={!selectedIds.length}>
                  {selectedIds.length ? `${selectedIds.length} testi koş` : 'Test seçin'}
                </Button>
              )
            ) : <p className="text-xs text-slate-500 dark:text-slate-400">Koşum başlatmak için "otomasyon çalıştırma" izni gerekir.</p>}
          </Panel>

          <div className="min-w-0 space-y-5">
            {run.phase === 'idle' ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <Cpu size={24} className="mx-auto text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">Henüz koşum başlatılmadı</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Soldan testleri seçip koşun; her testin durumu ve çıktısı burada canlı görünür.</p>
              </div>
            ) : (
              <Panel bodyClassName="p-0" title={<span className="flex items-center gap-2">Koşum {phase && <StatusBadge tone={phase.tone}>{phase.label}</StatusBadge>}</span>}
                actions={<span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">{fmtElapsed(elapsed)}</span>}>
                <div className="space-y-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <ResultBar height="h-2" segments={[
                    { label: 'Geçti', value: counts.passed || 0, tone: 'pass' }, { label: 'Kaldı', value: counts.failed || 0, tone: 'fail' },
                    { label: 'Atlandı', value: counts.skipped || 0, tone: 'blocked' },
                    { label: 'Bekliyor', value: (counts.queued || 0) + (counts.running || 0), tone: 'pending' },
                  ]} />
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <span><b className="font-semibold tabular-nums text-slate-900 dark:text-white">{counts.passed || 0}</b> geçti</span>
                    <span><b className="font-semibold tabular-nums text-rose-700 dark:text-rose-400">{counts.failed || 0}</b> kaldı</span>
                    {counts.skipped > 0 && <span><b className="font-semibold tabular-nums">{counts.skipped}</b> atlandı</span>}
                    {run.busy && <span className="text-slate-500 dark:text-slate-400">%{run.progress}</span>}
                    {run.summary?.run_id && (
                      <Link to={`/test-runs/${run.summary.run_id}`} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"><ExternalLink size={13} /> KS-{run.summary.run_id} koşumunu aç</Link>
                    )}
                    {run.summary?.defect && (
                      <Link to={`/defects/${run.summary.defect}`} className="inline-flex items-center gap-1 font-medium text-rose-700 hover:underline dark:text-rose-400"><Bug size={13} /> {run.summary.defect}</Link>
                    )}
                    {!run.busy && canRun && failedIds.length > 0 && (
                      <Button size="sm" className="ml-auto" icon={<RotateCcw size={13} />} onClick={() => rerun(failedIds)}>Kalanları tekrar koş</Button>
                    )}
                  </p>
                  {run.error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{run.error}</p>}
                  {run.phase === 'stopped' && <p className="text-sm text-amber-700 dark:text-amber-400">Koşum durduruldu; sonuçlar kaydedilmedi.</p>}
                  {run.busy && <p className="text-xs text-slate-500 dark:text-slate-400">Sayfadan ayrılırsanız koşum durdurulur.</p>}
                </div>
                {run.cases.length > 0 && <LiveCaseList cases={run.cases} stopped={run.phase === 'stopped' || run.phase === 'error'} />}
              </Panel>
            )}

            {run.phase !== 'idle' && <RunConsole logs={run.logs} live={run.busy} />}

            <RecentRuns runs={recent} onRerun={rerun} canRun={canRun} busy={run.busy} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationRun;
