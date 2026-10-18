/**
 * Test planları listesi. Plana tıklamak plan sayfasını açar (/test-plans/:id).
 * Parçalar ./test-plans altında: model.js, PlanFormDrawer, CasePickerDialog, PlanItemDialog.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, MoreHorizontal, Pencil, Trash2, PlayCircle, ClipboardList, Eye } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, ResultBar, StatusBadge, EmptyState, Skeleton, Ident } from '../components/ui';
import { DebouncedSearchInput, FilterSelect } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { TONES } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { projectsApi, testPlansApi } from '../api';
import PlanFormDrawer from './test-plans/PlanFormDrawer';
import { PLAN_STATUSES, PLAN_STATUS_TONE, planIdent, planStats, planSegments, dateRange, deadlineOf, trLower } from './test-plans/model';

const load = () => Promise.all([testPlansApi.getAll(), projectsApi.getAll()]).then(([pl, p]) => ({ plans: pl.data, projects: p.data }));

const TestPlans = () => {
  const { can } = usePermission();
  const navigate = useNavigate();
  const filters = useUrlFilters(['q', 'project', 'status']);
  const { q, project, status } = filters.values;
  const [data, setData] = useState({ plans: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setData(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const { plans, projects } = data;
  const projectName = (id) => projects.find(p => p.id === id)?.name || '—';
  const enriched = useMemo(() => plans.map(p => ({ ...p, stats: planStats(p), deadline: deadlineOf(p) })), [plans]);
  const filtered = useMemo(() => enriched.filter(p =>
    (!q || trLower(p.title).includes(trLower(q)) || planIdent(p.id).toLowerCase() === q.trim().toLowerCase()) &&
    (!project || String(p.project_id) === project) &&
    (!status || p.status === status)
  ), [enriched, q, project, status]);
  const counts = useMemo(() => Object.fromEntries(PLAN_STATUSES.map(s => [s, enriched.filter(p => p.status === s).length])), [enriched]);
  const overdue = enriched.filter(p => p.deadline?.tone === 'fail').length;

  const onSaved = (saved, created) => {
    setForm(null);
    if (created) navigate(`/test-plans/${saved.id}`);
    else setData(d => ({ ...d, plans: d.plans.map(p => p.id === saved.id ? saved : p) }));
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await testPlansApi.remove(confirm.id);
      setData(d => ({ ...d, plans: d.plans.filter(p => p.id !== confirm.id) }));
      toast.success(`${planIdent(confirm.id)} silindi.`);
      setConfirm(null);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Test planları"
        description="Bir sürüm ya da sprint için koşulacak case'ler. Plana bağlı koşumlar bitince plan sonuçları güncellenir."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></Button>
          {can('test_plans.create') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm({})} disabled={!projects.length}>Test planı oluştur</Button>}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}<Button size="sm" className="ml-auto" onClick={reload}>Tekrar dene</Button>
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <DebouncedSearchInput value={q} onChange={v => filters.set('q', v)} placeholder="Plan adı veya TP-ID ara" className="lg:w-72" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Proje" value={project} onChange={v => filters.set('project', v)} options={projects.map(p => [p.id, p.name])} />
          <div className="flex items-center gap-1" role="group" aria-label="Duruma göre süz">
            {PLAN_STATUSES.map(s => {
              const active = status === s;
              return (
                <button key={s} type="button" aria-pressed={active} onClick={() => filters.set('status', active ? '' : s)}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <span className={`h-2 w-2 rounded-full ${TONES[PLAN_STATUS_TONE[s]].dot}`} aria-hidden />{s}<span className="tabular-nums opacity-70">{counts[s]}</span>
                </button>
              );
            })}
          </div>
          {overdue > 0 && <span className="text-sm text-rose-600 dark:text-rose-400">{overdue} plan gecikmede</span>}
          {filters.active && <Button variant="ghost" size="sm" onClick={filters.clear}>Temizle</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm sm:min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Plan</th>
                <th scope="col" className="hidden w-40 px-3 py-2.5 font-medium md:table-cell">Proje</th>
                <th scope="col" className="hidden w-48 px-3 py-2.5 font-medium lg:table-cell">Tarih</th>
                <th scope="col" className="hidden w-56 px-3 py-2.5 font-medium sm:table-cell">İlerleme</th>
                <th scope="col" className="w-28 px-3 py-2.5 font-medium">Durum</th>
                <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !plans.length ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="flex gap-4"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-48" /></div></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  {plans.length === 0 ? (
                    <EmptyState icon={<ClipboardList size={24} />} title="Henüz test planı yok"
                      description="Plan, bir sürüm için koşulacak case'leri bir araya getirir; ilerlemeyi plan üzerinden takip edersiniz."
                      action={can('test_plans.create') && projects.length > 0 && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({})}>Test planı oluştur</Button>} />
                  ) : <EmptyState title="Filtrelere uyan plan yok" action={<Button onClick={filters.clear}>Filtreleri temizle</Button>} />}
                </td></tr>
              ) : filtered.map(p => {
                const s = p.stats;
                return (
                  <tr key={p.id} onClick={() => navigate(`/test-plans/${p.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="max-w-0 py-2.5 pl-4 pr-3">
                      <div className="flex items-baseline gap-2">
                        <Ident className="shrink-0">{planIdent(p.id)}</Ident>
                        <button type="button" onClick={e => { e.stopPropagation(); navigate(`/test-plans/${p.id}`); }}
                          className="truncate text-left font-medium text-slate-900 hover:underline dark:text-white">{p.title}</button>
                      </div>
                      {p.description && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{p.description}</p>}
                    </td>
                    <td className="hidden truncate px-3 py-2.5 text-slate-700 md:table-cell dark:text-slate-200">{projectName(p.project_id)}</td>
                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      <p className="truncate text-xs text-slate-600 dark:text-slate-300">{dateRange(p) || '—'}</p>
                      {p.deadline && <p className={`text-xs ${TONES[p.deadline.tone].text}`}>{p.deadline.text}</p>}
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      {s.total ? (
                        <>
                          <ResultBar segments={planSegments(s)} height="h-1.5" />
                          <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {s.done}/{s.total} case · %{s.progress}{s['Başarısız'] > 0 && <span className="text-rose-600 dark:text-rose-400"> · {s['Başarısız']} kaldı</span>}
                          </p>
                        </>
                      ) : <span className="text-xs text-slate-400">Case eklenmedi</span>}
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge tone={PLAN_STATUS_TONE[p.status]}>{p.status}</StatusBadge></td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <Menu trigger={({ ref, toggle, open }) => (
                        <button ref={ref} type="button" onClick={toggle} aria-label={`${planIdent(p.id)} işlemleri`} aria-haspopup="menu" aria-expanded={open}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
                      )}>
                        <MenuItem icon={Eye} onSelect={() => navigate(`/test-plans/${p.id}`)}>Aç</MenuItem>
                        {can('test_runs.create') && s.total > 0 && (
                          <MenuItem icon={PlayCircle} onSelect={() => navigate(`/test-runs?new=1&project_id=${p.project_id}&plan_id=${p.id}`)}>Bu planla koşum oluştur</MenuItem>
                        )}
                        {can('test_plans.edit') && <MenuItem icon={Pencil} onSelect={() => setForm({ plan: p })}>Düzenle</MenuItem>}
                        {can('test_plans.delete') && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" onSelect={() => setConfirm(p)}>Sil</MenuItem></>}
                      </Menu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && <PlanFormDrawer plan={form.plan} initialProject={project} projects={projects} onClose={() => setForm(null)} onSaved={onSaved} />}
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} loading={deleting} confirmLabel="Sil"
        title={confirm ? `${planIdent(confirm.id)} silinsin mi?` : ''}
        description="Plan ve kalem sonuçları silinir. Case'ler ve plana bağlı koşumlar korunur (koşumların plan bağlantısı kalkar)." />
    </div>
  );
};

export default TestPlans;
