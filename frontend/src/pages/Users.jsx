import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { usersApi, rolesApi } from '../api';
import {
  Users as UsersIcon, Search, Shield, MoreVertical, X,
  AlertCircle, CheckCircle2, UserX, Trash2,
  Pencil, Loader2, Lock, RefreshCw, UserPlus,
  Crown, KeyRound, Eye, EyeOff, Hash, ExternalLink,
  UserCheck, CheckSquare, Square
} from 'lucide-react'; // KULLANILMAYAN İKONLAR TEMİZLENDİ

// ── Sabitler ──────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-indigo-500','bg-violet-500','bg-blue-500',
  'bg-emerald-500','bg-rose-500','bg-amber-500','bg-pink-500','bg-teal-500',
];

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;

const ROLE_BADGE_MAP = {
  rose:    'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  amber:   'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  indigo:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  violet:  'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};
const getRoleBadgeClass = (color) => ROLE_BADGE_MAP[color] || ROLE_BADGE_MAP.slate;

// ── Yardımcılar ───────────────────────────────────────────────
const getAvatarColor = (str = '') => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (name = '', username = '') => {
  if (name?.trim()) {
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0][0].toUpperCase();
  }
  return username?.[0]?.toUpperCase() || '?';
};

const calcStrength = (pw = '') => {
  if (!pw) return null;
  if (pw.length < 6)  return { label: 'Çok Kısa', bars: 1, color: 'bg-rose-400' };
  if (pw.length < 8)  return { label: 'Zayıf',    bars: 2, color: 'bg-amber-400' };
  if (pw.length < 12) return { label: 'Orta',      bars: 3, color: 'bg-sky-400' };
  return { label: 'Güçlü', bars: 4, color: 'bg-emerald-400' };
};

const StrengthBar = ({ password }) => {
  const s = calcStrength(password);
  if (!s) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1,2,3,4].map(i => (
          <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= s.bars ? s.color : 'bg-slate-200 dark:bg-slate-700'}`}/>
        ))}
      </div>
      <p className="text-xs text-slate-400">{s.label}</p>
    </div>
  );
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

const Avatar = ({ user, size = 'md' }) => {
  const sz = size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-sm';
  return (
    <div className={`${sz} rounded-full ${getAvatarColor(user.username)} flex items-center justify-center text-white font-bold shrink-0`}>
      {getInitials(user.full_name, user.username)}
    </div>
  );
};


// ── Ana Bileşen ────────────────────────────────────────────────
const Users = () => {
  const { can }  = usePermission();
  const navigate = useNavigate();

  const [currentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  const [users,   setUsers]   = useState([]);
  const [roles,   setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const [selected, setSelected]         = useState(new Set());
  const [bulkRole, setBulkRole]         = useState('');
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [isDeleting, setIsDeleting]         = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const [panel, setPanel]         = useState(null);
  const [panelUser, setPanelUser] = useState(null);
  const [panelError, setPanelError] = useState('');
  const [isSaving, setIsSaving]     = useState(false);

  const [createForm, setCreateForm] = useState({ username: '', full_name: '', email: '', password: '', role: 'viewer' });
  const [editForm,   setEditForm]   = useState({ full_name: '', email: '', role: 'viewer' });
  const [pwForm,     setPwForm]     = useState({ newPassword: '', confirm: '' });
  const [pwShow,     setPwShow]     = useState({ new: false, confirm: false });


  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.allSettled([
        usersApi.getAll(),
        rolesApi.getAll(),
      ]);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data);
      else setError('Kullanıcılar yüklenemedi. Sunucu bağlantınızı kontrol edin.');

      if (rolesRes.status === 'fulfilled') {
        setRoles(rolesRes.value.data);
      } else {
        setRoles([
          { id:1, name:'admin',   display_name:'Admin',           color:'rose',   description:'Tam erişim' },
          { id:2, name:'manager', display_name:'Test Yöneticisi', color:'amber',  description:'Test süreçleri' },
          { id:3, name:'tester',  display_name:'Test Uzmanı',     color:'indigo', description:'Test yürütme' },
          { id:4, name:'viewer',  display_name:'İzleyici',        color:'slate',  description:'Yalnızca görüntüleme' },
        ]);
      }
    } catch { setError('Sunucuya bağlanılamadı.'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const close = () => setActiveDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [fetchData]);

  const getRoleObj   = (n) => roles.find(r => r.name === n);
  const getRoleLabel = (n) => getRoleObj(n)?.display_name || n || '—';
  const getRoleColor = (n) => getRoleObj(n)?.color || 'slate';
  const getRoleIcon  = (n) => n === 'admin' ? <Crown size={11}/> : <Shield size={11}/>;

  const openPanel = useCallback((type, user = null) => {
    setPanelError('');
    setPanelUser(user);
    setPanel(type);
    setActiveDropdown(null);
    if (type === 'edit' && user) {
      setEditForm({ full_name: user.full_name || '', email: user.email || '', role: user.role || 'viewer' });
    }
    if (type === 'password') {
      setPwForm({ newPassword: '', confirm: '' });
      setPwShow({ new: false, confirm: false });
    }
    if (type === 'create') {
      setCreateForm({ username: '', full_name: '', email: '', password: '', role: 'viewer' });
    }
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    setPanelUser(null);
    setPanelError('');
  }, []);

  const validateCreate = () => {
    if (!createForm.username.trim()) return 'Kullanıcı adı zorunludur.';
    if (!USERNAME_RE.test(createForm.username)) return 'Kullanıcı adı 3-50 karakter olmalı ve yalnızca harf, rakam, alt çizgi (_) veya tire (-) içerebilir.';
    if (createForm.password.length < 8) return 'Şifre en az 8 karakter olmalıdır.';
    if (!/[A-Z]/.test(createForm.password)) return 'Şifre en az 1 büyük harf içermelidir.';
    if (!/[0-9]/.test(createForm.password)) return 'Şifre en az 1 rakam içermelidir.';
    return null;
  };

  const validatePassword = () => {
    if (pwForm.newPassword.length < 8) return 'Şifre en az 8 karakter olmalıdır.';
    if (!/[A-Z]/.test(pwForm.newPassword)) return 'Şifre en az 1 büyük harf içermelidir.';
    if (!/[0-9]/.test(pwForm.newPassword)) return 'Şifre en az 1 rakam içermelidir.';
    if (pwForm.newPassword !== pwForm.confirm) return 'Şifreler eşleşmiyor.';
    return null;
  };

  const handleCreateSubmit = async () => {
    const err = validateCreate();
    if (err) { setPanelError(err); return; }
    setIsSaving(true);
    try {
      const res = await usersApi.create(createForm);
      setUsers(prev => [...prev, res.data]);
      closePanel();
      showToast('success', `@${res.data.username} başarıyla oluşturuldu.`);
    } catch (err) { setPanelError(err.message || 'Kullanıcı oluşturulamadı.'); }
    finally  { setIsSaving(false); }
  };

  const handleEditSubmit = async () => {
    if (!editForm.full_name.trim()) { setPanelError('Ad Soyad boş olamaz.'); return; }
    setIsSaving(true);
    try {
      const res = await usersApi.update(panelUser.id, { full_name: editForm.full_name, email: editForm.email || null, role: editForm.role });
      setUsers(prev => prev.map(u => u.id === res.data.id ? res.data : u));
      closePanel();
      showToast('success', 'Kullanıcı güncellendi.');
    } catch (err) { setPanelError(err.message || 'Güncelleme başarısız.'); }
    finally  { setIsSaving(false); }
  };

  const handlePasswordSubmit = async () => {
    const err = validatePassword();
    if (err) { setPanelError(err); return; }
    setIsSaving(true);
    try {
      await usersApi.updatePassword(panelUser.id, { password: pwForm.newPassword });
      closePanel();
      showToast('success', 'Şifre güncellendi.');
    } catch (err) { setPanelError(err.message || 'Şifre güncellenemedi.'); }
    finally  { setIsSaving(false); }
  };

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      if (id === 'bulk') {
        const ids = [...selected];
        await Promise.all(ids.map(uid => usersApi.remove(uid)));
        setUsers(prev => prev.filter(u => !ids.includes(u.id)));
        setSelected(new Set());
        showToast('success', `${ids.length} kullanıcı silindi.`);
      } else {
        await usersApi.remove(id);
        setUsers(prev => prev.filter(u => u.id !== id));
        showToast('success', 'Kullanıcı silindi.');
      }
    } catch { showToast('error', 'Sunucuya ulaşılamadı.'); }
    finally { setIsDeleting(false); setDeleteConfirm(null); }
  };

  const handleQuickRoleChange = async (userId, newRole) => {
    try {
      const res = await usersApi.updateRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === res.data.id ? res.data : u));
      showToast('success', `Rol: ${getRoleLabel(newRole)}`);
    } catch (err) { showToast('error', err.message || 'Rol güncellenemedi.'); }
  };

  const handleBulkRoleAssign = async () => {
    if (!bulkRole || selected.size === 0) return;
    setIsBulkSaving(true);
    try {
      await Promise.all([...selected].map(uid => usersApi.updateRole(uid, bulkRole)));
      await fetchData();
      setSelected(new Set());
      setBulkRole('');
      showToast('success', `${selected.size} kullanıcının rolü güncellendi.`);
    } catch { showToast('error', 'Toplu güncelleme tamamlanamadı.'); }
    finally  { setIsBulkSaving(false); }
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(u => u.id)));
  };

  const filtered = useMemo(() => users.filter(u => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q);
    const matchRole = roleFilter === 'All' || u.role === roleFilter;
    return matchSearch && matchRole;
  }), [users, searchTerm, roleFilter]);

  const roleCounts = useMemo(() => roles.reduce((acc, r) => {
    acc[r.name] = users.filter(u => u.role === r.name).length;
    return acc;
  }, {}), [roles, users]);

  const isPanelOpen = !!panel;
  const hasSelection = selected.size > 0;

  // Kendi profil düzenlemesi artık ayrı sayfada (rolü ne olursa olsun herkes erişebilir)
  const openMyProfile = () => navigate('/profile');

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UsersIcon size={24} className="text-indigo-500"/> Kullanıcılar
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Platforma kayıtlı tüm kullanıcıları yönetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
            title="Yenile">
            <RefreshCw size={17}/>
          </button>
          <button onClick={openMyProfile}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors"
            title="Profilimi Düzenle">
            <UserCheck size={15}/> Profilim
          </button>
          {can('roles.manage') && (
            <button onClick={() => navigate('/roles')}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-medium hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-700 flex items-center gap-2 text-sm transition-all">
              <Shield size={15}/> Rol Yönetimi
              <ExternalLink size={11} className="text-slate-400"/>
            </button>
          )}
          {can('users.manage') && (
            <button onClick={() => openPanel('create')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 text-sm">
              <UserPlus size={16}/> Yeni Kullanıcı
            </button>
          )}
        </div>
      </div>

      {/* İSTATİSTİK KARTLARI */}
      {!loading && roles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 shrink-0"><UsersIcon size={17}/></div>
            <div>
              <p className="text-xs font-medium text-slate-500">Toplam</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{users.length}</p>
            </div>
          </div>
          {roles.map(role => {
            const cnt      = roleCounts[role.name] || 0;
            const badgeCls = getRoleBadgeClass(role.color);
            const isActive = roleFilter === role.name;
            return (
              <button key={role.id}
                onClick={() => setRoleFilter(isActive ? 'All' : role.name)}
                className={`p-4 rounded-2xl border shadow-sm flex items-center gap-3 text-left transition-all hover:shadow-md ${
                  isActive ? `${badgeCls} ring-2 ring-offset-1 dark:ring-offset-slate-900 ring-current/30` : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}>
                <div className={`p-2 rounded-xl shrink-0 ${isActive ? 'bg-white/60 dark:bg-black/20' : `${ROLE_BADGE_MAP[role.color]}`}`}>
                  {role.name === 'admin' ? <Crown size={16}/> : <Shield size={16}/>}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-medium truncate ${isActive ? '' : 'text-slate-500 dark:text-slate-400'}`}>{role.display_name}</p>
                  <p className={`text-xl font-bold tabular-nums ${isActive ? '' : 'text-slate-900 dark:text-white'}`}>{cnt}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0"/> {error}
          <button onClick={fetchData} className="ml-auto text-rose-600 hover:underline font-medium">Tekrar Dene</button>
        </div>
      )}

      {/* Toplu Aksiyon Toolbar */}
      {hasSelection && can('users.manage') && (
        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">
            {selected.size} kullanıcı seçildi
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <select value={bulkRole} onChange={e => setBulkRole(e.target.value)}
              className="text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">Rol seç...</option>
              {roles.map(r => <option key={r.id} value={r.name}>{r.display_name}</option>)}
            </select>
            <button onClick={handleBulkRoleAssign} disabled={!bulkRole || isBulkSaving}
              className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors">
              {isBulkSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
              Rol Ata
            </button>
            <button onClick={() => setDeleteConfirm('bulk')}
              className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-1.5 transition-colors">
              <Trash2 size={12}/> Sil
            </button>
            <button onClick={() => setSelected(new Set())}
              className="p-1.5 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors">
              <X size={15}/>
            </button>
          </div>
        </div>
      )}

      {/* FİLTRELER */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl flex-1 min-w-[220px] focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input type="text" placeholder="İsim, kullanıcı adı veya e-posta..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 w-full"/>
          {searchTerm && <button onClick={() => setSearchTerm('')}><X size={13} className="text-slate-400"/></button>}
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
          <Shield size={14} className="text-slate-400 shrink-0"/>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer">
            <option value="All">Tüm Roller</option>
            {roles.map(r => <option key={r.id} value={r.name}>{r.display_name}</option>)}
          </select>
        </div>
        {(searchTerm || roleFilter !== 'All') && (
          <button onClick={() => { setSearchTerm(''); setRoleFilter('All'); }}
            className="text-xs text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1">
            <X size={12}/> Temizle
          </button>
        )}
        <span className="text-xs text-slate-400 self-center ml-auto">
          {filtered.length !== users.length ? `${filtered.length} / ${users.length} kullanıcı` : `${users.length} kullanıcı`}
        </span>
      </div>

      {/* TABLO */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {Array.from({length:4}).map((_,i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <Skeleton className="w-9 h-9 rounded-full shrink-0"/>
              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-36"/><Skeleton className="h-3 w-48"/></div>
              <Skeleton className="h-6 w-20 rounded-lg"/>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
          <UserX size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-4"/>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {searchTerm || roleFilter !== 'All' ? 'Kullanıcı Bulunamadı' : 'Henüz Kullanıcı Yok'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            {searchTerm || roleFilter !== 'All' ? 'Kriterlere uyan kullanıcı yok.' : 'Kayıtlı kullanıcı bulunmuyor.'}
          </p>
          {(searchTerm || roleFilter !== 'All') && (
            <button onClick={() => { setSearchTerm(''); setRoleFilter('All'); }}
              className="text-sm text-indigo-600 hover:underline font-medium">
              Filtreyi Temizle
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-400 font-semibold tracking-wide">
                {can('users.manage') && (
                  <th className="px-4 py-3.5 w-10 rounded-tl-2xl">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors">
                      {selected.size === filtered.length && filtered.length > 0
                        ? <CheckSquare size={16} className="text-indigo-500"/>
                        : <Square size={16}/>
                      }
                    </button>
                  </th>
                )}
                <th className={`px-6 py-3.5 ${!can('users.manage') ? 'rounded-tl-2xl' : ''}`}>Kullanıcı</th>
                <th className="px-6 py-3.5 hidden md:table-cell">Kullanıcı Adı</th>
                <th className="px-6 py-3.5 hidden lg:table-cell">E-posta</th>
                <th className={`px-6 py-3.5 ${!can('users.manage') ? 'rounded-tr-2xl' : ''}`}>Rol</th>
                {can('users.manage') && <th className="px-6 py-3.5 text-right rounded-tr-2xl">Aksiyon</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.map((u, index) => {
                const isMe      = u.username === currentUser?.username;
                const roleName  = u.role || 'viewer';
                const roleColor = getRoleColor(roleName);
                const roleLabel = getRoleLabel(roleName);
                const badgeCls  = getRoleBadgeClass(roleColor);
                const isSelected = selected.has(u.id);
                
                const isBottomRow = index >= filtered.length - 2 && filtered.length > 2;

                return (
                  <tr key={u.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}>

                    {can('users.manage') && (
                      <td className="px-4 py-4">
                        {!isMe && (
                          <button onClick={() => toggleSelect(u.id)} className="text-slate-300 hover:text-indigo-500 transition-colors">
                            {isSelected
                              ? <CheckSquare size={16} className="text-indigo-500"/>
                              : <Square size={16}/>
                            }
                          </button>
                        )}
                      </td>
                    )}

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar user={u}/>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            {u.full_name || <span className="text-slate-400 italic font-normal text-xs">İsim yok</span>}
                            {isMe && (
                              <span className="text-xs font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">Siz</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Hash size={10}/>#{u.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">@{u.username}</span>
                    </td>

                    <td className="px-6 py-4 hidden lg:table-cell">
                      {u.email
                        ? <span className="text-sm text-slate-600 dark:text-slate-300">{u.email}</span>
                        : <span className="text-xs text-slate-400 italic">—</span>
                      }
                    </td>

                    <td className="px-6 py-4">
                      {isMe || !can('users.manage') ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${badgeCls}`}>
                          {getRoleIcon(roleName)} {roleLabel}
                        </span>
                      ) : (
                        <select value={roleName} onChange={e => handleQuickRoleChange(u.id, e.target.value)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border outline-none cursor-pointer transition-all focus:ring-2 focus:ring-indigo-500 ${badgeCls}`}>
                          {roles.map(r => <option key={r.id} value={r.name}>{r.display_name}</option>)}
                        </select>
                      )}
                    </td>

                    {can('users.manage') && (
                      <td className="px-6 py-4 text-right relative">
                        <button onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown === u.id ? null : u.id); }}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                          <MoreVertical size={17}/>
                        </button>
                        {activeDropdown === u.id && (
                          <div className={`absolute right-8 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-[99] overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150 ${isBottomRow ? 'bottom-10 mb-2' : 'top-10'}`}>
                            <button onClick={() => openPanel('edit', u)}
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                              <Pencil size={13}/> Profili Düzenle
                            </button>
                            <button onClick={() => openPanel('password', u)}
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                              <KeyRound size={13}/> Şifre Sıfırla
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-slate-700"/>
                            <button onClick={() => { setDeleteConfirm(u.id); setActiveDropdown(null); }} disabled={isMe}
                              className="w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                              <Trash2 size={13}/> Kullanıcıyı Sil
                            </button>
                            {isMe && (
                              <p className="px-4 py-1.5 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">Kendinizi silemezsiniz.</p>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* OVERLAY */}
      {isPanelOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]" onClick={closePanel}/>}

      {/* SAĞ PANEL */}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[480px] bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-300 flex flex-col ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Panel Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              panel === 'password' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500' :
              panel === 'create'   ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500' :
              'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500'
            }`}>
              {panel === 'password' ? <KeyRound size={16}/> : panel === 'create' ? <UserPlus size={16}/> : <Pencil size={16}/>}
            </div>
            <h2 className="text-base font-bold dark:text-white">
              {panel === 'password' ? 'Şifre Sıfırla' : panel === 'create' ? 'Yeni Kullanıcı' : 'Kullanıcıyı Düzenle'}
            </h2>
          </div>
          <button onClick={closePanel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18}/>
          </button>
        </div>

        {panelUser && panel !== 'create' && (
          <div className="px-6 pt-4 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
              <Avatar user={panelUser} size="lg"/>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{panelUser.full_name || panelUser.username}</p>
                <p className="text-xs text-slate-400 mt-0.5">@{panelUser.username} · #{panelUser.id}</p>
                <span className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border ${getRoleBadgeClass(getRoleColor(panelUser.role))}`}>
                  {getRoleIcon(panelUser.role)} {getRoleLabel(panelUser.role)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Form Alanı */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {panelError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/5 dark:border-rose-800 dark:text-rose-400 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={14} className="shrink-0"/> {panelError}
            </div>
          )}

          {/* ── OLUŞTUR ── */}
          {panel === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Kullanıcı Adı <span className="text-rose-500">*</span>
                  <span className="text-xs text-slate-400 font-normal ml-1">(harf, rakam, _ -)</span>
                </label>
                <input type="text" value={createForm.username}
                  onChange={e => setCreateForm(p => ({...p, username: e.target.value.toLowerCase().replace(/\s/g,'')}))}
                  placeholder="Örn: ahmetyilmaz"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Ad Soyad</label>
                <input type="text" value={createForm.full_name}
                  onChange={e => setCreateForm(p => ({...p, full_name: e.target.value}))}
                  placeholder="Örn: Ahmet Yılmaz"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">E-posta</label>
                <input type="email" value={createForm.email}
                  onChange={e => setCreateForm(p => ({...p, email: e.target.value}))}
                  placeholder="ornek@sirket.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Şifre <span className="text-rose-500">*</span>
                  <span className="text-xs text-slate-400 font-normal ml-1">(min 8 karakter, 1 büyük harf, 1 rakam)</span>
                </label>
                <div className="relative">
                  <input type={pwShow.new ? 'text' : 'password'} value={createForm.password}
                    onChange={e => setCreateForm(p => ({...p, password: e.target.value}))}
                    placeholder="Güçlü bir şifre girin"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"/>
                  <button type="button" onClick={() => setPwShow(p => ({...p, new: !p.new}))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {pwShow.new ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
                <StrengthBar password={createForm.password}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Başlangıç Rolü</label>
                <div className="space-y-2">
                  {roles.map(role => {
                    const isSelected = createForm.role === role.name;
                    const badgeCls   = getRoleBadgeClass(role.color);
                    return (
                      <label key={role.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? `${badgeCls} border-current` : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                        <input type="radio" name="create_role" value={role.name} checked={isSelected}
                          onChange={() => setCreateForm(p => ({...p, role: role.name}))} className="sr-only"/>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-current' : 'border-slate-300 dark:border-slate-600'}`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-current"/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isSelected ? '' : 'text-slate-700 dark:text-slate-200'}`}>{role.display_name}</p>
                          {role.description && <p className={`text-xs mt-0.5 ${isSelected ? 'opacity-70' : 'text-slate-400'}`}>{role.description}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── DÜZENLE ── */}
          {panel === 'edit' && panelUser && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Lock size={13} className="text-slate-400"/> Kullanıcı Adı
                  <span className="text-xs text-slate-400 font-normal">(değiştirilemez)</span>
                </label>
                <input type="text" value={panelUser.username} readOnly
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed text-sm font-mono"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Ad Soyad</label>
                <input type="text" value={editForm.full_name}
                  onChange={e => setEditForm(p => ({...p, full_name: e.target.value}))}
                  placeholder="Ad Soyad"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">E-posta</label>
                <input type="email" value={editForm.email}
                  onChange={e => setEditForm(p => ({...p, email: e.target.value}))}
                  placeholder="ornek@mail.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rol</label>
                <div className="space-y-2">
                  {roles.map(role => {
                    const isSelected = editForm.role === role.name;
                    const badgeCls   = getRoleBadgeClass(role.color);
                    return (
                      <label key={role.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? `${badgeCls} border-current` : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                        <input type="radio" name="edit_role" value={role.name} checked={isSelected}
                          onChange={() => setEditForm(p => ({...p, role: role.name}))} className="sr-only"/>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-current' : 'border-slate-300 dark:border-slate-600'}`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-current"/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isSelected ? '' : 'text-slate-700 dark:text-slate-200'}`}>{role.display_name}</p>
                          {role.description && <p className={`text-xs mt-0.5 ${isSelected ? 'opacity-70' : 'text-slate-400'}`}>{role.description}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <button onClick={() => navigate('/roles')}
                  className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium">
                  <Shield size={11}/> Rol izinlerini yönet <ExternalLink size={10}/>
                </button>
              </div>
            </div>
          )}

          {/* ── ŞİFRE ── */}
          {panel === 'password' && panelUser && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5"/>
                <p>Bu kullanıcının şifresini kalıcı olarak değiştiriyorsunuz. Kullanıcı mevcut şifresiyle giriş yapamayacak.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Yeni Şifre</label>
                <div className="relative">
                  <input type={pwShow.new ? 'text' : 'password'} value={pwForm.newPassword}
                    onChange={e => setPwForm(p => ({...p, newPassword: e.target.value}))}
                    placeholder="En az 8 karakter"
                    className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"/>
                  <button type="button" onClick={() => setPwShow(p => ({...p, new: !p.new}))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {pwShow.new ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
                <StrengthBar password={pwForm.newPassword}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Şifreyi Doğrula</label>
                <div className="relative">
                  <input type={pwShow.confirm ? 'text' : 'password'} value={pwForm.confirm}
                    onChange={e => setPwForm(p => ({...p, confirm: e.target.value}))}
                    placeholder="Şifreyi tekrar girin"
                    className={`w-full px-4 py-2.5 pr-10 rounded-xl border dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono ${
                      pwForm.confirm && pwForm.confirm !== pwForm.newPassword
                        ? 'border-rose-300 dark:border-rose-700 focus:ring-rose-500'
                        : pwForm.confirm && pwForm.confirm === pwForm.newPassword
                        ? 'border-emerald-300 dark:border-emerald-700'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}/>
                  <button type="button" onClick={() => setPwShow(p => ({...p, confirm: !p.confirm}))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {pwShow.confirm ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
                {pwForm.confirm && (
                  <p className={`text-xs mt-1.5 flex items-center gap-1 ${pwForm.confirm === pwForm.newPassword ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {pwForm.confirm === pwForm.newPassword
                      ? <><CheckCircle2 size={12}/> Şifreler eşleşiyor</>
                      : <><AlertCircle size={12}/> Şifreler eşleşmiyor</>
                    }
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button onClick={closePanel} className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-sm font-medium">
            İptal
          </button>
          {panel === 'create' && (
            <button onClick={handleCreateSubmit} disabled={isSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-emerald-600/20">
              {isSaving ? <><Loader2 size={14} className="animate-spin"/> Oluşturuluyor...</> : <><UserPlus size={14}/> Kullanıcı Oluştur</>}
            </button>
          )}
          {panel === 'edit' && (
            <button onClick={handleEditSubmit} disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
              {isSaving ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : 'Kaydet'}
            </button>
          )}
          {panel === 'password' && (
            <button onClick={handlePasswordSubmit} disabled={isSaving}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors">
              {isSaving ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : <><KeyRound size={14}/> Şifreyi Güncelle</>}
            </button>
          )}
        </div>
      </div>

      {/* SİLME ONAY */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-rose-500"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white text-center mb-2">
              {deleteConfirm === 'bulk' ? `${selected.size} Kullanıcıyı Sil` : 'Kullanıcıyı Sil'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-5">
              {deleteConfirm === 'bulk'
                ? `Seçili ${selected.size} kullanıcı kalıcı olarak silinecek. Bu işlem geri alınamaz.`
                : 'Bu işlem geri alınamaz.'
              }
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors text-sm">
                İptal
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {isDeleting ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;