/**
 * Proje listesi. Sayılar sunucudan tek istekte gelir (?with_stats=true); case listesi indirilmez.
 * Parçalar ./projects altında: model.js, ProjectFormDrawer, DeleteProjectDialog.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, MoreHorizontal, Eye, Pencil, Trash2, FolderKanban, PlayCircle, BarChart3 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, ResultBar, StatusBadge, EmptyState, Skeleton } from '../components/ui';
import { DebouncedSearchInput, FilterSelect } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/overlay';
import { TONES } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { projectsApi } from '../api';
import { relativeTime, formatDate } from './test-runs/model';
import ProjectFormDrawer from './projects/ProjectFormDrawer';
import DeleteProjectDialog from './projects/DeleteProjectDialog';
import { PROJECT_STATUSES, PROJECT_STATUS_TONE, SORTS, caseSegments, caseRate, compareProjects, trLower } from './projects/model';

const load = () => projectsApi.getAll({ with_stats: true }).then(r => r.data);

const Projects = () => {
  const { can } = usePermission();
  const navigate = useNavigate();
  const filters = useUrlFilters(['q', 'status', 'sort']);
  const { q, status } = filters.values;
  const sort = filters.values.sort || 'activity';

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) { setProjects(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setProjects(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = trLower(q.trim());
    return projects
      .filter(p => (!needle || trLower(p.name).includes(needle) || trLower(p.description || '').includes(needle)) && (!status || p.status === status))
      .sort(compareProjects(sort));
  }, [projects, q, status, sort]);

  const totals = useMemo(() => projects.reduce((t, p) => ({
    cases: t.cases + (p.stats?.cases || 0), defects: t.defects + (p.stats?.open_defects || 0),
    active: t.active + (p.status === 'Aktif' ? 1 : 0),
  }), { cases: 0, defects: 0, active: 0 }), [projects]);

  const onSaved = (saved, created) => {
    setForm(null);
    if (created) { navigate(`/projects/${saved.id}`); return; }
    // Sayılar değişmez; yalnız temel alanları güncelle
    setProjects(list => list.map(p => (p.id === saved.id ? { ...p, ...saved, stats: p.stats } : p)));
  };

  const setStatus = async (p, value) => {
    try {
      const { data } = await projectsApi.update(p.id, { status: value });
      setProjects(list => list.map(x => (x.id === p.id ? { ...x, ...data, stats: x.stats } : x)));
      toast.success(`${p.name} → ${value}`);
    } catch (e) { toast.error(e.message || 'Güncellenemedi.'); }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Projeler"
        description="Test case, plan, koşum ve hata kayıtları projeye bağlıdır. Projeye tıklayınca tüm çalışmanın özeti açılır."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></Button>
          {can('projects.create') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm({})}>Proje oluştur</Button>}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}<Button size="sm" className="ml-auto" onClick={reload}>Tekrar dene</Button>
        </div>
      )}

      {projects.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <b className="font-semibold tabular-nums text-slate-900 dark:text-white">{projects.length}</b> proje · {totals.active} aktif ·{' '}
          <span className="tabular-nums">{totals.cases}</span> case · <span className={totals.defects ? 'text-rose-700 dark:text-rose-400' : ''}><span className="tabular-nums">{totals.defects}</span> açık hata</span>
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <DebouncedSearchInput value={q} onChange={v => filters.set('q', v)} placeholder="Proje ara" className="sm:w-64" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Durum" value={status} onChange={v => filters.set('status', v)} options={PROJECT_STATUSES.map(s => [s, s])} />
          <label className="relative inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2.5 pr-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Sırala:
            <select value={sort} onChange={e => filters.set('sort', e.target.value === 'activity' ? '' : e.target.value)} aria-label="Sırala"
              className="cursor-pointer bg-transparent font-medium text-slate-800 focus:outline-none dark:text-slate-100">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {(q || status) && <Button variant="ghost" size="sm" onClick={filters.clear}>Temizle</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm sm:min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Proje</th>
                <th scope="col" className="w-28 px-3 py-2.5 font-medium">Durum</th>
                <th scope="col" className="hidden w-56 px-3 py-2.5 font-medium md:table-cell">Case'ler (son sonuç)</th>
                <th scope="col" className="hidden w-32 px-3 py-2.5 font-medium lg:table-cell">Koşum</th>
                <th scope="col" className="hidden w-24 px-3 py-2.5 text-right font-medium sm:table-cell">Açık hata</th>
                <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !projects.length ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3.5"><div className="flex gap-4"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-48" /></div></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={6}>
                  {projects.length === 0 ? (
                    <EmptyState icon={<FolderKanban size={24} />} title="Henüz proje yok"
                      description="Test case'leri ürün veya modüle göre gruplamak için bir proje oluşturun."
                      action={can('projects.create') && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({})}>Proje oluştur</Button>} />
                  ) : <EmptyState title="Filtrelere uyan proje yok" action={<Button onClick={filters.clear}>Filtreleri temizle</Button>} />}
                </td></tr>
              ) : filtered.map(p => {
                const s = p.stats || {};
                const rate = caseRate(s.cases_by_status);
                return (
                  <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="max-w-0 py-3 pl-4 pr-3">
                      <button type="button" onClick={e => { e.stopPropagation(); navigate(`/projects/${p.id}`); }}
                        className="block max-w-full truncate text-left font-medium text-slate-900 hover:underline dark:text-white">{p.name}</button>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {p.description || <span className="italic">Açıklama yok</span>}
                      </p>
                    </td>
                    <td className="px-3 py-3"><StatusBadge tone={PROJECT_STATUS_TONE[p.status]}>{p.status}</StatusBadge></td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      {s.cases ? (
                        <>
                          <ResultBar height="h-1.5" segments={caseSegments(s.cases_by_status)} />
                          <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {s.cases} case{rate != null && ` · %${rate} geçiyor`}{s.automated > 0 && ` · ${s.automated} oto.`}
                          </p>
                        </>
                      ) : <span className="text-xs text-slate-400">Case yok</span>}
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 lg:table-cell dark:text-slate-400">
                      <span className="tabular-nums text-slate-800 dark:text-slate-100">{s.runs || 0}</span> koşum
                      {s.last_run_at && <span className="block" title={formatDate(s.last_run_at, true)}>son: {relativeTime(s.last_run_at)}</span>}
                    </td>
                    <td className="hidden px-3 py-3 text-right sm:table-cell">
                      {s.open_defects ? (
                        <span className="tabular-nums">
                          <span className="font-medium text-rose-700 dark:text-rose-400">{s.open_defects}</span>
                          {s.critical_defects > 0 && <span className="block text-xs text-slate-500 dark:text-slate-400">{s.critical_defects} kritik</span>}
                        </span>
                      ) : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <Menu trigger={({ ref, toggle, open }) => (
                        <button ref={ref} type="button" onClick={toggle} aria-label={`${p.name} işlemleri`} aria-haspopup="menu" aria-expanded={open}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
                      )}>
                        <MenuItem icon={Eye} onSelect={() => navigate(`/projects/${p.id}`)}>Projeyi aç</MenuItem>
                        {can('test_runs.create') && <MenuItem icon={PlayCircle} onSelect={() => navigate(`/test-runs?new=1&project_id=${p.id}`)}>Koşum oluştur</MenuItem>}
                        {can('reports.view') && <MenuItem icon={BarChart3} onSelect={() => navigate(`/reports?project=${p.id}`)}>Rapor</MenuItem>}
                        {can('projects.edit') && <>
                          <MenuSeparator />
                          <MenuItem icon={Pencil} onSelect={() => setForm({ project: p })}>Düzenle</MenuItem>
                          {PROJECT_STATUSES.filter(x => x !== p.status).map(x => (
                            <MenuItem key={x} icon={() => <span className={`mx-[3px] h-2 w-2 rounded-full ${TONES[PROJECT_STATUS_TONE[x]].dot}`} />} onSelect={() => setStatus(p, x)}>{x} yap</MenuItem>
                          ))}
                        </>}
                        {can('projects.delete') && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" onSelect={() => setRemoving(p)}>Sil</MenuItem></>}
                      </Menu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && <ProjectFormDrawer project={form.project} projects={projects} onClose={() => setForm(null)} onSaved={onSaved} />}
      {removing && <DeleteProjectDialog project={removing} onClose={() => setRemoving(null)}
        onDeleted={p => { setRemoving(null); setProjects(list => list.filter(x => x.id !== p.id)); }} />}
    </div>
  );
};

export default Projects;
