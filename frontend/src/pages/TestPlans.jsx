import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { testPlansApi, projectsApi, testCasesApi } from '../api';
import PermissionGuard from '../components/PermissionGuard';
import {
  ClipboardList, Plus, Search, MoreVertical, X, Pencil, Trash2,
  AlertCircle, CheckCircle2, Folder, Calendar, PlayCircle,
  Loader2, CircleDot, Ban, Filter, MessageSquare, Bug,
  CheckCheck, RefreshCw, Zap
} from 'lucide-react'; 

// ── Sabitler ───────────────────────────────────────────────────
const RUN_STATUSES = ['Bekliyor', 'Başarılı', 'Başarısız', 'Atlandı'];

// ── Yardımcılar ────────────────────────────────────────────────
const getPlanStatusStyle = (status) => {
  switch (status) {
    case 'Tamamlandı': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
    case 'Beklemede':  return 'bg-amber-50  dark:bg-amber-500/10  text-amber-600  dark:text-amber-400  border border-amber-200  dark:border-amber-800';
    case 'Aktif':
    default:           return 'bg-blue-50   dark:bg-blue-500/10   text-blue-600   dark:text-blue-400   border border-blue-200   dark:border-blue-800';
  }
};

const getRunStatusStyle = (s) => {
  switch (s) {
    case 'Başarılı':  return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700';
    case 'Başarısız': return 'bg-rose-50    dark:bg-rose-900/20    text-rose-700    dark:text-rose-400    border-rose-300    dark:border-rose-700';
    case 'Atlandı':   return 'bg-slate-100  dark:bg-slate-800      text-slate-500   dark:text-slate-400   border-slate-300   dark:border-slate-600';
    case 'Bekliyor':
    default:          return 'bg-violet-50  dark:bg-violet-900/20  text-violet-600  dark:text-violet-400  border-violet-200  dark:border-violet-700';
  }
};

const getPriorityStyle = (p) => {
  switch (p) {
    case 'Kritik': return 'text-rose-600 dark:text-rose-400';
    case 'Yüksek': return 'text-orange-500 dark:text-orange-400';
    case 'Orta':   return 'text-indigo-500 dark:text-indigo-400';
    default:       return 'text-slate-400 dark:text-slate-500';
  }
};

const getPlanStats = (plan) => {
  const items   = plan.items ?? [];
  const total   = items.length;
  const passed  = items.filter(i => i.run_status === 'Başarılı').length;
  const failed  = items.filter(i => i.run_status === 'Başarısız').length;
  const skipped = items.filter(i => i.run_status === 'Atlandı').length;
  const pending = items.filter(i => i.run_status === 'Bekliyor').length;
  const done    = passed + failed + skipped;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, passed, failed, skipped, pending, done, progress };
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Ana Bileşen ────────────────────────────────────────────────
const TestPlans = () => {
  const { can } = usePermission();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [plans, setPlans]         = useState([]);
  const [projects, setProjects]   = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Create / Edit panel
  const [isPanelOpen, setIsPanelOpen]   = useState(false);
  const [panelMode, setPanelMode]       = useState('create');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError]       = useState('');
  const defaultForm = { title: '', description: '', status: 'Aktif', project_id: '', start_date: '', end_date: '' };
  const [form, setForm] = useState(defaultForm);

  // Run panel
  const [runPlan, setRunPlan]       = useState(null);
  const [isRunOpen, setIsRunOpen]   = useState(false);
  const [addTcSearch, setAddTcSearch] = useState('');
  const [updatingItem, setUpdatingItem] = useState(null);
  const [itemNotes, setItemNotes]   = useState({});
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  
  // Defect
  const [isDefectCreating, setIsDefectCreating] = useState(false);

  // Silme
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting]       = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Veri Çekme ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [planRes, projRes, tcRes] = await Promise.allSettled([
        testPlansApi.getAll(),
        projectsApi.getAll(),
        testCasesApi.getAll(),
      ]);
      if (planRes.status === 'fulfilled') setPlans(planRes.value.data);
      else setError('Test planları yüklenemedi.');
      if (projRes.status === 'fulfilled') setProjects(projRes.value.data);
      if (tcRes.status  === 'fulfilled') setTestCases(tcRes.value.data);
    } catch {
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const close = () => setActiveDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [fetchAll]);

  const refreshRunPlan = useCallback(async (planId) => {
    try {
      const res = await testPlansApi.getOne(planId);
      const updated = res.data;
      setRunPlan(updated);
      setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      console.warn('Plan yenilenemedi:', err);
    }
  }, []);

  // ── Plan CRUD ────────────────────────────────────────────────
  const openCreatePanel = () => {
    setPanelMode('create');
    setForm({ ...defaultForm, project_id: projects[0]?.id || '' });
    setFormError('');
    setIsPanelOpen(true);
  };

  const openEditPanel = (plan) => {
    setPanelMode('edit');
    setForm({
      title:       plan.title,
      description: plan.description || '',
      status:      plan.status,
      project_id:  plan.project_id,
      start_date:  plan.start_date || '',
      end_date:    plan.end_date   || '',
      id:          plan.id,
    });
    setFormError('');
    setIsPanelOpen(true);
    setActiveDropdown(null);
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.title.trim()) { setFormError('Plan başlığı boş olamaz.'); return; }
    if (!form.project_id)   { setFormError('Proje seçiniz.'); return; }
    setIsSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(), description: form.description || null,
        status: form.status, project_id: parseInt(form.project_id),
        start_date: form.start_date || null, end_date: form.end_date || null,
      };
      const res = panelMode === 'create'
        ? await testPlansApi.create(payload)
        : await testPlansApi.update(form.id, payload);
      const saved = res.data;
      if (panelMode === 'create') {
        setPlans(prev => [{ ...saved, items: saved.items ?? [] }, ...prev]);
      } else {
        setPlans(prev => prev.map(p => p.id === saved.id ? { ...saved, items: saved.items ?? [] } : p));
      }
      setIsPanelOpen(false);
      showToast('success', panelMode === 'create' ? 'Plan oluşturuldu.' : 'Plan güncellendi.');
    } catch (err) {
      setFormError(err.message || 'Kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      await testPlansApi.remove(id);
      setPlans(prev => prev.filter(p => p.id !== id));
      showToast('success', 'Plan silindi.');
    } catch (err) {
      showToast('error', err.message || 'Silinemedi.');
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // ── Run Panel & Optimistic UI İşlemleri ───────────────────────
  const openRunPanel = async (plan) => {
    setAddTcSearch('');
    setItemNotes({});
    setIsRunOpen(true);
    setActiveDropdown(null);
    setRunPlan(plan);
    await refreshRunPlan(plan.id);
  };

  const handleAddTestCase = async (tcId) => {
    const tc = testCases.find(t => t.id === tcId);
    if (!tc) return;

    const tempItem = {
      id: `temp-${Date.now()}`,
      test_case_id: tc.id,
      test_case_title: tc.title,
      test_case_priority: tc.priority,
      run_status: 'Bekliyor',
      note: null
    };

    setRunPlan(prev => ({
      ...prev,
      items: [...(prev.items || []), tempItem]
    }));

    try {
      await testPlansApi.addItem(runPlan.id, { test_case_id: tcId });
      await refreshRunPlan(runPlan.id);
    } catch {
      setRunPlan(prev => ({
        ...prev,
        items: prev.items.filter(i => i.id !== tempItem.id)
      }));
      showToast('error', 'Eklenemedi. Sunucuya ulaşılamadı.');
    }
  };

  const handleRemoveItem = async (itemId) => {
    const previousItems = [...(runPlan.items || [])];

    setRunPlan(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== itemId)
    }));

    try {
      await testPlansApi.removeItem(runPlan.id, itemId);
      await refreshRunPlan(runPlan.id);
    } catch {
      setRunPlan(prev => ({ ...prev, items: previousItems }));
      showToast('error', 'Test case kaldırılamadı. Bağlantınızı kontrol edin.');
    }
  };

  const handleUpdateItemStatus = async (itemId, runStatus, note = null) => {
    setUpdatingItem(itemId);
    
    const previousItems = [...(runPlan.items || [])];
    const noteToSend = note !== null ? note : (itemNotes[itemId] ?? null);

    setRunPlan(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === itemId ? { ...i, run_status: runStatus, note: noteToSend } : i)
    }));

    try {
      await testPlansApi.updateItem(runPlan.id, itemId, { run_status: runStatus, note: noteToSend });
      await refreshRunPlan(runPlan.id);
    } catch {
      setRunPlan(prev => ({ ...prev, items: previousItems }));
      showToast('error', 'Statü güncellenemedi.');
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleBulkUpdate = async (status) => {
    if (!runPlan?.items?.length) return;
    const targets = runPlan.items.filter(i => i.run_status === 'Bekliyor');
    if (targets.length === 0) { showToast('error', 'Güncellenecek "Bekliyor" statüsünde test yok.'); return; }

    const previousItems = [...(runPlan.items || [])];

    setRunPlan(prev => ({
      ...prev,
      items: prev.items.map(i => i.run_status === 'Bekliyor' ? { ...i, run_status: status } : i)
    }));

    setIsBulkLoading(true);
    try {
      await Promise.all(targets.map(item =>
        testPlansApi.updateItem(runPlan.id, item.id, { run_status: status, note: null })
      ));
      await refreshRunPlan(runPlan.id);
      showToast('success', `${targets.length} test "${status}" olarak işaretlendi.`);
    } catch {
      setRunPlan(prev => ({ ...prev, items: previousItems }));
      showToast('error', 'Toplu güncelleme tamamlanamadı.');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleMarkPlanComplete = async () => {
    if (!runPlan) return;
    const stats = getPlanStats(runPlan);
    if (stats.pending > 0) {
      showToast('error', `${stats.pending} test hâlâ bekliyor. Önce tüm testleri tamamlayın.`);
      return;
    }
    
    setRunPlan(prev => ({ ...prev, status: 'Tamamlandı' }));

    try {
      await testPlansApi.update(runPlan.id, {
        title: runPlan.title, description: runPlan.description,
        status: 'Tamamlandı', project_id: runPlan.project_id,
        start_date: runPlan.start_date, end_date: runPlan.end_date,
      });
      await refreshRunPlan(runPlan.id);
      showToast('success', 'Plan başarıyla tamamlandı.');
    } catch {
      setRunPlan(prev => ({ ...prev, status: 'Aktif' }));
      showToast('error', 'Plan güncellenemedi.');
    }
  };

  // 🕷️ 1-Tık Defect (Hata) Raporlama Entegrasyonu
  const handleCreateDefect = async (tcId, tcTitle, note, projectId) => {
    if (!note || !note.trim()) { 
      showToast('error', 'Defect açmadan önce lütfen hata detaylarını (Hata Notu) yazın ve kaydedin.'); 
      return; 
    }
    setIsDefectCreating(true);
    try {
      const payload = {
        title: `[Oto-Defect] ${tcTitle} - Plan Hatası`,
        description: `**Bağlı Test Planı:** ${runPlan?.title}\n**Test Case ID:** #${tcId}\n\n**Bulgu / Hata Notu:**\n${note}`,
        status: 'Açık',
        priority: 'Yüksek',
        project_id: projectId
      };

      await import('../api').then(m => m.default.post('/test-runs', payload));
      showToast('success', '🔥 Hata (Defect) başarıyla oluşturuldu ve sisteme eklendi!');
    } catch {
      showToast('error', 'Defect API servisine ulaşılamadı.');
    } finally {
      setIsDefectCreating(false);
    }
  };


  // ── Filtreleme ───────────────────────────────────────────────
  const filtered = useMemo(() =>
    plans.filter(p => {
      const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'All' || p.status === statusFilter;
      return matchSearch && matchStatus;
    }),
  [plans, searchTerm, statusFilter]);

  const availableTCs = useMemo(() =>
    !runPlan ? [] : testCases.filter(tc =>
      tc.project_id === runPlan.project_id &&
      !runPlan.items?.some(i => i.test_case_id === tc.id) &&
      tc.title.toLowerCase().includes(addTcSearch.toLowerCase())
    ),
  [testCases, runPlan, addTcSearch]);

  const getProjectName = (id) => projects.find(p => p.id === id)?.name || '-';

  // ── Render ───────────────────────────────────────────────────
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
            <ClipboardList size={24} className="text-indigo-500"/> Test Planları
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Test koşumlarını planlayın ve yönetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors" title="Yenile">
            <RefreshCw size={17}/>
          </button>
          <PermissionGuard permission="test_plans.create">
            <button onClick={openCreatePanel}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 whitespace-nowrap">
              <Plus size={18}/> Yeni Plan
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Özet İstatislikleri */}
      {!loading && plans.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Toplam Plan',  value: plans.length,                                                       color: 'text-slate-600 dark:text-slate-300', bg: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800' },
            { label: 'Aktif',        value: plans.filter(p => p.status === 'Aktif').length,                     color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-800' },
            { label: 'Tamamlandı',   value: plans.filter(p => p.status === 'Tamamlandı').length,                color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800' },
            { label: 'Beklemede',    value: plans.filter(p => p.status === 'Beklemede').length,                 color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border p-4 rounded-2xl flex items-center gap-3 shadow-sm`}>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color} tabular-nums`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0"/> {error}
          <button onClick={fetchAll} className="ml-auto text-rose-600 hover:underline font-medium">Tekrar Dene</button>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl flex-1 min-w-[200px] focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-sm">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input type="text" placeholder="Plan ara..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 w-full"/>
          {searchTerm && <button onClick={() => setSearchTerm('')}><X size={13} className="text-slate-400"/></button>}
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl shadow-sm">
          <Filter size={15} className="text-slate-400 shrink-0"/>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer">
            <option value="All">Tüm Durumlar</option>
            <option value="Aktif">Aktif</option>
            <option value="Tamamlandı">Tamamlandı</option>
            <option value="Beklemede">Beklemede</option>
          </select>
        </div>
        {(searchTerm || statusFilter !== 'All') && (
          <button onClick={() => { setSearchTerm(''); setStatusFilter('All'); }}
            className="text-xs text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-1">
            <X size={12}/> Temizle
          </button>
        )}
        <span className="text-xs text-slate-400 self-center ml-auto">{filtered.length} plan</span>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          {Array.from({length: 3}).map((_,i) => <Skeleton key={i} className="h-14 w-full"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
          <ClipboardList size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4"/>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {searchTerm || statusFilter !== 'All' ? 'Sonuç Bulunamadı' : 'Henüz Plan Yok'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {searchTerm || statusFilter !== 'All' ? 'Filtre kriterlerine uyan plan yok.' : 'İlk test planınızı oluşturun.'}
          </p>
          {!(searchTerm || statusFilter !== 'All') && can('test_plans.create') && (
            <button onClick={openCreatePanel} className="text-indigo-600 font-medium hover:underline text-sm">
              Yeni Plan Oluştur
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 font-semibold tracking-wide">
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Proje</th>
                <th className="px-6 py-4">Tarih Aralığı</th>
                <th className="px-6 py-4">İlerleme</th>
                <th className="px-6 py-4">Durum</th>
                <th className="px-6 py-4 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filtered.map(plan => {
                const stats = getPlanStats(plan);
                return (
                  <tr key={plan.id} onClick={() => openRunPanel(plan)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{plan.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400">#{plan.id} · {stats.total} test</p>
                        {stats.total > 0 && (
                          <div className="flex items-center gap-1 text-xs">
                            {stats.passed > 0  && <span className="text-emerald-500">✓{stats.passed}</span>}
                            {stats.failed > 0  && <span className="text-rose-500">✗{stats.failed}</span>}
                            {stats.pending > 0 && <span className="text-violet-400">◎{stats.pending}</span>}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                        <Folder size={13} className="text-slate-400"/>
                        {getProjectName(plan.project_id)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {plan.start_date || plan.end_date ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <Calendar size={13} className="text-slate-400"/>
                          {plan.start_date || '?'} → {plan.end_date || '?'}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600 italic">Tarih yok</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {stats.total > 0 ? (
                        <div className="w-28">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">%{stats.progress}</span>
                            <span className="text-slate-400">{stats.done}/{stats.total}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(stats.passed/stats.total)*100}%` }}/>
                            <div className="bg-rose-500 h-full transition-all"    style={{ width: `${(stats.failed/stats.total)*100}%` }}/>
                            <div className="bg-slate-400 h-full transition-all"   style={{ width: `${(stats.skipped/stats.total)*100}%` }}/>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600 italic">Test yok</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getPlanStatusStyle(plan.status)}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown === plan.id ? null : plan.id); }}
                        className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <MoreVertical size={17}/>
                      </button>
                      {activeDropdown === plan.id && (
                        <div className="absolute right-8 top-10 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                          
                          {/* 🚀 KOŞUM BAŞLAT KISAYOLU */}
                          {can('test_runs.create') && (
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/test-runs?plan_id=${plan.id}&project_id=${plan.project_id}`); }} 
                              className="w-full px-4 py-2.5 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 flex items-center gap-2 transition-colors border-b border-slate-100 dark:border-slate-700">
                              <PlayCircle size={14}/> Koşum Başlat
                            </button>
                          )}

                          {can('test_plans.edit') && (
                            <button onClick={e => { e.stopPropagation(); openEditPanel(plan); }}
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                              <Pencil size={14}/> Düzenle
                            </button>
                          )}
                          {can('test_plans.delete') && (
                            <button onClick={e => { e.stopPropagation(); setDeleteConfirm(plan.id); setActiveDropdown(null); }}
                              className="w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-colors border-t border-slate-100 dark:border-slate-700">
                              <Trash2 size={14}/> Sil
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CREATE / EDIT PANEL ── */}
      {isPanelOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]" onClick={() => setIsPanelOpen(false)}/>}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[520px] bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-300 flex flex-col ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
              <ClipboardList size={16} className="text-indigo-500"/>
            </div>
            <h2 className="text-base font-bold dark:text-white">{panelMode === 'create' ? 'Yeni Test Planı' : 'Planı Düzenle'}</h2>
          </div>
          <button onClick={() => setIsPanelOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {formError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={15} className="shrink-0"/> {formError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Plan Başlığı</label>
            <input type="text" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))}
              placeholder="Örn: Sprint 1 Regresyon Testi"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Açıklama <span className="text-slate-400 font-normal text-xs">(isteğe bağlı)</span>
            </label>
            <textarea rows={3} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
              placeholder="Plan hakkında kısa bir açıklama..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Proje</label>
            <select value={form.project_id} onChange={e => setForm(p => ({...p, project_id: e.target.value}))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="" disabled>Proje seçiniz</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Başlangıç Tarihi</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({...p, start_date: e.target.value}))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Bitiş Tarihi</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({...p, end_date: e.target.value}))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Durum</label>
            <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="Aktif">Aktif</option>
              <option value="Beklemede">Beklemede</option>
              <option value="Tamamlandı">Tamamlandı</option>
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button onClick={() => setIsPanelOpen(false)} className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-sm font-medium">İptal</button>
          <button onClick={handleSubmit} disabled={isSubmitting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
            {isSubmitting ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : <><Zap size={14}/> Kaydet</>}
          </button>
        </div>
      </div>

      {/* ── RUN PANEL ── */}
      {isRunOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80]" onClick={() => setIsRunOpen(false)}/>}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[660px] bg-white dark:bg-slate-900 shadow-2xl z-[90] transform transition-transform duration-300 flex flex-col ${isRunOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {runPlan && (() => {
          const stats = getPlanStats(runPlan);
          return (
            <>
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-base font-bold dark:text-white flex items-center gap-2">
                    <PlayCircle size={17} className="text-indigo-500"/> {runPlan.title}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {getProjectName(runPlan.project_id)} · {stats.total} test ·{' '}
                    <span className={`font-semibold ${getPlanStatusStyle(runPlan.status).split(' ')[2]}`}>{runPlan.status}</span>
                  </p>
                </div>
                <button onClick={() => setIsRunOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X size={18}/>
                </button>
              </div>

              {/* Scrollable İçerik Alanı */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-12">

                {/* İlerleme özeti */}
                {stats.total > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 space-y-4 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Genel İlerleme</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">%{stats.progress}</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
                      <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${(stats.passed/stats.total)*100}%` }}/>
                      <div className="bg-rose-500 h-full transition-all duration-500"    style={{ width: `${(stats.failed/stats.total)*100}%` }}/>
                      <div className="bg-slate-400 h-full transition-all duration-500"   style={{ width: `${(stats.skipped/stats.total)*100}%` }}/>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Başarılı',  value: stats.passed,  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                        { label: 'Başarısız', value: stats.failed,  color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-500/10' },
                        { label: 'Atlandı',   value: stats.skipped, color: 'text-slate-500 dark:text-slate-400',     bg: 'bg-slate-100 dark:bg-slate-800' },
                        { label: 'Bekliyor',  value: stats.pending, color: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-50 dark:bg-violet-500/10' },
                      ].map(s => (
                        <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                          <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {can('test_runs.execute') && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button onClick={() => handleBulkUpdate('Başarılı')} disabled={isBulkLoading || stats.pending === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                          <CheckCheck size={13}/> Bekleyenleri Geçir
                        </button>
                        <button onClick={() => handleBulkUpdate('Atlandı')} disabled={isBulkLoading || stats.pending === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                          <Ban size={13}/> Bekleyenleri Atla
                        </button>
                        {stats.pending === 0 && runPlan.status !== 'Tamamlandı' && (
                          <button onClick={handleMarkPlanComplete}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-colors ml-auto">
                            <CheckCircle2 size={13}/> Planı Tamamlandı İşaretle
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Test Adımları */}
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Plana Ekli Testler</h3>
                  {stats.total === 0 ? (
                    <div className="text-center py-10 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/30">
                      <CircleDot size={28} className="mx-auto mb-2 opacity-30"/>
                      <p className="text-sm font-medium">Henüz test eklenmedi.</p>
                      {can('test_plans.edit') && <p className="text-xs mt-1">Aşağıdaki arama çubuğunu kullanarak plana test ekleyebilirsiniz.</p>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {runPlan.items.map(item => (
                        <div key={item.id} className={`border rounded-xl p-4 transition-all shadow-sm ${
                          item.run_status === 'Başarılı'  ? 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-100 dark:border-emerald-900/30' :
                          item.run_status === 'Başarısız' ? 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-100 dark:border-rose-900/30' :
                          'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                        }`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.test_case_title}</p>
                              {item.test_case_priority && (
                                <span className={`text-xs font-bold mt-0.5 inline-block ${getPriorityStyle(item.test_case_priority)}`}>
                                  {item.test_case_priority} Öncelik
                                </span>
                              )}
                            </div>
                            {can('test_plans.edit') && (
                              <button onClick={() => handleRemoveItem(item.id)}
                                className="text-slate-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors shrink-0 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                title="Testi Plandan Çıkar">
                                <X size={15}/>
                              </button>
                            )}
                          </div>

                          {/* Statü Butonları */}
                          <div className="flex flex-wrap gap-2 mt-3">
                            {RUN_STATUSES.map(s => (
                              <button key={s} onClick={() => handleUpdateItemStatus(item.id, s)}
                                disabled={updatingItem === item.id || !can('test_runs.execute')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                  item.run_status === s
                                    ? getRunStatusStyle(s) + ' shadow-sm'
                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}>
                                {updatingItem === item.id && item.run_status === s ? <Loader2 size={12} className="animate-spin inline mr-1"/> : null}
                                {s}
                              </button>
                            ))}
                          </div>

                          {/* Başarısız Not Alanı & DEFECT ENTEGRASYONU */}
                          {item.run_status === 'Başarısız' && can('test_runs.execute') && (
                            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300 bg-rose-50/50 dark:bg-rose-900/10 p-4 rounded-xl border border-rose-100 dark:border-rose-900/30">
                              <label className="text-xs font-bold text-rose-500 flex items-center gap-1.5 mb-2">
                                <MessageSquare size={13}/> Hata Notu / Bulgular
                              </label>
                              <div className="flex gap-2">
                                <input type="text"
                                  placeholder="Örn: Butona tıklanmıyor, 500 dönüyor..."
                                  value={itemNotes[item.id] || item.note || ''}
                                  onChange={e => setItemNotes(prev => ({...prev, [item.id]: e.target.value}))}
                                  className="flex-1 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 outline-none focus:border-rose-400 dark:text-white transition-colors placeholder:text-slate-400"/>
                                <button onClick={() => handleUpdateItemStatus(item.id, 'Başarısız', itemNotes[item.id] ?? item.note)}
                                  className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                                  Notu Kaydet
                                </button>
                              </div>
                              {item.note && !itemNotes[item.id] && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5 bg-white/50 dark:bg-slate-900/50 px-2 py-1 rounded-md">
                                  <CheckCircle2 size={12} className="text-emerald-500"/> Kayıtlı Not: <span className="font-medium text-slate-700 dark:text-slate-300">{item.note}</span>
                                </p>
                              )}

                              {/* 🕷️ DEFECT BUTONU */}
                              <div className="mt-3 pt-3 border-t border-rose-100 dark:border-rose-900/50">
                                <button 
                                  onClick={() => handleCreateDefect(item.test_case_id, item.test_case_title, itemNotes[item.id] ?? item.note, runPlan.project_id)}
                                  disabled={isDefectCreating}
                                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20 disabled:opacity-50">
                                  {isDefectCreating ? <Loader2 size={14} className="animate-spin"/> : <Bug size={14}/>}
                                  Defect (Hata) Raporla
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Salt Okunur Not Gösterimi */}
                          {item.run_status === 'Başarısız' && !can('test_runs.execute') && item.note && (
                            <div className="mt-3 bg-rose-50 dark:bg-rose-900/10 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30">
                              <span className="text-xs font-bold text-rose-500 flex items-center gap-1.5 mb-1"><MessageSquare size={12}/> Hata Notu:</span>
                              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{item.note}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Test Case Ekleme Arama ve Listesi */}
                {can('test_plans.edit') && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Plana Yeni Test Ekle</h3>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl mb-3 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-inner">
                      <Search size={16} className="text-slate-400 shrink-0"/>
                      <input type="text" placeholder="Projedeki test senaryolarında ara..." value={addTcSearch}
                        onChange={e => setAddTcSearch(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm font-medium text-slate-700 dark:text-slate-200 w-full placeholder:text-slate-400 placeholder:font-normal"/>
                      {addTcSearch && <button onClick={() => setAddTcSearch('')} className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><X size={13} className="text-slate-400"/></button>}
                    </div>
                    
                    {availableTCs.length === 0 ? (
                      <p className="text-sm font-medium text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                        {addTcSearch ? 'Arama kriterinize uygun test bulunamadı.' : 'Bu projeye ait mevcut tüm testler zaten plana eklenmiş.'}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                        {availableTCs.map(tc => (
                          <button key={tc.id} onClick={() => handleAddTestCase(tc.id)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all text-left group">
                            <div>
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{tc.title}</p>
                              <span className={`text-xs font-bold mt-1 inline-block ${getPriorityStyle(tc.priority)}`}>{tc.priority}</span>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/20 transition-colors">
                              <Plus size={16} className="text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0 transition-colors"/>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* ── SİLME ONAY MODALI ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-900 rounded-full flex items-center justify-center mx-auto mb-5">
              <Trash2 size={24} className="text-rose-500"/>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Test Planını Sil</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Bu işlem geri alınamaz. Plan ve plana ait tüm test statüleri kalıcı olarak silinecek. Onaylıyor musunuz?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-3 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 rounded-xl transition-colors text-sm">Vazgeç</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-lg shadow-rose-600/20">
                {isDeleting ? <Loader2 size={16} className="animate-spin"/> : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestPlans;