import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Download, TrendingUp, CheckCircle2, AlertCircle, Target, Zap,
  ChevronDown, BarChart3, Loader2, ArrowLeft, FileSpreadsheet,
  Bug, ClipboardList, RefreshCw
} from 'lucide-react';

// ── Yardımcılar ────────────────────────────────────────────────

/** Güvenli JSON parse — hatalı string'de [] döner */
const safeParseResults = (str) => {
  if (!str) return [];
  try {
    const p = JSON.parse(str);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── StatCard ───────────────────────────────────────────────────
const colorMap = {
  indigo:  'text-indigo-500 bg-indigo-500/10',
  emerald: 'text-emerald-500 bg-emerald-500/10',
  rose:    'text-rose-500 bg-rose-500/10',
  amber:   'text-amber-500 bg-amber-500/10',
  violet:  'text-violet-500 bg-violet-500/10',
};

const StatCard = ({ title, value, icon, color, sub }) => (
  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${colorMap[color] || colorMap.indigo}`}>{icon}</div>
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value ?? '—'}</h2>
    {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
  </div>
);

// ── Tooltip özelleştirme ───────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-xl text-xs text-white space-y-1">
      <p className="font-bold text-slate-300 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  );
};

// ── Ana Bileşen ────────────────────────────────────────────────
const Reports = () => {
  const { can } = usePermission();

  const [rawData, setRawData]         = useState({ testRuns: [], testCases: [], projects: [], testPlans: [] });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isExportingPdf, setIsExportingPdf]   = useState(false);
  const [toast, setToast]             = useState(null);
  const reportRef = useRef(null);

  // ✅ Dinamik API Base URL
  const API_BASE = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000';

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Veri Çekme ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // ✅ Domino Etkisi Çözüldü: Her fetch kendi hatasını yakalar, diğerlerini bozmaz.
      const [runsRes, casesRes, projsRes, plansRes] = await Promise.all([
        fetch(`${API_BASE}/test-runs`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/test-cases`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/projects`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/test-plans`).catch(() => ({ ok: false })),
      ]);
      
      setRawData({
        testRuns:  runsRes.ok  ? await runsRes.json()  : [],
        testCases: casesRes.ok ? await casesRes.json() : [],
        projects:  projsRes.ok ? await projsRes.json() : [],
        testPlans: plansRes.ok ? await plansRes.json() : [],
      });
      
      if (!runsRes.ok || !casesRes.ok || !projsRes.ok) setError('Bazı veriler yüklenemedi. Rapor eksik olabilir.');
    } catch {
      setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Global Metrikler ─────────────────────────────────────────
  const globalMetrics = useMemo(() => {
    let totalP = 0, totalF = 0, totalS = 0;
    const recentBugs = [];

    const projectStats = rawData.projects.map(proj => {
      const projRuns = rawData.testRuns.filter(r => r.project_id === proj.id);
      let p = 0, f = 0, s = 0;
      projRuns.forEach(run => {
        safeParseResults(run.results).forEach(res => {
          if (res.status === 'Passed')  { p++; totalP++; }
          if (res.status === 'Failed')  {
            f++; totalF++;
            // caseName yoksa run adını ve id'yi kullan
            recentBugs.push({
              id:      `BUG-${run.id}`,
              title:   res.actual_result ? res.actual_result.slice(0, 60) : `${run.name} koşumunda hata`,
              project: proj.name,
            });
          }
          if (res.status === 'Skipped') { s++; totalS++; }
        });
      });
      return { id: proj.id, name: proj.name, passed: p, failed: f, skipped: s, total: p + f + s };
    });

    // Son 8 koşum trendi
    const trend = rawData.testRuns.slice(-8).map(run => {
      const res = safeParseResults(run.results);
      return {
        name:   run.name.length > 12 ? run.name.slice(0, 12) + '…' : run.name,
        Geçti:  res.filter(r => r.status === 'Passed').length,
        Kaldı:  res.filter(r => r.status === 'Failed').length,
        Atlandı:res.filter(r => r.status === 'Skipped').length,
      };
    });

    // Test case durum dağılımı
    const tcStatusDist = [
      { name: 'Başarılı',     value: rawData.testCases.filter(tc => tc.status === 'Başarılı').length,     fill: '#10b981' },
      { name: 'Başarısız',    value: rawData.testCases.filter(tc => tc.status === 'Başarısız').length,    fill: '#f43f5e' },
      { name: 'Taslak',       value: rawData.testCases.filter(tc => tc.status === 'Taslak').length,       fill: '#94a3b8' },
      { name: 'Test Edilmedi',value: rawData.testCases.filter(tc => tc.status === 'Test Edilmedi').length, fill: '#a78bfa' },
    ].filter(d => d.value > 0);

    // Test planı metrikleri
    const planStats = {
      total:      rawData.testPlans.length,
      active:     rawData.testPlans.filter(p => p.status === 'Aktif').length,
      completed:  rawData.testPlans.filter(p => p.status === 'Tamamlandı').length,
    };

    return {
      totalP, totalF, totalS, projectStats, trend, tcStatusDist, planStats,
      recentBugs: recentBugs.slice(-6).reverse(),
      successRate: totalP + totalF > 0 ? ((totalP / (totalP + totalF)) * 100).toFixed(1) : '0.0',
    };
  }, [rawData]);

  // ── Proje Detay Metrikleri ───────────────────────────────────
  const detailData = useMemo(() => {
    if (!selectedProject) return [];
    return rawData.testRuns
      .filter(r => r.project_id === selectedProject.id)
      .map(run => {
        const res = safeParseResults(run.results);
        return {
          name:   run.name.length > 14 ? run.name.slice(0, 14) + '…' : run.name,
          Geçti:  res.filter(r => r.status === 'Passed').length,
          Kaldı:  res.filter(r => r.status === 'Failed').length,
          Atlandı:res.filter(r => r.status === 'Skipped').length,
        };
      });
  }, [selectedProject, rawData]);

  const detailTotals = useMemo(() => ({
    passed:  detailData.reduce((a, c) => a + c.Geçti,   0),
    failed:  detailData.reduce((a, c) => a + c.Kaldı,   0),
    skipped: detailData.reduce((a, c) => a + c.Atlandı, 0),
  }), [detailData]);

  // ── PDF Export ───────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsExportingPdf(true);
    try {
      const { toPng }   = await import('html-to-image');
      const { jsPDF }   = await import('jspdf');
      const el          = reportRef.current;
      const dataUrl     = await toPng(el, { quality: 0.95, backgroundColor: '#0f172a', pixelRatio: 2 });
      const pdf         = new jsPDF('p', 'mm', 'a4');
      const pdfWidth    = pdf.internal.pageSize.getWidth();
      const pdfHeight   = (el.offsetHeight * pdfWidth) / el.offsetWidth;
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`NG-TEST-Report-${selectedProject?.name || 'Genel'}.pdf`);
      showToast('success', 'PDF başarıyla indirildi.');
    } catch (err) {
      console.error('PDF hatası:', err);
      showToast('error', 'PDF oluşturulamadı. Konsolu kontrol edin.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // ── Excel Export ─────────────────────────────────────────────
  const handleDownloadExcel = async () => {
    try {
      const XLSX = await import('xlsx');

      // Birden fazla sekme
      const wb = XLSX.utils.book_new();

      // 1. Genel proje metrikleri
      const projSheet = XLSX.utils.json_to_sheet(
        globalMetrics.projectStats.map(p => ({
          'Proje':       p.name,
          'Geçen':       p.passed,
          'Başarısız':   p.failed,
          'Atlanan':     p.skipped,
          'Toplam':      p.total,
          'Başarı Oranı':p.total > 0 ? `%${((p.passed / p.total) * 100).toFixed(1)}` : '—',
        }))
      );
      XLSX.utils.book_append_sheet(wb, projSheet, 'Proje Özeti');

      // 2. Tüm test case'ler
      const tcSheet = XLSX.utils.json_to_sheet(
        rawData.testCases.map(tc => ({
          'ID':    tc.id,
          'Başlık':tc.title,
          'Proje': rawData.projects.find(p => p.id === tc.project_id)?.name || '—',
          'Durum': tc.status,
          'Öncelik':tc.priority,
        }))
      );
      XLSX.utils.book_append_sheet(wb, tcSheet, 'Test Senaryoları');

      // 3. Test planları
      if (rawData.testPlans.length > 0) {
        const plansSheet = XLSX.utils.json_to_sheet(
          rawData.testPlans.map(pl => ({
            'ID':         pl.id,
            'Plan Adı':   pl.title,
            'Proje':      rawData.projects.find(p => p.id === pl.project_id)?.name || '—',
            'Durum':      pl.status,
            'Başlangıç':  pl.start_date || '—',
            'Bitiş':      pl.end_date   || '—',
            'Test Sayısı':pl.items?.length || 0,
          }))
        );
        XLSX.utils.book_append_sheet(wb, plansSheet, 'Test Planları');
      }

      XLSX.writeFile(wb, `NG-TEST-Rapor-${Date.now()}.xlsx`);
      showToast('success', 'Excel başarıyla indirildi.');
    } catch (err) {
      console.error('Excel hatası:', err);
      showToast('error', 'Excel oluşturulamadı.');
    }
  };

  // ── Render: Loading ──────────────────────────────────────────
  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
            <Skeleton className="w-12 h-12 rounded-2xl" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );

  // ── Render: Ana ──────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedProject && (
            <button onClick={() => setSelectedProject(null)}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {selectedProject ? `${selectedProject.name} — Detay Analizi` : 'Sistem Raporları'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {selectedProject ? 'Projeye ait koşum verileri' : 'Platform geneli test metrikleri'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={fetchAll}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
            title="Yenile">
            <RefreshCw size={18} />
          </button>
          <button onClick={handleDownloadPDF} disabled={isExportingPdf}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-rose-600/20">
            {isExportingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF İndir
          </button>
          <button onClick={handleDownloadExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20">
            <FileSpreadsheet size={15} /> Excel İndir
          </button>
        </div>
      </div>

      {/* Hata Banner */}
      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
          <button onClick={fetchAll} className="ml-auto text-rose-600 hover:underline font-medium">Tekrar Dene</button>
        </div>
      )}

      {/* PDF içeriği */}
      <div ref={reportRef} className="space-y-6 p-2 rounded-2xl">

        {/* STAT KARTLARI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {!selectedProject ? (
            <>
              <StatCard title="Toplam Geçen"   value={globalMetrics.totalP}      icon={<CheckCircle2 size={22}/>} color="emerald" sub={`${rawData.testRuns.length} koşumdan`} />
              <StatCard title="Toplam Başarısız" value={globalMetrics.totalF}    icon={<AlertCircle size={22}/>}  color="rose"    sub={`${globalMetrics.totalS} atlanan`} />
              <StatCard title="Aktif Projeler"  value={rawData.projects.length}  icon={<Target size={22}/>}       color="indigo"  sub={`${rawData.testCases.length} test senaryosu`} />
              <StatCard title="Genel Başarı"    value={`%${globalMetrics.successRate}`} icon={<TrendingUp size={22}/>} color="amber" sub={`${globalMetrics.planStats.completed} plan tamamlandı`} />
            </>
          ) : (
            <>
              <StatCard title="Koşum Sayısı"   value={detailData.length}           icon={<Zap size={22}/>}          color="indigo"  />
              <StatCard title="Geçen Test"      value={detailTotals.passed}         icon={<CheckCircle2 size={22}/>} color="emerald" />
              <StatCard title="Başarısız Test"  value={detailTotals.failed}         icon={<AlertCircle size={22}/>}  color="rose"    />
              <StatCard title="Proje Başarısı"  value={`%${
                detailTotals.passed + detailTotals.failed > 0
                  ? ((detailTotals.passed / (detailTotals.passed + detailTotals.failed)) * 100).toFixed(1)
                  : '0.0'
              }`} icon={<TrendingUp size={22}/>} color="amber" />
            </>
          )}
        </div>

        {/* TEST PLAN METRİKLERİ (sadece genel görünümde) */}
        {!selectedProject && rawData.testPlans.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Toplam Plan',    value: globalMetrics.planStats.total,     color: 'text-indigo-600 dark:text-indigo-400',  bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
              { label: 'Aktif Plan',     value: globalMetrics.planStats.active,    color: 'text-amber-600  dark:text-amber-400',   bg: 'bg-amber-50  dark:bg-amber-500/10' },
              { label: 'Tamamlanan Plan',value: globalMetrics.planStats.completed, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center gap-4`}>
                <ClipboardList size={20} className={color} />
                <div>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* GRAFİKLER */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Performans Trendi */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
              <TrendingUp size={17} className="text-indigo-500" />
              {selectedProject ? 'Koşum Bazlı Performans' : 'Son 8 Koşum Trendi'}
            </h3>
            {(selectedProject ? detailData : globalMetrics.trend).length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Veri bulunamadı.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selectedProject ? detailData : globalMetrics.trend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <defs>
                      <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="Geçti"   stroke="#10b981" fill="url(#gP)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="Kaldı"   stroke="#f43f5e" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" />
                    <Area type="monotone" dataKey="Atlandı" stroke="#f59e0b" fillOpacity={0} strokeWidth={1.5} strokeDasharray="3 3" />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Dağılım Grafiği */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
              <BarChart3 size={17} className="text-amber-500" />
              {selectedProject ? 'Koşum Sonuç Dağılımı' : 'Test Case Durum Dağılımı'}
            </h3>
            {(selectedProject
              ? detailTotals.passed + detailTotals.failed === 0
              : globalMetrics.tcStatusDist.length === 0
            ) ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Veri bulunamadı.</div>
            ) : selectedProject ? (
              // Proje detayında bar chart
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detailData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <Bar dataKey="Geçti"   fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="Kaldı"   fill="#f43f5e" radius={[4,4,0,0]} />
                    <Bar dataKey="Atlandı" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              // Genel görünümde pie chart
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={globalMetrics.tcStatusDist} innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={6}>
                      {globalMetrics.tcStatusDist.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* PROJE MATRİSİ + HATALAR (sadece genel görünüm) */}
        {!selectedProject && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Proje Matrisi */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white">Proje Performans Matrisi</h3>
                <p className="text-xs text-slate-400 mt-0.5">Detay için projeye tıklayın</p>
              </div>
              {globalMetrics.projectStats.length === 0 ? (
                <div className="px-6 py-10 text-center text-slate-400 text-sm">Proje verisi yok.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {globalMetrics.projectStats.map((proj) => {
                    const rate = proj.total > 0 ? ((proj.passed / proj.total) * 100) : 0;
                    return (
                      <div key={proj.id}
                        onClick={() => setSelectedProject(rawData.projects.find(p => p.id === proj.id))}
                        className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-all group">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-xl flex items-center justify-center font-bold text-sm group-hover:bg-indigo-500 group-hover:text-white transition-all shrink-0">
                            {proj.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{proj.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${rate}%` }} />
                              </div>
                              <span className="text-xs text-slate-400">{proj.total} sonuç</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className={`text-sm font-black ${rate >= 80 ? 'text-emerald-500' : rate >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                              %{rate.toFixed(0)}
                            </p>
                            <p className="text-xs text-slate-400">başarı</p>
                          </div>
                          <ChevronDown size={15} className="text-slate-300 -rotate-90 group-hover:text-indigo-500 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Son Hatalar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Bug size={17} className="text-rose-500" /> Son Bulunan Hatalar
              </h3>
              <div className="space-y-3">
                {globalMetrics.recentBugs.length > 0 ? globalMetrics.recentBugs.map((bug, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-all">
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-white leading-snug truncate">{bug.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{bug.project}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-6">
                    <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">Harika! Son koşumlarda hata yok.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PROJE DETAY — Test Case Listesi */}
        {selectedProject && (() => {
          const projTCs = rawData.testCases.filter(tc => tc.project_id === selectedProject.id);
          return projTCs.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white">Projeye Ait Test Senaryoları</h3>
                <p className="text-xs text-slate-400 mt-0.5">{projTCs.length} senaryo</p>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-3">Başlık</th>
                    <th className="px-6 py-3">Öncelik</th>
                    <th className="px-6 py-3">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {projTCs.map(tc => (
                    <tr key={tc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-3 text-sm text-slate-800 dark:text-slate-200 font-medium">{tc.title}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold ${
                          tc.priority === 'Kritik' ? 'text-rose-600' :
                          tc.priority === 'Yüksek' ? 'text-orange-500' :
                          tc.priority === 'Orta'   ? 'text-indigo-500' : 'text-slate-400'
                        }`}>{tc.priority}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          tc.status === 'Başarılı'     ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                          tc.status === 'Başarısız'    ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400' :
                          tc.status === 'Test Edilmedi'? 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>{tc.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
};

export default Reports;