/**
 * Hata kayıtları listesi. Kayıtlar sunucuda tutulur: başarısız koşumlar otomatik kayıt üretir,
 * kullanıcılar elle de açabilir. Parçalar ./defects altında.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, MoreHorizontal, Eye, Pencil, Trash2, Bug, UserRoundCheck, UserRoundX, Copy, CircleDot, MessageSquare } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, StatusBadge, EmptyState, Skeleton, Ident, Avatar } from '../components/ui';
import { DebouncedSearchInput, FilterSelect, Pagination, Checkbox, SortHeader } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { TONES } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { defectsApi, projectsApi } from '../api';
import { relativeTime, formatDate } from './test-runs/model';
import { downloadText } from './test-cases/model';
import DefectFormDrawer from './defects/DefectFormDrawer';
import DefectBulkBar from './defects/DefectBulkBar';
import { migrateLegacyLocalDefects } from './defects/legacyMigration';
import {
  STATUSES, STATUS_LABEL, STATUS_TONE, ACTIVE, ACTIVE_STATUSES, SEVERITIES, SEVERITY_TONE, SOURCE_LABEL,
  defectIdent, matchesQuery, compareDefects, statusCounts, defectReport, defectsToCsv, currentUser, ageDays,
} from './defects/model';

const PAGE_SIZE = 25;

const load = () => Promise.all([defectsApi.getAll(), projectsApi.getAll(), defectsApi.assignees().catch(() => ({ data: [] }))])
  .then(([d, p, a]) => ({ defects: d.data, projects: p.data, assignees: a.data }));

const copyText = async (text, what) => {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} panoya kopyalandı.`); }
  catch { toast.error('Panoya kopyalanamadı.'); }
};

const Defects = () => {
  const { can } = usePermission();
  const canManage = can('defects.manage');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useUrlFilters(['q', 'status', 'project', 'severity', 'assignee', 'source']);
  const { q, status, project, severity, assignee, source } = filters.values;
  const me = useMemo(currentUser, []);

  const [data, setData] = useState({ defects: [], projects: [], assignees: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'id', direction: 'desc' });
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState(() => {
    // Başka sayfadan "hata kaydı aç" ile gelindiyse (?new=1&project_id=&case_id=&run_id=&title=)
    if (!searchParams.get('new')) return null;
    return { initial: {
      project_id: searchParams.get('project_id'), test_case_id: searchParams.get('case_id'),
      test_run_id: searchParams.get('run_id'), title: searchParams.get('title') || '',
    } };
  });
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Eski sürümde tarayıcıda tutulan defect verisini bir kez sunucuya taşı
      if (canManage) {
        try {
          const moved = await migrateLegacyLocalDefects();
          if (moved > 0) toast.success(`Tarayıcıda kalan ${moved} hata kaydı sunucuya taşındı.`);
        } catch { /* taşınamazsa veriler yerinde kalır, sonraki açılışta tekrar denenir */ }
      }
      try {
        const d = await load();
        if (alive) setData(d);
      } catch (e) { if (alive) setError(e.message || 'Hata kayıtları yüklenemedi.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [canManage]);

  // Tek seferlik "yeni kayıt" parametrelerini adresten temizle
  useEffect(() => {
    if (['new', 'project_id', 'case_id', 'run_id', 'title'].some(k => searchParams.has(k))) {
      const next = new URLSearchParams(searchParams);
      ['new', 'project_id', 'case_id', 'run_id', 'title'].forEach(k => next.delete(k));
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setData(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const { defects, projects, assignees } = data;
  const multiProject = projects.length > 1;

  // Statü dışındaki filtreler: statü şeridi bu kümenin dağılımını gösterir
  const base = useMemo(() => defects.filter(d =>
    matchesQuery(d, q) &&
    (!project || String(d.project_id) === project) &&
    (!severity || d.severity === severity) &&
    (!source || d.source === source) &&
    (!assignee || (assignee === 'me' ? d.assignee_id === me?.id : assignee === 'none' ? d.assignee_id == null : String(d.assignee_id) === assignee))
  ), [defects, q, project, severity, source, assignee, me]);

  const filtered = useMemo(() => {
    const list = base.filter(d => !status || (status === ACTIVE ? ACTIVE_STATUSES.has(d.status) : d.status === status));
    const cmp = compareDefects(sort.key);
    return list.sort((a, b) => (sort.direction === 'asc' ? 1 : -1) * (cmp(a, b) || a.id - b.id));
  }, [base, status, sort]);

  const counts = useMemo(() => statusCounts(base), [base]);
  const activeCount = counts.Open + counts['In Progress'] + counts['Re-test'];
  const mineCount = useMemo(() => defects.filter(d => d.assignee_id === me?.id && ACTIVE_STATUSES.has(d.status)).length, [defects, me]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const visibleIds = useMemo(() => new Set(filtered.map(d => d.id)), [filtered]);
  const selectedVisible = [...selected].filter(id => visibleIds.has(id)).length;
  const allSelected = filtered.length > 0 && selectedVisible === filtered.length;
  const selectedDefects = useMemo(() => defects.filter(d => selected.has(d.id)), [defects, selected]);

  const setFilter = (k, v) => { filters.set(k, v); setPage(1); };
  const onSort = (key) => setSort(s => ({ key, direction: s.key === key && s.direction === 'desc' ? 'asc' : 'desc' }));
  const toggle = (id) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(s => {
    const n = new Set(s);
    if (allSelected) filtered.forEach(d => n.delete(d.id)); else filtered.forEach(d => n.add(d.id));
    return n;
  });

  const replace = (updated) => setData(d => ({ ...d, defects: d.defects.map(x => x.id === updated.id ? updated : x) }));

  const patchOne = async (d, body, message) => {
    try {
      const { data: updated } = await defectsApi.update(d.id, body);
      replace(updated);
      toast.success(message);
    } catch (e) { toast.error(e.message || 'Güncellenemedi.'); }
  };

  // Toplu işlemler: sunucu yalnızca değişeni günceller; liste yeniden çekilir
  const bulk = async (kind, call, message) => {
    setBusy(kind);
    try {
      const { data: res } = await call([...selected]);
      const fresh = await load();
      setData(fresh);
      toast.success(message(res.updated));
      return true;
    } catch (e) { toast.error(e.message || 'Toplu işlem başarısız.'); return false; }
    finally { setBusy(null); }
  };
  const bulkStatus = (value) => bulk('status', ids => defectsApi.bulkStatus({ ids, status: value }),
    n => n ? `${n} kaydın durumu "${STATUS_LABEL[value]}" yapıldı.` : 'Seçili kayıtlar zaten bu durumda.');
  const bulkAssign = (id) => bulk('assign', ids => defectsApi.bulkAssign({ ids, assignee_id: id }),
    n => !n ? 'Değişiklik gerekmedi.' : id == null ? `${n} kaydın ataması kaldırıldı.` : `${n} kayıt ${assignees.find(u => u.id === id)?.full_name || assignees.find(u => u.id === id)?.username} kişisine atandı.`);

  const exportCsv = (list) => {
    downloadText(defectsToCsv(list), `hatalar-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const onSaved = (saved, created) => {
    setForm(null);
    if (created) navigate(`/defects/${defectIdent(saved.id)}`);
    else replace(saved);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await defectsApi.remove(confirm.id);
      setData(d => ({ ...d, defects: d.defects.filter(x => x.id !== confirm.id) }));
      setSelected(s => { const n = new Set(s); n.delete(confirm.id); return n; });
      toast.success(`${defectIdent(confirm.id)} silindi.`);
      setConfirm(null);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); }
    finally { setDeleting(false); }
  };

  const open = (d) => navigate(`/defects/${defectIdent(d.id)}`);

  const strip = [
    { value: ACTIVE, label: 'Çözülmemiş', count: activeCount, tone: null },
    ...STATUSES.map(s => ({ ...s, count: counts[s.value] })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Hatalar"
        description="Kaldı sonucu alan koşumlar burada otomatik kayıt açar; elle de kayıt açabilirsiniz. Kayıtları atayın, yorumlayın, düzeltmeyi tekrar teste gönderin."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </Button>
          {canManage && (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm({ initial: { project_id: project } })} disabled={!projects.length}>
              Hata kaydı aç
            </Button>
          )}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}<Button size="sm" className="ml-auto" onClick={reload}>Tekrar dene</Button>
        </div>
      )}

      {defects.length > 0 && (
        <section aria-label="Durum dağılımı" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="relative flex overflow-x-auto divide-x divide-slate-100 dark:divide-slate-800">
            {strip.map(s => {
              const activeTab = status === s.value;
              return (
                <button key={s.value} type="button" aria-pressed={activeTab} onClick={() => setFilter('status', activeTab ? '' : s.value)}
                  className={`relative min-w-[6.5rem] flex-1 px-3 py-2.5 text-left transition-colors sm:px-4 sm:py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${activeTab ? 'bg-slate-50 dark:bg-slate-800/60' : ''}`}>
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {s.tone ? <span className={`h-2 w-2 rounded-full ${TONES[s.tone].dot}`} aria-hidden /> : <CircleDot size={11} aria-hidden />}
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{s.count}</span>
                  {activeTab && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" aria-hidden />}
                </button>
              );
            })}
          </div>
          {base.length > 0 && (
            <div className="flex h-1.5 w-full gap-px" aria-hidden>
              {STATUSES.filter(s => counts[s.value]).map(s => (
                <div key={s.value} className={TONES[s.tone].bar} style={{ width: `${(counts[s.value] / base.length) * 100}%` }} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <DebouncedSearchInput value={q} onChange={v => setFilter('q', v)} placeholder="Başlık, BUG-ID veya kişi ara" className="lg:w-72" />
        <div className="flex flex-wrap items-center gap-2">
          {me && (
            <button type="button" aria-pressed={assignee === 'me'} onClick={() => setFilter('assignee', assignee === 'me' ? '' : 'me')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm ${assignee === 'me'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
              Bana atanan{mineCount > 0 && <span className="rounded bg-indigo-600 px-1 text-[11px] font-medium tabular-nums text-white">{mineCount}</span>}
            </button>
          )}
          {multiProject && <FilterSelect label="Proje" value={project} onChange={v => setFilter('project', v)} options={projects.map(p => [p.id, p.name])} />}
          <FilterSelect label="Önem" value={severity} onChange={v => setFilter('severity', v)} options={SEVERITIES.map(s => [s, s])} />
          <FilterSelect label="Atanan" value={assignee} onChange={v => setFilter('assignee', v)}
            options={[['me', 'Ben'], ['none', 'Atanmamış'], ...assignees.filter(u => u.id !== me?.id).map(u => [u.id, u.full_name || u.username])]} />
          <FilterSelect label="Kaynak" value={source} onChange={v => setFilter('source', v)} options={Object.entries(SOURCE_LABEL)} />
          {filters.active && <Button variant="ghost" size="sm" onClick={() => { filters.clear(); setPage(1); }}>Temizle</Button>}
        </div>
        {filtered.length > 0 && !selected.size && (
          <Menu trigger={({ ref, toggle: t, open: o }) => (
            <Button ref={ref} size="sm" variant="ghost" className="lg:ml-auto" onClick={t} aria-expanded={o} aria-haspopup="menu">Dışa aktar</Button>
          )}>
            <MenuItem icon={Copy} onSelect={() => copyText(filtered.map(defectReport).join('\n\n———\n\n'), `${filtered.length} kayıt`)}>Raporu kopyala</MenuItem>
            <MenuItem onSelect={() => exportCsv(filtered)} hint={`${filtered.length} kayıt`}>CSV indir</MenuItem>
          </Menu>
        )}
      </div>

      {selected.size > 0 && (
        <DefectBulkBar count={selected.size} hiddenCount={selected.size - selectedVisible} assignees={assignees} busy={busy}
          onStatus={canManage ? bulkStatus : null} onAssign={canManage ? bulkAssign : null}
          onCopy={() => copyText(selectedDefects.map(defectReport).join('\n\n———\n\n'), `${selectedDefects.length} kayıt`)}
          onExport={() => exportCsv(selectedDefects)} onClear={() => setSelected(new Set())} />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm sm:min-w-[760px]">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th scope="col" className="w-10 py-2.5 pl-4">
                  <Checkbox checked={allSelected} indeterminate={selectedVisible > 0 && !allSelected} onChange={toggleAll} label="Tümünü seç" disabled={!filtered.length} />
                </th>
                <SortHeader label="Hata" sortKey="id" sort={sort} onSort={onSort} className="pl-1" />
                {multiProject && <th scope="col" className="hidden w-36 px-3 py-2.5 font-medium xl:table-cell">Proje</th>}
                <SortHeader label="Önem" sortKey="severity" sort={sort} onSort={onSort} className="hidden w-24 md:table-cell" />
                <SortHeader label="Durum" sortKey="status" sort={sort} onSort={onSort} className="w-32" />
                <SortHeader label="Atanan" sortKey="assignee" sort={sort} onSort={onSort} className="hidden w-40 lg:table-cell" />
                <SortHeader label="Güncellendi" sortKey="updated" sort={sort} onSort={onSort} className="hidden w-28 lg:table-cell" />
                <th scope="col" className="w-12 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !defects.length ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="flex gap-4"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /></div></td></tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={8}>
                  {defects.length === 0 ? (
                    <EmptyState icon={<Bug size={24} />} title="Hata kaydı yok"
                      description="Bir koşumda Kaldı sonucu girildiğinde kayıt burada otomatik açılır."
                      action={canManage && projects.length > 0 && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({ initial: {} })}>Hata kaydı aç</Button>} />
                  ) : (
                    <EmptyState title={status === ACTIVE && !filters.active ? 'Çözülmemiş hata yok' : 'Filtrelere uyan kayıt yok'}
                      action={<Button onClick={() => { filters.clear(); setPage(1); }}>Filtreleri temizle</Button>} />
                  )}
                </td></tr>
              ) : rows.map(d => {
                const age = ageDays(d);
                return (
                  <tr key={d.id} onClick={() => open(d)} className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selected.has(d.id) ? 'bg-indigo-50/40 dark:bg-indigo-500/5' : ''}`}>
                    <td className="py-2.5 pl-4 align-top" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(d.id)} onChange={() => toggle(d.id)} label={`${defectIdent(d.id)} seç`} className="mt-0.5" />
                    </td>
                    <td className="max-w-0 py-2.5 pl-1 pr-3">
                      <div className="flex items-baseline gap-2">
                        <Ident className="shrink-0">{defectIdent(d.id)}</Ident>
                        <button type="button" onClick={e => { e.stopPropagation(); open(d); }}
                          className="truncate text-left font-medium text-slate-900 hover:underline dark:text-white">{d.title}</button>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        <span>{d.source === 'auto' ? (d.test_run_id ? `KS-${d.test_run_id}` : 'Silinmiş koşum') : 'Manuel'}</span>
                        {d.failed_count > 0 && <><span aria-hidden>·</span><span className="text-rose-600 dark:text-rose-400">{d.failed_count} hatalı test</span></>}
                        {d.comment_count > 0 && <><span aria-hidden>·</span><span className="inline-flex items-center gap-0.5"><MessageSquare size={11} aria-hidden />{d.comment_count}</span></>}
                        {age != null && ACTIVE_STATUSES.has(d.status) && age >= 1 && <><span aria-hidden>·</span><span title="Açık kaldığı süre">{age} gündür açık</span></>}
                        <span className="md:hidden"><span aria-hidden>· </span>{d.severity}</span>
                      </p>
                    </td>
                    {multiProject && <td className="hidden max-w-0 truncate px-3 py-2.5 text-slate-700 xl:table-cell dark:text-slate-200">{d.project_name || '—'}</td>}
                    <td className="hidden px-3 py-2.5 md:table-cell"><StatusBadge tone={SEVERITY_TONE[d.severity]}>{d.severity}</StatusBadge></td>
                    <td className="px-3 py-2.5"><StatusBadge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status] || d.status}</StatusBadge></td>
                    <td className="hidden max-w-0 px-3 py-2.5 lg:table-cell">
                      {d.assignee_id ? (
                        <span className="flex items-center gap-2 truncate text-slate-700 dark:text-slate-200">
                          <Avatar user={{ full_name: d.assignee_name, username: d.assignee_name }} size="sm" />
                          <span className="truncate">{d.assignee_id === me?.id ? 'Ben' : d.assignee_name}</span>
                        </span>
                      ) : <span className="text-xs text-slate-400">Atanmamış</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-slate-500 lg:table-cell dark:text-slate-400" title={formatDate(d.updated_at || d.created_at, true)}>
                      {relativeTime(d.updated_at || d.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      <Menu width={230} trigger={({ ref, toggle: t, open: o }) => (
                        <button ref={ref} type="button" onClick={t} aria-label={`${defectIdent(d.id)} işlemleri`} aria-haspopup="menu" aria-expanded={o}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
                      )}>
                        <MenuItem icon={Eye} onSelect={() => open(d)}>Ayrıntıları aç</MenuItem>
                        {canManage && <>
                          <MenuItem icon={Pencil} onSelect={() => setForm({ defect: d })}>Düzenle</MenuItem>
                          {me && d.assignee_id !== me.id && <MenuItem icon={UserRoundCheck} onSelect={() => patchOne(d, { assignee_id: me.id }, `${defectIdent(d.id)} size atandı.`)}>Bana ata</MenuItem>}
                          {d.assignee_id && <MenuItem icon={UserRoundX} onSelect={() => patchOne(d, { assignee_id: null }, 'Atama kaldırıldı.')}>Atamayı kaldır</MenuItem>}
                          <MenuSeparator />
                          {STATUSES.filter(s => s.value !== d.status).map(s => (
                            <MenuItem key={s.value} icon={() => <span className={`mx-[3px] h-2 w-2 rounded-full ${TONES[s.tone].dot}`} />}
                              onSelect={() => patchOne(d, { status: s.value }, `${defectIdent(d.id)} → ${s.label}`)}>{s.label}</MenuItem>
                          ))}
                        </>}
                        <MenuSeparator />
                        <MenuItem icon={Copy} onSelect={() => copyText(defectReport(d), defectIdent(d.id))}>Raporu kopyala</MenuItem>
                        {canManage && <MenuItem icon={Trash2} tone="danger" onSelect={() => setConfirm(d)}>Sil</MenuItem>}
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
        <DefectFormDrawer defect={form.defect} initial={form.initial} projects={projects} assignees={assignees}
          onClose={() => setForm(null)} onSaved={onSaved} />
      )}
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} loading={deleting} confirmLabel="Sil"
        title={confirm ? `${defectIdent(confirm.id)} silinsin mi?` : ''}
        description={confirm?.source === 'auto'
          ? 'Kayıt, yorumları ve geçmişiyle silinir. Koşum tekrar hata verirse yeni bir kayıt açılır. Bu işlem geri alınamaz.'
          : 'Kayıt, yorumları ve geçmişiyle silinir. Bu işlem geri alınamaz.'} />
    </div>
  );
};

export default Defects;
