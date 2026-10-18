/**
 * Kullanıcılar. Parçalar ./users altında (form, şifre sıfırlama, rol rozeti).
 * Hesap silmek yerine devre dışı bırakmak önerilir: geçmiş kayıtlar korunur, oturumlar düşer.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, MoreHorizontal, Pencil, KeyRound, Trash2, UserX, UserCheck, Users as UsersIcon, X, Shield } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, EmptyState, Skeleton, Avatar, StatusBadge } from '../components/ui';
import { DebouncedSearchInput, FilterSelect, Checkbox } from '../components/ui/data';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { ROLE_DOT } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';
import { usersApi, rolesApi } from '../api';
import UserFormDrawer from './users/UserFormDrawer';
import PasswordDialog from './users/PasswordDialog';
import { RoleBadge } from './users/parts';
import { relativeTime, trLower } from './users/helpers';

const readMe = () => { try { return JSON.parse(localStorage.getItem('user')) || {}; } catch { return {}; } };
const load = () => Promise.all([usersApi.getAll(), rolesApi.getAll().catch(() => ({ data: [] }))]).then(([u, r]) => ({ users: u.data, roles: r.data }));

const Users = () => {
  const { can, role: myRole } = usePermission();
  const navigate = useNavigate();
  const canManage = can('users.manage');
  const actorIsAdmin = myRole === 'admin';
  const me = useMemo(readMe, []);
  const filters = useUrlFilters(['q', 'role', 'status']);
  const { q, role, status } = filters.values;

  const [data, setData] = useState({ users: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);   // { type: 'form'|'password'|'delete'|'bulk-delete'|'deactivate', ... }
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) { setData(d); setLoading(false); } }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  const reload = useCallback(() => {
    setLoading(true);
    load().then(d => { setData(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const { users, roles } = data;
  const roleByName = useMemo(() => new Map(roles.map(r => [r.name, r])), [roles]);
  const isMe = (u) => u.id === me.id || u.username === me.username;
  // Admin hesabına yalnızca admin dokunabilir; kimse kendini silemez/devre dışı bırakamaz
  const canTouch = (u) => canManage && (actorIsAdmin || u.role !== 'admin' || isMe(u));

  const visible = useMemo(() => users.filter(u =>
    (!q || [u.username, u.full_name, u.email].some(x => trLower(x || '').includes(trLower(q)))) &&
    (!role || u.role === role) &&
    (!status || (status === 'inactive' ? !u.is_active : u.is_active))
  ).sort((a, b) => Number(b.is_active) - Number(a.is_active) || (a.full_name || a.username).localeCompare(b.full_name || b.username, 'tr')), [users, q, role, status]);

  const counts = useMemo(() => {
    const c = { inactive: users.filter(u => !u.is_active).length };
    roles.forEach(r => { c[r.name] = users.filter(u => u.role === r.name).length; });
    return c;
  }, [users, roles]);

  const selectable = visible.filter(u => canTouch(u) && !isMe(u));
  const pickedVisible = selectable.filter(u => selected.has(u.id)).length;
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(prev => {
    const n = new Set(prev); const on = pickedVisible !== selectable.length;
    selectable.forEach(u => on ? n.add(u.id) : n.delete(u.id)); return n;
  });

  const replaceUser = (u) => setData(d => ({ ...d, users: d.users.map(x => x.id === u.id ? u : x) }));

  const setActive = async (u, active) => {
    setBusy(`active-${u.id}`);
    try {
      const { data: saved } = await usersApi.update(u.id, { is_active: active });
      replaceUser(saved);
      toast.success(active ? `@${u.username} yeniden etkin.` : `@${u.username} devre dışı bırakıldı; açık oturumları sonlandırıldı.`);
      setDialog(null);
    } catch (e) { toast.error(e.message || 'Güncellenemedi.'); }
    finally { setBusy(null); }
  };

  const removeOne = async (u) => {
    setBusy('delete');
    try {
      await usersApi.remove(u.id);
      setData(d => ({ ...d, users: d.users.filter(x => x.id !== u.id) }));
      toast.success(`@${u.username} silindi.`);
      setDialog(null);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); }
    finally { setBusy(null); }
  };

  // Toplu işlemler: her kullanıcı ayrı istek; başarısız olanlar raporlanır, başarılılar uygulanır
  const bulk = async (label, fn) => {
    const ids = [...selected];
    setBusy('bulk');
    const results = await Promise.allSettled(ids.map(fn));
    const failed = results.filter(r => r.status === 'rejected');
    const okUsers = results.filter(r => r.status === 'fulfilled').map(r => r.value?.data).filter(Boolean);
    setBusy(null);
    return { ids, failed, okUsers, report: () => failed.length
      ? toast.error(`${ids.length - failed.length} kullanıcı ${label}; ${failed.length} tanesi yapılamadı: ${failed[0].reason?.message || ''}`)
      : toast.success(`${ids.length} kullanıcı ${label}.`) };
  };

  const bulkRole = async (newRole) => {
    const r = await bulk(`"${roleByName.get(newRole)?.display_name || newRole}" rolüne alındı`, id => usersApi.update(id, { role: newRole }));
    setData(d => ({ ...d, users: d.users.map(u => r.okUsers.find(x => x.id === u.id) || u) }));
    r.report(); setSelected(new Set());
  };
  const bulkActive = async (active) => {
    const r = await bulk(active ? 'etkinleştirildi' : 'devre dışı bırakıldı', id => usersApi.update(id, { is_active: active }));
    setData(d => ({ ...d, users: d.users.map(u => r.okUsers.find(x => x.id === u.id) || u) }));
    r.report(); setSelected(new Set()); setDialog(null);
  };
  const bulkDelete = async () => {
    const r = await bulk('silindi', id => usersApi.remove(id).then(() => ({ data: { id } })));
    const gone = new Set(r.okUsers.map(x => x.id));
    setData(d => ({ ...d, users: d.users.filter(u => !gone.has(u.id)) }));
    r.report(); setSelected(new Set()); setDialog(null);
  };

  const onSaved = (saved, created) => {
    setData(d => ({ ...d, users: created ? [...d.users, saved] : d.users.map(u => u.id === saved.id ? saved : u) }));
    setDialog(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Kullanıcılar" description="Hesaplar, roller ve erişim. Ayrılan biri için hesabı silmek yerine devre dışı bırakın; geçmişi korunur."
        actions={<>
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></Button>
          {can('roles.view') && <Button icon={<Shield size={14} />} onClick={() => navigate('/roles')}>Roller ve izinler</Button>}
          {canManage && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDialog({ type: 'form' })}>Kullanıcı ekle</Button>}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}<Button size="sm" className="ml-auto" onClick={reload}>Tekrar dene</Button>
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <DebouncedSearchInput value={q} onChange={v => filters.set('q', v)} placeholder="Ad, kullanıcı adı veya e-posta ara" className="lg:w-72" />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Role göre süz">
          {roles.map(r => {
            const active = role === r.name;
            return (
              <button key={r.id} type="button" aria-pressed={active} onClick={() => filters.set('role', active ? '' : r.name)}
                className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                <span className={`h-2 w-2 rounded-full ${ROLE_DOT[r.color] || ROLE_DOT.slate}`} aria-hidden />{r.display_name}<span className="tabular-nums opacity-70">{counts[r.name] || 0}</span>
              </button>
            );
          })}
          <FilterSelect label="Durum" value={status} onChange={v => filters.set('status', v)} options={[['active', 'Etkin'], ['inactive', `Devre dışı (${counts.inactive})`]]} className="ml-1" />
          {filters.active && <Button variant="ghost" size="sm" onClick={filters.clear}>Temizle</Button>}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10" role="region" aria-label="Toplu işlemler">
          <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{selected.size} kullanıcı seçili</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select defaultValue="" onChange={e => { if (e.target.value) bulkRole(e.target.value); e.target.value = ''; }} disabled={busy === 'bulk'} aria-label="Rol ata"
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <option value="">Rol ata…</option>
              {roles.filter(r => actorIsAdmin || r.name !== 'admin').map(r => <option key={r.id} value={r.name}>{r.display_name}</option>)}
            </select>
            <Button size="sm" icon={<UserX size={13} />} onClick={() => setDialog({ type: 'bulk-deactivate' })} disabled={busy === 'bulk'}>Devre dışı bırak</Button>
            <Button size="sm" icon={<UserCheck size={13} />} onClick={() => bulkActive(true)} disabled={busy === 'bulk'}>Etkinleştir</Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setDialog({ type: 'bulk-delete' })} disabled={busy === 'bulk'}>Sil</Button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Seçimi temizle" className="rounded-md p-1 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-500/20"><X size={15} /></button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="relative overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm sm:min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                {canManage && (
                  <th className="w-10 py-2.5 pl-4 pr-1">
                    <Checkbox label="Görünenlerin tümünü seç" checked={selectable.length > 0 && pickedVisible === selectable.length}
                      indeterminate={pickedVisible > 0 && pickedVisible < selectable.length} onChange={toggleAll} disabled={!selectable.length} />
                  </th>
                )}
                <th className={`py-2.5 pr-3 font-medium ${canManage ? 'pl-2' : 'pl-4'}`}>Kullanıcı</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">E-posta</th>
                <th className="w-40 px-3 py-2.5 font-medium">Rol</th>
                <th className="hidden w-32 px-3 py-2.5 font-medium md:table-cell">Son giriş</th>
                <th className="w-24 px-3 py-2.5"><span className="sr-only">İşlemler</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && !users.length ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 flex-1" /></div></td></tr>
              )) : visible.length === 0 ? (
                <tr><td colSpan={6}><EmptyState icon={<UsersIcon size={24} />} title={users.length ? 'Filtrelere uyan kullanıcı yok' : 'Henüz kullanıcı yok'}
                  action={users.length ? <Button onClick={filters.clear}>Filtreleri temizle</Button> : null} /></td></tr>
              ) : visible.map(u => {
                const mine = isMe(u);
                const touch = canTouch(u);
                return (
                  <tr key={u.id} className={`${u.is_active ? '' : 'bg-slate-50/60 dark:bg-slate-950/30'} hover:bg-slate-50 dark:hover:bg-slate-800/40`}>
                    {canManage && (
                      <td className="py-2.5 pl-4 pr-1">
                        {touch && !mine && <Checkbox checked={selected.has(u.id)} onChange={() => toggle(u.id)} label={`@${u.username} seç`} />}
                      </td>
                    )}
                    <td className={`max-w-0 py-2.5 pr-3 ${canManage ? 'pl-2' : 'pl-4'}`}>
                      <div className="flex items-center gap-3">
                        <Avatar user={u} className={u.is_active ? '' : 'opacity-50'} />
                        <div className="min-w-0">
                          <p className={`flex items-center gap-1.5 truncate font-medium ${u.is_active ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                            <span className="truncate">{u.full_name || u.username}</span>
                            {mine && <span className="shrink-0 rounded bg-slate-100 px-1 text-[11px] font-normal text-slate-500 dark:bg-slate-800">siz</span>}
                            {!u.is_active && <StatusBadge tone="draft">Devre dışı</StatusBadge>}
                          </p>
                          <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden truncate px-3 py-2.5 text-slate-600 lg:table-cell dark:text-slate-300">{u.email || '—'}</td>
                    <td className="px-3 py-2.5"><RoleBadge role={roleByName.get(u.role)} name={u.role} /></td>
                    <td className="hidden px-3 py-2.5 text-xs text-slate-500 md:table-cell dark:text-slate-400" title={u.last_login_at ? new Date(u.last_login_at).toLocaleString('tr-TR') : undefined}>
                      {u.last_login_at ? relativeTime(u.last_login_at) : 'Hiç giriş yapmadı'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {mine ? (
                        <Button variant="ghost" size="sm" onClick={() => navigate('/profile')}>Profilim</Button>
                      ) : touch ? (
                        <Menu trigger={({ ref, toggle: t, open }) => (
                          <button ref={ref} type="button" onClick={t} aria-label={`@${u.username} işlemleri`} aria-haspopup="menu" aria-expanded={open}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
                        )}>
                          <MenuItem icon={Pencil} onSelect={() => setDialog({ type: 'form', user: u })}>Düzenle</MenuItem>
                          <MenuItem icon={KeyRound} onSelect={() => setDialog({ type: 'password', user: u })}>Şifre sıfırla</MenuItem>
                          {u.is_active
                            ? <MenuItem icon={UserX} onSelect={() => setDialog({ type: 'deactivate', user: u })}>Devre dışı bırak</MenuItem>
                            : <MenuItem icon={UserCheck} onSelect={() => setActive(u, true)}>Etkinleştir</MenuItem>}
                          <MenuSeparator />
                          <MenuItem icon={Trash2} tone="danger" onSelect={() => setDialog({ type: 'delete', user: u })}>Sil</MenuItem>
                        </Menu>
                      ) : canManage ? (
                        <span className="text-xs text-slate-400" title="Admin hesabını yalnızca admin değiştirebilir">—</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.type === 'form' && <UserFormDrawer user={dialog.user} roles={roles} actorIsAdmin={actorIsAdmin} onClose={() => setDialog(null)} onSaved={onSaved} />}
      {dialog?.type === 'password' && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
      <ConfirmDialog open={dialog?.type === 'deactivate'} onClose={() => setDialog(null)} onConfirm={() => setActive(dialog.user, false)}
        loading={busy?.startsWith?.('active')} confirmLabel="Devre dışı bırak" tone="primary"
        title={dialog?.user ? `@${dialog.user.username} devre dışı bırakılsın mı?` : ''}
        description="Kullanıcı giriş yapamaz ve açık oturumları hemen sonlanır. Oluşturduğu kayıtlar korunur; istediğiniz zaman yeniden etkinleştirebilirsiniz." />
      <ConfirmDialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} onConfirm={() => removeOne(dialog.user)} loading={busy === 'delete'} confirmLabel="Kalıcı olarak sil"
        title={dialog?.user ? `@${dialog.user.username} silinsin mi?` : ''}
        description="Hesap kalıcı olarak silinir ve geri alınamaz. Yalnızca erişimi kesmek istiyorsanız devre dışı bırakmayı tercih edin." />
      <ConfirmDialog open={dialog?.type === 'bulk-deactivate'} onClose={() => setDialog(null)} onConfirm={() => bulkActive(false)} loading={busy === 'bulk'} confirmLabel="Devre dışı bırak" tone="primary"
        title={`${selected.size} kullanıcı devre dışı bırakılsın mı?`} description="Giriş yapamazlar ve açık oturumları sonlanır. Kayıtları korunur." />
      <ConfirmDialog open={dialog?.type === 'bulk-delete'} onClose={() => setDialog(null)} onConfirm={bulkDelete} loading={busy === 'bulk'} confirmLabel="Kalıcı olarak sil"
        title={`${selected.size} kullanıcı silinsin mi?`} description="Hesaplar kalıcı olarak silinir ve geri alınamaz." />
    </div>
  );
};

export default Users;
