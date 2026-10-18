import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import { projectsApi, fetchAllTestCases } from '../api';
import {
  ArrowLeft, Folder, Settings, Users, Beaker,
  Activity, AlertCircle, CheckCircle2, Clock,
  ChevronRight, Calendar, Plus, TrendingUp,
  Copy, Check, Search, Filter, ShieldAlert, Tag
} from 'lucide-react';

// ── Yardımcı Stiller ──────────────────────────────────────────
const getProjectStatusStyle = (status) => {
  switch (status) {
    case 'Tamamlandı': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';
    case 'Beklemede':  return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
    default:           return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50';
  }
};

const getTCStatusStyle = (status) => {
  switch (status) {
    case 'Başarılı':      return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';
    case 'Başarısız':     return 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50';
    case 'Test Edilmedi': return 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/50';
    case 'Taslak':        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    default:              return 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  }
};

const getPriorityStyle = (p) => {
  switch (p) {
    case 'Kritik': return 'bg-rose-500 text-white';
    case 'Yüksek': return 'bg-orange-500 text-white';
    case 'Orta':   return 'bg-indigo-500 text-white';
    default:       return 'bg-slate-400 text-white';
  }
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

const TABS = ['Genel Bakış', 'Test Senaryoları'];

// ── Ana Bileşen ────────────────────────────────────────────────
const ProjectDetail = () => {
  // ✅ DÜZELTME 1: Parametre isimlendirme çakışmalarına karşı güvenli hale getirdik.
  const params = useParams();
  const id = params.id || params.projectId; 

  const navigate = useNavigate();
  const { can }  = usePermission();

  const [project, setProject]       = useState(null);
  const [testCases, setTestCases]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tcLoading, setTcLoading]   = useState(false);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState('Genel Bakış');
  const [copied, setCopied]         = useState(false);

  // Test case filtresi
  const [tcSearch, setTcSearch]         = useState('');
  const [tcStatusFilter, setTcStatusFilter] = useState('All');

  const tabsRef = useRef(null);

  const goToTab = (tab) => {
    setActiveTab(tab);
    setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(`PRJ-${project?.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. Proje verisi
  useEffect(() => {
    // ✅ DÜZELTME 2: Gelen ID undefined ise boşuna istek atıp backend'i yormuyoruz ve 422 yemiyoruz.
    if (!id || id === 'undefined') {
      setError("Geçersiz proje bağlantısı (ID bulunamadı).");
      setLoading(false);
      return;
    }

    const fetchProject = async () => {
      setError(null);
      try {
        const res = await projectsApi.getOne(id);
        setProject(res.data);
      } catch (err) {
        // ✅ DÜZELTME 3: Hata mesajlarını daha anlaşılır yakalıyoruz.
        if (err.message?.includes('404') || err.response?.status === 404) setError('404');
        else if (err.response?.status === 422) setError('Backend: Doğrulama Hatası (ID geçersiz formatta).');
        else setError(err.response?.data?.detail || err.message || 'Proje detayları yüklenemedi.');
      }
      finally { setLoading(false); }
    };
    fetchProject();
  }, [id]);

  // 2. Test senaryoları
  useEffect(() => {
    if (!project || !id || id === 'undefined') return;
    const fetchTCs = async () => {
      setTcLoading(true);
      try {
        const res = { data: await fetchAllTestCases({ project_id: id }) };
        setTestCases(res.data || []);
      } catch { console.error('Test senaryoları çekilemedi.'); }
      finally { setTcLoading(false); }
    };
    fetchTCs();
  }, [project, id]);

  // ── Hesaplamalar ──────────────
  const stats = useMemo(() => ({
    total:    testCases.length,
    passed:   testCases.filter(tc => tc.status === 'Başarılı' || tc.status === 'Passed').length,
    failed:   testCases.filter(tc => tc.status === 'Başarısız' || tc.status === 'Failed').length,
    draft:    testCases.filter(tc => tc.status === 'Taslak' || tc.status === 'Draft').length,
    untested: testCases.filter(tc => tc.status === 'Test Edilmedi' || tc.status === 'Untested').length,
  }), [testCases]);
  
  // Geçme oranı tüm sayfalarda aynı: geçen / koşulan (koşulmamış case'ler paydada yok)
  const successRate = useMemo(() =>
    stats.passed + stats.failed > 0 ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100) : null
  , [stats]);

  const priorityDist = useMemo(() => 
    ['Kritik', 'Yüksek', 'Orta', 'Düşük']
      .map(p => ({ label: p, count: testCases.filter(tc => tc.priority === p).length }))
      .filter(p => p.count > 0)
  , [testCases]);

  const filteredTCs = useMemo(() => 
    testCases.filter(tc => {
      const q = tcSearch.toLowerCase();
      const matchSearch = tc.title?.toLowerCase().includes(q) || String(tc.id).includes(q);
      const matchStatus = tcStatusFilter === 'All' || tc.status === tcStatusFilter;
      return matchSearch && matchStatus;
    })
  , [testCases, tcSearch, tcStatusFilter]);

  // ── Render: Loading ──────────────────────────────────────────
  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="w-12 h-12 rounded-2xl" />
        <div className="space-y-2"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
      </div>
      <Skeleton className="h-[400px] rounded-3xl" />
    </div>
  );

  // ── Render: Error & 404 ──────────────────────────────────────
  if (error === '404') return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-5 animate-in zoom-in-95 duration-300">
      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-2 shadow-inner">
        <Folder size={40} className="text-slate-400 dark:text-slate-500" />
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white">Proje Bulunamadı</h2>
      <p className="text-slate-500 dark:text-slate-400 font-medium max-w-sm">Aramış olduğunuz ID'ye ait bir proje sistemde mevcut değil veya silinmiş.</p>
      <button onClick={() => navigate('/projects')} className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
        Tüm Projelere Dön
      </button>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center py-20 gap-4">
      <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 px-5 py-4 rounded-2xl text-sm font-bold shadow-sm">
        <AlertCircle size={20} className="shrink-0" />
        <span>{error}</span>
      </div>
      <button onClick={() => navigate('/projects')} className="mt-2 text-indigo-600 hover:text-indigo-700 hover:underline font-bold text-sm">Geri Dön ve Tekrar Dene</button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/projects')}
          className="p-2.5 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all shrink-0 shadow-sm">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white truncate max-w-full">
              {project.name}
            </h1>
            <span className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${getProjectStatusStyle(project.status)}`}>
              {project.status || 'Aktif'}
            </span>
            <button onClick={handleCopyId}
              className="ml-auto text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 rounded-lg shadow-sm">
              {copied ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
              <span className="hidden sm:inline">{copied ? 'Kopyalandı' : 'ID Kopyala'}</span>
            </button>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed max-w-3xl">
            {project.description || <span className="italic">Bu proje için henüz bir açıklama eklenmemiş.</span>}
          </p>
        </div>
      </div>

      {/* SEKMELER */}
      <div ref={tabsRef} className="border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex gap-6 px-2">
          {TABS.map(tab => {
            const isActive = activeTab === tab;
            return (
              <button key={tab} onClick={() => goToTab(tab)}
                className={`pb-4 pt-2 text-sm font-bold transition-all relative outline-none flex items-center gap-2 ${ isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200' }`}>
                {tab}
                {tab === 'Test Senaryoları' && testCases.length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {testCases.length}
                  </span>
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── GENEL BAKIŞ SEKMESİ ── */}
      {activeTab === 'Genel Bakış' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-right-4 duration-300">
          <div className="lg:col-span-2 space-y-6">

            {/* İstatistik Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Toplam Test',  value: tcLoading ? '…' : stats.total,    icon: <Beaker size={18} className="text-indigo-500" />,    bg: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20' },
                { label: 'Başarılı',     value: tcLoading ? '…' : stats.passed,   icon: <CheckCircle2 size={18} className="text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20' },
                { label: 'Başarısız',    value: tcLoading ? '…' : stats.failed,   icon: <AlertCircle size={18} className="text-rose-500" />,  bg: 'bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20' },
                { label: 'Taslak',       value: tcLoading ? '…' : stats.draft,    icon: <Clock size={18} className="text-slate-500" />,       bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-10 h-10 rounded-2xl border ${s.bg} flex items-center justify-center shadow-inner`}>{s.icon}</div>
                  <div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">{s.value}</p>
                    <p className="text-xs font-medium text-slate-400 mt-1">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Test Durum Özeti */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
              <h3 className="text-base font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                <TrendingUp size={18} className="text-indigo-500" /> Test Durum Özeti
              </h3>
              {tcLoading ? (
                <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : stats.total === 0 ? (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Beaker size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Bu projede henüz test senaryosu bulunmuyor.</p>
                  {can('test_cases.create') && (
                    <button onClick={() => navigate('/test-cases')} className="mt-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                      İlk Senaryoyu Ekle
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {[
                    { label: 'Başarılı',      count: stats.passed,   total: stats.total, bg: 'bg-emerald-500',  text: 'text-emerald-700 dark:text-emerald-400' },
                    { label: 'Başarısız',     count: stats.failed,   total: stats.total, bg: 'bg-rose-500',     text: 'text-rose-700 dark:text-rose-400' },
                    { label: 'Test Edilmedi', count: stats.untested, total: stats.total, bg: 'bg-violet-400',   text: 'text-violet-700 dark:text-violet-400' },
                    { label: 'Taslak',        count: stats.draft,    total: stats.total, bg: 'bg-slate-400',    text: 'text-slate-600 dark:text-slate-400' },
                  ].filter(item => item.count > 0).map(item => (
                    <div key={item.label} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-medium ${item.text}`}>{item.label}</span>
                        <span className="text-xs font-bold text-slate-400 tabular-nums">{item.count} / {item.total}</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                        <div className={`${item.bg} h-full rounded-full transition-all duration-1000 ease-out`}
                          style={{ width: `${Math.round((item.count / item.total) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  
                  {/* Genel Başarı Oranı Göstergesi */}
                  <div className="mt-8 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={16} className="text-slate-400" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Geçme oranı</span>
                    </div>
                    <span className={`text-xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white`}>
                      {successRate == null ? '—' : `%${successRate}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sağ Kolon: Meta + Hızlı Erişim */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-[11px] font-medium text-slate-400 tracking-[0.15em] mb-5">Proje Künyesi</h3>
              <div className="space-y-5">
                <div className="flex items-start gap-3 text-sm">
                  <Folder size={16} className="text-indigo-400 mt-0.5 shrink-0" />
                  <div><p className="text-[11px] font-medium text-slate-400 mb-0.5">Sistem ID</p><p className="font-bold text-slate-700 dark:text-slate-200">PRJ-{project.id}</p></div>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <Activity size={16} className="text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-slate-400 mb-1">Anlık Durum</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${getProjectStatusStyle(project.status)}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {project.status || 'Aktif'}
                    </span>
                  </div>
                </div>
                {project.created_at && (
                  <div className="flex items-start gap-3 text-sm">
                    <Calendar size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-slate-400 mb-0.5">Oluşturulma</p>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {new Date(project.created_at).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 text-sm">
                  <Users size={16} className="text-rose-400 mt-0.5 shrink-0" />
                  <div><p className="text-[11px] font-medium text-slate-400 mb-0.5">Erişim</p><p className="font-bold text-slate-700 dark:text-slate-200">Ekip Geneli</p></div>
                </div>
              </div>
            </div>

            {/* Öncelik Dağılımı */}
            {priorityDist.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <h3 className="text-[11px] font-medium text-slate-400 tracking-[0.15em] mb-5">Öncelik (Priority) Dağılımı</h3>
                <div className="space-y-3">
                  {priorityDist.map(({ label, count }) => (
                    <div key={label} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
                      </div>
                      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg ${getPriorityStyle(label)}`}>
                        {count} Test
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hızlı Erişim */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-[11px] font-medium text-slate-400 tracking-[0.15em] mb-4">Hızlı Kısayollar</h3>
              <div className="space-y-2">
                <button onClick={() => goToTab('Test Senaryoları')}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 transition-all group">
                  <span className="flex items-center gap-3"><Beaker size={16} className="text-indigo-500" /> Test Listesi</span>
                  <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                </button>
                {can('test_cases.create') && (
                  <button onClick={() => navigate('/test-cases')}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 transition-all group">
                    <span className="flex items-center gap-3"><Plus size={16} className="text-emerald-500" /> Yeni Senaryo</span>
                    <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
                {can('projects.edit') && (
                  <button onClick={() => navigate('/projects')} className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 transition-all group">
                    <span className="flex items-center gap-3"><Settings size={16} className="text-slate-500" /> Proje Ayarları</span>
                    <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TEST SENARYOLARI SEKMESİ ── */}
      {activeTab === 'Test Senaryoları' && (
        <div className="space-y-5 animate-in slide-in-from-left-4 duration-300">
          
          {/* Filtre Barı */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl w-full sm:flex-1 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input type="text" placeholder="Senaryo ID veya Başlık ara..." value={tcSearch}
                onChange={(e) => setTcSearch(e.target.value)}
                className="bg-transparent border-none outline-none text-sm font-medium text-slate-700 dark:text-slate-200 w-full"
              />
            </div>
            
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <Filter size={16} className="text-slate-400 shrink-0" />
              <select value={tcStatusFilter} onChange={(e) => setTcStatusFilter(e.target.value)} className="bg-transparent border-none outline-none text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <option value="All">Tüm Durumlar</option>
                <option value="Taslak">Taslak</option>
                <option value="Başarılı">Başarılı</option>
                <option value="Başarısız">Başarısız</option>
                <option value="Test Edilmedi">Test Edilmedi</option>
              </select>
            </div>
            
            {can('test_cases.create') && (
              <button onClick={() => navigate('/test-cases')}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm shadow-md shadow-indigo-600/20 whitespace-nowrap">
                <Plus size={16} /> Yeni Senaryo
              </button>
            )}
          </div>

          {/* Test Case Tablosu */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
            {tcLoading ? (
              <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
            ) : filteredTCs.length === 0 ? (
              <div className="text-center py-20 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Beaker size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">Senaryo Bulunamadı</h3>
                <p className="text-sm font-medium text-slate-500">
                  {tcSearch || tcStatusFilter !== 'All' ? 'Filtrelerinize uyan bir kayıt yok.' : 'Bu proje için oluşturulmuş hiçbir test senaryosu bulunmuyor.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 font-medium">
                      <th className="px-6 py-5">Senaryo Detayı</th>
                      <th className="px-6 py-5">Öncelik</th>
                      <th className="px-6 py-5">Son Durum</th>
                      <th className="px-6 py-5 text-right">Git</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredTCs.map((tc) => (
                      <tr 
                        key={tc.id} 
                        onClick={() => navigate(`/test-cases?project=${project.id}`)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{tc.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">TC-{tc.id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium ${getPriorityStyle(tc.priority)}`}>
                            {tc.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-bold ${getTCStatusStyle(tc.status)}`}>
                            {tc.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-slate-300 dark:text-slate-600 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 group-hover:text-indigo-500 rounded-xl transition-all">
                            <ChevronRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetail;