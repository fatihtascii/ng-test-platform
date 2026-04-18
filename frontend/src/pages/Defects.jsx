import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import {
  Bug, Search, Filter, AlertCircle, CheckCircle2,
  Clock, ArrowRightCircle, Target, Folder, X,
  RefreshCw, CheckSquare, Square, Copy, Check,
  ChevronDown, TrendingDown, Zap, PlayCircle 
} from 'lucide-react'; // <-- PlayCircle BURAYA EKLENDİ

// ── Sabitler ──────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'Open',        label: '🔴 Açık',          cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  { value: 'In Progress', label: '🟡 İnceleniyor',   cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { value: 'Resolved',    label: '🟢 Çözüldü',       cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  { value: 'Re-test',     label: '🔵 Tekrar Test',   cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
];

const SEVERITY_CONFIG = {
  'Kritik': { bg: 'bg-rose-500/10 text-rose-500',     badge: 'bg-rose-500 text-white',     dot: 'bg-rose-500' },
  'Yüksek': { bg: 'bg-orange-500/10 text-orange-500', badge: 'bg-orange-500 text-white',   dot: 'bg-orange-500' },
  'Orta':   { bg: 'bg-amber-500/10 text-amber-500',   badge: 'bg-amber-500 text-white',    dot: 'bg-amber-400' },
  'Düşük':  { bg: 'bg-blue-500/10 text-blue-500',     badge: 'bg-blue-400 text-white',     dot: 'bg-blue-400' },
};
const getSeverityConfig = (s) => SEVERITY_CONFIG[s] || SEVERITY_CONFIG['Orta'];

const getStatusCls = (s) => STATUS_OPTIONS.find(o => o.value === s)?.cls || 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
const getStatusLabel = (s) => STATUS_OPTIONS.find(o => o.value === s)?.label || s;

const LS_KEY = 'ng-defect-statuses';

// ── Yardımcılar ───────────────────────────────────────────────
const safeParseResults = (str) => {
  if (!str) return [];
  try { const p = JSON.parse(str); return Array.isArray(p) ? p : []; }
  catch { return []; }
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Ana Bileşen ────────────────────────────────────────────────
const Defects = () => {
  const navigate = useNavigate();
  const { can }  = usePermission();

  const [rawData, setRawData] = useState({ testRuns: [], projects: [], testCases: [] });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('All');
  const [filterProject,  setFilterProject]  = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');

  // Statüler localStorage'da + son güncelleme zamanı da saklanıyor
  const [statuses,     setStatuses]     = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } });
  const [statusTimes,  setStatusTimes]  = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY + '-times') || '{}'); } catch { return {}; } });

  // Toplu seçim
  const [selected,      setSelected]      = useState(new Set());
  const [bulkStatus,    setBulkStatus]    = useState('');
  const [isBulkSaving,  setIsBulkSaving]  = useState(false);

  // Kopyalama feedback
  const [copied, setCopied] = useState(false);

  // ── Veri Çekme ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsRes, projsRes, casesRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/test-runs').catch(() => ({ ok: false })),
        fetch('http://127.0.0.1:8000/projects').catch(() => ({ ok: false })),
        fetch('http://127.0.0.1:8000/test-cases').catch(() => ({ ok: false })),
      ]);
      setRawData({
        testRuns:  runsRes.ok  ? await runsRes.json()  : [],
        projects:  projsRes.ok ? await projsRes.json() : [],
        testCases: casesRes.ok ? await casesRes.json() : [],
      });
      if (!runsRes.ok) setError('Test koşumları yüklenemedi.');
    } catch {
      setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Hataları Çıkart ──────────────────────────────────────────
  const defects = useMemo(() => {
    const bugs = [];
    (rawData.testRuns || []).forEach(run => {
      const project = (rawData.projects || []).find(p => p.id === run.project_id);
      safeParseResults(run.results).forEach((res, index) => {
        const isFailed =
          res.status === 'Failed'      || res.status === 'Başarısız' ||
          res.run_status === 'Failed'  || res.run_status === 'Başarısız';
        if (!isFailed) return;

        const caseId    = res.case_id || res.test_case_id || res.id;
        const bugSuffix = caseId != null ? caseId : `idx${index}`;
        const bugId     = `BUG-${run.id}-${bugSuffix}`;
        const realTC    = caseId != null ? (rawData.testCases || []).find(tc => tc.id === caseId) : null;
        
        const title     = realTC?.title || res.caseName || res.test_case_title || `Test #${bugSuffix}`;
        const severity  = realTC?.priority || res.test_case_priority || 'Orta';

        bugs.push({
          id:          bugId,
          title,
          caseId,
          projectId:   project?.id   ?? null,
          projectName: project?.name ?? 'Bilinmeyen Proje',
          runId:       run.id,
          runName:     run.name ?? 'İsimsiz Koşum',
          severity,
          status:      statuses[bugId] ?? 'Open',
          updatedAt:   statusTimes[bugId] ?? null,
        });
      });
    });
    return bugs.reverse();
  }, [rawData, statuses, statusTimes]);

  // ── Statü Değiştir ───────────────────────────────────────────
  const handleStatusChange = useCallback((bugId, newStatus) => {
    const now  = new Date().toISOString();
    const nextStatuses = { ...statuses, [bugId]: newStatus };
    const nextTimes    = { ...statusTimes, [bugId]: now };
    setStatuses(nextStatuses);
    setStatusTimes(nextTimes);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(nextStatuses));
      localStorage.setItem(LS_KEY + '-times', JSON.stringify(nextTimes));
    } catch { console.warn('localStorage yazılamadı.'); }
  }, [statuses, statusTimes]);

  // ── Toplu Statü ─────────────────────────────────────────────
  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selected.size === 0) return;
    setIsBulkSaving(true);
    const now = new Date().toISOString();
    const nextStatuses = { ...statuses };
    const nextTimes    = { ...statusTimes };
    [...selected].forEach(bugId => {
      nextStatuses[bugId] = bulkStatus;
      nextTimes[bugId]    = now;
    });
    setStatuses(nextStatuses);
    setStatusTimes(nextTimes);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(nextStatuses));
      localStorage.setItem(LS_KEY + '-times', JSON.stringify(nextTimes));
    } catch { console.warn('localStorage yazılamadı.'); }
    setSelected(new Set());
    setBulkStatus('');
    setIsBulkSaving(false);
  };

  // ── Seçim ────────────────────────────────────────────────────
  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(b => b.id)));
  };

  // ── Filtreleme ───────────────────────────────────────────────
  const filtered = useMemo(() => defects.filter(bug => {
    const q = searchQuery.toLowerCase();
    return (
      (!q || bug.title.toLowerCase().includes(q) || bug.id.toLowerCase().includes(q)) &&
      (filterStatus   === 'All' || bug.status   === filterStatus)   &&
      (filterProject  === 'All' || String(bug.projectId) === String(filterProject)) &&
      (filterSeverity === 'All' || bug.severity === filterSeverity)
    );
  }), [defects, searchQuery, filterStatus, filterProject, filterSeverity]);

  const hasFilter = searchQuery || filterStatus !== 'All' || filterProject !== 'All' || filterSeverity !== 'All';

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('All');
    setFilterProject('All');
    setFilterSeverity('All');
  };

  const stats = useMemo(() => ({
    total:      defects.length,
    open:       defects.filter(d => d.status === 'Open').length,
    inProgress: defects.filter(d => d.status === 'In Progress').length,
    retest:     defects.filter(d => d.status === 'Re-test').length,
    resolved:   defects.filter(d => d.status === 'Resolved').length,
  }), [defects]);

  // ── Dışa Aktar (Kopyala) ─────────────────────────────────────
  const handleCopyReport = () => {
    if (filtered.length === 0) return;
    const lines = ['# NG Test - Hata Raporu\n'];
    filtered.forEach(bug => {
      lines.push(`[${bug.id}] ${bug.title}`);
      lines.push(`  Öncelik: ${bug.severity} | Statü: ${getStatusLabel(bug.status)}`);
      lines.push(`  Proje: ${bug.projectName} | Koşum: ${bug.runName}\n`);
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Son güncelleme formatı
  const formatTime = (iso) => {
    if (!iso) return null;
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return `${diff} sn önce`;
    if (diff < 3600)  return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
    return new Date(iso).toLocaleDateString('tr-TR');
  };

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Skeleton className="h-8 w-56"/>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-20 rounded-2xl"/>)}
      </div>
      <Skeleton className="h-16 rounded-2xl"/>
      <div className="space-y-3">
        {Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-24 rounded-2xl"/>)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bug size={24} className="text-rose-500"/> Hata Takip
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Başarısız test koşumlarından çıkan hatalar ve takipleri.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* EKLENEN BUTON: Dışa Aktar (Kopyala) */}
          <button onClick={handleCopyReport} disabled={filtered.length === 0}
            className={`flex items-center gap-2 px-3 py-2 border rounded-xl font-medium text-sm transition-colors ${
              copied 
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Listeyi Kopyala">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span className="hidden sm:inline">{copied ? 'Kopyalandı!' : 'Kopyala'}</span>
          </button>
          
          <button onClick={fetchAll}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            title="Verileri Yenile">
            <RefreshCw size={17}/>
          </button>
          
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse"/>
            Statüler Yerel
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-800 px-4 py-3 rounded-xl text-sm font-medium">
          <AlertCircle size={16} className="shrink-0"/> {error}
          <button onClick={fetchAll} className="ml-auto underline underline-offset-2">Tekrar Dene</button>
        </div>
      )}

      {/* İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Toplam',      value: stats.total,      filterVal: 'All',         icon: <TrendingDown size={18}/>, bg: 'bg-slate-100 dark:bg-slate-800',   text: 'text-slate-600 dark:text-slate-400',     border: 'border-slate-200 dark:border-slate-700' },
          { label: 'Açık',        value: stats.open,        filterVal: 'Open',        icon: <AlertCircle size={18}/>,  bg: 'bg-rose-500/10',                   text: 'text-rose-600 dark:text-rose-400',       border: 'border-rose-500/20' },
          { label: 'İnceleniyor', value: stats.inProgress,  filterVal: 'In Progress', icon: <Clock size={18}/>,        bg: 'bg-amber-500/10',                  text: 'text-amber-600 dark:text-amber-400',     border: 'border-amber-500/20' },
          { label: 'Tekrar Test', value: stats.retest,      filterVal: 'Re-test',     icon: <Zap size={18}/>,          bg: 'bg-blue-500/10',                   text: 'text-blue-600 dark:text-blue-400',       border: 'border-blue-500/20' },
          { label: 'Çözüldü',     value: stats.resolved,    filterVal: 'Resolved',    icon: <CheckCircle2 size={18}/>, bg: 'bg-emerald-500/10',                text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
        ].map(s => {
          const isActive = filterStatus === s.filterVal;
          return (
            <button key={s.label}
              onClick={() => setFilterStatus(isActive && s.filterVal !== 'All' ? 'All' : s.filterVal)}
              className={`p-4 rounded-2xl border shadow-sm flex items-center gap-3 text-left transition-all w-full focus-visible:ring-2 outline-none focus-visible:ring-rose-500 ${
                isActive && s.filterVal !== 'All'
                  ? `${s.bg} ${s.border} ring-2 ring-current/20 scale-[1.02]`
                  : `bg-white dark:bg-slate-900 ${s.border} hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600`
              }`}>
              <div className={`p-2.5 ${s.bg} rounded-xl ${s.text} shrink-0`}>{s.icon}</div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold truncate ${s.text}`}>{s.label}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{s.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* TOPLU AKSİYON TOOLBAR */}
      {selected.size > 0 && can('defects.manage') && (
        <div className="flex items-center gap-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800/50 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
          <span className="text-sm font-bold text-rose-700 dark:text-rose-400">
            {selected.size} Hata Seçildi
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              className="text-xs font-semibold bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-700 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer shadow-sm">
              <option value="">Toplu Statü Ata...</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={handleBulkStatusChange} disabled={!bulkStatus || isBulkSaving}
              className="px-3 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm shadow-rose-600/20">
              {isBulkSaving ? 'İşleniyor...' : <><CheckCircle2 size={14}/> Uygula</>}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="p-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg transition-colors ml-1"
              title="Seçimi Temizle">
              <X size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* FİLTRE ÇUBUĞU */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center">
        <div className="relative w-full md:flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
          <input type="text" placeholder="Hata ID, Test Başlığı..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-rose-400 outline-none dark:text-white text-sm transition-all"/>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
              <X size={14}/>
            </button>
          )}
        </div>
        
        <div className="flex w-full md:w-auto flex-wrap gap-3">
          {[
            { icon: <Folder size={14}/>, value: filterProject, onChange: setFilterProject,
              options: [['All','Tüm Projeler'], ...(rawData.projects || []).map(p => [p.id, p.name])] },
            { icon: <Bug size={14}/>, value: filterSeverity, onChange: setFilterSeverity,
              options: [['All','Tüm Öncelikler'],['Kritik','Kritik'],['Yüksek','Yüksek'],['Orta','Orta'],['Düşük','Düşük']] },
            { icon: <Filter size={14}/>, value: filterStatus, onChange: setFilterStatus,
              options: [['All','Tüm Statüler'], ...STATUS_OPTIONS.map(o => [o.value, o.label.replace(/🔴|🟡|🟢|🔵/g,'').trim()])] },
          ].map((f, i) => (
            <div key={i} className="flex flex-1 md:flex-none items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl focus-within:ring-2 focus-within:ring-rose-400 focus-within:border-transparent transition-all">
              <span className="text-slate-400 shrink-0">{f.icon}</span>
              <select value={f.value} onChange={e => f.onChange(e.target.value)}
                className="bg-transparent border-none outline-none text-sm dark:text-white cursor-pointer w-full font-medium">
                {f.options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>

        {hasFilter && (
          <button onClick={clearFilters} className="w-full md:w-auto text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-800/50 px-3 py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors">
            <X size={14}/> Temizle
          </button>
        )}
      </div>

      {/* HATA LİSTESİ */}
      <div className="space-y-3">
        {defects.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl shadow-sm">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
              <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400"/>
            </div>
            <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Sıfır Hata! 🎉</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Sistemde kayıtlı hiçbir başarısız test koşumu bulunamadı. Kod kalitesi mükemmel görünüyor.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl shadow-sm">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-slate-400 dark:text-slate-500"/>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Kayıt Bulunamadı</h3>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
              Arama kriterlerinize uyan bir hata kaydı bulunamadı.
            </p>
            <button onClick={clearFilters} className="text-rose-600 dark:text-rose-400 font-bold hover:underline text-sm underline-offset-2">
              Tüm Filtreleri Temizle
            </button>
          </div>
        ) : (
          <>
            {/* Tablo Ara Başlığı */}
            {can('defects.manage') && (
              <div className="flex items-center gap-3 px-4 pb-1">
                <button onClick={toggleSelectAll} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider outline-none rounded-sm">
                  {selected.size === filtered.length
                    ? <><CheckSquare size={16} className="text-rose-500"/> Seçimi Kaldır</>
                    : <><Square size={16}/> Tümünü Seç</>
                  }
                </button>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800 mx-2" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {filtered.length} Hata
                </span>
              </div>
            )}

            {filtered.map(bug => {
              const sev        = getSeverityConfig(bug.severity);
              const isSelected = selected.has(bug.id);
              const updatedStr = formatTime(bug.updatedAt);
              const currentStatus = STATUS_OPTIONS.find(o => o.value === bug.status);

              return (
                <div key={bug.id}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 md:p-5 transition-all shadow-sm group relative overflow-hidden ${
                    isSelected
                      ? 'border-rose-400 dark:border-rose-600 bg-rose-50/50 dark:bg-rose-500/5 ring-1 ring-rose-400/50'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md'
                  }`}>
                  
                  {/* Seçili ise sol kenar belirteci */}
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />}

                  <div className="flex items-start md:items-center flex-col md:flex-row gap-4 md:gap-5">

                    {/* Sol Bölüm: İkon ve Seçim */}
                    <div className="flex items-center gap-4 shrink-0">
                      {can('defects.manage') && (
                        <button onClick={() => toggleSelect(bug.id)}
                          className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors outline-none rounded focus-visible:ring-2 focus-visible:ring-rose-500">
                          {isSelected
                            ? <CheckSquare size={20} className="text-rose-500"/>
                            : <Square size={20}/>
                          }
                        </button>
                      )}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${sev.bg}`}>
                        <Bug size={18}/>
                      </div>
                    </div>

                    {/* Orta Bölüm: Detaylar */}
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono tracking-tight bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {bug.id}
                        </span>
                        <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md ${sev.badge}`}>
                          {bug.severity}
                        </span>
                        {!can('defects.manage') && (
                          <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md border ${getStatusCls(bug.status)}`}>
                            {currentStatus?.label || bug.status}
                          </span>
                        )}
                        {updatedStr && (
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 ml-auto md:ml-0">
                            <Clock size={11}/> {updatedStr}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm md:text-base font-bold text-slate-900 dark:text-white leading-snug truncate pr-2" title={bug.title}>
                        {bug.title}
                      </h3>
                      <div className="flex items-center gap-2 md:gap-3 mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800 truncate max-w-[200px]">
                          <Folder size={12} className="text-indigo-400"/> {bug.projectName}
                        </span>
                        <span className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-100 dark:border-slate-800 truncate max-w-[200px]">
                          <PlayCircle size={12} className="text-emerald-400"/> {bug.runName}
                        </span>
                      </div>
                    </div>

                    {/* Sağ Bölüm: Aksiyonlar */}
                    <div className="flex items-center justify-between w-full md:w-auto gap-3 shrink-0 mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                      {can('defects.manage') && (
                        <select value={bug.status} onChange={e => handleStatusChange(bug.id, e.target.value)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold outline-none cursor-pointer border-2 transition-all focus:ring-2 focus:ring-rose-400 shadow-sm ${getStatusCls(bug.status)}`}>
                          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}

                      <button onClick={() => navigate(`/defects/${bug.id}`)}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500/50 flex items-center justify-center shrink-0 shadow-sm"
                        title={`${bug.id} Detaylarına Git`}>
                        <ArrowRightCircle size={18}/>
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default Defects;