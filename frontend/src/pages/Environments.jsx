import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePermission } from '../hooks/usePermission';
import api from '../api';
import {
  Server, Database, Key, Globe, Plus, Search, MoreVertical,
  X, Pencil, Trash2, AlertCircle, CheckCircle2, Eye, EyeOff,
  Copy, Shield, FileText, Folder, Loader2, RefreshCw,
  Wifi, WifiOff, Filter, Check, Lock, ExternalLink, Zap
} from 'lucide-react';

// ── İzinler ───────────────────────────────────────────────────────
const PERM = { envManage: 'environments.manage' };

// ── URL Validasyon ────────────────────────────────────────────────
const isValidUrl = (url) => {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

// ── Sabit form şablonları (bileşen dışında — referans stabilitesi) ─
const DEFAULT_ENV_FORM = { id: '', name: '', project_id: '', url: '', description: '' };
const DEFAULT_VAR_FORM = { id: '', key: '', value: '', project_id: '', env_id: '', is_secret: false };
// FIX: Key regex sabiti dışarıda — her render'da yeniden oluşmaz
const KEY_RE = /^[A-Z0-9_]+$/;

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`}/>
);

const getPingStyle = (status) => ({
  online:  { dot: 'bg-emerald-400',                            btn: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', label: 'Erişilebilir'      },
  offline: { dot: 'bg-rose-400',                               btn: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',                   label: 'Erişilemiyor'      },
  testing: { dot: 'bg-amber-400 animate-pulse',                btn: 'bg-amber-50 text-amber-500 border-amber-200',                                                                              label: 'Test ediliyor...'  },
  unknown: { dot: 'bg-slate-300 dark:bg-slate-600',            btn: 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600', label: 'Test Et' },
}[status] || { dot: 'bg-slate-300', btn: 'bg-slate-50 text-slate-500 border-slate-200', label: 'Test Et' });

// FIX: API hata mesajını güvenli parse et (Pydantic 422 dahil)
const parseApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg || String(d)).join(', ');
  if (typeof detail === 'string') return detail;
  return err?.message || 'Bir hata oluştu.';
};

// ── Ana Bileşen ────────────────────────────────────────────────────
const Environments = () => {
  const { can } = usePermission();

  const [projects,     setProjects]     = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [variables,    setVariables]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const [activeTab,     setActiveTab]     = useState('environments');
  const [searchTerm,    setSearchTerm]    = useState('');
  const [projectFilter, setProjectFilter] = useState('All');
  const [envFilter,     setEnvFilter]     = useState('All');
  const [typeFilter,    setTypeFilter]    = useState('All');

  const [pingStatus,     setPingStatus]     = useState({});
  const [revealed,       setRevealed]       = useState(new Set());
  const [activeDropdown, setActiveDropdown] = useState(null);

  const [panel,        setPanel]        = useState(null); // { type: 'env'|'var', mode: 'create'|'edit' }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panelError,   setPanelError]   = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting,    setIsDeleting]    = useState(false);

  const [envForm,      setEnvForm]      = useState(DEFAULT_ENV_FORM);
  const [varForm,      setVarForm]      = useState(DEFAULT_VAR_FORM);
  const [showVarValue, setShowVarValue] = useState(false);

  // FIX: Toast timer ref — memory leak önlemi
  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // FIX: Ping abort controller'ları — bileşen unmount'ta veya yeni ping'de iptal et
  const pingAbortRefs = useRef({});

  // ── Veri Çekme ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setError(null);
    // FIX: setLoading(true) eksikti — her fetchData çağrısında loading göster
    setLoading(true);
    try {
      const [projRes, envRes, varRes] = await Promise.all([
        api.get('/projects').catch(() => null),
        api.get('/environments').catch(() => null),
        api.get('/variables').catch(() => null),
      ]);
      if (projRes) setProjects(projRes.data);
      if (envRes)  setEnvironments(envRes.data);  else setEnvironments([]);
      if (varRes)  setVariables(varRes.data);      else setVariables([]);
      if (!projRes) setError('Projeler yüklenemedi.');
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // FIX: data-dropdown attribute ile dropdown dışı tıklamada kapat
    const close = (e) => { if (!e.target.closest('[data-dropdown]')) setActiveDropdown(null); };
    document.addEventListener('click', close);
    const pings = pingAbortRefs.current;   // cleanup anında aynı nesneye erişmek için
    return () => {
      document.removeEventListener('click', close);
      // Unmount'ta açık kalan ping isteklerini iptal et
      Object.values(pings).forEach(ac => ac.abort());
    };
  }, [fetchData]);

  // Tab değişince filtreleri sıfırla
  useEffect(() => { setSearchTerm(''); setEnvFilter('All'); setTypeFilter('All'); }, [activeTab]);

  // ── URL Ping ─────────────────────────────────────────────────────
  const pingUrl = useCallback(async (envId, url) => {
    if (!url) { showToast('error', 'Test edilecek URL yok.'); return; }
    // FIX: Aynı env için devam eden ping varsa iptal et
    if (pingAbortRefs.current[envId]) pingAbortRefs.current[envId].abort();
    const ac = new AbortController();
    pingAbortRefs.current[envId] = ac;

    setPingStatus(prev => ({ ...prev, [envId]: 'testing' }));
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ac.signal });
      // FIX: AbortError fırlatılmadan önce status güncellenmesi için abort kontrolü
      if (ac.signal.aborted) return;
      setPingStatus(prev => ({ ...prev, [envId]: 'online' }));
      showToast('success', `${url} — ağ bağlantısı erişilebilir.`);
    } catch (err) {
      if (err.name === 'AbortError') return; // Kullanıcı iptal etti — sessizce çık
      setPingStatus(prev => ({ ...prev, [envId]: 'offline' }));
      showToast('error', err.name === 'TimeoutError'
        ? 'Zaman aşımı — sunucu yanıt vermiyor.'
        : 'Bağlantı kurulamadı.');
    } finally {
      // FIX: Tamamlanan ping'in ref'ini temizle
      if (pingAbortRefs.current[envId] === ac) delete pingAbortRefs.current[envId];
    }
  }, [showToast]);

  // ── Kopyalama ─────────────────────────────────────────────────────
  const copyToClipboard = useCallback((text, label = '') => {
    if (!text) return;
    const doToast = () => showToast('success', label ? `${label} kopyalandı!` : 'Kopyalandı!');
    navigator.clipboard?.writeText(text).then(doToast).catch(() => {
      // Fallback: eski tarayıcılar için execCommand
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); doToast(); }
      catch { showToast('error', 'Kopyalama başarısız.'); }
      document.body.removeChild(ta);
    });
  }, [showToast]);

  const toggleReveal = useCallback((id) => setRevealed(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  }), []);

  // ── Yardımcılar ───────────────────────────────────────────────────
  const getProjectName = useCallback((id) =>
    projects.find(p => String(p.id) === String(id))?.name || '—'
  , [projects]);

  const getEnvName = useCallback((id) =>
    id ? (environments.find(e => String(e.id) === String(id))?.name || 'Bilinmiyor') : 'Global (Proje Geneli)'
  , [environments]);

  // ── Panel Açma / Kapama ───────────────────────────────────────────
  const openEnvPanel = useCallback((env = null) => {
    setPanelError(''); setShowVarValue(false);
    setEnvForm(env
      ? { id: env.id, name: env.name || '', project_id: env.project_id, url: env.url || '', description: env.description || '' }
      : { ...DEFAULT_ENV_FORM }
    );
    setPanel({ type: 'env', mode: env ? 'edit' : 'create' });
    setActiveDropdown(null);
  }, []);

  const openVarPanel = useCallback((variable = null) => {
    setPanelError(''); setShowVarValue(false);
    setVarForm(variable
      ? { id: variable.id, key: variable.key || '', value: variable.value || '', project_id: variable.project_id || '', env_id: variable.env_id || '', is_secret: variable.is_secret }
      : { ...DEFAULT_VAR_FORM }
    );
    setPanel({ type: 'var', mode: variable ? 'edit' : 'create' });
    setActiveDropdown(null);
  }, []);

  const closePanel = useCallback(() => { setPanel(null); setPanelError(''); }, []);

  // ── Ortam CRUD ────────────────────────────────────────────────────
  const handleEnvSubmit = useCallback(async () => {
    setPanelError('');
    if (!envForm.name.trim())           { setPanelError('Ortam adı boş olamaz.'); return; }
    if (!envForm.project_id)            { setPanelError('Proje seçiniz.'); return; }
    if (!envForm.url.trim())            { setPanelError('URL boş olamaz.'); return; }
    if (!isValidUrl(envForm.url.trim())) { setPanelError('Geçerli bir URL girin (örn: https://api.example.com).'); return; }

    setIsSubmitting(true);
    try {
      const endpoint = panel?.mode === 'create' ? '/environments' : `/environments/${envForm.id}`;
      const method   = panel?.mode === 'create' ? 'post' : 'put';
      const res = await api[method](endpoint, {
        name:        envForm.name.trim(),
        project_id:  parseInt(envForm.project_id),
        url:         envForm.url.trim(),
        description: envForm.description?.trim() || null,
      });
      const saved = res.data;
      setEnvironments(prev =>
        panel?.mode === 'create' ? [saved, ...prev] : prev.map(e => e.id === saved.id ? saved : e)
      );
      closePanel();
      showToast('success', panel?.mode === 'create' ? 'Ortam oluşturuldu.' : 'Ortam güncellendi.');
    } catch (err) { setPanelError(parseApiError(err)); }
    finally       { setIsSubmitting(false); }
  }, [envForm, panel, closePanel, showToast]);

  // ── Değişken CRUD ─────────────────────────────────────────────────
  const handleVarSubmit = useCallback(async () => {
    setPanelError('');
    // FIX: Key normalize — boşlukları alt çizgiye çevir, büyük harfe al
    const key = varForm.key.trim().toUpperCase().replace(/\s+/g, '_');
    if (!key)              { setPanelError('Key boş olamaz.'); return; }
    if (!KEY_RE.test(key)) { setPanelError('Key yalnızca büyük harf, rakam ve alt çizgi içerebilir.'); return; }
    if (!varForm.value.trim()) { setPanelError('Değer boş olamaz.'); return; }

    // FIX: Duplicate check sadece create modunda yapılmalı
    if (panel?.mode === 'create') {
      const exists = variables.some(v =>
        v.key === key &&
        String(v.env_id     || '') === String(varForm.env_id     || '') &&
        String(v.project_id || '') === String(varForm.project_id || '')
      );
      if (exists) { setPanelError(`"${key}" bu kapsam için zaten mevcut.`); return; }
    }

    setIsSubmitting(true);
    try {
      const endpoint = panel?.mode === 'create' ? '/variables' : `/variables/${varForm.id}`;
      const method   = panel?.mode === 'create' ? 'post' : 'put';
      const res = await api[method](endpoint, {
        key,
        value:      varForm.value,
        project_id: varForm.project_id ? parseInt(varForm.project_id) : null,
        env_id:     varForm.env_id     ? parseInt(varForm.env_id)     : null,
        is_secret:  varForm.is_secret,
      });
      const saved = res.data;
      setVariables(prev =>
        panel?.mode === 'create' ? [saved, ...prev] : prev.map(v => v.id === saved.id ? saved : v)
      );
      closePanel();
      showToast('success', panel?.mode === 'create' ? 'Değişken oluşturuldu.' : 'Değişken güncellendi.');
    } catch (err) { setPanelError(parseApiError(err)); }
    finally       { setIsSubmitting(false); }
  }, [varForm, panel, variables, closePanel, showToast]);

  // ── Silme ─────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    const { type, id } = deleteConfirm;
    try {
      await api.delete(type === 'env' ? `/environments/${id}` : `/variables/${id}`);
      if (type === 'env') {
        setEnvironments(prev => prev.filter(e => e.id !== id));
        // FIX: Silinen ortama ait değişkenlerin ping state'ini de temizle
        setPingStatus(prev => { const n = { ...prev }; delete n[id]; return n; });
      } else {
        setVariables(prev => prev.filter(v => v.id !== id));
        // FIX: Silinen değişkenin reveal state'ini temizle
        setRevealed(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
      showToast('success', type === 'env' ? 'Ortam silindi.' : 'Değişken silindi.');
    } catch (err) { showToast('error', parseApiError(err)); }
    finally       { setIsDeleting(false); setDeleteConfirm(null); }
  }, [deleteConfirm, showToast]);

  // ── Filtreler ─────────────────────────────────────────────────────
  // FIX: Türkçe güvenli arama
  const filteredEnvironments = useMemo(() => environments.filter(env => {
    const q = searchTerm.toLocaleLowerCase('tr-TR');
    return (
      (!q || env.name?.toLocaleLowerCase('tr-TR').includes(q) || env.url?.toLowerCase().includes(q)) &&
      (projectFilter === 'All' || String(env.project_id) === String(projectFilter))
    );
  }), [environments, searchTerm, projectFilter]);

  const filteredVariables = useMemo(() => variables.filter(v => {
    const q = searchTerm.toLocaleLowerCase('tr-TR');
    return (
      (!q || v.key?.toLocaleLowerCase('tr-TR').includes(q) || (!v.is_secret && v.value?.toLowerCase().includes(q))) &&
      (projectFilter === 'All' || String(v.project_id) === String(projectFilter)) &&
      (envFilter     === 'All' || String(v.env_id || '') === String(envFilter)) &&
      (typeFilter    === 'All' || (typeFilter === 'secret' ? v.is_secret : !v.is_secret))
    );
  }), [variables, searchTerm, projectFilter, envFilter, typeFilter]);

  const groupedVariables = useMemo(() => {
    const groups = {};
    filteredVariables.forEach(v => {
      const gKey = v.env_id ? `env:${v.env_id}` : 'global';
      if (!groups[gKey]) groups[gKey] = { label: getEnvName(v.env_id), items: [], isGlobal: !v.env_id };
      groups[gKey].items.push(v);
    });
    return Object.values(groups).sort((a, b) => {
      if (a.isGlobal) return 1;
      if (b.isGlobal) return -1;
      return a.label.localeCompare(b.label, 'tr');
    });
  }, [filteredVariables, getEnvName]);

  // FIX: Değişken panelinde proje seçilince ortam listesi filtrelenir — bu useMemo ile hesaplanıyor
  const filteredEnvsForVarForm = useMemo(() =>
    environments.filter(e => !varForm.project_id || String(e.project_id) === String(varForm.project_id))
  , [environments, varForm.project_id]);

  const hasFilter = !!(searchTerm || projectFilter !== 'All' || envFilter !== 'All' || typeFilter !== 'All');
  const clearFilters = useCallback(() => {
    setSearchTerm(''); setProjectFilter('All'); setEnvFilter('All'); setTypeFilter('All');
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative pb-20">

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
      <div className="flex flex-col lg:flex-row justify-between lg:items-end gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <Server size={24} className="text-indigo-500"/> Ortam ve Veri Yönetimi
          </h1>
          <div className="flex items-center gap-6">
            {[
              { id: 'environments', label: 'Ortamlar',             icon: <Globe size={15}/>,    count: environments.length },
              { id: 'variables',    label: 'Değişkenler & Sırlar', icon: <Database size={15}/>, count: variables.length },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} type="button"
                className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}>
                {tab.icon} {tab.label}
                {tab.count > 0 && (
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-md font-medium">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} type="button" title="Yenile"
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
            <RefreshCw size={16}/>
          </button>
          {can(PERM.envManage) && (
            <button type="button"
              onClick={activeTab === 'environments' ? () => openEnvPanel() : () => openVarPanel()}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 whitespace-nowrap text-sm">
              <Plus size={17}/> {activeTab === 'environments' ? 'Yeni Ortam' : 'Yeni Değişken'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0"/> {error}
          <button onClick={fetchData} type="button" className="ml-auto text-rose-600 hover:underline font-medium">Tekrar Dene</button>
        </div>
      )}

      {/* FİLTRELER */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl flex-1 min-w-[220px] focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input type="text"
            placeholder={activeTab === 'environments' ? 'Ortam veya URL ara...' : 'Key ara...'}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 w-full"/>
          {searchTerm && <button onClick={() => setSearchTerm('')} type="button"><X size={13} className="text-slate-400"/></button>}
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
          <Folder size={14} className="text-slate-400 shrink-0"/>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer">
            <option value="All">Tüm Projeler</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {activeTab === 'variables' && (
          <>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
              <Globe size={14} className="text-slate-400 shrink-0"/>
              <select value={envFilter} onChange={e => setEnvFilter(e.target.value)}
                className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer">
                <option value="All">Tüm Ortamlar</option>
                {/* FIX: Ortam listesi projectFilter'a göre filtreleniyor */}
                {environments
                  .filter(e => projectFilter === 'All' || String(e.project_id) === String(projectFilter))
                  .map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
              <Filter size={14} className="text-slate-400 shrink-0"/>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer">
                <option value="All">Tüm Türler</option>
                <option value="secret">Sadece Sırlar</option>
                <option value="normal">Sadece Değişkenler</option>
              </select>
            </div>
          </>
        )}
        {hasFilter && (
          <button onClick={clearFilters} type="button"
            className="text-xs text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 hover:border-indigo-300 transition-all">
            <X size={12}/> Temizle
          </button>
        )}
        <span className="text-xs text-slate-400 self-center ml-auto">
          {activeTab === 'environments' ? `${filteredEnvironments.length} ortam` : `${filteredVariables.length} değişken`}
        </span>
      </div>

      {/* ── ORTAMLAR ── */}
      {activeTab === 'environments' && (
        loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl"/>)}
          </div>
        ) : filteredEnvironments.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
            <Globe size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4"/>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {hasFilter ? 'Ortam Bulunamadı' : 'Henüz Ortam Yok'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
              {hasFilter ? 'Filtre kriterlerine uyan ortam yok.' : 'Test, staging ve production ortamlarını ekleyin.'}
            </p>
            {hasFilter
              ? <button onClick={clearFilters} type="button" className="text-indigo-600 font-medium hover:underline text-sm">Filtreyi Temizle</button>
              : can(PERM.envManage) && <button onClick={() => openEnvPanel()} type="button" className="text-indigo-600 font-medium hover:underline text-sm">Ortam Ekle</button>
            }
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* Ping uyarısı */}
            <div className="md:col-span-2 xl:col-span-3 flex items-center gap-2 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-2.5 rounded-xl text-xs font-medium">
              <AlertCircle size={13} className="shrink-0"/>
              Ping testi tarayıcıdan yapılır. CORS kısıtlaması olan URL'lerde sonuç yanıltıcı olabilir — gerçek erişim için backend loglarını kontrol edin.
            </div>
            {filteredEnvironments.map(env => {
              const ping        = pingStatus[env.id] || 'unknown';
              const pingSty     = getPingStyle(ping);
              const varCount    = variables.filter(v => String(v.env_id) === String(env.id)).length;
              const secretCount = variables.filter(v => String(v.env_id) === String(env.id) && v.is_secret).length;
              return (
                <div key={env.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all group relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${pingSty.dot}`}/>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{env.name || 'İsimsiz'}</h3>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1 pl-4">
                        <Folder size={10}/> {getProjectName(env.project_id)}
                      </p>
                    </div>
                    {can(PERM.envManage) && (
                      // FIX: data-dropdown attribute ile dropdown tıklama yönetimi
                      <div className="relative shrink-0" data-dropdown>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setActiveDropdown(prev => prev === `env-${env.id}` ? null : `env-${env.id}`); }}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          <MoreVertical size={15}/>
                        </button>
                        {activeDropdown === `env-${env.id}` && (
                          <div className="absolute right-0 top-8 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <button onClick={() => openEnvPanel(env)} type="button"
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors">
                              <Pencil size={13}/> Düzenle
                            </button>
                            <button type="button"
                              onClick={() => { setActiveTab('variables'); setEnvFilter(String(env.id)); setActiveDropdown(null); }}
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors">
                              <Key size={13}/> Değişkenleri Gör
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-slate-700"/>
                            <button type="button"
                              onClick={() => { setDeleteConfirm({ type: 'env', id: env.id, name: env.name }); setActiveDropdown(null); }}
                              className="w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-colors">
                              <Trash2 size={13}/> Sil
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* URL */}
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">{env.url || '—'}</span>
                    <div className="flex gap-1 shrink-0">
                      {env.url && (
                        <>
                          <button type="button" onClick={() => copyToClipboard(env.url, env.name)} title="Kopyala"
                            className="p-1 text-slate-300 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                            <Copy size={13}/>
                          </button>
                          <a href={env.url} target="_blank" rel="noopener noreferrer" title="Yeni sekmede aç"
                            onClick={e => e.stopPropagation()}
                            className="p-1 text-slate-300 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                            <ExternalLink size={13}/>
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {env.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 leading-relaxed">{env.description}</p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button type="button"
                      onClick={() => { setActiveTab('variables'); setEnvFilter(String(env.id)); }}
                      className="text-xs text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1">
                      <Key size={11}/> {varCount} değişken
                      {secretCount > 0 && <span className="text-rose-400 ml-0.5">({secretCount} sır)</span>}
                    </button>
                    <button type="button" onClick={() => pingUrl(env.id, env.url)} disabled={ping === 'testing'}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all disabled:cursor-not-allowed ${pingSty.btn}`}>
                      {ping === 'online'  ? <><Wifi size={12}/> Açık</> :
                       ping === 'offline' ? <><WifiOff size={12}/> Kapalı</> :
                       ping === 'testing' ? <><Loader2 size={12} className="animate-spin"/> Test...</> :
                       <><Zap size={12}/> Test Et</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── DEĞİŞKENLER ── */}
      {activeTab === 'variables' && (
        loading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <Skeleton className="h-7 w-36 rounded-lg"/>
                <Skeleton className="h-4 w-48"/>
                <Skeleton className="h-4 w-24 ml-auto"/>
              </div>
            ))}
          </div>
        ) : filteredVariables.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
            <Key size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4"/>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {hasFilter ? 'Değişken Bulunamadı' : 'Henüz Değişken Yok'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">
              {hasFilter ? 'Filtre kriterlerine uyan değişken yok.' : 'API Key, şifre veya token ekleyin.'}
            </p>
            {hasFilter
              ? <button onClick={clearFilters} type="button" className="text-indigo-600 font-medium hover:underline text-sm">Filtreyi Temizle</button>
              : can(PERM.envManage) && <button onClick={() => openVarPanel()} type="button" className="text-indigo-600 font-medium hover:underline text-sm">Değişken Ekle</button>
            }
          </div>
        ) : (
          <div className="space-y-4">
            {groupedVariables.map(group => (
              <div key={group.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Globe size={13} className={group.isGlobal ? 'text-indigo-400' : 'text-slate-400'}/>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{group.label}</span>
                  <span className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-md ml-auto">{group.items.length} kayıt</span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs uppercase text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                      <th className="px-6 py-3">Key</th>
                      <th className="px-6 py-3">Değer</th>
                      <th className="px-6 py-3 hidden sm:table-cell">Proje</th>
                      <th className="px-6 py-3">Tür</th>
                      {can(PERM.envManage) && <th className="px-6 py-3 text-right">İşlem</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {group.items.map(v => (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            {v.is_secret && <Lock size={11} className="text-rose-400 shrink-0"/>}
                            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded-md">
                              {v.key}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate max-w-[200px]"
                              title={!v.is_secret || revealed.has(v.id) ? v.value : undefined}>
                              {v.is_secret && !revealed.has(v.id) ? '•'.repeat(12) : (v.value || '—')}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity shrink-0">
                              {v.is_secret && (
                                <button type="button" onClick={() => toggleReveal(v.id)}
                                  title={revealed.has(v.id) ? 'Gizle' : 'Göster'}
                                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                  {revealed.has(v.id) ? <EyeOff size={13}/> : <Eye size={13}/>}
                                </button>
                              )}
                              {(!v.is_secret || revealed.has(v.id)) ? (
                                <button type="button" onClick={() => copyToClipboard(v.value, v.key)} title="Kopyala"
                                  className="p-1 text-slate-400 hover:text-indigo-500 transition-colors">
                                  <Copy size={13}/>
                                </button>
                              ) : (
                                // FIX: Sır gizliyken kopyala butonu disabled — sadece görsel
                                <span title="Önce göster butonuna basın" className="p-1 text-slate-200 dark:text-slate-700 cursor-not-allowed">
                                  <Lock size={13}/>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 hidden sm:table-cell">
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Folder size={10}/> {getProjectName(v.project_id)}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          {v.is_secret ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-800">
                              <Shield size={11}/> Sır
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg text-xs font-semibold">
                              <Key size={11}/> Değişken
                            </span>
                          )}
                        </td>
                        {can(PERM.envManage) && (
                          <td className="px-6 py-3.5 text-right relative" data-dropdown>
                            <button type="button"
                              onClick={e => { e.stopPropagation(); setActiveDropdown(prev => prev === `var-${v.id}` ? null : `var-${v.id}`); }}
                              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                              <MoreVertical size={15}/>
                            </button>
                            {activeDropdown === `var-${v.id}` && (
                              <div className="absolute right-8 top-8 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                <button onClick={() => openVarPanel(v)} type="button"
                                  className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors">
                                  <Pencil size={13}/> Düzenle
                                </button>
                                <div className="h-px bg-slate-100 dark:bg-slate-700"/>
                                <button type="button"
                                  onClick={() => { setDeleteConfirm({ type: 'var', id: v.id, name: v.key }); setActiveDropdown(null); }}
                                  className="w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-colors">
                                  <Trash2 size={13}/> Sil
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── PANEL OVERLAY ── */}
      {panel && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]" onClick={closePanel}/>}

      {/* ── ORTAM PANELİ ── */}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[520px] bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-300 flex flex-col ${panel?.type === 'env' ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <Globe size={16} className="text-indigo-500"/>
            </div>
            <h2 className="text-base font-bold dark:text-white">
              {panel?.mode === 'create' ? 'Yeni Ortam Ekle' : 'Ortamı Düzenle'}
            </h2>
          </div>
          <button onClick={closePanel} type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {panelError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={14} className="shrink-0"/> {panelError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Ortam Adı</label>
            <input type="text" value={envForm.name} onChange={e => setEnvForm({ ...envForm, name: e.target.value })}
              placeholder="Örn: Staging, Production, Dev-TR"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Bağlı Proje</label>
            <select value={envForm.project_id} onChange={e => setEnvForm({ ...envForm, project_id: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="" disabled>Proje seçiniz...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Base URL</label>
            <input type="text" value={envForm.url} onChange={e => setEnvForm({ ...envForm, url: e.target.value })}
              placeholder="https://api.staging.example.com"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all"/>
            {/* FIX: Canlı URL validasyon geri bildirimi */}
            {envForm.url && !isValidUrl(envForm.url) && (
              <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1">
                <AlertCircle size={11}/> Geçerli bir URL girin (http:// veya https://).
              </p>
            )}
            {envForm.url && isValidUrl(envForm.url) && (
              <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={11}/> Geçerli URL.
              </p>
            )}
            {!envForm.url && <p className="text-xs text-slate-400 mt-1.5">http:// veya https:// ile başlamalıdır.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText size={13}/> Açıklama <span className="text-slate-400 font-normal">(isteğe bağlı)</span>
            </label>
            <textarea rows={3} value={envForm.description} onChange={e => setEnvForm({ ...envForm, description: e.target.value })}
              placeholder="Bu ortam hakkında notlar..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"/>
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button onClick={closePanel} type="button"
            className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium text-sm transition-colors">
            İptal
          </button>
          <button onClick={handleEnvSubmit} disabled={isSubmitting} type="button"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
            {isSubmitting ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : <><Check size={14}/> Kaydet</>}
          </button>
        </div>
      </div>

      {/* ── DEĞİŞKEN PANELİ ── */}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[520px] bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-300 flex flex-col ${panel?.type === 'var' ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
              <Database size={16} className="text-rose-500"/>
            </div>
            <h2 className="text-base font-bold dark:text-white">
              {panel?.mode === 'create' ? 'Yeni Değişken / Sır' : 'Değişkeni Düzenle'}
            </h2>
          </div>
          <button onClick={closePanel} type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {panelError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={14} className="shrink-0"/> {panelError}
            </div>
          )}
          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 p-4 rounded-xl text-sm flex items-start gap-3">
            <Shield size={16} className="shrink-0 mt-0.5"/>
            <p>Değişkenleri testlerinizde <code className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">{'{{KEY}}'}</code> formatında kullanabilirsiniz.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Anahtar (Key) <span className="text-xs text-slate-400 font-normal">— Büyük harf, rakam, alt çizgi</span>
            </label>
            <input type="text" value={varForm.key}
              onChange={e => setVarForm({ ...varForm, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
              placeholder="ADMIN_PASSWORD"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Değer (Value)</label>
            <div className="relative">
              <input
                type={varForm.is_secret && !showVarValue ? 'password' : 'text'}
                value={varForm.value} onChange={e => setVarForm({ ...varForm, value: e.target.value })}
                placeholder="Değeri girin..."
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono transition-all"/>
              {varForm.is_secret && (
                <button type="button" onClick={() => setShowVarValue(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showVarValue ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 py-3 border-y border-slate-100 dark:border-slate-800">
            <input type="checkbox" id="is_secret" checked={varForm.is_secret}
              onChange={e => setVarForm({ ...varForm, is_secret: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"/>
            <div>
              <label htmlFor="is_secret" className="text-sm font-medium dark:text-white cursor-pointer">Sır olarak işaretle (maskelenir)</label>
              <p className="text-xs text-slate-400 mt-0.5">Şifreler, API anahtarları, token'lar için seçin.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Proje Kapsamı</label>
              <select value={varForm.project_id}
                onChange={e => setVarForm({ ...varForm, project_id: e.target.value, env_id: '' })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                <option value="">Global (Tüm Projeler)</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Ortam Kapsamı</label>
              <select value={varForm.env_id}
                onChange={e => setVarForm({ ...varForm, env_id: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                <option value="">Tüm Ortamlar</option>
                {/* FIX: filteredEnvsForVarForm useMemo ile hesaplanıyor — inline filter kaldırıldı */}
                {filteredEnvsForVarForm.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button onClick={closePanel} type="button"
            className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium text-sm transition-colors">
            İptal
          </button>
          <button onClick={handleVarSubmit} disabled={isSubmitting} type="button"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
            {isSubmitting ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : <><Check size={14}/> Kaydet</>}
          </button>
        </div>
      </div>

      {/* ── SİLME ONAY ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-rose-500"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white text-center mb-1">
              {deleteConfirm.type === 'env' ? 'Ortamı Sil' : 'Değişkeni Sil'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300">"{deleteConfirm.name}"</span> silinecek.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center mb-5">
              {deleteConfirm.type === 'env'
                ? 'Bu ortama bağlı tüm değişkenler de silinecek. Bu işlem geri alınamaz.'
                : 'Bu işlem geri alınamaz.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} type="button"
                className="flex-1 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium text-sm transition-colors">
                İptal
              </button>
              <button onClick={handleDelete} disabled={isDeleting} type="button"
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

export default Environments;