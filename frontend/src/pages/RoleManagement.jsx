import React, { useState, useEffect, useCallback } from 'react';
import { usePermission } from '../hooks/usePermission';
import {
  Shield, Users, Plus, Pencil, Trash2, X, Check,
  AlertCircle, CheckCircle2, Loader2, Lock, ChevronDown,
  ChevronRight, Info, Crown, Eye, Zap,
  FolderKanban, Beaker, PlayCircle, ClipboardList,
  Bug, TrendingUp, Cpu, Globe, RefreshCw
} from 'lucide-react'; // KULLANILMAYAN İKONLAR VE BİLEŞENLER TEMİZLENDİ

// ── Sabitler ────────────────────────────────────────────────
const MODULES = [
  { key: 'projects',     label: 'Projeler',         icon: <FolderKanban size={15}/> },
  { key: 'test_cases',   label: 'Test Senaryoları',  icon: <Beaker size={15}/> },
  { key: 'test_runs',    label: 'Test Koşumları',    icon: <PlayCircle size={15}/> },
  { key: 'test_plans',   label: 'Test Planları',     icon: <ClipboardList size={15}/> },
  { key: 'defects',      label: 'Hatalar',           icon: <Bug size={15}/> },
  { key: 'users',        label: 'Kullanıcılar',      icon: <Users size={15}/> },
  { key: 'reports',      label: 'Raporlar',          icon: <TrendingUp size={15}/> },
  { key: 'automation',   label: 'Otomasyon',         icon: <Cpu size={15}/> },
  { key: 'environments', label: 'Ortamlar',          icon: <Globe size={15}/> },
  { key: 'roles',        label: 'Rol Yönetimi',      icon: <Shield size={15}/> },
];

// Fallback: Backend hazır değilse bu statik veri kullanılır
const STATIC_PERMISSIONS = [
  { id:1,  key:"projects.view",    name:"Projeleri Gör",       module:"projects",     description:"Projeleri listele ve detay gör" },
  { id:2,  key:"projects.create",  name:"Proje Oluştur",       module:"projects",     description:"Yeni proje ekle" },
  { id:3,  key:"projects.edit",    name:"Proje Düzenle",       module:"projects",     description:"Projeleri güncelle" },
  { id:4,  key:"projects.delete",  name:"Proje Sil",           module:"projects",     description:"Projeleri sil" },
  { id:5,  key:"test_cases.view",  name:"Test Case Gör",       module:"test_cases",   description:"Test senaryolarını görüntüle" },
  { id:6,  key:"test_cases.create",name:"Test Case Ekle",      module:"test_cases",   description:"Yeni senaryo oluştur" },
  { id:7,  key:"test_cases.edit",  name:"Test Case Düzenle",   module:"test_cases",   description:"Senaryoları güncelle" },
  { id:8,  key:"test_cases.delete",name:"Test Case Sil",       module:"test_cases",   description:"Senaryoları sil" },
  { id:9,  key:"test_runs.view",   name:"Koşumları Gör",       module:"test_runs",    description:"Koşumları görüntüle" },
  { id:10, key:"test_runs.create", name:"Koşum Başlat",        module:"test_runs",    description:"Yeni koşum oluştur" },
  { id:11, key:"test_runs.execute",name:"Koşum Çalıştır",      module:"test_runs",    description:"Test runner kullan" },
  { id:12, key:"test_runs.delete", name:"Koşum Sil",           module:"test_runs",    description:"Koşumları sil" },
  { id:13, key:"test_plans.view",  name:"Planları Gör",        module:"test_plans",   description:"Test planlarını görüntüle" },
  { id:14, key:"test_plans.create",name:"Plan Oluştur",        module:"test_plans",   description:"Yeni plan ekle" },
  { id:15, key:"test_plans.edit",  name:"Plan Düzenle",        module:"test_plans",   description:"Planları güncelle" },
  { id:16, key:"test_plans.delete",name:"Plan Sil",            module:"test_plans",   description:"Planları sil" },
  { id:17, key:"defects.view",     name:"Hataları Gör",        module:"defects",      description:"Hata kayıtlarını görüntüle" },
  { id:18, key:"defects.manage",   name:"Hata Yönet",          module:"defects",      description:"Statü güncelle" },
  { id:19, key:"users.view",       name:"Kullanıcıları Gör",   module:"users",        description:"Kullanıcı listesini gör" },
  { id:20, key:"users.manage",     name:"Kullanıcı Yönet",     module:"users",        description:"Kullanıcı düzenle, sil, rol ata" },
  { id:21, key:"reports.view",     name:"Raporları Gör",       module:"reports",      description:"Raporları görüntüle" },
  { id:22, key:"reports.export",   name:"Rapor İndir",         module:"reports",      description:"PDF/Excel export al" },
  { id:23, key:"automation.view",  name:"Otomasyonu Gör",      module:"automation",   description:"Otomasyon sayfasını gör" },
  { id:24, key:"automation.execute",name:"Otomasyon Çalıştır", module:"automation",   description:"Otomasyon testleri başlat" },
  { id:25, key:"environments.view",name:"Ortamları Gör",       module:"environments", description:"Ortam ve değişkenleri gör" },
  { id:26, key:"environments.manage",name:"Ortam Yönet",       module:"environments", description:"Ortam/değişken ekle/sil" },
  { id:27, key:"roles.view",       name:"Rolleri Gör",         module:"roles",        description:"Rol listesini görüntüle" },
  { id:28, key:"roles.manage",     name:"Rol Yönet",           module:"roles",        description:"Rol ve izin yönetimi" },
];

const STATIC_ROLES = [
  { id:1, name:"admin",   display_name:"Admin",            color:"rose",   is_system:true,  description:"Tüm işlemlere tam erişim. Sistem rolü.", permissions: STATIC_PERMISSIONS },
  { id:2, name:"manager", display_name:"Test Yöneticisi",  color:"amber",  is_system:true,  description:"Projeleri ve test süreçlerini yönetebilir.", permissions: STATIC_PERMISSIONS.filter(p => !['projects.delete','users.manage','roles.manage'].includes(p.key)) },
  { id:3, name:"tester",  display_name:"Test Uzmanı",      color:"indigo", is_system:true,  description:"Test senaryoları oluşturabilir ve koşum yapabilir.", permissions: STATIC_PERMISSIONS.filter(p => ['view','create','edit','execute','manage'].some(a => p.key.includes(a)) && !['users','roles','environments'].some(m => p.key.startsWith(m+'.manage'))) },
  { id:4, name:"viewer",  display_name:"İzleyici",         color:"slate",  is_system:true,  description:"Yalnızca görüntüleme yetkisi.", permissions: STATIC_PERMISSIONS.filter(p => p.key.endsWith('.view')) },
];

const STATIC_USERS = [
  { id:1, username:"admin",   full_name:"Admin Kullanıcı",  role:"admin"   },
  { id:2, username:"tester1", full_name:"Test Uzmanı 1",    role:"tester"  },
  { id:3, username:"viewer1", full_name:"İzleyici 1",       role:"viewer"  },
];

// ── Renk config ─────────────────────────────────────────────
const getRoleColor = (color) => ({
  rose:   { badge: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',   dot: 'bg-rose-500',   ring: 'ring-rose-500/20' },
  amber:  { badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500', ring: 'ring-amber-500/20' },
  indigo: { badge: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500', ring: 'ring-indigo-500/20' },
  emerald:{ badge: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500', ring: 'ring-emerald-500/20' },
  violet: { badge: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-800', dot: 'bg-violet-500', ring: 'ring-violet-500/20' },
  slate:  { badge: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400',   ring: 'ring-slate-500/20' },
}[color] || { badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', ring: 'ring-slate-500/20' });

const ROLE_COLORS = ['rose','amber','indigo','emerald','violet','slate'];

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── İzin Checkbox Grid Satırı ────────────────────────────────
const PermCheckbox = ({ checked, onChange, disabled }) => (
  <button onClick={() => !disabled && onChange(!checked)} disabled={disabled}
    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
      disabled   ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed' :
      checked    ? 'bg-indigo-500 border-indigo-500 text-white hover:bg-indigo-600' :
                   'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 hover:border-indigo-400'
    }`}>
    {checked && <Check size={12} strokeWidth={3}/>}
  </button>
);

// ── Ana Bileşen ──────────────────────────────────────────────
const RoleManagement = () => {
  const { can } = usePermission();

  const [roles, setRoles]               = useState([]);
  const [permissions, setPermissions]   = useState([]);
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(false);

  const [activeTab, setActiveTab]       = useState('roles');   // roles | users
  const [selectedRole, setSelectedRole] = useState(null);      // detay panelindeki rol
  const [expandedModules, setExpandedModules] = useState({});  // modül accordion'u

  // Panel
  const [panel, setPanel]               = useState(null);      // null | 'create' | 'edit'
  const [panelRole, setPanelRole]       = useState(null);
  const [roleForm, setRoleForm]         = useState({ name:'', display_name:'', description:'', color:'indigo' });
  const [editPerms, setEditPerms]       = useState({});        // { permId: bool }
  const [formError, setFormError]       = useState('');
  const [isSaving, setIsSaving]         = useState(false);

  // Kullanıcı rol atama
  const [userRoleEdit, setUserRoleEdit] = useState({});        // { userId: role }
  const [savingUserId, setSavingUserId] = useState(null);

  // Silme onay
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting]       = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ✅ Dinamik API Base URL
  const API_BASE = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000';

  // ── Veri Çekme ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/roles`).catch(() => null),
        fetch(`${API_BASE}/permissions`).catch(() => null),
        fetch(`${API_BASE}/users`).catch(() => null),
      ]);

      const beOk = rolesRes?.ok && permsRes?.ok;
      setBackendAvailable(beOk);

      if (beOk) {
        setRoles(await rolesRes.json());
        setPermissions(await permsRes.json());
        if (usersRes?.ok) setUsers(await usersRes.json());
      } else {
        // Backend hazır değil — statik veri ile çalış
        setRoles(STATIC_ROLES);
        setPermissions(STATIC_PERMISSIONS);
        setUsers(STATIC_USERS);
      }
    } catch {
      setRoles(STATIC_ROLES);
      setPermissions(STATIC_PERMISSIONS);
      setUsers(STATIC_USERS);
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // İlk yüklemede ilk rolü seç
  useEffect(() => {
    if (roles.length > 0 && !selectedRole) setSelectedRole(roles[0]);
  }, [roles]);

  // ── Modül accordion ─────────────────────────────────────────
  const toggleModule = (key) => setExpandedModules(p => ({ ...p, [key]: !p[key] }));

  // ── Panel yönetimi ──────────────────────────────────────────
  const openCreatePanel = () => {
    setRoleForm({ name:'', display_name:'', description:'', color:'indigo' });
    const initPerms = {};
    permissions.forEach(p => { initPerms[p.id] = false; });
    setEditPerms(initPerms);
    setFormError('');
    setPanel('create');
  };

  const openEditPanel = (role) => {
    setPanelRole(role);
    setRoleForm({ name: role.name, display_name: role.display_name, description: role.description || '', color: role.color || 'indigo' });
    const initPerms = {};
    permissions.forEach(p => { initPerms[p.id] = role.permissions?.some(rp => (rp.id || rp) === p.id) || false; });
    setEditPerms(initPerms);
    setFormError('');
    setPanel('edit');
  };

  const closePanel = () => { setPanel(null); setPanelRole(null); };

  // ── Tüm modülü seç/kaldır ───────────────────────────────────
  const toggleModule_perms = (moduleKey, value) => {
    const modulePerms = permissions.filter(p => p.module === moduleKey);
    setEditPerms(prev => {
      const next = { ...prev };
      modulePerms.forEach(p => { next[p.id] = value; });
      return next;
    });
  };

  // ── Kaydet ──────────────────────────────────────────────────
  const handleSave = async () => {
    setFormError('');
    if (!roleForm.display_name.trim()) { setFormError('Rol adı boş olamaz.'); return; }
    if (panel === 'create' && !roleForm.name.trim()) { setFormError('Rol anahtarı boş olamaz (örn: developer).'); return; }

    const selectedPermIds = Object.entries(editPerms).filter(([,v]) => v).map(([k]) => parseInt(k));
    setIsSaving(true);

    try {
      if (backendAvailable) {
        // Gerçek API
        const url    = panel === 'create' ? `${API_BASE}/roles` : `${API_BASE}/roles/${panelRole.id}`;
        const method = panel === 'create' ? 'POST' : 'PUT';
        const res = await fetch(url, {
          method, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: roleForm.name, display_name: roleForm.display_name, description: roleForm.description, color: roleForm.color }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setFormError(d.detail || 'Kaydedilemedi.'); return; }
        const savedRole = await res.json();
        
        // İzinleri güncelle
        await fetch(`${API_BASE}/roles/${savedRole.id}/permissions`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permission_ids: selectedPermIds }),
        });
        await fetchData();
      } else {
        // Statik mod — local state güncelle
        const updatedPerms = permissions.filter(p => selectedPermIds.includes(p.id));
        if (panel === 'create') {
          const newRole = { id: Date.now(), ...roleForm, is_system: false, permissions: updatedPerms };
          setRoles(prev => [...prev, newRole]);
          setSelectedRole(newRole);
        } else {
          const updated = { ...panelRole, ...roleForm, permissions: updatedPerms };
          setRoles(prev => prev.map(r => r.id === panelRole.id ? updated : r));
          if (selectedRole?.id === panelRole.id) setSelectedRole(updated);
        }
      }
      closePanel();
      showToast('success', panel === 'create' ? 'Rol oluşturuldu.' : 'Rol güncellendi.');
    } catch { setFormError('İşlem tamamlanamadı.'); }
    finally  { setIsSaving(false); }
  };

  // ── Sil ─────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      if (backendAvailable) {
        const res = await fetch(`${API_BASE}/roles/${id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); showToast('error', d.detail || 'Silinemedi.'); return; }
        await fetchData();
      } else {
        setRoles(prev => prev.filter(r => r.id !== id));
        if (selectedRole?.id === id) setSelectedRole(roles.find(r => r.id !== id) || null);
      }
      showToast('success', 'Rol silindi.');
    } catch { showToast('error', 'İşlem tamamlanamadı.'); }
    finally { setIsDeleting(false); setDeleteConfirm(null); }
  };

  // ── Kullanıcı rol atama ──────────────────────────────────────
  const handleUserRoleSave = async (userId) => {
    const newRole = userRoleEdit[userId];
    if (!newRole) return;
    setSavingUserId(userId);
    try {
      if (backendAvailable) {
        await fetch(`${API_BASE}/users/${userId}/role`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        });
        await fetchData();
      } else {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      }
      setUserRoleEdit(prev => { const n = {...prev}; delete n[userId]; return n; });
      showToast('success', 'Kullanıcı rolü güncellendi.');
    } catch { showToast('error', 'Güncellenemedi.'); }
    finally  { setSavingUserId(null); }
  };

  // ── Yardımcı hesaplamalar ────────────────────────────────────
  const getModulePerms   = (moduleKey) => permissions.filter(p => p.module === moduleKey);
  const getRolePermIds   = (role) => new Set((role?.permissions || []).map(p => p.id || p));
  const getUserCount     = (roleName) => users.filter(u => u.role === roleName).length;
  const getRoleName      = (roleName) => roles.find(r => r.name === roleName)?.display_name || roleName;
  const allModuleChecked = (moduleKey) => getModulePerms(moduleKey).every(p => editPerms[p.id]);
  const someModuleChecked= (moduleKey) => getModulePerms(moduleKey).some(p => editPerms[p.id]);

  // ── Render ───────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Skeleton className="h-8 w-64"/>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-24 rounded-2xl"/>)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Skeleton className="h-96 rounded-2xl"/>
        <div className="col-span-2"><Skeleton className="h-96 rounded-2xl"/></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400' : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield size={24} className="text-indigo-500"/> Rol ve İzin Yönetimi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Hangi rolün neye erişeceğini ve kullanıcılara hangi rolün atanacağını yönetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors" title="Yenile">
            <RefreshCw size={17}/>
          </button>
          {!backendAvailable && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-xl">
              <Info size={13}/> Demo mod — Backend bağlantısı yok
            </div>
          )}
        </div>
      </div>

      {/* ÖZET KARTLARI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {roles.map(role => {
          const c = getRoleColor(role.color);
          const cnt = getUserCount(role.name);
          return (
            <button key={role.id} onClick={() => { setSelectedRole(role); setActiveTab('roles'); }}
              className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border text-left transition-all hover:shadow-md ${
                selectedRole?.id === role.id ? `border-current ring-2 ${c.ring} ${c.badge}` : 'border-slate-200 dark:border-slate-800'
              }`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`w-2 h-2 rounded-full ${c.dot}`}/>
                {role.is_system && <Lock size={12} className="text-slate-400"/>}
              </div>
              <p className="text-base font-bold text-slate-900 dark:text-white">{role.display_name}</p>
              <p className="text-xs text-slate-400 mt-1">{cnt} kullanıcı · {role.permissions?.length || 0} izin</p>
            </button>
          );
        })}

        {/* YETKİ KONTROLÜ: Yeni Rol Oluşturma */}
        {can('roles.manage') && (
          <button onClick={openCreatePanel}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-left hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all flex items-center gap-3 text-slate-400 hover:text-indigo-500">
            <Plus size={18}/>
            <span className="text-sm font-medium">Yeni Rol</span>
          </button>
        )}
      </div>

      {/* TAB */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {[
          { id: 'roles', label: 'Rol İzinleri', icon: <Shield size={15}/> },
          { id: 'users', label: 'Kullanıcı Rolleri', icon: <Users size={15}/> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ROL İZİNLERİ TABİ */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Sol: Rol Listesi */}
          <div className="space-y-2">
            {roles.map(role => {
              const c = getRoleColor(role.color);
              const isSelected = selectedRole?.id === role.id;
              return (
                <button key={role.id} onClick={() => setSelectedRole(role)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all ${
                    isSelected
                      ? 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 shadow-sm ring-1 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 ${c.badge} border`}>
                        {role.name === 'admin' ? <Crown size={15}/> : role.name === 'viewer' ? <Eye size={15}/> : <Shield size={15}/>}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {role.display_name}
                          {role.is_system && <Lock size={11} className="text-slate-400 shrink-0"/>}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{getUserCount(role.name)} kullanıcı</p>
                      </div>
                    </div>
                    
                    {/* YETKİ KONTROLÜ: Düzenle / Sil */}
                    {can('roles.manage') && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={e => { e.stopPropagation(); openEditPanel(role); }}
                          className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors">
                          <Pencil size={13}/>
                        </button>
                        {!role.is_system && (
                          <button onClick={e => { e.stopPropagation(); setDeleteConfirm(role.id); }}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {role.description && <p className="text-xs text-slate-400 mt-2 leading-relaxed line-clamp-2">{role.description}</p>}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${c.dot} transition-all`}
                        style={{ width: `${permissions.length > 0 ? Math.round(((role.permissions?.length || 0) / permissions.length) * 100) : 0}%` }}/>
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums shrink-0">{role.permissions?.length || 0}/{permissions.length}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sağ: Seçili Rolün İzin Detayları */}
          <div className="lg:col-span-2">
            {!selectedRole ? (
              <div className="h-64 flex items-center justify-center text-slate-400 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                <div className="text-center">
                  <Shield size={32} className="mx-auto mb-3 opacity-20"/>
                  <p className="text-sm">Detayları görmek için bir rol seçin</p>
                </div>
              </div>
            ) : (() => {
              const c = getRoleColor(selectedRole.color);
              const rolePermIds = getRolePermIds(selectedRole);
              return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  {/* Rol başlığı */}
                  <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center border ${c.badge}`}>
                        {selectedRole.name === 'admin' ? <Crown size={18}/> : selectedRole.name === 'viewer' ? <Eye size={18}/> : <Shield size={18}/>}
                      </span>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          {selectedRole.display_name}
                          {selectedRole.is_system && (
                            <span className="text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                              <Lock size={10}/> Sistem
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{selectedRole.description}</p>
                      </div>
                    </div>
                    {/* YETKİ KONTROLÜ: Detay içindeki Düzenle butonu */}
                    {can('roles.manage') && (
                      <button onClick={() => openEditPanel(selectedRole)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl transition-colors border border-indigo-200 dark:border-indigo-800">
                        <Pencil size={13}/> Düzenle
                      </button>
                    )}
                  </div>

                  {/* Modül bazlı izin listesi */}
                  <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {MODULES.map(mod => {
                      const modPerms = getModulePerms(mod.key);
                      if (modPerms.length === 0) return null;
                      const grantedCount = modPerms.filter(p => rolePermIds.has(p.id)).length;
                      const allGranted   = grantedCount === modPerms.length;
                      const isExpanded   = expandedModules[mod.key];
                      return (
                        <div key={mod.key}>
                          <button onClick={() => toggleModule(mod.key)}
                            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">{mod.icon}</span>
                              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{mod.label}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                allGranted ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                grantedCount > 0 ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                                'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              }`}>
                                {grantedCount}/{modPerms.length}
                              </span>
                              {isExpanded ? <ChevronDown size={15} className="text-slate-400"/> : <ChevronRight size={15} className="text-slate-400"/>}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800/50">
                              {modPerms.map(perm => {
                                const granted = rolePermIds.has(perm.id);
                                return (
                                  <div key={perm.id} className="flex items-center justify-between px-6 py-3 hover:bg-white dark:hover:bg-slate-900 transition-colors">
                                    <div>
                                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{perm.name}</p>
                                      {perm.description && <p className="text-xs text-slate-400 mt-0.5">{perm.description}</p>}
                                    </div>
                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                                      granted ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                                    }`}>
                                      {granted ? <><Check size={11}/> İzinli</> : <><X size={11}/> İzinsiz</>}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* KULLANICI ROLLERI TABİ */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
              Kullanıcılara Rol Ata
            </h3>
            <span className="text-xs text-slate-400">{users.length} kullanıcı</span>
          </div>
          {users.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users size={32} className="mx-auto mb-3 opacity-20"/>
              <p className="text-sm">Henüz kullanıcı yok.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-xs uppercase text-slate-400 font-semibold">
                  <th className="px-6 py-3.5">Kullanıcı</th>
                  <th className="px-6 py-3.5">Mevcut Rol</th>
                  <th className="px-6 py-3.5">Rol Değiştir</th>
                  <th className="px-6 py-3.5 text-right">Kaydet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {users.map(u => {
                  const currentRoleName = u.role || 'viewer';
                  const currentRole     = roles.find(r => r.name === currentRoleName);
                  const c               = getRoleColor(currentRole?.color || 'slate');
                  const pendingRole     = userRoleEdit[u.id];
                  const hasChange       = pendingRole && pendingRole !== currentRoleName;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                            {(u.full_name || u.username || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.full_name || u.username}</p>
                            <p className="text-xs text-slate-400">@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${c.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>
                          {currentRole?.display_name || currentRoleName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={pendingRole ?? currentRoleName}
                          onChange={e => setUserRoleEdit(prev => ({ ...prev, [u.id]: e.target.value }))}
                          disabled={!can('users.manage')}
                          className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {roles.map(r => <option key={r.id} value={r.name}>{r.display_name}</option>)}
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {hasChange && can('users.manage') && (
                          <button onClick={() => handleUserRoleSave(u.id)} disabled={savingUserId === u.id}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 ml-auto">
                            {savingUserId === u.id ? <><Loader2 size={12} className="animate-spin"/> Kaydediliyor</> : <><Check size={12}/> Kaydet</>}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── PANEL OVERLAY ── */}
      {panel && <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60]" onClick={closePanel}/>}

      {/* ── ROL PANEL ── */}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[580px] bg-white dark:bg-slate-900 shadow-2xl z-[70] flex flex-col transform transition-transform duration-300 ${panel ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <Shield size={16} className="text-indigo-500"/>
            </div>
            <h2 className="text-base font-bold dark:text-white">
              {panel === 'create' ? 'Yeni Rol Oluştur' : `"${panelRole?.display_name}" Rolünü Düzenle`}
            </h2>
          </div>
          <button onClick={closePanel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {formError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={14} className="shrink-0"/> {formError}
            </div>
          )}

          {/* Temel bilgiler */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Temel Bilgiler</p>
            {panel === 'create' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Rol Anahtarı <span className="text-slate-400 font-normal text-xs">(küçük harf, boşluksuz)</span>
                </label>
                <input type="text" value={roleForm.name} onChange={e => setRoleForm(p => ({...p, name: e.target.value.toLowerCase().replace(/\s/g,'_')}))}
                  placeholder="Örn: developer" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono"/>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Görünen Ad</label>
              <input type="text" value={roleForm.display_name} onChange={e => setRoleForm(p => ({...p, display_name: e.target.value}))}
                placeholder="Örn: Geliştirici" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Açıklama <span className="text-slate-400 font-normal text-xs">(isteğe bağlı)</span></label>
              <textarea rows={2} value={roleForm.description} onChange={e => setRoleForm(p => ({...p, description: e.target.value}))}
                placeholder="Bu rolün yetkilerini özetleyin..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Renk (badge)</label>
              <div className="flex gap-2 flex-wrap">
                {ROLE_COLORS.map(color => {
                  const c = getRoleColor(color);
                  return (
                    <button key={color} onClick={() => setRoleForm(p => ({...p, color}))}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${c.dot} ${roleForm.color === color ? 'border-slate-900 dark:border-white scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}/>
                  );
                })}
              </div>
            </div>
          </div>

          {/* İzin seçimi — modül bazlı */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">İzinler</p>
              <span className="text-xs text-slate-400">
                {Object.values(editPerms).filter(Boolean).length} / {permissions.length} seçili
              </span>
            </div>

            {MODULES.map(mod => {
              const modPerms = getModulePerms(mod.key);
              if (modPerms.length === 0) return null;
              const allChecked  = allModuleChecked(mod.key);
              const someChecked = someModuleChecked(mod.key);
              const isOpen      = expandedModules[`panel_${mod.key}`] !== false; // default open

              return (
                <div key={mod.key} className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                  {/* Modül başlığı */}
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                    onClick={() => setExpandedModules(p => ({...p, [`panel_${mod.key}`]: !isOpen}))}>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={e => { e.stopPropagation(); toggleModule_perms(mod.key, !allChecked); }}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          allChecked  ? 'bg-indigo-500 border-indigo-500 text-white' :
                          someChecked ? 'bg-indigo-200 border-indigo-400 dark:bg-indigo-500/30 dark:border-indigo-500' :
                          'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                        }`}>
                        {allChecked ? <Check size={12} strokeWidth={3}/> : someChecked ? <span className="w-2 h-0.5 bg-indigo-500 dark:bg-indigo-400 rounded"/> : null}
                      </button>
                      <span className="text-slate-500 dark:text-slate-400">{mod.icon}</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{mod.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{modPerms.filter(p => editPerms[p.id]).length}/{modPerms.length}</span>
                      {isOpen ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>}
                    </div>
                  </div>

                  {/* İzin satırları */}
                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/50">
                      {modPerms.map(perm => (
                        <div key={perm.id} className="flex items-center justify-between px-4 py-3 hover:bg-white dark:hover:bg-slate-900 transition-colors">
                          <div className="flex items-center gap-3">
                            <PermCheckbox
                              checked={editPerms[perm.id] || false}
                              onChange={val => setEditPerms(prev => ({...prev, [perm.id]: val}))}
                              disabled={false}
                            />
                            <div>
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{perm.name}</p>
                              {perm.description && <p className="text-xs text-slate-400">{perm.description}</p>}
                            </div>
                          </div>
                          <code className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">{perm.key}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <p className="text-xs text-slate-400">{Object.values(editPerms).filter(Boolean).length} izin seçildi</p>
          <div className="flex gap-2">
            <button onClick={closePanel} className="px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium">İptal</button>
            <button onClick={handleSave} disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
              {isSaving ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : <><Zap size={14}/> Kaydet</>}
            </button>
          </div>
        </div>
      </div>

      {/* SİLME ONAY */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-rose-500"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white text-center mb-2">Rolü Sil</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Bu rol silinecek. Bu role atanmış kullanıcılar etkilenebilir.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors text-sm">İptal</button>
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

export default RoleManagement;