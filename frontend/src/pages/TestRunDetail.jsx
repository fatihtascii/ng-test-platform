import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { testRunsApi, projectsApi, testCasesApi } from '../api';
import { usePermission } from '../hooks/usePermission';
import {
  ArrowLeft, PlayCircle, Folder, Clock, CheckCircle2,
  XCircle, SkipForward, AlertCircle, Play, BarChart3,
  Target, Hash, RefreshCw
} from 'lucide-react';

// ── Yardımcılar ────────────────────────────────────────────────
const safeParseResults = (str) => {
  if (!str) return [];
  try { const p = JSON.parse(str); return Array.isArray(p) ? p : []; }
  catch { return []; }
};

const getStatusConfig = (status) => {
  switch (status) {
    case 'Tamamlandı': return { cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' };
    case 'Beklemede':  return { cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' };
    default:           return { cls: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500' };
  }
};

const getResultConfig = (status) => {
  switch (status) {
    case 'Passed':  return { cls: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500', label: 'Geçti' };
    case 'Failed':  return { cls: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 border-rose-200 dark:border-rose-800',                dot: 'bg-rose-500',    label: 'Başarısız' };
    case 'Skipped': return { cls: 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800',           dot: 'bg-amber-500',   label: 'Atlandı' };
    default:        return { cls: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',              dot: 'bg-slate-400',   label: 'Bekliyor' };
  }
};

const getPriorityStyle = (p) => ({
  'Kritik': 'text-rose-600',
  'Yüksek': 'text-orange-500',
  'Orta':   'text-indigo-500',
  'Düşük':  'text-slate-400',
}[p] || 'text-slate-400');

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Ana Bileşen ────────────────────────────────────────────────
const TestRunDetail = () => {
  const { can } = usePermission();
  const { id }   = useParams();
  const navigate = useNavigate();

  const [run, setRun]           = useState(null);
  const [project, setProject]   = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');


  const fetchDetail = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // FIX: /test-runs/{id} direkt endpoint kullanılıyor — tüm listeyi çekmek yerine
      const [runRes, projsRes, casesRes] = await Promise.allSettled([
        testRunsApi.getOne(id),
        projectsApi.getAll(),
        testCasesApi.getAll(),
      ]);

      if (runRes.status !== 'fulfilled') throw new Error('Koşum bulunamadı.');

      const found = runRes.value.data;
      setRun(found);
      if (projsRes.status === 'fulfilled') {
        setProject(projsRes.value.data.find(p => p.id === found.project_id) || null);
      }
      if (casesRes.status === 'fulfilled') setTestCases(casesRes.value.data);
    } catch (err) {
      setError(err.message || 'Veri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // ── Hesaplamalar (✅ useMemo ile Optimize Edildi) ────────────
  const results = useMemo(() => safeParseResults(run?.results), [run?.results]);
  
  const stats = useMemo(() => {
    const total    = results.length;
    const passed   = results.filter(r => r.status === 'Passed').length;
    const failed   = results.filter(r => r.status === 'Failed').length;
    const skipped  = results.filter(r => r.status === 'Skipped').length;
    const pending  = total - passed - failed - skipped;
    const rate     = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    return { total, passed, failed, skipped, pending, rate };
  }, [results]);

  const enrichedResults = useMemo(() => {
    return results.map((r, idx) => {
      const tc = testCases.find(t => t.id === r.test_case_id || t.id === r.case_id);
      return {
        ...r,
        index:    idx,
        tc_title: tc?.title    || r.caseName || `Test #${r.test_case_id ?? idx}`,
        tc_prio:  tc?.priority || null,
        tc_id:    tc?.id       || r.test_case_id,
      };
    });
  }, [results, testCases]);

  const visibleResults = useMemo(() => {
    if (activeFilter === 'All') return enrichedResults;
    return enrichedResults.filter(r => {
      if (activeFilter === 'Pending') return r.status !== 'Passed' && r.status !== 'Failed' && r.status !== 'Skipped';
      return r.status === activeFilter;
    });
  }, [enrichedResults, activeFilter]);

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-xl"/>
        <div className="space-y-2"><Skeleton className="h-7 w-56"/><Skeleton className="h-4 w-72"/></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-24 rounded-2xl"/>)}
      </div>
      <Skeleton className="h-96 rounded-2xl"/>
    </div>
  );

  if (error || !run) return (
    <div className="text-center py-20 space-y-4">
      <div className="w-14 h-14 bg-rose-100 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto">
        <PlayCircle size={28} className="text-rose-500"/>
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Koşum Bulunamadı</h2>
      <p className="text-slate-500 dark:text-slate-400 text-sm">{error}</p>
      <div className="flex items-center gap-3 justify-center">
        <button onClick={() => navigate('/test-runs')}
          className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 transition-colors">
          Geri Dön
        </button>
        <button onClick={fetchDetail}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2">
          <RefreshCw size={15}/> Tekrar Dene
        </button>
      </div>
    </div>
  );

  const rateColor = stats.rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : stats.rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  const statConf = getStatusConfig(run.status);

  // Filtre
  const filterOptions = [
    { key: 'All',     label: 'Tümü',       count: stats.total   },
    { key: 'Failed',  label: 'Başarısız',  count: stats.failed  },
    { key: 'Passed',  label: 'Geçti',      count: stats.passed  },
    { key: 'Skipped', label: 'Atlandı',    count: stats.skipped },
    { key: 'Pending', label: 'Bekliyor',   count: stats.pending },
  ].filter(f => f.count > 0 || f.key === 'All');

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">

      {/* HEADER */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/test-runs')}
          className="p-2 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0">
          <ArrowLeft size={20}/>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{run.name}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${statConf.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statConf.dot}`}/>{run.status}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {run.description || 'Açıklama yok.'} · {project?.name || '—'} · #{run.id}
          </p>
        </div>
        <button onClick={() => navigate(`/test-runs/${id}`, { replace: true })}
          className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors shrink-0"
          title="Yenile">
          <RefreshCw size={17}/>
        </button>
      </div>

      {/* ÖZET KARTLARI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Toplam',     value: stats.total,   icon: <Hash size={18}/>,          bg: 'bg-slate-100 dark:bg-slate-800',           text: 'text-slate-600 dark:text-slate-300' },
          { label: 'Geçti',      value: stats.passed,  icon: <CheckCircle2 size={18}/>,  bg: 'bg-emerald-50 dark:bg-emerald-500/10',     text: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Başarısız',  value: stats.failed,  icon: <XCircle size={18}/>,       bg: 'bg-rose-50 dark:bg-rose-500/10',           text: 'text-rose-600 dark:text-rose-400' },
          { label: 'Atlanan',    value: stats.skipped, icon: <SkipForward size={18}/>,   bg: 'bg-amber-50 dark:bg-amber-500/10',         text: 'text-amber-600 dark:text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center ${s.text} shrink-0`}>{s.icon}</div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{s.value}</p>
              <p className={`text-xs font-medium ${s.text}`}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* DETAY GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Sol: Sonuç Listesi */}
        <div className="lg:col-span-2 space-y-4">

          {/* Filtre Tabları */}
          {stats.total > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {filterOptions.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    activeFilter === f.key
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                  }`}>
                  {f.label}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-xs ${activeFilter === f.key ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Sonuç Kartları */}
          {stats.total === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400">
              <PlayCircle size={32} className="mx-auto mb-3 opacity-20"/>
              <p className="text-sm font-medium">Bu koşum henüz çalıştırılmamış.</p>
              
              {/* YETKİ KONTROLÜ: Koşumu Başlat Yönlendirmesi */}
              {can('test_runs.execute') && (
                <button onClick={() => navigate('/test-runs')}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto">
                  <Play size={14}/> Koşumu Başlat
                </button>
              )}
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400">
              <p className="text-sm">Bu filtrede sonuç yok.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleResults.map((r) => {
                const conf = getResultConfig(r.status);
                return (
                  <div key={r.index} className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 transition-all ${r.status === 'Failed' ? 'border-rose-200 dark:border-rose-800/50' : 'border-slate-200 dark:border-slate-800'}`}>
                    <div className="flex items-start gap-4">
                      {/* Status ikonuu */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        r.status === 'Passed'  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500' :
                        r.status === 'Failed'  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-500' :
                        r.status === 'Skipped' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}>
                        {r.status === 'Passed'  ? <CheckCircle2 size={16}/> :
                         r.status === 'Failed'  ? <XCircle size={16}/> :
                         r.status === 'Skipped' ? <SkipForward size={16}/> :
                         <Clock size={16}/>}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{r.tc_title}</p>
                          {r.tc_prio && (
                            <span className={`text-xs font-bold ${getPriorityStyle(r.tc_prio)}`}>{r.tc_prio}</span>
                          )}
                          <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${conf.cls}`}>
                            <span className={`w-1 h-1 rounded-full ${conf.dot}`}/>{conf.label}
                          </span>
                        </div>
                        {r.tc_id && (
                          <p className="text-xs text-slate-400 mt-0.5">#{r.tc_id}</p>
                        )}
                        {/* Hata notu */}
                        {r.actual_result && (
                          <div className="mt-3 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/30 rounded-xl p-3">
                            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1 uppercase tracking-wide">Hata Notu</p>
                            <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">{r.actual_result}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sağ: Meta + İstatistikler */}
        <div className="space-y-4">

          {/* Koşum Bilgileri */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Koşum Bilgileri</h3>
            <div className="space-y-3">
              {[
                { icon: <Hash size={13}/>,          label: 'ID',     value: `#${run.id}` },
                { icon: <Folder size={13}/>,         label: 'Proje',  value: project?.name || '—' },
                { icon: <Target size={13}/>,         label: 'Durum',  value: run.status },
                { icon: <BarChart3 size={13}/>,      label: 'Testler',value: `${stats.total} test senaryosu` },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">{icon}{label}</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Başarı Oranı */}
          {stats.total > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Başarı Oranı</h3>

              {/* Büyük yüzde */}
              <div className="text-center mb-4">
                <p className={`text-5xl font-bold tabular-nums ${rateColor}`}>%{stats.rate}</p>
                <p className="text-xs text-slate-400 mt-1">{stats.passed}/{stats.total} test geçti</p>
              </div>

              {/* Stacked bar */}
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex gap-0.5 mb-4">
                {stats.passed  > 0 && <div className="bg-emerald-500 h-full rounded-full transition-all duration-700" style={{width:`${(stats.passed/stats.total)*100}%`}}/>}
                {stats.failed  > 0 && <div className="bg-rose-500 h-full rounded-full transition-all duration-700" style={{width:`${(stats.failed/stats.total)*100}%`}}/>}
                {stats.skipped > 0 && <div className="bg-amber-500 h-full rounded-full transition-all duration-700" style={{width:`${(stats.skipped/stats.total)*100}%`}}/>}
              </div>

              {/* Dağılım */}
              <div className="space-y-2">
                {[
                  { label: 'Geçti',     count: stats.passed,  color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Başarısız', count: stats.failed,  color: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400' },
                  { label: 'Atlandı',   count: stats.skipped, color: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Bekliyor',  count: stats.pending, color: 'bg-slate-400',   text: 'text-slate-500' },
                ].filter(i => i.count > 0).map(i => (
                  <div key={i.label} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${i.color}`}/>
                    <span className={`flex-1 font-medium ${i.text}`}>{i.label}</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">{i.count}</span>
                    <span className="text-slate-400 w-8 text-right tabular-nums">%{Math.round((i.count/stats.total)*100)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aksiyonlar */}
          <div className="space-y-2">
            <button onClick={() => navigate('/test-runs')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
              <ArrowLeft size={15}/> Koşumlar Listesine Dön
            </button>
            {stats.failed > 0 && (
              <button onClick={() => navigate('/defects')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors text-sm font-medium">
                <XCircle size={15}/> {stats.failed} Hatayı İncele
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestRunDetail;