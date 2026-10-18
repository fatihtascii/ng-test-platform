/**
 * Test planı sayfası: plan kalemleri (case'ler ve sonuçları) ve plana bağlı koşumlar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, PlayCircle, Pencil, Trash2, MoreHorizontal, CheckCircle2, X, ListChecks } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { Button, ResultBar, StatusBadge, Ident, Skeleton, EmptyState } from '../components/ui';
import { Checkbox, SearchInput, Tabs } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { TONES } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { testPlansApi, projectsApi, fetchAllTestRuns, fetchAllTestCases } from '../api';
import PlanFormDrawer from './test-plans/PlanFormDrawer';
import CasePickerDialog from './test-plans/CasePickerDialog';
import PlanItemDialog from './test-plans/PlanItemDialog';
import RunFormDrawer from './test-runs/RunFormDrawer';
import { PriorityMark } from './test-cases/parts';
import { caseIdent } from './test-cases/model';
import {
  ITEM_STATUSES, ITEM_LABEL, ITEM_TONE, PLAN_STATUS_TONE, planIdent, planStats, planSegments, dateRange, deadlineOf, trLower,
} from './test-plans/model';
import { parseResults, summarize, segmentsOf, runIdent, RUN_STATUS_TONE, RUN_STATUS_LABEL, relativeTime } from './test-runs/model';

const load = async (id, canRuns) => {
  const { data: plan } = await testPlansApi.getOne(id);
  const [projects, runs] = await Promise.all([
    projectsApi.getAll().then(r => r.data).catch(() => []),
    canRuns ? fetchAllTestRuns({ test_plan_id: plan.id }).catch(() => []) : [],
  ]);
  return { plan, projects, runs };
};

const TestPlanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const [state, setState] = useState({ loading: true });
  const [tab, setTab] = useState('items');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);   // { type: 'edit'|'pick'|'item'|'delete'|'remove'|'run', ... }
  const [busy, setBusy] = useState(null);

  const canRuns = can('test_runs.view');
  useEffect(() => {
    let alive = true;
    load(id, canRuns).then(d => alive && setState({ loading: false, ...d }))
      .catch(e => alive && setState({ loading: false, error: e.message }));
    return () => { alive = false; };
  }, [id, canRuns]);

  const { plan, projects = [], runs = [] } = state;
  const setPlan = useCallback((p) => setState(s => ({ ...s, plan: p })), []);
  const stats = useMemo(() => planStats(plan), [plan]);
  const deadline = plan ? deadlineOf(plan) : null;
  const project = projects.find(p => p.id === plan?.project_id);

  const items = useMemo(() => (plan?.items || []).filter(i =>
    (!statusFilter || i.run_status === statusFilter) &&
    (!q || trLower(i.test_case_title || '').includes(trLower(q)) || caseIdent(i.test_case_id).toLowerCase() === q.trim().toLowerCase())
  ), [plan, q, statusFilter]);

  const canExecute = can('test_runs.execute');
  const canEdit = can('test_plans.edit');
  const selectable = canExecute || canEdit;
  const pickedVisible = items.filter(i => selected.has(i.id)).length;
  const toggle = (iid) => setSelected(prev => { const n = new Set(prev); if (n.has(iid)) n.delete(iid); else n.add(iid); return n; });
  const toggleVisible = () => setSelected(prev => {
    const n = new Set(prev); const on = pickedVisible !== items.length;
    items.forEach(i => on ? n.add(i.id) : n.delete(i.id)); return n;
  });

  // ── İşlemler ────────────────────────────────────────────────
  const addCases = async (ids) => {
    try {
      const { data } = await testPlansApi.bulkAdd(plan.id, ids);
      const { data: fresh } = await testPlansApi.getOne(plan.id);
      setPlan(fresh);
      toast.success(`${data.added} case plana eklendi.`);
      setDialog(null);
      return true;
    } catch (e) { toast.error(e.message || 'Eklenemedi.'); return false; }
  };

  const bulkStatus = async (runStatus) => {
    setBusy('status');
    try {
      const { data } = await testPlansApi.bulkItemStatus(plan.id, [...selected], runStatus);
      setPlan(data);
      toast.success(`${selected.size} kalem "${ITEM_LABEL[runStatus]}" olarak işaretlendi.`);
      setSelected(new Set());
    } catch (e) { toast.error(e.message || 'Güncellenemedi.'); }
    finally { setBusy(null); }
  };

  const removeSelected = async () => {
    setBusy('remove');
    try {
      const { data } = await testPlansApi.bulkRemoveItems(plan.id, [...selected]);
      setPlan(data);
      toast.success(`${selected.size} case plandan çıkarıldı.`);
      setSelected(new Set());
      setDialog(null);
    } catch (e) { toast.error(e.message || 'Çıkarılamadı.'); }
    finally { setBusy(null); }
  };

  const saveItem = async (item, runStatus, note) => {
    try {
      const { data } = await testPlansApi.updateItem(plan.id, item.id, { run_status: runStatus, note });
      setPlan({ ...plan, items: plan.items.map(i => i.id === item.id ? data : i) });
      return true;
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); return false; }
  };

  const setPlanStatus = async (status) => {
    setBusy('plan');
    try {
      const { data } = await testPlansApi.update(plan.id, {
        title: plan.title, description: plan.description, status, project_id: plan.project_id,
        start_date: plan.start_date, end_date: plan.end_date,
      });
      setPlan(data);
      toast.success(status === 'Tamamlandı' ? 'Plan tamamlandı olarak işaretlendi.' : `Plan durumu: ${status}.`);
    } catch (e) { toast.error(e.message || 'Güncellenemedi.'); }
    finally { setBusy(null); }
  };

  const removePlan = async () => {
    setBusy('delete');
    try { await testPlansApi.remove(plan.id); toast.success(`${planIdent(plan.id)} silindi.`); navigate('/test-plans'); }
    catch (e) { toast.error(e.message || 'Silinemedi.'); setBusy(null); }
  };

  const openRunForm = async () => {
    const cases = await fetchAllTestCases({ project_id: plan.project_id }).catch(() => []);
    setDialog({ type: 'run', caseCounts: new Map([[plan.project_id, cases.length]]) });
  };

  // ── Görünüm ─────────────────────────────────────────────────
  if (state.loading) return <div className="space-y-4"><Skeleton className="h-8 w-80" /><Skeleton className="h-20" /><Skeleton className="h-96" /></div>;
  if (state.error || !plan) return <EmptyState title="Plan açılamadı" description={state.error} action={<Button onClick={() => navigate('/test-plans')}>Planlara dön</Button>} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link to="/test-plans" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft size={12} /> Test planları
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Ident>{planIdent(plan.id)}</Ident>
            <StatusBadge tone={PLAN_STATUS_TONE[plan.status]}>{plan.status}</StatusBadge>
            {deadline && <span className={`text-xs ${TONES[deadline.tone].text}`}>{deadline.text}</span>}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{plan.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {project && <Link to={`/projects/${project.id}`} className="hover:underline">{project.name}</Link>}
            {dateRange(plan) && <> · {dateRange(plan)}</>}
          </p>
          {plan.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{plan.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {can('test_runs.create') && stats.total > 0 && (
            <Button variant="primary" icon={<PlayCircle size={15} />} onClick={openRunForm}>Koşum oluştur</Button>
          )}
          {(canEdit || can('test_plans.delete')) && (
            <Menu trigger={({ ref, toggle: t, open }) => (
              <Button ref={ref} variant="ghost" size="icon" onClick={t} aria-label="Diğer işlemler" aria-haspopup="menu" aria-expanded={open}><MoreHorizontal size={16} /></Button>
            )} width={240}>
              {canEdit && <MenuItem icon={Pencil} onSelect={() => setDialog({ type: 'edit' })}>Planı düzenle</MenuItem>}
              {canEdit && plan.status !== 'Tamamlandı' && <MenuItem icon={CheckCircle2} onSelect={() => setPlanStatus('Tamamlandı')}>Tamamlandı işaretle</MenuItem>}
              {canEdit && plan.status === 'Tamamlandı' && <MenuItem icon={PlayCircle} onSelect={() => setPlanStatus('Aktif')}>Yeniden aktif yap</MenuItem>}
              {can('test_plans.delete') && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" onSelect={() => setDialog({ type: 'delete' })}>Planı sil</MenuItem></>}
            </Menu>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900" aria-label="Plan özeti">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{stats.done}/{stats.total}</span> case sonuçlandı (%{stats.progress})
            {stats.rate != null && <> · geçme oranı <span className="font-semibold tabular-nums text-slate-900 dark:text-white">%{stats.rate}</span></>}
            {runs.length > 0 && <> · {runs.length} koşum</>}
          </p>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Sonuca göre süz">
            {ITEM_STATUSES.map(s => {
              const active = statusFilter === s;
              return (
                <button key={s} type="button" aria-pressed={active} onClick={() => { setStatusFilter(active ? '' : s); setTab('items'); }}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  <span className={`h-2 w-2 rounded-full ${TONES[ITEM_TONE[s]].dot}`} aria-hidden />{ITEM_LABEL[s]}<span className="tabular-nums opacity-70">{stats[s]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <ResultBar segments={planSegments(stats)} />
        {stats.total > 0 && stats['Bekliyor'] === 0 && plan.status !== 'Tamamlandı' && canEdit && (
          <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300">
            Tüm case'ler sonuçlandı. <button type="button" onClick={() => setPlanStatus('Tamamlandı')} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Planı tamamlandı işaretle</button>
          </p>
        )}
      </section>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'items', label: 'Case\'ler', count: stats.total },
        ...(can('test_runs.view') ? [{ id: 'runs', label: 'Koşumlar', count: runs.length }] : []),
      ]} />

      {tab === 'items' && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Plandaki case'lerde ara" className="sm:w-72" />
            {canEdit && <Button icon={<Plus size={14} />} onClick={() => setDialog({ type: 'pick' })} className="sm:ml-auto">Case ekle</Button>}
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10" role="region" aria-label="Toplu işlemler">
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{selected.size} kalem seçili</span>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {canExecute && ITEM_STATUSES.map(s => (
                  <Button key={s} size="sm" onClick={() => bulkStatus(s)} disabled={busy === 'status'}>
                    <span className={`h-2 w-2 rounded-full ${TONES[ITEM_TONE[s]].dot}`} aria-hidden />{ITEM_LABEL[s]}
                  </Button>
                ))}
                {canEdit && <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDialog({ type: 'remove' })}>Plandan çıkar</Button>}
                <button type="button" onClick={() => setSelected(new Set())} aria-label="Seçimi temizle" className="rounded-md p-1 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-500/20"><X size={15} /></button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {stats.total === 0 ? (
              <EmptyState icon={<ListChecks size={24} />} title="Bu planda henüz case yok"
                description="Plana eklenen case'ler, plana bağlı koşumların kapsamını oluşturur."
                action={canEdit && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ type: 'pick' })}>Case ekle</Button>} />
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      {selectable && (
                        <th scope="col" className="w-10 py-2.5 pl-4 pr-1">
                          <Checkbox label="Görünenlerin tümünü seç" checked={items.length > 0 && pickedVisible === items.length}
                            indeterminate={pickedVisible > 0 && pickedVisible < items.length} onChange={toggleVisible} />
                        </th>
                      )}
                      <th scope="col" className={`py-2.5 pr-3 font-medium ${selectable ? 'pl-2' : 'pl-4'}`}>Case</th>
                      <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium sm:table-cell">Öncelik</th>
                      <th scope="col" className="w-28 px-3 py-2.5 font-medium">Sonuç</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">Filtreye uyan case yok.</td></tr>}
                    {items.map(i => (
                      <tr key={i.id} onClick={() => setDialog({ type: 'item', item: i })} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        {selectable && (
                          <td className="py-2.5 pl-4 pr-1" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selected.has(i.id)} onChange={() => toggle(i.id)} label={`${caseIdent(i.test_case_id)} seç`} />
                          </td>
                        )}
                        <td className={`max-w-0 py-2.5 pr-3 ${selectable ? 'pl-2' : 'pl-4'}`}>
                          <div className="flex items-baseline gap-2">
                            <Ident className="w-14 shrink-0">{caseIdent(i.test_case_id)}</Ident>
                            <span className="truncate text-slate-900 dark:text-slate-100">{i.test_case_title || 'Silinmiş case'}</span>
                          </div>
                          {i.note && <p className="mt-0.5 truncate pl-16 text-xs text-slate-500 dark:text-slate-400">{i.note}</p>}
                        </td>
                        <td className="hidden px-3 py-2.5 sm:table-cell"><PriorityMark priority={i.test_case_priority} /></td>
                        <td className="px-3 py-2.5"><StatusBadge tone={ITEM_TONE[i.run_status]}>{ITEM_LABEL[i.run_status] || i.run_status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'runs' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {runs.length === 0 ? (
            <EmptyState icon={<PlayCircle size={24} />} title="Bu planla henüz koşum yapılmadı"
              description="Koşum oluşturduğunuzda planın case'leri kapsam olarak alınır; koşum bitince sonuçlar bu plana yazılır."
              action={can('test_runs.create') && stats.total > 0 && <Button variant="primary" icon={<PlayCircle size={14} />} onClick={openRunForm}>Koşum oluştur</Button>} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {runs.map(r => {
                const s = summarize(parseResults(r.results));
                return (
                  <li key={r.id}>
                    <Link to={`/test-runs/${r.id}`} className="grid items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[1fr_12rem_8rem] dark:hover:bg-slate-800/40">
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-2"><Ident>{runIdent(r.id)}</Ident><span className="truncate text-sm font-medium text-slate-900 dark:text-white">{r.name}</span></span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{relativeTime(r.updated_at || r.created_at)} · {s.done}/{s.total} sonuç{s.rate != null && ` · %${s.rate}`}</span>
                      </span>
                      <ResultBar segments={segmentsOf(s)} height="h-1.5" />
                      <span className="sm:text-right"><StatusBadge tone={RUN_STATUS_TONE[r.status]}>{RUN_STATUS_LABEL[r.status] || r.status}</StatusBadge></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {dialog?.type === 'edit' && <PlanFormDrawer plan={plan} projects={projects} onClose={() => setDialog(null)} onSaved={(p) => { setPlan(p); setDialog(null); }} />}
      {dialog?.type === 'pick' && <CasePickerDialog projectId={plan.project_id} existing={new Set(plan.items.map(i => i.test_case_id))} onClose={() => setDialog(null)} onAdd={addCases} />}
      {dialog?.type === 'item' && (
        <PlanItemDialog item={dialog.item} plan={plan} readOnly={!canExecute} canDefect={can('defects.manage')}
          onClose={() => setDialog(null)} onSave={(st, note) => saveItem(dialog.item, st, note)} />
      )}
      {dialog?.type === 'run' && (
        <RunFormDrawer initial={{ project_id: plan.project_id, test_plan_id: plan.id }} projects={projects} plans={[plan]} caseCounts={dialog.caseCounts}
          onClose={() => setDialog(null)} onSaved={(run) => navigate(`/test-runs/${run.id}`)} />
      )}
      <ConfirmDialog open={dialog?.type === 'remove'} onClose={() => setDialog(null)} onConfirm={removeSelected} loading={busy === 'remove'}
        confirmLabel="Çıkar" title={`${selected.size} case plandan çıkarılsın mı?`}
        description="Case'ler silinmez; yalnızca bu planın kapsamından çıkar ve kalem sonuçları kaybolur." />
      <ConfirmDialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} onConfirm={removePlan} loading={busy === 'delete'}
        confirmLabel="Sil" title={`${planIdent(plan.id)} silinsin mi?`}
        description="Plan ve kalem sonuçları silinir. Case'ler ve koşumlar korunur. Bu işlem geri alınamaz." />
    </div>
  );
};

export default TestPlanDetail;
