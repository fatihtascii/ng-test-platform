/**
 * Ortamlar ve değişkenler. Parçalar ./environments altında.
 * Ortam: koşumun hedef adresi. Değişken: koşuma ortam değişkeni olarak verilen değer
 * (global < proje < ortam). Sırlar listede maskelidir, yönetici tek tek açar.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, MoreHorizontal, Pencil, Trash2, Eye, EyeOff, Globe, KeyRound, Lock, ExternalLink, ListTree } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, EmptyState, Skeleton, StatusBadge } from '../components/ui';
import { DebouncedSearchInput, FilterSelect, Tabs } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { toast } from '../components/ui/toast';
import { projectsApi, environmentsApi, variablesApi } from '../api';
import EnvFormDrawer from './environments/EnvFormDrawer';
import VarFormDrawer from './environments/VarFormDrawer';
import EnvDetailDrawer from './environments/EnvDetailDrawer';
import { CopyButton } from './environments/parts';

const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');
const load = () => Promise.all([projectsApi.getAll(), environmentsApi.getAll(), variablesApi.getAll()])
  .then(([p, e, v]) => ({ projects: p.data, environments: e.data, variables: v.data }));

const RowMenu = ({ label, children }) => (
  <Menu trigger={({ ref, toggle, open }) => (
    <button ref={ref} type="button" onClick={toggle} aria-label={label} aria-haspopup="menu" aria-expanded={open}
      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
  )}>{children}</Menu>
);

const Environments = () => {
  const { can } = usePermission();
  const canManage = can('environments.manage');
  const filters = useUrlFilters(['tab', 'project', 'q', 'env', 'type']);
  const { project, q, env: envFilter, type } = filters.values;
  const tab = filters.values.tab || 'environments';

  const [data, setData] = useState({ projects: [], environments: [], variables: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState({});     // { varId: değer }
  const [dialog, setDialog] = useState(null);       // { type: 'env'|'var'|'detail'|'delete', ... }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) { setData(d); setLoading(false); } }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setData(d); setError(null); setRevealed({}); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const { projects, environments, variables } = data;
  const projectName = useCallback((id) => projects.find(p => p.id === id)?.name || '—', [projects]);
  const envById = useMemo(() => new Map(environments.map(e => [e.id, e])), [environments]);

  const visibleEnvs = useMemo(() => environments.filter(e =>
    (!project || String(e.project_id) === project) &&
    (!q || trLower(e.name).includes(trLower(q)) || e.url.toLowerCase().includes(q.toLowerCase()))
  ), [environments, project, q]);

  const scopeOf = (v) => v.env_id ? { label: envById.get(v.env_id)?.name || 'Ortam', sub: projectName(v.project_id), tone: 'accent' }
    : v.project_id ? { label: 'Tüm ortamlar', sub: projectName(v.project_id), tone: 'info' } : { label: 'Global', sub: 'Tüm projeler', tone: 'pending' };

  const visibleVars = useMemo(() => variables.filter(v =>
    (!project || String(v.project_id) === project || (!v.project_id && !v.env_id)) &&
    (!envFilter || (envFilter === 'global' ? !v.env_id : String(v.env_id) === envFilter)) &&
    (!type || (type === 'secret' ? v.is_secret : !v.is_secret)) &&
    (!q || trLower(v.key).includes(trLower(q)))
  ), [variables, project, envFilter, type, q]);

  const reveal = async (v) => {
    if (revealed[v.id] != null) { setRevealed(r => { const n = { ...r }; delete n[v.id]; return n; }); return; }
    try { const { data: d } = await variablesApi.reveal(v.id); setRevealed(r => ({ ...r, [v.id]: d.value })); }
    catch (e) { toast.error(e.message || 'Değer açılamadı.'); }
  };
  const secretValue = (v) => async () => revealed[v.id] ?? (await variablesApi.reveal(v.id)).data.value;

  const onEnvSaved = (saved, created) => {
    setData(d => ({ ...d, environments: created ? [saved, ...d.environments] : d.environments.map(e => e.id === saved.id ? saved : e) }));
    setDialog(created ? null : { type: 'detail', env: saved });
  };
  const onVarSaved = (saved, created) => {
    setData(d => ({ ...d, variables: created ? [...d.variables, saved] : d.variables.map(v => v.id === saved.id ? saved : v) }));
    setRevealed(r => { const n = { ...r }; delete n[saved.id]; return n; });
    setDialog(null);
  };

  const remove = async () => {
    const { kind, item } = dialog;
    setBusy(true);
    try {
      if (kind === 'env') {
        await environmentsApi.remove(item.id);
        setData(d => ({ ...d, environments: d.environments.filter(e => e.id !== item.id), variables: d.variables.filter(v => v.env_id !== item.id) }));
      } else {
        await variablesApi.remove(item.id);
        setData(d => ({ ...d, variables: d.variables.filter(v => v.id !== item.id) }));
      }
      toast.success(`${kind === 'env' ? item.name : item.key} silindi.`);
      setDialog(null);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); }
    finally { setBusy(false); }
  };

  const varCount = (envId) => variables.filter(v => v.env_id === envId);

  return (
    <div className="space-y-5">
      <PageHeader title="Ortamlar ve değişkenler"
        description="Koşumların hedef adresleri ve testlere aktarılan değişkenler. Otomasyon ekranında seçilen ortamın değerleri script'e ortam değişkeni olarak verilir."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></Button>
          {canManage && (tab === 'environments'
            ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog({ type: 'env' })} disabled={!projects.length}>Ortam ekle</Button>
            : <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog({ type: 'var', initial: { project_id: project, env_id: envFilter !== 'global' ? envFilter : '' } })}>Değişken ekle</Button>)}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}<Button size="sm" className="ml-auto" onClick={reload}>Tekrar dene</Button>
        </div>
      )}

      <Tabs value={tab} onChange={t => filters.patch({ tab: t === 'environments' ? '' : t, env: '', type: '', q: '' })} tabs={[
        { id: 'environments', label: 'Ortamlar', count: environments.length },
        { id: 'variables', label: 'Değişkenler', count: variables.length },
      ]} />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <DebouncedSearchInput value={q} onChange={v => filters.set('q', v)} placeholder={tab === 'environments' ? 'Ortam adı veya adres ara' : 'Anahtar ara'} className="lg:w-72" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Proje" value={project} onChange={v => filters.patch({ project: v, env: '' })} options={projects.map(p => [p.id, p.name])} />
          {tab === 'variables' && <>
            <FilterSelect label="Kapsam" value={envFilter} onChange={v => filters.set('env', v)}
              options={[['global', 'Ortama bağlı olmayanlar'], ...environments.filter(e => !project || String(e.project_id) === project).map(e => [e.id, `${e.name} · ${projectName(e.project_id)}`])]} />
            <FilterSelect label="Tür" value={type} onChange={v => filters.set('type', v)} options={[['secret', 'Sır'], ['plain', 'Düz değer']]} />
          </>}
          {filters.active && (q || project || envFilter || type) && <Button variant="ghost" size="sm" onClick={() => filters.patch({ project: '', q: '', env: '', type: '' })}>Temizle</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading && !environments.length && !variables.length ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>
        ) : tab === 'environments' ? (
          visibleEnvs.length === 0 ? (
            environments.length === 0
              ? <EmptyState icon={<Globe size={24} />} title="Henüz ortam yok" description="QA, staging, production gibi hedefleri ekleyin; otomasyon seçilen ortamın adresine koşar."
                  action={canManage && projects.length > 0 && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ type: 'env' })}>Ortam ekle</Button>} />
              : <EmptyState title="Filtrelere uyan ortam yok" />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm sm:min-w-[680px]">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3 font-medium">Ortam</th>
                    <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Adres</th>
                    <th className="hidden w-36 px-3 py-2.5 font-medium md:table-cell">Değişken</th>
                    <th className="w-12 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleEnvs.map(e => {
                    const vars = varCount(e.id);
                    return (
                      <tr key={e.id} onClick={() => setDialog({ type: 'detail', env: e })} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="max-w-0 py-2.5 pl-4 pr-3">
                          <button type="button" className="block max-w-full truncate text-left font-medium text-slate-900 hover:underline dark:text-white"
                            onClick={ev => { ev.stopPropagation(); setDialog({ type: 'detail', env: e }); }}>{e.name}</button>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{projectName(e.project_id)}{e.description && ` · ${e.description}`}</p>
                        </td>
                        <td className="hidden max-w-0 px-3 py-2.5 sm:table-cell" onClick={ev => ev.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">{e.url}</span>
                            <CopyButton text={e.url} label="Adres" className="shrink-0" />
                            <a href={e.url} target="_blank" rel="noreferrer noopener" aria-label="Yeni sekmede aç" className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><ExternalLink size={14} /></a>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-slate-600 md:table-cell dark:text-slate-300">
                          {vars.length} değişken{vars.some(v => v.is_secret) && <span className="text-slate-400"> · {vars.filter(v => v.is_secret).length} sır</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={ev => ev.stopPropagation()}>
                          <RowMenu label={`${e.name} işlemleri`}>
                            <MenuItem icon={ListTree} onSelect={() => setDialog({ type: 'detail', env: e })}>Geçerli değişkenler</MenuItem>
                            <MenuItem icon={KeyRound} onSelect={() => filters.patch({ tab: 'variables', env: String(e.id), project: '', q: '', type: '' })}>Değişkenlerini listele</MenuItem>
                            {canManage && <MenuItem icon={Pencil} onSelect={() => setDialog({ type: 'env', env: e })}>Düzenle</MenuItem>}
                            {canManage && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" onSelect={() => setDialog({ type: 'delete', kind: 'env', item: e })}>Sil</MenuItem></>}
                          </RowMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : visibleVars.length === 0 ? (
          variables.length === 0
            ? <EmptyState icon={<KeyRound size={24} />} title="Henüz değişken yok" description="Kullanıcı adları, API anahtarları, zaman aşımları… Script'ler os.environ ile okur."
                action={canManage && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ type: 'var' })}>Değişken ekle</Button>} />
            : <EmptyState title="Filtrelere uyan değişken yok" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm sm:min-w-[680px]">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-[34%] py-2.5 pl-4 pr-3 font-medium">Anahtar</th>
                  <th className="px-3 py-2.5 font-medium">Değer</th>
                  <th className="hidden w-44 px-3 py-2.5 font-medium md:table-cell">Kapsam</th>
                  <th className="w-12 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleVars.map(v => {
                  const sc = scopeOf(v);
                  const open = revealed[v.id] != null;
                  return (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="max-w-0 py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-1.5">
                          {v.is_secret && <Lock size={12} className="shrink-0 text-slate-400" aria-label="Sır" />}
                          <span className="truncate font-mono text-xs font-medium text-slate-900 dark:text-slate-100">{v.key}</span>
                        </div>
                        <p className="truncate text-xs text-slate-500 md:hidden dark:text-slate-400">{sc.label} · {sc.sub}</p>
                      </td>
                      <td className="max-w-0 px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <span className={`truncate font-mono text-xs ${v.is_secret && !open ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                            {v.is_secret ? (open ? revealed[v.id] : '••••••••') : v.value}
                          </span>
                          {v.is_secret && canManage && (
                            <button type="button" onClick={() => reveal(v)} aria-label={open ? 'Gizle' : 'Göster'}
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">{open ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                          )}
                          {(!v.is_secret || canManage) && <CopyButton text={v.is_secret ? secretValue(v) : v.value} label={v.key} className="shrink-0" />}
                        </div>
                      </td>
                      <td className="hidden max-w-0 px-3 py-2.5 md:table-cell">
                        <StatusBadge tone={sc.tone}>{sc.label}</StatusBadge>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{sc.sub}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {canManage && (
                          <RowMenu label={`${v.key} işlemleri`}>
                            <MenuItem icon={Pencil} onSelect={() => setDialog({ type: 'var', variable: v })}>Düzenle</MenuItem>
                            <MenuSeparator />
                            <MenuItem icon={Trash2} tone="danger" onSelect={() => setDialog({ type: 'delete', kind: 'var', item: v })}>Sil</MenuItem>
                          </RowMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.type === 'env' && <EnvFormDrawer env={dialog.env} initialProject={project} projects={projects} onClose={() => setDialog(null)} onSaved={onEnvSaved} />}
      {dialog?.type === 'var' && (
        <VarFormDrawer variable={dialog.variable} initial={dialog.initial} projects={projects} environments={environments} variables={variables}
          onClose={() => setDialog(null)} onSaved={onVarSaved} />
      )}
      {dialog?.type === 'detail' && (
        <EnvDetailDrawer env={dialog.env} projectName={projectName} canManage={canManage} onClose={() => setDialog(null)}
          onEdit={() => setDialog({ type: 'env', env: dialog.env })}
          onAddVar={() => setDialog({ type: 'var', initial: { project_id: String(dialog.env.project_id), env_id: String(dialog.env.id) } })} />
      )}
      <ConfirmDialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} onConfirm={remove} loading={busy} confirmLabel="Sil"
        title={dialog?.type === 'delete' ? `${dialog.kind === 'env' ? dialog.item.name : dialog.item.key} silinsin mi?` : ''}
        description={dialog?.kind === 'env'
          ? `Bu ortama bağlı ${dialog?.item ? varCount(dialog.item.id).length : 0} değişken de silinir. Bu işlem geri alınamaz.`
          : 'Bu değeri kullanan script\'ler bir sonraki koşumda onu bulamaz. Bu işlem geri alınamaz.'} />
    </div>
  );
};

export default Environments;
