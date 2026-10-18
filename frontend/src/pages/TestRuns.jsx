/**
 * Koşumlar listesi. Bir koşuma tıklamak yürütme ekranını açar (/test-runs/:id).
 * Parçalar ./test-runs altında: model.js (sonuç okuma/özet), RunFormDrawer.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, Play, Pencil, Trash2, MoreHorizontal, PlayCircle, Eye } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, ResultBar, StatusBadge, EmptyState, Skeleton, Ident } from '../components/ui';
import { DebouncedSearchInput, FilterSelect, Pagination } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { toast } from '../components/ui/toast';
import { projectsApi, testPlansApi, testRunsApi, fetchAllTestRuns, fetchAllTestCases } from '../api';
import RunFormDrawer from './test-runs/RunFormDrawer';
import {
  RUN_STATUSES, RUN_STATUS_TONE, RUN_STATUS_LABEL, FINISHED, parseResults, summarize, segmentsOf,
  runIdent, trLower, relativeTime, formatDate,
} from './test-runs/model';

const PAGE_SIZE = 25;

const load = () => Promise.all([fetchAllTestRuns(), projectsApi.getAll(), testPlansApi.getAll(), fetchAllTestCases()])
  .then(([runs, p, pl, cases]) => {
    const caseCounts = new Map();
    cases.forEach(c => caseCounts.set(c.project_id, (caseCounts.get(c.project_id) || 0) + 1));
    return { runs, projects: p.data, plans: pl.data, caseCounts };
  });

const TestRuns = () => {
  const { can } = usePermission();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useUrlFilters(['q', 'project', 'status', 'plan']);
  const { q, project, status, plan } = filters.values;

  const [data, setData] = useState({ runs: [], projects: [], plans: [], caseCounts: new Map() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(() => {
    // Başka sayfadan "koşum oluştur" ile gelindiyse (?new=1&project_id=&plan_id=) panel açık başlar
    if (searchParams.get('new') || searchParams.get('plan_id')) {
      return { initial: { project_id: searchParams.get('project_id'), test_plan_id: searchParams.get('plan_id') } };
    }
    return null;
  });
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Panel açıldıktan sonra tek seferlik parametreleri adresten temizle (yenileyince tekrar açılmasın)
  useEffect(() => {
    if (searchParams.get('new') || searchParams.get('plan_id') || searchParams.get('project_id')) {
      const next = new URLSearchParams(searchParams);
      ['new', 'plan_id', 'project_id'].forEach(k => next.delete(k));
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setData(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const { runs, projects, plans, caseCounts } = data;
  const projectName = useCallback((id) => projects.find(p => p.id === id)?.name || '—', [projects]);
  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);

  const enriched = useMemo(() => runs.map(r => ({ ...r, summary: summarize(parseResults(r.results)) })), [runs]);
  const filtered = useMemo(() => enriched.filter(r =>
    (!q || trLower(r.name).includes(trLower(q)) || runIdent(r.id).toLowerCase() === q.trim().toLowerCase()) &&
    (!project || String(r.project_id) === project) &&
    (!status || r.status === status) &&
    (!plan || String(r.test_plan_id) === plan)
  ), [enriched, q, project, status, plan]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const totals = useMemo(() => {
    const s = { Passed: 0, Failed: 0, Skipped: 0, Pending: 0, active: 0 };
    filtered.forEach(r => {
      ['Passed', 'Failed', 'Skipped', 'Pending'].forEach(k => { s[k] += r.summary[k]; });
      if (!FINISHED.has(r.status)) s.active += 1;
    });
    s.rate = s.Passed + s.Failed ? Math.round((s.Passed / (s.Passed + s.Failed)) * 100) : null;
    return s;
  }, [filtered]);

  const onSaved = (saved, created) => {
    setForm(null);
    if (created) navigate(`/test-runs/${saved.id}`);
    else setData(d => ({ ...d, runs: d.runs.map(r => r.id === saved.id ? saved : r) }));
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await testRunsApi.remove(confirm.id);
      setData(d => ({ ...d, runs: d.runs.filter(r => r.id !== confirm.id) }));
      toast.success(`${runIdent(confirm.id)} silindi.`);
      setConfirm(null);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); }
    finally { setDeleting(false); }
  };

  const setFilter = (k, v) => { filters.set(k, v); setPage(1); };

  return (
    <div className="space-y-5">
      <PageHeader title="Koşumlar"
        description="Manuel ve otomasyon koşumları. Kaldı sonucu alan case'ler koşuma bağlı tek bir hata kaydında toplanır."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </Button>
          {can('test_runs.create') && (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm({ initial: { project_id: project, test_plan_id: plan } })}
              disabled={!projects.length}>Koşum oluştur</Button>
          )}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}<Button size="sm" className="ml-auto" onClick={reload}>Tekrar dene</Button>
        </div>
      )}

      {runs.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900" aria-label="Koşum özeti">
          <p className="mb-2.5 text-sm text-slate-600 dark:text-slate-300">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{filtered.length}</span> koşum
            {' '}· <span className="tabular-nums">{totals.active}</span> sürüyor
            {totals.rate != null && <> · geçme oranı <span className="font-semibold tabular-nums text-slate-900 dark:text-white">%{totals.rate}</span></>}
            {' '}· <span className="tabular-nums">{totals.Passed + totals.Failed + totals.Skipped}</span> sonuç girildi, <span className="tabular-nums">{totals.Pending}</span> bekliyor
          </p>
          <ResultBar segments={segmentsOf(totals)} />
        </section>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <DebouncedSearchInput value={q} onChange={v => setFilter('q', v)} placeholder="Koşum adı veya KS-ID ara" className="lg:w-72" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Proje" value={project} onChange={v => setFilter('project', v)} options={projects.map(p => [p.id, p.name])} />
          <FilterSelect label="Durum" value={status} onChange={v => setFilter('status', v)} options={RUN_STATUSES.map(s => [s, RUN_STATUS_LABEL[s]])} />
          {plans.length > 0 && <FilterSelect label="Plan" value={plan} onChange={v => setFilter('plan', v)} options={plans.map(p => [p.id, p.title])} />}
          {filters.active && <Button variant="ghost" size="sm" onClick={() => { filters.clear(); setPage(1); }}>Temizle</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm sm:min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Koşum</th>
                <th scope="col" className="hidden w-40 px-3 py-2.5 font-medium md:table-cell">Proje / plan</th>
                <th scope="col" className="w-32 px-3 py-2.5 font-medium sm:w-36">Durum</th>
                <th scope="col" className="hidden w-56 px-3 py-2.5 font-medium sm:table-cell">Sonuçlar</th>
                <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium lg:table-cell">Güncellendi</th>
                <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !runs.length ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="flex gap-4"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-24" /></div></td></tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={6}>
                  {runs.length === 0 ? (
                    <EmptyState icon={<PlayCircle size={24} />} title="Henüz koşum yok"
                      description="Bir koşum, seçtiğiniz case'leri tek tek sonuçlandırdığınız bir test oturumudur."
                      action={can('test_runs.create') && projects.length > 0 && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({ initial: {} })}>Koşum oluştur</Button>} />
                  ) : (
                    <EmptyState title="Filtrelere uyan koşum yok" action={<Button onClick={filters.clear}>Filtreleri temizle</Button>} />
                  )}
                </td></tr>
              ) : rows.map(r => {
                const s = r.summary;
                const linkedPlan = planById.get(r.test_plan_id);
                return (
                  <tr key={r.id} onClick={() => navigate(`/test-runs/${r.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="max-w-0 py-2.5 pl-4 pr-3">
                      <div className="flex items-baseline gap-2">
                        <Ident className="shrink-0">{runIdent(r.id)}</Ident>
                        <button type="button" onClick={e => { e.stopPropagation(); navigate(`/test-runs/${r.id}`); }}
                          className="truncate text-left font-medium text-slate-900 hover:underline dark:text-white">{r.name}</button>
                      </div>
                      {r.description && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{r.description}</p>}
                    </td>
                    <td className="hidden max-w-0 px-3 py-2.5 md:table-cell">
                      <p className="truncate text-slate-700 dark:text-slate-200">{projectName(r.project_id)}</p>
                      {linkedPlan && <p className="truncate text-xs text-slate-500 dark:text-slate-400">Plan: {linkedPlan.title}</p>}
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge tone={RUN_STATUS_TONE[r.status]}>{RUN_STATUS_LABEL[r.status] || r.status}</StatusBadge></td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      {s.total ? (
                        <>
                          <ResultBar segments={segmentsOf(s)} height="h-1.5" />
                          <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {s.done}/{s.total} sonuç · {s.Failed > 0 ? <span className="text-rose-600 dark:text-rose-400">{s.Failed} kaldı</span> : `${s.Passed} geçti`}
                            {s.rate != null && ` · %${s.rate}`}
                          </p>
                        </>
                      ) : <span className="text-xs text-slate-400">Case yok</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-slate-500 lg:table-cell dark:text-slate-400" title={formatDate(r.updated_at || r.created_at, true)}>
                      {relativeTime(r.updated_at || r.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <Menu trigger={({ ref, toggle, open }) => (
                        <button ref={ref} type="button" onClick={toggle} aria-label={`${runIdent(r.id)} işlemleri`} aria-haspopup="menu" aria-expanded={open}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
                      )}>
                        {can('test_runs.execute') && !FINISHED.has(r.status)
                          ? <MenuItem icon={Play} onSelect={() => navigate(`/test-runs/${r.id}`)}>Koşmaya devam et</MenuItem>
                          : <MenuItem icon={Eye} onSelect={() => navigate(`/test-runs/${r.id}`)}>Sonuçları aç</MenuItem>}
                        {can('test_runs.execute') && <MenuItem icon={Pencil} onSelect={() => setForm({ run: r })}>Düzenle</MenuItem>}
                        {can('test_runs.delete') && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" onSelect={() => setConfirm(r)}>Sil</MenuItem></>}
                      </Menu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > PAGE_SIZE && <Pagination page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />}
      </div>

      {form && (
        <RunFormDrawer run={form.run} initial={form.initial} projects={projects} plans={plans} caseCounts={caseCounts}
          onClose={() => setForm(null)} onSaved={onSaved} />
      )}
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} loading={deleting} confirmLabel="Sil"
        title={confirm ? `${runIdent(confirm.id)} silinsin mi?` : ''}
        description="Koşumun tüm sonuçları silinir. Koşuma bağlı otomatik hata kaydı korunur ama koşum bağlantısı kalkar. Bu işlem geri alınamaz." />
    </div>
  );
};

export default TestRuns;
