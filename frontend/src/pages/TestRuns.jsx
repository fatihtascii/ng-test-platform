import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import {
  PlayCircle, Search, MoreVertical, X, Pencil, Trash2, Folder,
  CheckCircle2, Clock, Play, Plus, Check, SkipForward,
  ChevronDown, ChevronUp, Filter, AlertCircle, Loader2,
  ChevronRight, Save, CheckCheck, Ban, MessageSquare, Bug, ClipboardList
} from 'lucide-react';

// ── Sabitler ──────────────────────────────────────────────────────
// FIX: Magic string yerine merkezi sabitler — tüm status kontrolleri buradan
const RUN_STATUSES = ['Aktif', 'Beklemede', 'Tamamlandı'];

// ── Yardımcılar ───────────────────────────────────────────────────
const safeParseResults = (str) => {
  if (!str) return [];
  try { const p = JSON.parse(str); return Array.isArray(p) ? p : []; }
  catch { return []; }
};

const getTestCaseType = (descStr) => {
  if (!descStr) return 'Diğer';
  try { return JSON.parse(descStr).type || 'Diğer'; } catch { return 'Diğer'; }
};

const getCardBgStyle = (status, isExpanded) => {
  if (isExpanded) return 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 shadow-md ring-1 ring-indigo-500/20';
  if (status === 'Passed')  return 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 opacity-80';
  if (status === 'Failed')  return 'bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30';
  if (status === 'Skipped') return 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30 opacity-80';
  return 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80';
};

// FIX: API hata mesajını güvenli parse et
const parseApiError = async (res) => {
  try {
    const d = await res.json();
    if (Array.isArray(d.detail)) return d.detail.map(e => e.msg || String(e)).join(', ');
    return d.detail || 'Bir hata oluştu.';
  } catch { return 'Sunucu hatası.'; }
};

const RunStatusBadge = ({ status }) => {
  if (status === 'Tamamlandı') return <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg font-semibold border border-emerald-200 dark:border-emerald-800/50 text-xs flex items-center gap-1"><CheckCircle2 size={12}/> Tamamlandı</span>;
  if (status === 'Beklemede')  return <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg font-semibold border border-amber-200 dark:border-amber-800/50 text-xs flex items-center gap-1"><Clock size={12}/> Beklemede</span>;
  return <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg font-semibold border border-indigo-200 dark:border-indigo-800/50 text-xs flex items-center gap-1"><PlayCircle size={12}/> Aktif</span>;
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// FIX: defaultForm bileşen dışında — her render'da yeni obje oluşturmuyor
const makeDefaultForm = (firstProjectId = '') => ({
  name: '', description: '', status: 'Aktif',
  project_id: firstProjectId, test_plan_id: '',
});

// ── Ana Bileşen ────────────────────────────────────────────────────
const TestRuns = () => {
  const { can }  = usePermission();
  const navigate = useNavigate();

  const [testRuns,  setTestRuns]  = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [testPlans, setTestPlans] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [searchTerm,     setSearchTerm]     = useState('');
  const [projectFilter,  setProjectFilter]  = useState('All');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Panel State
  const [isPanelOpen,       setIsPanelOpen]       = useState(false);
  const [modalMode,         setModalMode]         = useState('create');
  const [isSubmitting,      setIsSubmitting]       = useState(false);
  const [formError,         setFormError]         = useState('');
  const [currentTestRun,    setCurrentTestRun]    = useState(() => makeDefaultForm());

  // Silme State
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting,    setIsDeleting]    = useState(false);

  // FIX: Toast timer ref — memory leak önlemi
  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const API_BASE = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000';

  // Runner State
  const [isRunnerOpen,        setIsRunnerOpen]        = useState(false);
  const [runningTestRun,      setRunningTestRun]      = useState(null);
  const [projectTestCases,    setProjectTestCases]    = useState([]);
  const [currentRunResults,   setCurrentRunResults]   = useState([]);
  const [expandedCaseId,      setExpandedCaseId]      = useState(null);
  const [runnerSearch,        setRunnerSearch]        = useState('');
  const [runnerTypeFilter,    setRunnerTypeFilter]    = useState('All');
  const [runnerStatusFilter,  setRunnerStatusFilter]  = useState('All');
  const [isSavingRun,         setIsSavingRun]         = useState(false);
  const [hasUnsavedChanges,   setHasUnsavedChanges]   = useState(false);
  const [isDefectCreating,    setIsDefectCreating]    = useState(false);
  // FIX: Runner yüklenirken loading state eklendi
  const [isRunnerLoading,     setIsRunnerLoading]     = useState(false);

  // ── Veri Çekme ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [projRes, runRes, plansRes] = await Promise.all([
        fetch(`${API_BASE}/projects`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/test-runs`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/test-plans`).catch(() => ({ ok: false })),
      ]);
      if (projRes.ok)  setProjects(await projRes.json());
      if (plansRes.ok) setTestPlans(await plansRes.json());
      if (runRes.ok) {
        const data = await runRes.json();
        setTestRuns(data.sort((a, b) => b.id - a.id));
      }
      if (!projRes.ok || !runRes.ok) setError('Bazı veriler yüklenemedi.');
    } catch {
      setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchData();
    // FIX: data-dropdown attribute ile dropdown dışı tıklamada kapat
    const close = (e) => { if (!e.target.closest('[data-dropdown]')) setActiveDropdown(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [fetchData]);

  // ── CRUD İşlemleri ──────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setFormError('');
    if (!currentTestRun.name.trim()) { setFormError('Koşum adı boş olamaz.'); return; }
    if (!currentTestRun.project_id)  { setFormError('Proje seçiniz.'); return; }
    setIsSubmitting(true);
    try {
      const url    = modalMode === 'create' ? `${API_BASE}/test-runs` : `${API_BASE}/test-runs/${currentTestRun.id}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';

      const payload = {
        ...currentTestRun,
        project_id:   Number(currentTestRun.project_id),
        // FIX: test_plan_id boş string yerine null gönder
        test_plan_id: currentTestRun.test_plan_id ? Number(currentTestRun.test_plan_id) : null,
        results:      currentTestRun.results || '[]',
      };

      // FIX: project_id NaN ise erken durdur
      if (isNaN(payload.project_id)) { setFormError('Geçersiz proje seçimi.'); setIsSubmitting(false); return; }

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsPanelOpen(false); fetchData();
        showToast('success', modalMode === 'create' ? 'Koşum başarıyla oluşturuldu.' : 'Koşum güncellendi.');
      } else {
        setFormError(await parseApiError(res));
      }
    } catch { setFormError('Sunucuya ulaşılamadı.'); }
    finally  { setIsSubmitting(false); }
  }, [currentTestRun, modalMode, API_BASE, fetchData, showToast]);

  const handleDelete = useCallback(async (id) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/test-runs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTestRuns(prev => prev.filter(r => r.id !== id));
        showToast('success', 'Koşum kalıcı olarak silindi.');
      } else {
        showToast('error', await parseApiError(res));
      }
    } catch { showToast('error', 'Sunucuya ulaşılamadı.'); }
    finally  { setIsDeleting(false); setDeleteConfirm(null); }
  }, [API_BASE, showToast]);

  const openCreatePanel = useCallback(() => {
    setModalMode('create');
    setCurrentTestRun(makeDefaultForm(projects[0]?.id || ''));
    setFormError(''); setIsPanelOpen(true);
  }, [projects]);

  const openEditPanel = useCallback((run) => {
    setModalMode('edit');
    setCurrentTestRun(run);
    setFormError(''); setIsPanelOpen(true); setActiveDropdown(null);
  }, []);

  // ── TEST RUNNER ──────────────────────────────────────────────────
  const openTestRunner = useCallback(async (run) => {
    setRunningTestRun(run);
    setIsRunnerOpen(true);
    setActiveDropdown(null);
    setRunnerSearch(''); setRunnerTypeFilter('All'); setRunnerStatusFilter('All');
    setHasUnsavedChanges(false);
    setIsRunnerLoading(true); // FIX: loading başlat

    try {
      const res = await fetch(`${API_BASE}/test-cases`);
      if (!res.ok) throw new Error('Test senaryoları alınamadı.');

      const all      = await res.json();
      let filtered   = all.filter(tc => tc.project_id === run.project_id);

      // Test planı bağlıysa filtrele
      if (run.test_plan_id) {
        const plan = testPlans.find(p => p.id === run.test_plan_id);
        if (plan) {
          let planCaseIds = [];
          try {
            planCaseIds = typeof plan.test_cases === 'string'
              ? JSON.parse(plan.test_cases)
              : (Array.isArray(plan.test_cases) ? plan.test_cases : []);
          } catch {}
          if (planCaseIds.length > 0) {
            filtered = filtered.filter(tc => planCaseIds.includes(tc.id));
          }
        }
      }

      setProjectTestCases(filtered);
      const existing = safeParseResults(run.results);

      const results = filtered.map(tc => {
        const found = existing.find(r => r.test_case_id === tc.id);
        return found || { test_case_id: tc.id, status: 'Pending', actual_result: '' };
      });
      setCurrentRunResults(results);

      // İlk Pending teste aç
      const firstPending = filtered.find(tc => {
        const r = existing.find(r => r.test_case_id === tc.id);
        return !r || r.status === 'Pending';
      });
      setExpandedCaseId(firstPending?.id ?? filtered[0]?.id ?? null);

    } catch (err) {
      showToast('error', err.message || 'Test senaryoları yüklenemedi.');
    } finally {
      setIsRunnerLoading(false); // FIX: loading bitir
    }
  }, [API_BASE, testPlans, showToast]);

  const closeTestRunner = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('Kaydedilmemiş değişiklikleriniz var! Çıkmak istediğinize emin misiniz?')) return;
    }
    setIsRunnerOpen(false);
    setRunningTestRun(null);
    // FIX: Runner state'ini temizle — eski veri sonraki açılışta görünmesin
    setProjectTestCases([]);
    setCurrentRunResults([]);
    setExpandedCaseId(null);
  }, [hasUnsavedChanges]);

  const updateTestCaseStatus = useCallback((e, tcId, status) => {
    e.stopPropagation();
    if (!can('test_runs.execute')) return;

    setCurrentRunResults(prev => prev.map(r => r.test_case_id === tcId ? { ...r, status } : r));
    setHasUnsavedChanges(true);

    if (status === 'Failed') {
      // Başarısız olursa kart açık kalsın, defect girilebilsin
      setExpandedCaseId(tcId);
    } else if (status === 'Passed' || status === 'Skipped') {
      // FIX: currentRunResults closure yerine functional update içinde sonraki testi bul
      setCurrentRunResults(prev => {
        const idx = projectTestCases.findIndex(c => c.id === tcId);
        if (idx !== -1) {
          for (let i = idx + 1; i < projectTestCases.length; i++) {
            const nextRes = prev.find(r => r.test_case_id === projectTestCases[i].id);
            if (!nextRes || nextRes.status === 'Pending') {
              setExpandedCaseId(projectTestCases[i].id);
              break;
            }
          }
        }
        return prev;
      });
    }
  }, [can, projectTestCases]);

  const updateTestCaseNote = useCallback((tcId, note) => {
    if (!can('test_runs.execute')) return;
    setCurrentRunResults(prev => prev.map(r => r.test_case_id === tcId ? { ...r, actual_result: note } : r));
    setHasUnsavedChanges(true);
  }, [can]);

  const handleCreateDefect = useCallback(async (tcId, tcTitle, note) => {
    if (!note || !note.trim()) {
      showToast('error', 'Defect açmadan önce lütfen hata detaylarını yazın.');
      return;
    }
    if (!runningTestRun) return;
    setIsDefectCreating(true);
    try {
      const payload = {
        title:       `[Oto-Defect] ${tcTitle} - Koşum Hatası`,
        description: `**Test Koşumu:** ${runningTestRun.name}\n**Test Case ID:** #${tcId}\n\n**Bulgu / Hata Notu:**\n${note}`,
        status:      'Açık',
        priority:    'Yüksek',
        project_id:  runningTestRun.project_id,
      };
      const res = await fetch(`${API_BASE}/defects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('success', '🔥 Hata (Defect) başarıyla oluşturuldu ve sisteme eklendi!');
      } else {
        showToast('error', await parseApiError(res));
      }
    } catch { showToast('error', 'Defect API servisine ulaşılamadı.'); }
    finally  { setIsDefectCreating(false); }
  }, [API_BASE, runningTestRun, showToast]);

  const handleBulkStatusChange = useCallback((status) => {
    if (!can('test_runs.execute')) return;
    setCurrentRunResults(prev => prev.map(r => r.status === 'Pending' ? { ...r, status } : r));
    setHasUnsavedChanges(true);
    showToast('success', `Tüm bekleyen testler "${status}" olarak işaretlendi.`);
  }, [can, showToast]);

  const saveTestRunProgress = useCallback(async () => {
    if (!runningTestRun || !can('test_runs.execute')) return;
    setIsSavingRun(true);
    try {
      const updated = { ...runningTestRun, results: JSON.stringify(currentRunResults) };
      const res = await fetch(`${API_BASE}/test-runs/${runningTestRun.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setRunningTestRun(updated);
        setHasUnsavedChanges(false);
        fetchData();
        showToast('success', 'İlerleme ara kayıt olarak kaydedildi.');
      } else {
        showToast('error', await parseApiError(res));
      }
    } catch { showToast('error', 'Bağlantı hatası, kaydedilemedi.'); }
    finally  { setIsSavingRun(false); }
  }, [runningTestRun, currentRunResults, API_BASE, can, fetchData, showToast]);

  const finishTestRun = useCallback(async () => {
    if (!runningTestRun || !can('test_runs.execute')) return;
    // FIX: Hâlâ pending test varsa uyar — sessizce Tamamlandı yapma
    const pendingCount = currentRunResults.filter(r => r.status === 'Pending').length;
    if (pendingCount > 0) {
      if (!window.confirm(`${pendingCount} test hâlâ "Bekliyor" durumunda. Yine de koşumu tamamlamak istiyor musunuz?`)) return;
    }
    setIsSavingRun(true);
    try {
      const updated = { ...runningTestRun, status: 'Tamamlandı', results: JSON.stringify(currentRunResults) };
      const res = await fetch(`${API_BASE}/test-runs/${runningTestRun.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        setHasUnsavedChanges(false);
        setIsRunnerOpen(false);
        setRunningTestRun(null);
        setProjectTestCases([]);
        setCurrentRunResults([]);
        fetchData();
        showToast('success', 'Koşum tamamlandı ve başarıyla kaydedildi.');
      } else {
        showToast('error', await parseApiError(res));
      }
    } catch { showToast('error', 'Sunucuya ulaşılamadı.'); }
    finally  { setIsSavingRun(false); }
  }, [runningTestRun, currentRunResults, API_BASE, can, fetchData, showToast]);

  // ── Yardımcı Hesaplamalar ────────────────────────────────────────
  const calculateProgress = useCallback((resultsStr) => {
    const r = safeParseResults(resultsStr);
    if (!r.length) return { passed: 0, failed: 0, skipped: 0, total: 0, passedCount: 0, failedCount: 0, pendingCount: 0 };
    const t = r.length;
    const p = r.filter(x => x.status === 'Passed').length;
    const f = r.filter(x => x.status === 'Failed').length;
    const s = r.filter(x => x.status === 'Skipped').length;
    return {
      passed: Math.round((p / t) * 100),
      failed: Math.round((f / t) * 100),
      skipped: Math.round((s / t) * 100),
      total: t, passedCount: p, failedCount: f,
      pendingCount: t - (p + f + s),
    };
  }, []);

  const renderTestCaseDetails = useCallback((descStr) => {
    if (!descStr) return null;
    try {
      const parsed = JSON.parse(descStr);
      const steps = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.steps) ? parsed.steps : null);
      if (!steps || steps.length === 0) return <p className="text-sm text-slate-500 italic mt-2">Bu senaryo için adım girilmemiş.</p>;
      return (
        <div className="mt-4 space-y-3">
          {steps.map((step, idx) => (
            <div key={idx} className="bg-slate-100/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-sm shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">{idx + 1}</div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Aksiyon</span><p className="text-slate-700 dark:text-slate-300">{step.action}</p></div>
                  <div><span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block mb-1">Beklenen Sonuç</span><p className="text-slate-700 dark:text-slate-300">{step.expectedResult || '-'}</p></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    } catch { return <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{descStr}</p>; }
  }, []);

  // ── Memoize Edilmiş Türetilmiş Veriler ───────────────────────────
  const getProjectName  = useCallback((id) => projects.find(p => p.id === id)?.name || '—', [projects]);
  const getTestPlanName = useCallback((id) => testPlans.find(p => p.id === id)?.name || '', [testPlans]);

  const filteredRuns = useMemo(() => testRuns.filter(run => {
    // FIX: Türkçe güvenli arama
    const matchSearch  = run.name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'));
    const matchProject = projectFilter === 'All' || run.project_id === Number(projectFilter);
    const matchStatus  = statusFilter  === 'All' || run.status === statusFilter;
    return matchSearch && matchProject && matchStatus;
  }), [testRuns, searchTerm, projectFilter, statusFilter]);

  const filteredRunnerCases = useMemo(() => projectTestCases.filter(tc => {
    const type   = getTestCaseType(tc.description);
    const result = currentRunResults.find(r => r.test_case_id === tc.id) || { status: 'Pending' };
    const q      = runnerSearch.toLocaleLowerCase('tr-TR');
    const matchSearch = tc.title.toLocaleLowerCase('tr-TR').includes(q) || String(tc.id).includes(q);
    const matchType   = runnerTypeFilter   === 'All' || type          === runnerTypeFilter;
    const matchStatus = runnerStatusFilter === 'All' || result.status === runnerStatusFilter;
    return matchSearch && matchType && matchStatus;
  }), [projectTestCases, runnerSearch, runnerTypeFilter, runnerStatusFilter, currentRunResults]);

  const runnerSummary = useMemo(() => {
    const total   = currentRunResults.length;
    const passed  = currentRunResults.filter(r => r.status === 'Passed').length;
    const failed  = currentRunResults.filter(r => r.status === 'Failed').length;
    const skipped = currentRunResults.filter(r => r.status === 'Skipped').length;
    const pending = currentRunResults.filter(r => r.status === 'Pending').length;
    const done    = passed + failed + skipped;
    return { total, passed, failed, skipped, pending, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [currentRunResults]);

  // Seçili projeye ait test planları
  const availableTestPlans = useMemo(() => {
    if (!currentTestRun.project_id) return [];
    return testPlans.filter(p => String(p.project_id) === String(currentTestRun.project_id));
  }, [testPlans, currentTestRun.project_id]);

  // Runner'da kullanılan benzersiz test tipleri
  // FIX: Tipleri dinamik hesapla — hardcode yerine mevcut test case'lerden üret
  const runnerTypes = useMemo(() => {
    const types = new Set(projectTestCases.map(tc => getTestCaseType(tc.description)));
    return [...types].sort();
  }, [projectTestCases]);

  // ── Render ───────────────────────────────────────────────────────
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
            <PlayCircle size={24} className="text-indigo-500"/> Test Koşumları
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sistemin sağlığını ölçmek için test senaryolarını koşun ve raporlayın.</p>
        </div>
        {can('test_runs.create') && (
          <button onClick={openCreatePanel} type="button"
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2 whitespace-nowrap transition-colors">
            <Plus size={18}/> Yeni Koşum Başlat
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0"/> {error}
          {/* FIX: Tekrar dene butonu eklendi */}
          <button onClick={fetchData} type="button" className="ml-auto text-rose-600 hover:underline font-medium">Tekrar Dene</button>
        </div>
      )}

      {/* FİLTRELER */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl flex-1 min-w-[200px] focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-sm">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input type="text" placeholder="Koşum adı ile ara..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 w-full"/>
          {searchTerm && <button onClick={() => setSearchTerm('')} type="button"><X size={13} className="text-slate-400"/></button>}
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl shadow-sm">
          <Folder size={15} className="text-slate-400 shrink-0"/>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full dark:text-white cursor-pointer">
            <option value="All">Tüm Projeler</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl shadow-sm">
          <Filter size={15} className="text-slate-400 shrink-0"/>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full dark:text-white cursor-pointer">
            <option value="All">Tüm Durumlar</option>
            {RUN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* LİSTE */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
              <Skeleton className="h-5 w-48"/><Skeleton className="h-4 w-72"/><Skeleton className="h-2.5 w-full"/>
            </div>
          ))}
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
          <PlayCircle size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4 opacity-50"/>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
            {searchTerm || projectFilter !== 'All' || statusFilter !== 'All' ? 'Sonuç Bulunamadı' : 'Henüz Koşum Yok'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            {searchTerm || projectFilter !== 'All' || statusFilter !== 'All'
              ? 'Filtre kriterlerine uyan koşum yok.'
              : 'İlk test koşumunuzu başlatıp testleri execute edin.'}
          </p>
          {!(searchTerm || projectFilter !== 'All' || statusFilter !== 'All') && can('test_runs.create') && (
            <button onClick={openCreatePanel} type="button"
              className="text-indigo-600 font-medium hover:underline text-sm flex items-center gap-1 mx-auto">
              <Plus size={16}/> Koşum Başlat
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredRuns.map(run => {
            const prog     = calculateProgress(run.results);
            const planName = getTestPlanName(run.test_plan_id);
            return (
              <div key={run.id} onClick={() => navigate(`/test-runs/${run.id}`)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{run.name}</h3>
                      <RunStatusBadge status={run.status}/>
                      {planName && (
                        <span className="px-2 py-0.5 bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 rounded-md border border-fuchsia-200 dark:border-fuchsia-800/50 text-[10px] font-bold flex items-center gap-1">
                          <ClipboardList size={10}/> Plan: {planName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 truncate">{run.description || 'Açıklama yok.'}</p>
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1.5"><Folder size={13} className="text-slate-400"/>{getProjectName(run.project_id)}</span>
                      <span className="flex items-center gap-1.5"><Clock size={13} className="text-slate-400"/>#{run.id}</span>
                      {prog.total > 0 && (
                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-800">
                          <span className="text-emerald-600 dark:text-emerald-400">✓ {prog.passedCount}</span>
                          <span className="text-rose-600 dark:text-rose-400">✗ {prog.failedCount}</span>
                          <span className="text-slate-400">Toplam {prog.total}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {prog.total > 0 && (
                    <div className="w-full md:w-56 space-y-1.5 shrink-0">
                      <div className="flex justify-between text-xs font-bold">
                        <span className={prog.passed === 100 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'}>İlerleme: %{prog.passed}</span>
                        <span className="text-slate-400">{prog.total - prog.pendingCount}/{prog.total}</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                        {prog.passed  > 0 && <div style={{ width: `${prog.passed}%`  }} className="bg-emerald-500 h-full transition-all"/>}
                        {prog.failed  > 0 && <div style={{ width: `${prog.failed}%`  }} className="bg-rose-500 h-full transition-all"/>}
                        {prog.skipped > 0 && <div style={{ width: `${prog.skipped}%` }} className="bg-amber-500 h-full transition-all"/>}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 shrink-0 mt-3 md:mt-0">
                    {can('test_runs.execute') && (
                      <button onClick={e => { e.stopPropagation(); openTestRunner(run); }} type="button"
                        className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:shadow-md transition-all flex items-center gap-2 text-sm font-bold border border-indigo-100 dark:border-indigo-800/30">
                        <Play size={15}/> Çalıştır
                      </button>
                    )}
                    {/* FIX: data-dropdown attribute ile dropdown tıklama yönetimi */}
                    <div className="relative" data-dropdown>
                      <button onClick={e => { e.stopPropagation(); setActiveDropdown(prev => prev === run.id ? null : run.id); }} type="button"
                        className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <MoreVertical size={18}/>
                      </button>
                      {activeDropdown === run.id && (
                        <div className="absolute right-0 top-10 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                          <button onClick={e => { e.stopPropagation(); navigate(`/test-runs/${run.id}`); }} type="button"
                            className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                            <ChevronRight size={14}/> Detay
                          </button>
                          {can('test_runs.create') && (
                            <button onClick={e => { e.stopPropagation(); openEditPanel(run); }} type="button"
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                              <Pencil size={14}/> Düzenle
                            </button>
                          )}
                          {can('test_runs.create') && can('test_runs.delete') && <div className="h-px bg-slate-100 dark:bg-slate-700"/>}
                          {can('test_runs.delete') && (
                            <button onClick={e => { e.stopPropagation(); setDeleteConfirm(run.id); setActiveDropdown(null); }} type="button"
                              className="w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-colors">
                              <Trash2 size={14}/> Sil
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TEST RUNNER MODALI ── */}
      {isRunnerOpen && runningTestRun && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] p-0 md:p-6 lg:p-10 flex flex-col animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-[1400px] mx-auto rounded-none md:rounded-3xl shadow-2xl border-0 md:border border-slate-200 dark:border-slate-800 flex-1 flex flex-col overflow-hidden">

            {/* Runner Header */}
            <div className="px-6 py-4 flex justify-between items-center bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20"><Play size={20}/></div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {runningTestRun.name}
                    {hasUnsavedChanges && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full animate-pulse">Kaydedilmedi</span>}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {getProjectName(runningTestRun.project_id)} · {runnerSummary.total} Test
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveTestRunProgress} disabled={!hasUnsavedChanges || isSavingRun} type="button"
                  className="hidden md:flex px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-all items-center gap-2">
                  <Save size={14}/> Ara Kayıt
                </button>
                <button onClick={closeTestRunner} type="button"
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors">
                  <X size={22}/>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {runnerSummary.total > 0 && (
              <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 flex items-center gap-4">
                  <div className="w-full max-w-md h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${(runnerSummary.passed / runnerSummary.total) * 100}%` }}/>
                    <div className="bg-rose-500 h-full transition-all duration-500"    style={{ width: `${(runnerSummary.failed  / runnerSummary.total) * 100}%` }}/>
                    <div className="bg-amber-500 h-full transition-all duration-500"   style={{ width: `${(runnerSummary.skipped / runnerSummary.total) * 100}%` }}/>
                  </div>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">%{runnerSummary.percent}</span>
                </div>
                <div className="flex gap-4 text-sm font-bold">
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><Check size={16}/> {runnerSummary.passed}</span>
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5"><X size={16}/> {runnerSummary.failed}</span>
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><SkipForward size={14}/> {runnerSummary.skipped}</span>
                  <span className="text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-4">{runnerSummary.pending} Bekliyor</span>
                </div>
              </div>
            )}

            {/* Runner Araç Çubuğu */}
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/30 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex w-full sm:w-auto items-center gap-2">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg flex-1 shadow-sm">
                  <Search size={14} className="text-slate-400 shrink-0"/>
                  <input type="text" placeholder="No veya İsim..." value={runnerSearch}
                    onChange={e => setRunnerSearch(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs text-slate-700 dark:text-slate-200 w-full"/>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 rounded-lg shadow-sm">
                  <Filter size={13} className="text-slate-400 shrink-0"/>
                  <select value={runnerStatusFilter} onChange={e => setRunnerStatusFilter(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                    <option value="All">Tüm Durumlar</option>
                    <option value="Pending">Sadece Bekleyenler</option>
                    <option value="Failed">Sadece Başarısızlar</option>
                    <option value="Passed">Sadece Geçenler</option>
                  </select>
                </div>
                {/* FIX: Dinamik tür filtresi — hardcode yoktu, şimdi mevcut tiplerden üretiliyor */}
                {runnerTypes.length > 1 && (
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 rounded-lg shadow-sm">
                    <select value={runnerTypeFilter} onChange={e => setRunnerTypeFilter(e.target.value)}
                      className="bg-transparent border-none outline-none text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <option value="All">Tüm Tipler</option>
                      {runnerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {can('test_runs.execute') && runnerSummary.pending > 0 && (
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={() => handleBulkStatusChange('Passed')} type="button"
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                    <CheckCheck size={14}/> Bekleyenleri Geçir
                  </button>
                  <button onClick={() => handleBulkStatusChange('Skipped')} type="button"
                    className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                    <Ban size={14}/> Bekleyenleri Atla
                  </button>
                </div>
              )}
            </div>

            {/* Test Senaryoları */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
              {/* FIX: Runner yüklenirken skeleton göster */}
              {isRunnerLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl"/>)}
                </div>
              ) : filteredRunnerCases.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search size={28} className="text-slate-300 dark:text-slate-600"/>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Test Bulunamadı</h3>
                  <p className="text-sm text-slate-500">Bu planda veya filtre kriterlerinize uygun test senaryosu yok.</p>
                </div>
              ) : filteredRunnerCases.map(tc => {
                const res   = currentRunResults.find(r => r.test_case_id === tc.id) || { status: 'Pending', actual_result: '' };
                const isExp = expandedCaseId === tc.id;
                return (
                  <div key={tc.id} className={`border rounded-2xl transition-all duration-300 overflow-hidden ${getCardBgStyle(res.status, isExp)}`}>
                    <div onClick={() => setExpandedCaseId(isExp ? null : tc.id)}
                      className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:p-5 cursor-pointer select-none ${isExp ? 'border-b border-slate-200 dark:border-slate-800/50' : ''}`}>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <span className={`font-mono text-sm font-bold shrink-0 ${isExp ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>#{tc.id}</span>
                        <div className="min-w-0">
                          <h3 className={`text-sm md:text-base font-bold truncate ${isExp ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>{tc.title}</h3>
                          {!isExp && <span className="text-xs text-slate-400 font-medium">{getTestCaseType(tc.description)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          {[
                            { s: 'Passed',  icon: <Check size={18} strokeWidth={3}/>,        ac: 'bg-emerald-500', hv: 'hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40' },
                            { s: 'Failed',  icon: <X size={18} strokeWidth={3}/>,             ac: 'bg-rose-500',    hv: 'hover:text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40' },
                            { s: 'Skipped', icon: <SkipForward size={18} strokeWidth={2.5}/>, ac: 'bg-amber-500',   hv: 'hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40' },
                          ].map(({ s, icon, ac, hv }) => (
                            <button key={s} onClick={e => updateTestCaseStatus(e, tc.id, s)} type="button"
                              disabled={!can('test_runs.execute')}
                              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                                res.status === s
                                  ? `${ac} text-white shadow-lg`
                                  : `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 ${hv}`
                              } disabled:opacity-50 disabled:cursor-not-allowed`}>
                              {icon}
                            </button>
                          ))}
                        </div>
                        <div className="text-slate-400 pl-3 border-l border-slate-200 dark:border-slate-700">
                          {isExp ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                        </div>
                      </div>
                    </div>

                    {isExp && (
                      <div className="p-5 md:px-8 bg-white/60 dark:bg-slate-900/40 animate-in slide-in-from-top-2 duration-200">
                        {renderTestCaseDetails(tc.description)}
                        {(res.status === 'Failed' || res.actual_result) && (
                          <div className="mt-6 bg-rose-50/50 dark:bg-rose-900/10 p-5 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                            <label className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                              <MessageSquare size={14}/> Hata Notu / Bulgular
                            </label>
                            <textarea value={res.actual_result} onChange={e => updateTestCaseNote(tc.id, e.target.value)} rows={3}
                              disabled={!can('test_runs.execute')}
                              className="w-full text-sm px-4 py-3 rounded-xl border border-rose-200 dark:border-rose-800/50 dark:bg-slate-950 dark:text-white outline-none focus:ring-2 focus:ring-rose-500 resize-none disabled:opacity-50 transition-colors shadow-inner mb-3"
                              placeholder="Test neden başarısız oldu? (Örn: Element bulunamadı, 500 hatası döndü)"/>
                            <button onClick={() => handleCreateDefect(tc.id, tc.title, res.actual_result)}
                              disabled={isDefectCreating} type="button"
                              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-600/20 disabled:opacity-50">
                              {isDefectCreating ? <Loader2 size={14} className="animate-spin"/> : <Bug size={14}/>}
                              Defect (Hata) Raporla
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Runner Footer */}
            <div className="p-4 md:p-6 border-t dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-950">
              <div className="flex items-center gap-3 text-sm">
                <RunStatusBadge status={runningTestRun.status}/>
              </div>
              <div className="flex gap-3">
                {can('test_runs.execute') && (
                  <>
                    <button onClick={saveTestRunProgress} disabled={!hasUnsavedChanges || isSavingRun} type="button"
                      className="px-5 py-3 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all disabled:opacity-40 text-sm hidden sm:block">
                      İlerlemeyi Kaydet
                    </button>
                    <button onClick={finishTestRun} disabled={isSavingRun} type="button"
                      className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all text-sm disabled:opacity-50">
                      {isSavingRun ? <><Loader2 size={16} className="animate-spin"/> Bekleyin...</> : <><CheckCircle2 size={18}/> Koşumu Tamamla</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT PANEL ── */}
      {isPanelOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]" onClick={() => setIsPanelOpen(false)}/>}
      <div className={`fixed top-0 right-0 h-screen w-full sm:w-[500px] bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-300 ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg"><PlayCircle size={18}/></div>
            <h2 className="text-base font-bold dark:text-white">{modalMode === 'create' ? 'Yeni Koşum Başlat' : 'Koşumu Düzenle'}</h2>
          </div>
          <button onClick={() => setIsPanelOpen(false)} type="button"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {formError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle size={15} className="shrink-0"/> {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Bağlı Proje</label>
            <select value={currentTestRun.project_id}
              onChange={e => setCurrentTestRun({ ...currentTestRun, project_id: e.target.value, test_plan_id: '' })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer shadow-sm">
              <option value="" disabled>Proje Seçiniz</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              Bağlı Test Planı
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Yeni</span>
            </label>
            <select value={currentTestRun.test_plan_id || ''}
              onChange={e => setCurrentTestRun({ ...currentTestRun, test_plan_id: e.target.value })}
              disabled={!currentTestRun.project_id || availableTestPlans.length === 0}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer shadow-sm disabled:opacity-50">
              <option value="">Plan Seçme (Tüm testleri getir)</option>
              {availableTestPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {currentTestRun.project_id && availableTestPlans.length === 0 && (
              <p className="text-xs text-amber-500 mt-2">Bu projeye ait aktif bir test planı bulunamadı.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Koşum Adı</label>
            <input type="text" value={currentTestRun.name}
              onChange={e => setCurrentTestRun({ ...currentTestRun, name: e.target.value })}
              placeholder="Örn: Sprint 12 Regresyon Testi"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-sm"/>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              Açıklama <span className="text-slate-400 font-normal text-xs">(isteğe bağlı)</span>
            </label>
            <textarea rows={4} value={currentTestRun.description}
              onChange={e => setCurrentTestRun({ ...currentTestRun, description: e.target.value })}
              placeholder="Bu test koşumunun amacı nedir?"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm shadow-sm"/>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Durum</label>
            <select value={currentTestRun.status}
              onChange={e => setCurrentTestRun({ ...currentTestRun, status: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm cursor-pointer shadow-sm">
              {RUN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0 bg-slate-50 dark:bg-slate-950/50">
          <button onClick={() => setIsPanelOpen(false)} type="button"
            className="px-5 py-2.5 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors text-sm">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={isSubmitting} type="button"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20">
            {isSubmitting ? <><Loader2 size={16} className="animate-spin"/> Kaydediliyor...</> : <><Save size={16}/> Kaydet</>}
          </button>
        </div>
      </div>

      {/* ── SİLME ONAY ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-900 rounded-full flex items-center justify-center mx-auto mb-5">
              <Trash2 size={24} className="text-rose-500"/>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Koşumu Sil</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
              Bu koşumu silmek istediğinizden emin misiniz? Koşuma ait tüm test sonuçları da kalıcı olarak silinir.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} type="button"
                className="flex-1 px-4 py-3 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-sm">
                Vazgeç
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={isDeleting} type="button"
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20">
                {isDeleting ? <Loader2 size={16} className="animate-spin"/> : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestRuns;