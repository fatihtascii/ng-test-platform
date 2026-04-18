import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import {
  FolderKanban, Beaker, CheckCircle2, XCircle, Activity,
  Clock, PlayCircle, ArrowRight, FileEdit, AlertCircle,
  RefreshCw, ClipboardList, TrendingUp, Plus, ChevronRight,
  Zap, Target, BarChart3, Layers
} from 'lucide-react';

// ── Yardımcılar ───────────────────────────────────────────────
const timeAgo = (dateStr) => {
  if (!dateStr) return null;
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff} sn önce`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
};

const getRateColor = (rate) =>
  rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
  rate >= 50 ? 'text-amber-600 dark:text-amber-400' :
               'text-rose-600 dark:text-rose-400';

const getRateBarColor = (rate) =>
  rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500';

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Özet Metrik Kartı ─────────────────────────────────────────
const MetricCard = ({ icon, label, value, sub, color, badge, badgeColor, onClick, loading }) => {
  if (loading) return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-10 h-10 rounded-xl"/>
        <Skeleton className="w-14 h-5 rounded-lg"/>
      </div>
      <Skeleton className="w-16 h-8 rounded-lg mb-2"/>
      <Skeleton className="w-28 h-4 rounded-lg"/>
    </div>
  );
  return (
    <button onClick={onClick}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group text-left w-full">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.bg} ${color.text} group-hover:scale-105 transition-transform`}>
          {icon}
        </div>
        {badge && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${badgeColor || color.bg} ${color.text}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mb-1">{value}</p>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">{sub}</p>}
    </button>
  );
};

// ── Ana Bileşen ────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();
  const { can }  = usePermission();

  // ✅ Düzeltildi: user state'e alındı
  const [user] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  const [projects,  setProjects]  = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [testPlans, setTestPlans] = useState([]);
  const [testRuns,  setTestRuns]  = useState([]);  // ✅ Eklendi
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [projRes, tcRes, plansRes, runsRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/projects'),
        fetch('http://127.0.0.1:8000/test-cases'),
        fetch('http://127.0.0.1:8000/test-plans').catch(() => ({ ok: false })),
        fetch('http://127.0.0.1:8000/test-runs').catch(() => ({ ok: false })),
      ]);
      if (projRes.ok)  setProjects(await projRes.json());
      if (tcRes.ok)    setTestCases(await tcRes.json());
      if (plansRes.ok) setTestPlans(await plansRes.json());
      if (runsRes.ok)  setTestRuns(await runsRes.json());
      if (!projRes.ok || !tcRes.ok) setError('Bazı veriler yüklenemedi.');
    } catch {
      setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Metrikler ────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total    = testCases.length;
    const passed   = testCases.filter(tc => tc.status === 'Başarılı').length;
    const failed   = testCases.filter(tc => tc.status === 'Başarısız').length;
    const draft    = testCases.filter(tc => tc.status === 'Taslak').length;
    const untested = testCases.filter(tc => tc.status === 'Test Edilmedi').length;
    // ✅ Düzeltildi: Gerçek başarı oranı = passed / (passed + failed)
    const testedCount = passed + failed;
    const successRate = testedCount > 0 ? Math.round((passed / testedCount) * 100) : 0;

    const activePlans    = testPlans.filter(p => p.status === 'Aktif').length;
    const completedPlans = testPlans.filter(p => p.status === 'Tamamlandı').length;

    const statusBar = [
      { label: 'Başarılı',      count: passed,   color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
      { label: 'Başarısız',     count: failed,   color: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400' },
      { label: 'Test Edilmedi', count: untested, color: 'bg-violet-400',  text: 'text-violet-600 dark:text-violet-400' },
      { label: 'Taslak',        count: draft,    color: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-500 dark:text-slate-400' },
    ].filter(i => i.count > 0);

    return { total, passed, failed, draft, untested, successRate, testedCount, activePlans, completedPlans, statusBar };
  }, [testCases, testPlans]);

  // ✅ Son aktiviteler — id'ye göre sort (created_at güvenilmez)
  const recentItems = useMemo(() =>
    [...testCases].sort((a, b) => b.id - a.id).slice(0, 5),
  [testCases]);

  const getProjectName = (id) => projects.find(p => p.id === id)?.name || '—';

  const firstName = user?.full_name?.split(' ')[0] || user?.username || 'Kullanıcı';

  // Selamlama metni
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-8">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            İşte platformunuzun güncel durumu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            title="Yenile">
            <RefreshCw size={16}/>
          </button>
          <PermissionGuard permission="test_cases.create">
            <button onClick={() => navigate('/test-cases')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2 text-sm">
              <Plus size={15}/> Yeni Test
            </button>
          </PermissionGuard>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="shrink-0"/> {error}
          <button onClick={fetchAll} className="ml-auto text-rose-600 dark:text-rose-400 hover:underline font-medium flex items-center gap-1">
            <RefreshCw size={12}/> Tekrar Dene
          </button>
        </div>
      )}

      {/* ── 4 ANA METRİK KARTI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard loading={loading}
          icon={<FolderKanban size={20}/>}
          label="Toplam Proje"
          value={projects.length}
          badge={`${projects.filter(p=>p.status==='Aktif').length} aktif`}
          sub={`${projects.filter(p=>p.status==='Tamamlandı').length} tamamlandı`}
          color={{ bg:'bg-indigo-50 dark:bg-indigo-500/10', text:'text-indigo-600 dark:text-indigo-400' }}
          onClick={() => navigate('/projects')}
        />
        <MetricCard loading={loading}
          icon={<Beaker size={20}/>}
          label="Test Senaryosu"
          value={metrics.total}
          badge={`${metrics.draft} taslak`}
          sub={`${metrics.untested} test edilmedi`}
          color={{ bg:'bg-blue-50 dark:bg-blue-500/10', text:'text-blue-600 dark:text-blue-400' }}
          onClick={() => navigate('/test-cases')}
        />
        <MetricCard loading={loading}
          icon={<Target size={20}/>}
          label="Başarı Oranı"
          value={`%${metrics.successRate}`}
          badge={metrics.successRate >= 80 ? '🎉 Harika' : metrics.successRate >= 50 ? 'Orta' : '⚠️ Düşük'}
          sub={`${metrics.passed} geçti · ${metrics.failed} başarısız`}
          color={{ bg: metrics.successRate >= 80 ? 'bg-emerald-50 dark:bg-emerald-500/10' : metrics.successRate >= 50 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-rose-50 dark:bg-rose-500/10',
                   text: metrics.successRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : metrics.successRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400' }}
          onClick={() => navigate('/test-cases')}
        />
        <MetricCard loading={loading}
          icon={<ClipboardList size={20}/>}
          label="Test Planı"
          value={testPlans.length}
          badge={`${metrics.activePlans} aktif`}
          sub={`${metrics.completedPlans} tamamlandı`}
          color={{ bg:'bg-violet-50 dark:bg-violet-500/10', text:'text-violet-600 dark:text-violet-400' }}
          onClick={() => navigate('/test-plans')}
        />
      </div>

      {/* ── ANA İÇERİK — 3 kolon ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* SOL — Test Durum Özeti (2 kolon) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Test Durum Dağılımı */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 size={16} className="text-indigo-500"/> Test Durum Dağılımı
              </h2>
              <button onClick={() => navigate('/test-cases')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1">
                Tümü <ArrowRight size={12}/>
              </button>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="space-y-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-8 w-full"/>)}</div>
              ) : metrics.total === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-slate-400">
                  <Beaker size={28} className="mb-3 opacity-20"/>
                  <p className="text-sm">Henüz test senaryosu yok.</p>
                  <PermissionGuard permission="test_cases.create">
                    <button onClick={() => navigate('/test-cases')} className="mt-3 text-indigo-600 text-xs hover:underline font-medium flex items-center gap-1">
                      <Plus size={12}/> İlk testi oluştur
                    </button>
                  </PermissionGuard>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Stacked progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 mb-2">
                      <span>{metrics.total} toplam senaryo</span>
                      <span className={`font-bold ${getRateColor(metrics.successRate)}`}>%{metrics.successRate} başarı</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex gap-px">
                      {metrics.statusBar.map(item => (
                        <div key={item.label} className={`${item.color} h-full transition-all duration-700`}
                          style={{ width: `${Math.round((item.count / metrics.total) * 100)}%` }}
                          title={`${item.label}: ${item.count}`}/>
                      ))}
                    </div>
                  </div>

                  {/* Detay satırları */}
                  <div className="grid grid-cols-2 gap-3">
                    {metrics.statusBar.map(item => (
                      <div key={item.label} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`}/>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${item.text} truncate`}>{item.label}</p>
                          <p className="text-xs text-slate-400">{Math.round((item.count / metrics.total) * 100)}%</p>
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Proje Listesi */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderKanban size={16} className="text-indigo-500"/> Projeler
              </h2>
              <button onClick={() => navigate('/projects')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1">
                Tümü <ArrowRight size={12}/>
              </button>
            </div>

            {loading ? (
              <div className="p-4 space-y-2">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-12 w-full"/>)}</div>
            ) : projects.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <FolderKanban size={28} className="mx-auto mb-2 opacity-20"/>
                <p className="text-sm">Henüz proje yok.</p>
                <PermissionGuard permission="projects.create">
                  <button onClick={() => navigate('/projects')} className="mt-2 text-indigo-600 text-xs hover:underline font-medium">
                    + Proje oluştur
                  </button>
                </PermissionGuard>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {projects.slice(0, 5).map(project => {
                  const pTCs    = testCases.filter(tc => tc.project_id === project.id);
                  const pPassed = pTCs.filter(tc => tc.status === 'Başarılı').length;
                  const pFailed = pTCs.filter(tc => tc.status === 'Başarısız').length;
                  const pTested = pPassed + pFailed;
                  const pRate   = pTested > 0 ? Math.round((pPassed / pTested) * 100) : null;
                  return (
                    <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)}
                      className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 group transition-colors text-left">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500 shrink-0">
                        <FolderKanban size={15}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                          {project.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                          {pTCs.length} test · {pPassed} geçti · {pFailed} başarısız
                        </p>
                      </div>
                      {pRate !== null && (
                        <div className="hidden sm:flex items-center gap-2 shrink-0">
                          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${getRateBarColor(pRate)}`} style={{ width: `${pRate}%` }}/>
                          </div>
                          <span className={`text-xs font-bold tabular-nums w-8 text-right ${getRateColor(pRate)}`}>%{pRate}</span>
                        </div>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg border shrink-0 hidden sm:inline-flex ${
                        project.status === 'Tamamlandı' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' :
                        project.status === 'Beklemede'  ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' :
                        'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                      }`}>
                        {project.status || 'Aktif'}
                      </span>
                      <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0"/>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* SAĞ — Son Aktiviteler + Hızlı Aksiyonlar */}
        <div className="space-y-6">

          {/* Son Aktiviteler */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock size={15} className="text-indigo-500"/> Son Eklenenler
              </h2>
              <button onClick={() => navigate('/test-cases')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1">
                Tümü <ArrowRight size={12}/>
              </button>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="space-y-4">
                  {Array.from({length:4}).map((_,i)=>(
                    <div key={i} className="flex gap-3">
                      <Skeleton className="w-7 h-7 rounded-full shrink-0"/>
                      <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-full"/><Skeleton className="h-3 w-2/3"/></div>
                    </div>
                  ))}
                </div>
              ) : recentItems.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <FileEdit size={24} className="mx-auto mb-2 opacity-20"/>
                  <p className="text-xs">Henüz test eklenmedi.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentItems.map((tc, idx) => {
                    const statusCls = {
                      'Başarılı':     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                      'Başarısız':    'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
                      'Test Edilmedi':'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400',
                      'Taslak':       'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                    }[tc.status] || 'bg-slate-100 dark:bg-slate-800 text-slate-500';

                    return (
                      <div key={tc.id}
                        className="flex gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        onClick={() => navigate('/test-cases')}>
                        <div className="relative z-10 w-7 h-7 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <FileEdit size={11} className="text-indigo-500"/>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {tc.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${statusCls}`}>{tc.status}</span>
                            <span className="text-[10px] text-slate-400 truncate">{getProjectName(tc.project_id)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Test Planı Durumu */}
          {/* ✅ Düzeltildi: || true kaldırıldı */}
          {!loading && testPlans.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ClipboardList size={15} className="text-violet-500"/> Test Planları
                </h2>
                <button onClick={() => navigate('/test-plans')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium flex items-center gap-1">
                  Tümü <ArrowRight size={12}/>
                </button>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: 'Toplam',     value: testPlans.length,         color: 'text-slate-600 dark:text-slate-300',       dot: 'bg-slate-400' },
                  { label: 'Aktif',      value: metrics.activePlans,      color: 'text-amber-600 dark:text-amber-400',        dot: 'bg-amber-500' },
                  { label: 'Tamamlandı', value: metrics.completedPlans,   color: 'text-emerald-600 dark:text-emerald-400',    dot: 'bg-emerald-500' },
                  { label: 'Beklemede',  value: testPlans.filter(p => p.status === 'Beklemede').length, color: 'text-slate-400', dot: 'bg-slate-300' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${row.dot}`}/>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{row.label}</span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hızlı Aksiyonlar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap size={15} className="text-amber-500"/> Hızlı Aksiyonlar
              </h2>
            </div>
            <div className="p-3 space-y-1">
              {[
                { label: 'Yeni Test Ekle',    icon: <Beaker size={15}/>,        path: '/test-cases',  perm: 'test_cases.create',  color: 'text-indigo-500' },
                { label: 'Yeni Proje',         icon: <FolderKanban size={15}/>,  path: '/projects',    perm: 'projects.create',    color: 'text-blue-500' },
                { label: 'Yeni Test Planı',    icon: <ClipboardList size={15}/>, path: '/test-plans',  perm: 'test_plans.create',  color: 'text-violet-500' },
                { label: 'Raporları Görüntüle',icon: <TrendingUp size={15}/>,    path: '/reports',     perm: 'reports.view',       color: 'text-emerald-500' },
                { label: 'Otomasyon Çalıştır', icon: <PlayCircle size={15}/>,    path: '/automation',  perm: 'automation.execute', color: 'text-rose-500' },
              ].filter(a => !a.perm || can(a.perm)).map(action => (
                <button key={action.label} onClick={() => navigate(action.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group text-left">
                  <span className={`${action.color} shrink-0 group-hover:scale-110 transition-transform`}>{action.icon}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    {action.label}
                  </span>
                  <ChevronRight size={13} className="ml-auto text-slate-300 dark:text-slate-600 group-hover:text-slate-400 transition-colors shrink-0"/>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;