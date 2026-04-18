import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import {
  ArrowLeft, Bug, Target, Clock, AlertCircle,
  Terminal, AlignLeft, CheckCircle2, PlayCircle,
  Folder, Tag, RefreshCw, Copy, Check
} from 'lucide-react';

// ── Sabitler (Defects.jsx ile %100 Uyumlu) ─────────────────────
const STATUS_OPTIONS = [
  { value: 'Open',        label: '🔴 Açık',          cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  { value: 'In Progress', label: '🟡 İnceleniyor',   cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { value: 'Resolved',    label: '🟢 Çözüldü',       cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  { value: 'Re-test',     label: '🔵 Tekrar Test',   cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
];

const SEVERITY_CONFIG = {
  'Kritik': { bg: 'bg-rose-500/10 text-rose-600',     badge: 'bg-rose-500 text-white' },
  'Yüksek': { bg: 'bg-orange-500/10 text-orange-600', badge: 'bg-orange-500 text-white' },
  'Orta':   { bg: 'bg-amber-500/10 text-amber-600',   badge: 'bg-amber-500 text-white' },
  'Düşük':  { bg: 'bg-blue-500/10 text-blue-600',     badge: 'bg-blue-400 text-white' },
};

const getSeverityConfig = (s) => SEVERITY_CONFIG[s] || SEVERITY_CONFIG['Orta'];
const getStatusCls = (s) => STATUS_OPTIONS.find(o => o.value === s)?.cls || 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700';
const getStatusLabel = (s) => STATUS_OPTIONS.find(o => o.value === s)?.label || s;
const LS_KEY = 'ng-defect-statuses';

// ── Yardımcılar ────────────────────────────────────────────────
const safeParseResults = (str) => {
  if (!str) return [];
  try { const p = JSON.parse(str); return Array.isArray(p) ? p : []; }
  catch { return []; }
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Ana Bileşen ────────────────────────────────────────────────
const DefectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();

  const [defectData, setDefectData] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [status, setStatus]         = useState('Open');
  const [copied, setCopied]         = useState(false);

  // localStorage'dan statü oku
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      setStatus(saved[id] ?? 'Open');
    } catch { setStatus('Open'); }
  }, [id]);

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    const now = new Date().toISOString();
    try {
      const savedStatuses = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      const savedTimes    = JSON.parse(localStorage.getItem(`${LS_KEY}-times`) || '{}');
      
      localStorage.setItem(LS_KEY, JSON.stringify({ ...savedStatuses, [id]: newStatus }));
      localStorage.setItem(`${LS_KEY}-times`, JSON.stringify({ ...savedTimes, [id]: now }));
    } catch { console.error('localStorage yazılamadı.'); }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(`${id} - ${defectData?.title}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchDetail = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const parts = id.split('-');
      if (parts.length < 3) throw new Error('Geçersiz hata ID formatı.');
      const runId = parts[1];

      const [runsRes, projsRes, casesRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/test-runs').catch(() => ({ ok: false })),
        fetch('http://127.0.0.1:8000/projects').catch(() => ({ ok: false })),
        fetch('http://127.0.0.1:8000/test-cases').catch(() => ({ ok: false })),
      ]);

      if (!runsRes || !runsRes.ok) throw new Error('Sunucuya bağlanılamadı (Test Koşumları yüklenemedi).');
      
      const testRuns  = await runsRes.json();
      const projects  = projsRes.ok  ? await projsRes.json()  : [];
      const testCases = casesRes.ok  ? await casesRes.json()  : [];

      const run = testRuns.find(r => String(r.id) === String(runId));
      if (!run) throw new Error('Bu hatanın bağlı olduğu koşum silinmiş veya bulunamadı.');

      const results = safeParseResults(run.results);

      const targetResult = results.find((r, idx) => {
        const tId = r.case_id || r.test_case_id || r.id || idx;
        return `BUG-${run.id}-${tId}` === id || `BUG-${run.id}-idx${idx}` === id;
      });

      if (!targetResult) throw new Error('Bu ID\'ye ait hata kaydı koşum sonuçları içinde bulunamadı.');

      const targetTcId = targetResult.case_id || targetResult.test_case_id || targetResult.id;
      const realTC = testCases.find(tc => String(tc.id) === String(targetTcId));

      const title    = realTC?.title || targetResult.caseName || targetResult.test_case_title || `Bilinmeyen Test Senaryosu`;
      const severity = realTC?.priority || targetResult.test_case_priority || 'Orta';
      const project  = projects.find(p => String(p.id) === String(run.project_id));

      let description   = realTC?.description || null;
      let stepsDisplay  = null;
      let testType      = null;
      let executionType = null;

      if (description && description.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(description);
          testType      = parsed.type          ?? null;
          executionType = parsed.execution_type ?? null;
          if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
            stepsDisplay = parsed.steps;
          }
          description = 'Bu senaryo yapılandırılmış (BDD) formatta girilmiştir. Adımları aşağıdan inceleyebilirsiniz.';
        } catch { /* JSON değilse düz metin kalır */ }
      }

      const errorMessage =
        targetResult.actual_result ||
        targetResult.actualResult  ||
        targetResult.notes         ||
        targetResult.error         ||
        targetResult.message       ||
        targetResult.comment       ||
        null;

      setDefectData({
        id,
        title,
        projectName: project?.name ?? 'Bilinmeyen Proje',
        runName:     run.name      ?? 'İsimsiz Koşum',
        severity,
        errorMessage,
        description,
        stepsDisplay,
        testType,
        executionType,
        detectedAt: run.created_at ? new Date(run.created_at).toLocaleString('tr-TR', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Tarih Bilinmiyor',
      });
    } catch (err) {
      setError(err.message || 'Hata detayları yüklenirken beklenmeyen bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // ── Render: Loading ──────────────────────────────────────────
  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64" /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-[22rem] rounded-2xl" />
      </div>
    </div>
  );

  // ── Render: Hata Durumu ──────────────────────────────────────
  if (error || !defectData) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800 rounded-3xl flex items-center justify-center shadow-inner">
        <Bug size={32} className="text-rose-500" />
      </div>
      <div>
        <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Detaylara Ulaşılamadı</h2>
        <p className="text-slate-500 dark:text-slate-400 font-medium text-sm max-w-md mx-auto leading-relaxed">{error}</p>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => navigate('/defects')}
          className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
          Listeye Dön
        </button>
        <button onClick={fetchDetail}
          className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-sm shadow-rose-600/20">
          <RefreshCw size={15} /> Yeniden Dene
        </button>
      </div>
    </div>
  );

  const sevConfig = getSeverityConfig(defectData.severity);
  const currentStatus = STATUS_OPTIONS.find(o => o.value === status);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-7xl mx-auto">

      {/* HEADER */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/defects')}
          className="p-2.5 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-all shrink-0 shadow-sm">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white font-mono tracking-tight bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              {defectData.id}
            </h1>
            <span className={`text-[11px] uppercase font-black tracking-wider px-2.5 py-1 rounded-md ${sevConfig.badge}`}>
              {defectData.severity}
            </span>
            <span className={`text-[11px] uppercase font-black tracking-wider px-2.5 py-1 rounded-md border ${getStatusCls(status)}`}>
              {currentStatus?.label || status}
            </span>
            
            {/* KOPYALA BUTONU */}
            <button onClick={handleCopyId}
              className="ml-auto text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg">
              {copied ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
              <span className="hidden sm:inline">{copied ? 'Kopyalandı' : 'ID Kopyala'}</span>
            </button>
          </div>
          <p className="text-lg text-slate-700 dark:text-slate-200 font-bold leading-snug">{defectData.title}</p>
          <div className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><Folder size={12}/> {defectData.projectName}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"/>
            <span className="flex items-center gap-1"><PlayCircle size={12}/> {defectData.runName}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── SOL KOLON (Detaylar) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Hata Mesajı (Terminal) */}
          <div className="bg-[#0d1117] rounded-2xl p-5 md:p-6 border border-slate-800 shadow-xl overflow-hidden relative">
            {/* Dekoratif Mac Butonları */}
            <div className="absolute top-4 left-4 flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            </div>

            <h3 className="text-slate-400 font-bold mt-4 mb-4 flex items-center gap-2 text-sm ml-1">
              <Terminal size={16} className="text-rose-400" /> Çalışma Zamanı Hata Çıktısı
            </h3>
            <div className="font-mono text-sm bg-black/40 rounded-xl p-4 md:p-5 overflow-x-auto border border-white/5">
              {defectData.errorMessage ? (
                <span className="text-rose-400/90 whitespace-pre-wrap leading-relaxed">{defectData.errorMessage}</span>
              ) : (
                <span className="text-slate-500 italic">Test otomasyonu özel bir hata (Exception) fırlatmadı veya manuel test sırasında log girilmedi.</span>
              )}
            </div>
          </div>

          {/* Senaryo Açıklaması ve Adımlar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap border-b border-slate-100 dark:border-slate-800/60 pb-4">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlignLeft size={18} className="text-indigo-500" /> Senaryo Detayları
              </h3>
              <div className="flex gap-2">
                {defectData.testType && (
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700">
                    {defectData.testType}
                  </span>
                )}
                {defectData.executionType && (
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700">
                    {defectData.executionType}
                  </span>
                )}
              </div>
            </div>
            
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-8 font-medium">
              {defectData.description || 'Bu senaryo için herhangi bir ön açıklama veya metin bulunmuyor.'}
            </p>

            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <PlayCircle size={18} className="text-emerald-500" /> Test Adımları
            </h3>
            {defectData.stepsDisplay ? (
              <div className="space-y-3">
                {defectData.stepsDisplay.map((step, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-200 dark:border-slate-800/60 pb-2 inline-block">ADIM {idx + 1}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Uygulanan Aksiyon</p>
                        <p className="text-slate-700 dark:text-slate-200 font-medium">{step.action || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Beklenen Sistem Yanıtı</p>
                        <p className="text-slate-700 dark:text-slate-200 font-medium">{step.expectedResult || '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 rounded-xl p-5 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Bu test senaryosu BDD veya adımlı bir formatta yazılmamış.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── SAĞ KOLON (Kontrol ve Bilgi) ── */}
        <div className="space-y-6">

          {/* Statü Değiştirme */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Target size={14} className="text-indigo-400"/> Statü Yönetimi
            </h3>
            
            {/* Seçili Statü Görseli */}
            <div className={`px-4 py-3 rounded-xl border-2 flex items-center justify-center font-black text-sm mb-4 transition-colors ${getStatusCls(status)}`}>
              {currentStatus?.label || status}
            </div>
            
            {can('defects.manage') ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">Durumu Güncelle</label>
                <select 
                  value={status} 
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer shadow-sm">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 font-medium mt-2 flex items-center gap-1.5 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Değişiklikler tarayıcıya kaydedilir.
                </p>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bu hatanın durumunu değiştirmek için <strong>Hata Yönetimi</strong> yetkisine ihtiyacınız var.</p>
              </div>
            )}
          </div>

          {/* Künye (Meta Info) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Künye</h3>
            <div className="space-y-4">
              {[
                { icon: <Folder size={16} className="text-indigo-400"/>,  label: 'Proje',   value: defectData.projectName },
                { icon: <PlayCircle size={16} className="text-emerald-400"/>, label: 'Koşum', value: defectData.runName },
                { icon: <Clock size={16} className="text-amber-400"/>,    label: 'Tarih',   value: defectData.detectedAt },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                    {icon} {label}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm ml-6">{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DefectDetail;