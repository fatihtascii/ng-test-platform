import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { testRunsApi, projectsApi, testCasesApi } from '../api';
import {
  Bug, Search, Filter, AlertCircle, CheckCircle2,
  Clock, ArrowRightCircle, Folder, X,
  RefreshCw, CheckSquare, Square, Copy, Check,
  TrendingDown, Zap, PlayCircle, Plus,
  ChevronLeft, ChevronRight, Trash2, Pencil,
  ChevronDown, ChevronUp, Save, Loader2
} from 'lucide-react';

// ── Sabitler ──────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'Open',        label: 'Açık',        emoji: '🔴', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  { value: 'In Progress', label: 'İnceleniyor', emoji: '🟡', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { value: 'Resolved',    label: 'Çözüldü',     emoji: '🟢', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  { value: 'Re-test',     label: 'Tekrar Test', emoji: '🔵', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
];
const SEVERITY_OPTIONS = ['Kritik', 'Yüksek', 'Orta', 'Düşük'];
const SEVERITY_CONFIG  = {
  'Kritik': { bg: 'bg-rose-500/10 text-rose-500',     badge: 'bg-rose-500 text-white' },
  'Yüksek': { bg: 'bg-orange-500/10 text-orange-500', badge: 'bg-orange-500 text-white' },
  'Orta':   { bg: 'bg-amber-500/10 text-amber-500',   badge: 'bg-amber-500 text-white' },
  'Düşük':  { bg: 'bg-blue-500/10 text-blue-500',     badge: 'bg-blue-400 text-white' },
};
const PAGE_SIZE  = 10;
const LS_KEY     = 'ng-defect-statuses';
const MANUAL_KEY = 'ng-manual-defects';
const HIDDEN_KEY = 'ng-hidden-auto-defects'; // ✅ YENİ: Silinen otomatik defectler için

const getSev         = (s) => SEVERITY_CONFIG[s] || SEVERITY_CONFIG['Orta'];
const getStatusOpt   = (s) => STATUS_OPTIONS.find(o => o.value === s);
const getStatusCls   = (s) => getStatusOpt(s)?.cls || 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
const getStatusLabel = (s) => { const o = getStatusOpt(s); return o ? `${o.emoji} ${o.label}` : s; };

// ✅ FİX: Eğer backend array dönerse string parse etmeye çalışıp çökmesin diye düzeltildi
const safeJSON = (s) => { 
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { 
    const p = typeof s === 'string' ? JSON.parse(s) : s; 
    return Array.isArray(p) ? p : []; 
  } catch { return []; } 
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Defect Modal ──────────────────────────────────────────────
const DefectModal = ({ mode, defect, projects, onClose, onSave }) => {
  const [form,   setForm]   = useState({ title: defect?.title || '', description: defect?.description || '', severity: defect?.severity || 'Orta', status: defect?.status || 'Open', projectId: defect?.projectId || projects[0]?.id || '' });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: typeof v === 'string' ? v : v.target.value }));

  const submit = async () => {
    if (!form.title.trim()) { setErr('Başlık zorunludur.'); return; }
    if (!form.projectId)    { setErr('Proje seçilmelidir.'); return; }
    setSaving(true); setErr('');
    try { await onSave(form); onClose(); }
    catch (e) { setErr(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bug size={18} className="text-rose-500"/>
            {mode === 'create' ? 'Yeni Defect Ekle' : 'Defect Düzenle'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X size={18}/></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 px-3 py-2.5 rounded-xl text-sm font-medium"><AlertCircle size={15}/> {err}</div>}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Başlık *</label>
            <input value={form.title} onChange={f('title')} placeholder="Hatanın kısa açıklaması..."
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-rose-500"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Açıklama / Hata Detayı</label>
            <textarea value={form.description} onChange={f('description')} rows={4} placeholder="Hata nasıl oluştu? Adımlar, beklenen/gerçekleşen durum..."
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-rose-500 resize-none"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Proje *</label>
              <select value={form.projectId} onChange={f('projectId')} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
                <option value="">Proje Seç</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Öncelik</label>
              <select value={form.severity} onChange={f('severity')} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
                {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Statü</label>
            <select value={form.status} onChange={f('status')} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">İptal</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60 shadow-sm shadow-rose-600/20">
            {saving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}
            {saving ? 'Kaydediliyor...' : (mode === 'create' ? 'Ekle' : 'Güncelle')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Silme Onayı ───────────────────────────────────────────────
const DeleteConfirm = ({ title, onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200 text-center">
      <div className="w-14 h-14 bg-rose-100 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={24} className="text-rose-500"/></div>
      <h3 className="font-bold text-slate-900 dark:text-white mb-2">Defect'i Sil</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed"><strong className="text-slate-700 dark:text-slate-300">{title}</strong> defectini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
      <div className="flex gap-3">
        <button onClick={onCancel} disabled={loading} className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">İptal</button>
        <button onClick={onConfirm} disabled={loading} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm shadow-rose-600/20">
          {loading ? <Loader2 size={15} className="animate-spin"/> : <Trash2 size={15}/>}
          {loading ? 'Siliniyor...' : 'Evet, Sil'}
        </button>
      </div>
    </div>
  </div>
);

// ── Ana Bileşen ────────────────────────────────────────────────
const Defects = () => {
  const navigate = useNavigate();
  const { can }  = usePermission();

  const [rawData, setRawData] = useState({ testRuns: [], projects: [], testCases: [] });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  
  // ✅ YENİ: Toast bildirimleri
  const [toast, setToast] = useState(null);

  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('All');
  const [filterProject,  setFilterProject]  = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [page,           setPage]           = useState(1);
  const [expandedId,     setExpandedId]     = useState(null);
  const [selected,       setSelected]       = useState(new Set());
  const [bulkStatus,     setBulkStatus]     = useState('');
  const [isBulkSaving,   setIsBulkSaving]   = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [modal,          setModal]          = useState(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);
  const [isDeleting,     setIsDeleting]     = useState(false);

  const [statuses,      setStatuses]      = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY)            || '{}'); } catch { return {}; } });
  const [statusTimes,   setStatusTimes]   = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY + '-times') || '{}'); } catch { return {}; } });
  const [manualDefects, setManualDefects] = useState(() => { try { return JSON.parse(localStorage.getItem(MANUAL_KEY)        || '[]'); } catch { return []; } });
  
  // ✅ YENİ: Otomatik oluşturulan hataların silinenlerini tutan state
  const [hiddenAutoDefects, setHiddenAutoDefects] = useState(() => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } });

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Veri Çekme ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [runsRes, projsRes, casesRes] = await Promise.allSettled([
        testRunsApi.getAll(), projectsApi.getAll(), testCasesApi.getAll(),
      ]);
      setRawData({
        testRuns:  runsRes.status  === 'fulfilled' ? runsRes.value.data  : [],
        projects:  projsRes.status === 'fulfilled' ? projsRes.value.data : [],
        testCases: casesRes.status === 'fulfilled' ? casesRes.value.data : [],
      });
      if (runsRes.status !== 'fulfilled') setError('Test koşumları yüklenemedi.');
    } catch { setError('Sunucuya bağlanılamadı.'); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Otomasyon defectlerini RUN bazlı grupla ─────────────────
  const autoDefects = useMemo(() => {
    const bugs = [];
    (rawData.testRuns || []).forEach(run => {
      const bugId = `BUG-${run.id}`;
      
      // ✅ FİX: Eğer bu otomatik hata daha önce silinmişse (gizlenmişse) pas geç!
      if (hiddenAutoDefects.includes(bugId)) return;

      const project     = (rawData.projects || []).find(p => p.id === run.project_id);
      const failedItems = safeJSON(run.results).filter(r =>
        r.status === 'Failed' || r.status === 'Başarısız' ||
        r.run_status === 'Failed' || r.run_status === 'Başarısız'
      );
      if (failedItems.length === 0) return;

      const sevOrder     = { 'Kritik': 4, 'Yüksek': 3, 'Orta': 2, 'Düşük': 1 };
      const failedDetails = failedItems.map((r, idx) => {
        const caseId = r.case_id ?? r.test_case_id ?? r.id ?? null;
        const realTC = caseId != null ? (rawData.testCases || []).find(tc => tc.id === caseId) : null;
        return {
          caseId,
          title:        realTC?.title || r.test_case_title || (caseId != null ? `Test #${caseId}` : `Test ${idx + 1}`),
          errorMessage: r.actual_result || r.error || null,
          severity:     realTC?.priority || r.test_case_priority || 'Orta',
        };
      });
      const topSev = failedDetails.reduce((max, item) =>
        (sevOrder[item.severity] || 2) > (sevOrder[max] || 2) ? item.severity : max, 'Orta'
      );
      bugs.push({
        id: bugId, type: 'auto',
        title:        `${run.name || 'İsimsiz Koşum'} — ${failedDetails.length} Hatalı Test`,
        failedCount:  failedDetails.length,
        failedDetails,
        projectId:    project?.id   ?? null,
        projectName:  project?.name ?? 'Bilinmeyen Proje',
        runId:        run.id,
        runName:      run.name ?? 'İsimsiz Koşum',
        severity:     topSev,
        status:       statuses[bugId]    ?? 'Open',
        updatedAt:    statusTimes[bugId] ?? null,
        createdAt:    run.created_at     ?? null,
      });
    });
    return bugs.reverse();
  }, [rawData, statuses, statusTimes, hiddenAutoDefects]);

  const allDefects = useMemo(() => [
    ...manualDefects.map(d => ({ ...d, type: 'manual', status: statuses[d.id] ?? d.status ?? 'Open' })),
    ...autoDefects,
  ], [autoDefects, manualDefects, statuses]);

  // ── Filtreleme ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allDefects.filter(b =>
      (!q || b.title.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)) &&
      (filterStatus   === 'All' || b.status   === filterStatus)   &&
      (filterProject  === 'All' || String(b.projectId) === String(filterProject)) &&
      (filterSeverity === 'All' || b.severity === filterSeverity)
    );
  }, [allDefects, searchQuery, filterStatus, filterProject, filterSeverity]);

  const hasFilter = searchQuery || filterStatus !== 'All' || filterProject !== 'All' || filterSeverity !== 'All';
  const clearFilters = useCallback(() => { setSearchQuery(''); setFilterStatus('All'); setFilterProject('All'); setFilterSeverity('All'); setPage(1); }, []);
  useEffect(() => { setPage(1); }, [searchQuery, filterStatus, filterProject, filterSeverity]);

  // ── Pagination ───────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => ({
    total:      allDefects.length,
    open:       allDefects.filter(d => d.status === 'Open').length,
    inProgress: allDefects.filter(d => d.status === 'In Progress').length,
    retest:     allDefects.filter(d => d.status === 'Re-test').length,
    resolved:   allDefects.filter(d => d.status === 'Resolved').length,
  }), [allDefects]);

  // ── Statü Kaydet ─────────────────────────────────────────────
  const saveStatus = useCallback((bugId, newStatus) => {
    const now = new Date().toISOString();
    const ns  = { ...statuses,    [bugId]: newStatus };
    const nt  = { ...statusTimes, [bugId]: now };
    setStatuses(ns); setStatusTimes(nt);
    try { localStorage.setItem(LS_KEY, JSON.stringify(ns)); localStorage.setItem(LS_KEY + '-times', JSON.stringify(nt)); } catch { /* ignore */ }
    showToast('success', 'Statü başarıyla güncellendi.');
  }, [statuses, statusTimes]);

  const handleBulkStatus = useCallback(async () => {
    if (!bulkStatus || !selected.size) return;
    setIsBulkSaving(true);
    const now = new Date().toISOString();
    const ns  = { ...statuses }; const nt = { ...statusTimes };
    [...selected].forEach(id => { ns[id] = bulkStatus; nt[id] = now; });
    setStatuses(ns); setStatusTimes(nt);
    try { localStorage.setItem(LS_KEY, JSON.stringify(ns)); localStorage.setItem(LS_KEY + '-times', JSON.stringify(nt)); } catch { /* ignore */ }
    setSelected(new Set()); setBulkStatus(''); setIsBulkSaving(false);
    showToast('success', `${selected.size} adet kaydın statüsü güncellendi.`);
  }, [bulkStatus, selected, statuses, statusTimes]);

  // ── Seçim ────────────────────────────────────────────────────
  const toggleSelect    = useCallback((id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const toggleSelectAll = useCallback(() => {
    setSelected(selected.size === paginated.length && paginated.length > 0 ? new Set() : new Set(paginated.map(b => b.id)));
  }, [selected.size, paginated]);

  // ── CRUD ─────────────────────────────────────────────────────
  const saveManualDefect = useCallback(async (form) => {
    const proj = rawData.projects.find(p => String(p.id) === String(form.projectId));
    if (modal?.mode === 'create') {
      const nd = {
        id: `BUG-M-${Date.now()}`, type: 'manual',
        title: form.title.trim(), description: form.description || '',
        severity: form.severity, projectId: Number(form.projectId),
        projectName: proj?.name || 'Bilinmeyen', runId: null, runName: 'Manuel Ekleme',
        failedCount: 0, failedDetails: [], status: form.status,
        updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      };
      const upd = [nd, ...manualDefects];
      setManualDefects(upd);
      saveStatus(nd.id, form.status);
      try { localStorage.setItem(MANUAL_KEY, JSON.stringify(upd)); } catch { /* ignore */ }
      showToast('success', 'Defect başarıyla eklendi.');
    } else {
      const upd = manualDefects.map(d => d.id === modal.defect.id
        ? { ...d, title: form.title.trim(), description: form.description || '', severity: form.severity, projectId: Number(form.projectId), projectName: proj?.name || d.projectName, status: form.status, updatedAt: new Date().toISOString() }
        : d
      );
      setManualDefects(upd);
      saveStatus(modal.defect.id, form.status);
      try { localStorage.setItem(MANUAL_KEY, JSON.stringify(upd)); } catch { /* ignore */ }
      showToast('success', 'Defect detayları güncellendi.');
    }
  }, [modal, manualDefects, rawData.projects, saveStatus]);

  // ✅ FİX: Silme işlemi artık hem manuel hem de otomatik hataları başarıyla siliyor!
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    
    if (deleteConfirm.id.startsWith('BUG-M-')) {
      // Manuel eklenenleri direkt state ve local'den sil
      const upd = manualDefects.filter(d => d.id !== deleteConfirm.id);
      setManualDefects(upd);
      try { localStorage.setItem(MANUAL_KEY, JSON.stringify(upd)); } catch { /* ignore */ }
    } else {
      // Otomatikleri "gizlenenler" listesine at (Çünkü koşum silinmiyor)
      const upd = [...hiddenAutoDefects, deleteConfirm.id];
      setHiddenAutoDefects(upd);
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(upd)); } catch { /* ignore */ }
    }
    
    setSelected(prev => { const n = new Set(prev); n.delete(deleteConfirm.id); return n; });
    setIsDeleting(false); 
    setDeleteConfirm(null);
    showToast('success', 'Defect sistemden kaldırıldı.');
  }, [deleteConfirm, manualDefects, hiddenAutoDefects]);

  const handleCopyReport = useCallback(() => {
    if (!filtered.length) return;
    navigator.clipboard.writeText(filtered.map(b => `[${b.id}] ${b.title} | ${b.severity} | ${getStatusLabel(b.status)}`).join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [filtered]);

  const formatTime = (iso) => {
    if (!iso) return null;
    const d = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (d < 60) return `${d} sn önce`; if (d < 3600) return `${Math.floor(d/60)} dk önce`;
    if (d < 86400) return `${Math.floor(d/3600)} saat önce`;
    return new Date(iso).toLocaleDateString('tr-TR');
  };

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Skeleton className="h-8 w-56"/>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-20 rounded-2xl"/>)}</div>
      <Skeleton className="h-16 rounded-2xl"/>
      <div className="space-y-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24 rounded-2xl"/>)}</div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 relative">

      {/* ✅ YENİ: Toast Bildirimi */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border animate-in slide-in-from-bottom-5 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-300' 
                                   : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/40 dark:border-rose-800 dark:text-rose-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {modal && <DefectModal mode={modal.mode} defect={modal.defect} projects={rawData.projects} onClose={() => setModal(null)} onSave={saveManualDefect}/>}
      {deleteConfirm && <DeleteConfirm title={deleteConfirm.title} onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} loading={isDeleting}/>}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Bug size={24} className="text-rose-500"/> Hata Takip</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Başarısız test koşumlarından çıkan hatalar ve takipleri.</p>
        </div>
        <div className="flex items-center gap-2">
          {can('defects.manage') && (
            <button onClick={() => setModal({ mode: 'create' })}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm shadow-rose-600/20">
              <Plus size={16}/> Defect Ekle
            </button>
          )}
          <button onClick={handleCopyReport} disabled={!filtered.length}
            className={`flex items-center gap-2 px-3 py-2 border rounded-xl font-medium text-sm transition-colors ${copied ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'} disabled:opacity-50`}>
            {copied ? <Check size={16}/> : <Copy size={16}/>}
            <span className="hidden sm:inline">{copied ? 'Kopyalandı!' : 'Kopyala'}</span>
          </button>
          <button onClick={fetchAll} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"><RefreshCw size={17}/></button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-800 px-4 py-3 rounded-xl text-sm font-medium">
          <AlertCircle size={16} className="shrink-0"/> {error}
          <button onClick={fetchAll} className="ml-auto underline underline-offset-2">Tekrar Dene</button>
        </div>
      )}

      {/* STAT KARTLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label:'Toplam',      value:stats.total,     fv:'All',         icon:<TrendingDown size={18}/>, bg:'bg-slate-100 dark:bg-slate-800',  text:'text-slate-600 dark:text-slate-400',     border:'border-slate-200 dark:border-slate-700' },
          { label:'Açık',        value:stats.open,       fv:'Open',        icon:<AlertCircle size={18}/>,  bg:'bg-rose-500/10',                  text:'text-rose-600 dark:text-rose-400',       border:'border-rose-500/20' },
          { label:'İnceleniyor', value:stats.inProgress, fv:'In Progress', icon:<Clock size={18}/>,        bg:'bg-amber-500/10',                 text:'text-amber-600 dark:text-amber-400',     border:'border-amber-500/20' },
          { label:'Tekrar Test', value:stats.retest,     fv:'Re-test',     icon:<Zap size={18}/>,          bg:'bg-blue-500/10',                  text:'text-blue-600 dark:text-blue-400',       border:'border-blue-500/20' },
          { label:'Çözüldü',     value:stats.resolved,   fv:'Resolved',    icon:<CheckCircle2 size={18}/>, bg:'bg-emerald-500/10',               text:'text-emerald-600 dark:text-emerald-400', border:'border-emerald-500/20' },
        ].map(s => (
          <button key={s.label} onClick={() => setFilterStatus(filterStatus === s.fv && s.fv !== 'All' ? 'All' : s.fv)}
            className={`p-4 rounded-2xl border shadow-sm flex items-center gap-3 text-left transition-all w-full outline-none ${filterStatus === s.fv && s.fv !== 'All' ? `${s.bg} ${s.border} ring-2 ring-offset-1 scale-[1.02]` : `bg-white dark:bg-slate-900 ${s.border} hover:shadow-md`}`}>
            <div className={`p-2.5 ${s.bg} rounded-xl ${s.text} shrink-0`}>{s.icon}</div>
            <div><p className={`text-xs font-semibold ${s.text}`}>{s.label}</p><p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{s.value}</p></div>
          </button>
        ))}
      </div>

      {/* TOPLU AKSİYON */}
      {selected.size > 0 && can('defects.manage') && (
        <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 px-4 py-3 rounded-xl animate-in fade-in duration-200 shadow-sm">
          <span className="text-sm font-bold text-rose-700 dark:text-rose-400">{selected.size} Hata Seçildi</span>
          <div className="flex items-center gap-2 ml-auto">
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              className="text-xs font-semibold bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-700 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 outline-none cursor-pointer">
              <option value="">Toplu Statü Ata...</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>)}
            </select>
            <button onClick={handleBulkStatus} disabled={!bulkStatus || isBulkSaving}
              className="px-3 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors">
              {isBulkSaving ? 'İşleniyor...' : <><CheckCircle2 size={14}/> Uygula</>}
            </button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg"><X size={16}/></button>
          </div>
        </div>
      )}

      {/* FİLTRE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center">
        <div className="relative w-full md:flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
          <input type="text" placeholder="Hata ID, Başlık..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 dark:text-white text-sm"/>
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={14}/></button>}
        </div>
        <div className="flex w-full md:w-auto flex-wrap gap-3">
          {[
            { icon:<Folder size={14}/>, value:filterProject,  onChange:setFilterProject,  options:[['All','Tüm Projeler'], ...(rawData.projects||[]).map(p=>[p.id,p.name])] },
            { icon:<Bug size={14}/>,    value:filterSeverity, onChange:setFilterSeverity, options:[['All','Tüm Öncelikler'],['Kritik','Kritik'],['Yüksek','Yüksek'],['Orta','Orta'],['Düşük','Düşük']] },
            { icon:<Filter size={14}/>, value:filterStatus,   onChange:setFilterStatus,   options:[['All','Tüm Statüler'],...STATUS_OPTIONS.map(o=>[o.value,`${o.emoji} ${o.label}`])] },
          ].map((f,i) => (
            <div key={i} className="flex flex-1 md:flex-none items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
              <span className="text-slate-400 shrink-0">{f.icon}</span>
              <select value={f.value} onChange={e => f.onChange(e.target.value)} className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer w-full font-medium">
                {f.options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
        {hasFilter && <button onClick={clearFilters} className="w-full md:w-auto text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 px-3 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors hover:bg-rose-100"><X size={14}/> Temizle</button>}
      </div>

      {/* LİSTE */}
      <div className="space-y-3">
        {allDefects.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5"><CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400"/></div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Sıfır Hata! 🎉</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">Başarısız test koşumu bulunmuyor.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl">
            <Search size={24} className="mx-auto text-slate-400 mb-3"/>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Kayıt Bulunamadı</h3>
            <button onClick={clearFilters} className="mt-2 text-rose-600 dark:text-rose-400 font-bold hover:underline text-sm">Filtreleri Temizle</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 pb-1">
              {can('defects.manage') && (
                <button onClick={toggleSelectAll} className="text-slate-500 hover:text-rose-600 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  {selected.size > 0 && selected.size === paginated.length ? <><CheckSquare size={16} className="text-rose-500"/> Seçimi Kaldır</> : <><Square size={16}/> Tümünü Seç</>}
                </button>
              )}
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"/>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{filtered.length} Hata · Sayfa {page}/{totalPages}</span>
            </div>

            {paginated.map(bug => {
              const sev        = getSev(bug.severity);
              const isSelected = selected.has(bug.id);
              const isExpanded = expandedId === bug.id;

              return (
                <div key={bug.id} className={`bg-white dark:bg-slate-900 border rounded-2xl transition-all shadow-sm overflow-hidden ${isSelected ? 'border-rose-400 dark:border-rose-600 ring-1 ring-rose-400/50' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'}`}>
                  {isSelected && <div className="h-0.5 bg-rose-500 w-full"/>}
                  <div className="p-4 md:p-5">
                    <div className="flex items-start md:items-center flex-col md:flex-row gap-4">

                      {/* Sol */}
                      <div className="flex items-center gap-4 shrink-0">
                        {can('defects.manage') && (
                          <button onClick={() => toggleSelect(bug.id)} className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors">
                            {isSelected ? <CheckSquare size={20} className="text-rose-500"/> : <Square size={20}/>}
                          </button>
                        )}
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sev.bg}`}><Bug size={18}/></div>
                      </div>

                      {/* Orta */}
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-xs font-bold font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md shrink-0">{bug.id}</span>
                          <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md shrink-0 ${sev.badge}`}>{bug.severity}</span>
                          {bug.type === 'manual' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 shrink-0">Manuel</span>
                          )}
                          {formatTime(bug.updatedAt) && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1 ml-auto shrink-0"><Clock size={11}/> {formatTime(bug.updatedAt)}</span>
                          )}
                        </div>

                        <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{bug.title}</h3>

                        {bug.type === 'manual' && bug.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{bug.description}</p>
                        )}

                        {/* Expand butonu */}
                        {bug.type === 'auto' && bug.failedCount > 0 && (
                          <button onClick={() => setExpandedId(isExpanded ? null : bug.id)}
                            className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 transition-colors">
                            {isExpanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                            {bug.failedCount} hatalı test {isExpanded ? '(gizle)' : '(detay)'}
                          </button>
                        )}

                        <div className="flex items-center gap-2 mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800 max-w-[160px] truncate">
                            <Folder size={11} className="text-indigo-400 shrink-0"/> {bug.projectName}
                          </span>
                          <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800 max-w-[180px] truncate">
                            <PlayCircle size={11} className="text-emerald-400 shrink-0"/> {bug.runName}
                          </span>
                        </div>
                      </div>

                      {/* Sağ: Aksiyonlar */}
                      <div className="flex items-center justify-end w-full md:w-auto gap-2 shrink-0 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                        {can('defects.manage') && (
                          <select value={bug.status} onChange={e => saveStatus(bug.id, e.target.value)}
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold outline-none cursor-pointer border-2 transition-all focus:ring-2 focus:ring-rose-400 ${getStatusCls(bug.status)}`}>
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>)}
                          </select>
                        )}
                        {can('defects.manage') && bug.type === 'manual' && (
                          <button onClick={() => setModal({ mode: 'edit', defect: bug })}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all border border-slate-200 dark:border-slate-700" title="Düzenle">
                            <Pencil size={16}/>
                          </button>
                        )}
                        {can('defects.manage') && (
                          <button onClick={() => setDeleteConfirm({ id: bug.id, title: bug.title })}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all border border-slate-200 dark:border-slate-700" title="Sil">
                            <Trash2 size={16}/>
                          </button>
                        )}
                        {bug.type === 'auto' && bug.runId && (
                          <button onClick={() => navigate(`/test-runs/${bug.runId}`)}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all border border-slate-200 dark:border-slate-700" title="Koşum Detayı">
                            <PlayCircle size={16}/>
                          </button>
                        )}
                        {bug.type === 'auto' && (
                          <button onClick={() => navigate(`/defects/${bug.id}-0`)}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all border border-slate-200 dark:border-slate-700" title="Hata Detayı">
                            <ArrowRightCircle size={18}/>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expand: Hatalı adımlar */}
                    {isExpanded && bug.failedDetails?.length > 0 && (
                      <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2 animate-in fade-in duration-200">
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Hatalı Test Adımları</p>
                        {bug.failedDetails.map((item, idx) => {
                          const is = getSev(item.severity);
                          return (
                            <div key={idx} className="flex items-start gap-3 p-3 bg-rose-50/50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/20 rounded-xl">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5 ${is.badge}`}>{idx + 1}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{item.title}</p>
                                {item.errorMessage && (
                                  <p className="text-xs font-mono text-rose-600 dark:text-rose-400 mt-1 line-clamp-2 break-words">⚠ {item.errorMessage}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* PAGİNATION */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-3.5 shadow-sm">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {((page-1)*PAGE_SIZE)+1}–{Math.min(page*PAGE_SIZE, filtered.length)} / {filtered.length} hata
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(1)} disabled={page===1} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-xs font-bold">«</button>
            <button onClick={() => setPage(p=>p-1)} disabled={page===1} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronLeft size={16}/></button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pg = totalPages <= 5 ? i+1 : page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i;
              return <button key={pg} onClick={() => setPage(pg)} className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${pg===page ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{pg}</button>;
            })}
            <button onClick={() => setPage(p=>p+1)} disabled={page===totalPages} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronRight size={16}/></button>
            <button onClick={() => setPage(totalPages)} disabled={page===totalPages} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 text-xs font-bold">»</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Defects;