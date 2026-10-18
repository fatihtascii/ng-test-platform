/**
 * Roller ve izinler: rol listesi ve izin matrisi (izinler × roller).
 * Matristeki değişiklikler taslakta tutulur, tek seferde kaydedilir. Admin her izne sahiptir.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, MoreHorizontal, Pencil, Copy, Trash2, Lock } from 'lucide-react';
import { usePermission, clearPermissionCache } from '../hooks/usePermission';
import { PageHeader, Button, Skeleton, EmptyState } from '../components/ui';
import { Checkbox } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { ROLE_DOT } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { rolesApi, usersApi } from '../api';
import RoleFormDrawer from './roles/RoleFormDrawer';

const MODULE_LABEL = {
  projects: 'Projeler', test_cases: "Test case'ler", test_plans: 'Test planları', test_runs: 'Koşumlar',
  defects: 'Hatalar', automation: 'Otomasyon', reports: 'Raporlar', environments: 'Ortamlar',
  integrations: 'Entegrasyonlar', users: 'Kullanıcılar', roles: 'Roller',
};
const MODULE_ORDER = Object.keys(MODULE_LABEL);

const load = () => Promise.all([rolesApi.getAll(), rolesApi.getPermissions(), usersApi.getAll().catch(() => ({ data: null }))])
  .then(([r, p, u]) => ({ roles: r.data, permissions: p.data, users: u.data }));

const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

const RoleManagement = () => {
  const { can, role: myRole } = usePermission();
  const canManage = can('roles.manage');
  const [data, setData] = useState({ roles: [], permissions: [], users: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});          // { roleId: Set(permId) } — yalnızca değişen roller
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) { setData(d); setLoading(false); } }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setData(d); setError(null); setDraft({}); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const { roles, permissions, users } = data;
  // Admin solda, sonra sistem rolleri, sonra özel roller
  const ordered = useMemo(() => [...roles].sort((a, b) =>
    (b.name === 'admin') - (a.name === 'admin') || Number(b.is_system) - Number(a.is_system) || a.id - b.id), [roles]);
  const saved = useMemo(() => Object.fromEntries(roles.map(r => [r.id, new Set((r.permissions || []).map(p => p.id))])), [roles]);
  const current = (roleId) => draft[roleId] || saved[roleId] || new Set();
  const userCount = (name) => users ? users.filter(u => u.role === name).length : null;

  const groups = useMemo(() => {
    const by = {};
    permissions.forEach(p => { (by[p.module] ||= []).push(p); });
    return Object.keys(by).sort((a, b) => (MODULE_ORDER.indexOf(a) + 1 || 99) - (MODULE_ORDER.indexOf(b) + 1 || 99))
      .map(m => ({ module: m, label: MODULE_LABEL[m] || m, perms: by[m].sort((a, b) => a.id - b.id) }));
  }, [permissions]);

  const editable = (r) => canManage && r.name !== 'admin';
  const setRolePerms = (roleId, next) => setDraft(d => {
    const n = { ...d };
    if (sameSet(next, saved[roleId] || new Set())) delete n[roleId]; else n[roleId] = next;
    return n;
  });
  const togglePerm = (roleId, permId) => {
    const next = new Set(current(roleId));
    if (next.has(permId)) next.delete(permId); else next.add(permId);
    // ".view" kaldırılırsa aynı modülün diğer izinleri anlamsız kalır; eklenince view de eklenir
    const perm = permissions.find(p => p.id === permId);
    const view = permissions.find(p => p.module === perm.module && p.key.endsWith('.view'));
    if (view && view.id !== permId && next.has(permId)) next.add(view.id);
    if (view && view.id === permId && !next.has(permId)) permissions.filter(p => p.module === perm.module).forEach(p => next.delete(p.id));
    setRolePerms(roleId, next);
  };
  const toggleModule = (roleId, perms, on) => {
    const next = new Set(current(roleId));
    perms.forEach(p => on ? next.add(p.id) : next.delete(p.id));
    setRolePerms(roleId, next);
  };

  const dirtyIds = Object.keys(draft).map(Number);
  const changedCells = dirtyIds.reduce((n, id) => {
    const a = draft[id], b = saved[id] || new Set();
    return n + [...a].filter(x => !b.has(x)).length + [...b].filter(x => !a.has(x)).length;
  }, 0);

  const save = async () => {
    setSaving(true);
    const results = await Promise.allSettled(dirtyIds.map(id => rolesApi.updatePermissions(id, { permission_ids: [...draft[id]] })));
    const ok = results.map(r => r.status === 'fulfilled' ? r.value.data : null).filter(Boolean);
    setData(d => ({ ...d, roles: d.roles.map(r => ok.find(x => x.id === r.id) || r) }));
    setDraft(dr => { const n = { ...dr }; ok.forEach(x => delete n[x.id]); return n; });
    clearPermissionCache();   // kendi rolümüz değiştiyse menüler yeni izinlerle çizilsin
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) toast.error(`${failed.length} rol kaydedilemedi: ${failed[0].reason?.message || ''}`);
    else toast.success(`${ok.length} rolün izinleri kaydedildi. Değişiklik kullanıcıların bir sonraki isteğinde geçerli olur.`);
    setSaving(false);
  };

  const removeRole = async () => {
    setSaving(true);
    try {
      await rolesApi.remove(dialog.role.id);
      setData(d => ({ ...d, roles: d.roles.filter(r => r.id !== dialog.role.id) }));
      setDraft(dr => { const n = { ...dr }; delete n[dialog.role.id]; return n; });
      toast.success(`${dialog.role.display_name} silindi.`);
      setDialog(null);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); }
    finally { setSaving(false); }
  };

  const onSaved = (role, created) => {
    setData(d => ({ ...d, roles: created ? [...d.roles, role] : d.roles.map(r => r.id === role.id ? role : r) }));
    setDialog(null);
  };

  if (loading && !roles.length) return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-5 pb-16">
      <PageHeader title="Roller ve izinler" description="Her rolün neye erişebileceği. Kullanıcıya rol Kullanıcılar sayfasından atanır."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></Button>
          {canManage && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog({ type: 'form' })}>Rol oluştur</Button>}
        </>} />

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}

      {/* Roller */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label="Roller">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {ordered.map(r => {
            const n = userCount(r.name);
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT[r.color] || ROLE_DOT.slate}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                    {r.display_name}
                    <span className="font-mono text-xs font-normal text-slate-400">{r.name}</span>
                    {r.is_system && <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 text-[11px] font-normal text-slate-500 dark:bg-slate-800"><Lock size={10} /> sistem</span>}
                  </p>
                  {r.description && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.description}</p>}
                </div>
                <span className="hidden text-xs tabular-nums text-slate-500 sm:inline dark:text-slate-400">{r.name === 'admin' ? 'Tüm izinler' : `${current(r.id).size}/${permissions.length} izin`}</span>
                {n != null && (
                  <Link to={`/users?role=${r.name}`} className="w-24 text-right text-xs tabular-nums text-slate-600 hover:underline dark:text-slate-300">{n} kullanıcı</Link>
                )}
                {canManage && (
                  <Menu trigger={({ ref, toggle, open }) => (
                    <button ref={ref} type="button" onClick={toggle} aria-label={`${r.display_name} işlemleri`} aria-haspopup="menu" aria-expanded={open}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
                  )}>
                    <MenuItem icon={Pencil} onSelect={() => setDialog({ type: 'form', role: r })}>Ad, açıklama, renk</MenuItem>
                    {r.name !== 'admin' && <MenuItem icon={Copy} onSelect={() => setDialog({ type: 'form', copyFrom: r })}>Kopyasından yeni rol</MenuItem>}
                    {!r.is_system && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" disabled={n > 0} hint={n > 0 ? `${n} kullanıcı` : undefined}
                      onSelect={() => setDialog({ type: 'delete', role: r })}>Sil</MenuItem></>}
                  </Menu>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* İzin matrisi */}
      <section aria-label="İzin matrisi">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">İzinler</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{canManage ? 'Bir modülde işlem izni verilince görüntüleme izni de eklenir.' : 'Değiştirmek için rol yönetimi izni gerekir.'}</p>
        </div>
        {permissions.length === 0 ? <EmptyState title="İzin listesi alınamadı" /> : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="relative max-h-[70vh] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 min-w-[16rem] border-b border-slate-200 bg-slate-50 py-2.5 pl-4 pr-3 font-medium dark:border-slate-800 dark:bg-slate-900">İzin</th>
                    {ordered.map(r => (
                      <th key={r.id} scope="col" className={`min-w-[7rem] border-b border-slate-200 px-2 py-2.5 text-center font-medium dark:border-slate-800 ${draft[r.id] ? 'text-indigo-700 dark:text-indigo-300' : ''}`}>
                        <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[r.color] || ROLE_DOT.slate}`} />{r.display_name}{draft[r.id] && ' •'}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <React.Fragment key={g.module}>
                      <tr className="bg-slate-50/60 dark:bg-slate-950/40">
                        <th scope="rowgroup" className="sticky left-0 border-b border-slate-100 bg-slate-50 py-2 pl-4 pr-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{g.label}</th>
                        {ordered.map(r => {
                          const set = current(r.id);
                          const n = g.perms.filter(p => set.has(p.id)).length;
                          return (
                            <td key={r.id} className="border-b border-slate-100 px-2 py-2 text-center dark:border-slate-800">
                              {r.name === 'admin' ? <span className="text-[11px] text-slate-400">tümü</span> : (
                                <Checkbox checked={n === g.perms.length} indeterminate={n > 0 && n < g.perms.length} disabled={!editable(r)}
                                  onChange={() => toggleModule(r.id, g.perms, n !== g.perms.length)} label={`${r.display_name}: ${g.label} modülünün tümü`} />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {g.perms.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <th scope="row" className="sticky left-0 border-b border-slate-100 bg-white py-2 pl-7 pr-3 font-normal dark:border-slate-800 dark:bg-slate-900" title={p.description || undefined}>
                            <span className="block text-slate-800 dark:text-slate-100">{p.name}</span>
                            <span className="font-mono text-[11px] text-slate-400">{p.key}</span>
                          </th>
                          {ordered.map(r => {
                            const on = r.name === 'admin' || current(r.id).has(p.id);
                            const changed = draft[r.id] && draft[r.id].has(p.id) !== (saved[r.id] || new Set()).has(p.id);
                            return (
                              <td key={r.id} className={`border-b border-slate-100 px-2 py-2 text-center dark:border-slate-800 ${changed ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}`}>
                                <Checkbox checked={on} disabled={!editable(r)} onChange={() => togglePerm(r.id, p.id)} label={`${r.display_name}: ${p.name}`} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {dirtyIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-56">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900" role="region" aria-label="Kaydedilmemiş izin değişiklikleri">
            <span className="text-sm text-slate-700 dark:text-slate-200">{dirtyIds.length} rolde {changedCells} değişiklik</span>
            {dirtyIds.some(id => roles.find(r => r.id === id)?.name === myRole) && <span className="text-xs text-amber-700 dark:text-amber-400">Kendi rolünüz de değişiyor</span>}
            <Button variant="ghost" size="sm" onClick={() => setDraft({})} disabled={saving}>Vazgeç</Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>Kaydet</Button>
          </div>
        </div>
      )}

      {dialog?.type === 'form' && <RoleFormDrawer role={dialog.role} copyFrom={dialog.copyFrom} roles={roles} onClose={() => setDialog(null)} onSaved={onSaved} />}
      <ConfirmDialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} onConfirm={removeRole} loading={saving} confirmLabel="Sil"
        title={dialog?.role ? `${dialog.role.display_name} silinsin mi?` : ''} description="Rol ve izin atamaları silinir. Bu işlem geri alınamaz." />
    </div>
  );
};

export default RoleManagement;
