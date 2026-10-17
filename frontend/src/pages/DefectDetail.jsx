import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { testRunsApi, projectsApi, testCasesApi } from '../api';
import { usePermission } from '../hooks/usePermission';
import {
  ArrowLeft, Bug, Target, Clock, Terminal,
  AlignLeft, PlayCircle, Folder, RefreshCw,
  Copy, Check, AlertCircle, CheckCircle2,
  ExternalLink, ChevronDown, ChevronUp
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'Open',        label: 'Açık',        emoji: '🔴', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  { value: 'In Progress', label: 'İnceleniyor', emoji: '🟡', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { value: 'Resolved',    label: 'Çözüldü',     emoji: '🟢', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  { value: 'Re-test',     label: 'Tekrar Test', emoji: '🔵', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
];
const SEVERITY_CONFIG = {
  'Kritik': { bg: 'bg-rose-500/10 text-rose-600',     badge: 'bg-rose-500 text-white' },
  'Yüksek': { bg: 'bg-orange-500/10 text-orange-600', badge: 'bg-orange-500 text-white' },
  'Orta':   { bg: 'bg-amber-500/10 text-amber-600',   badge: 'bg-amber-500 text-white' },
  'Düşük':  { bg: 'bg-blue-500/10 text-blue-600',     badge: 'bg-blue-400 text-white' },
};
const LS_KEY = 'ng-defect-statuses';

const getSev         = (s) => SEVERITY_CONFIG[s] || SEVERITY_CONFIG['Orta'];
const getStatusOpt   = (s) => STATUS_OPTIONS.find(o => o.value === s);
const getStatusCls   = (s) => getStatusOpt(s)?.cls || 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200';
const getStatusLabel = (s) => { const o = getStatusOpt(s); return o ? `${o.emoji} ${o.label}` : s; };

// ✅ FİX: JSON Güvenliği eklendi
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

const DefectDetail = () => {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { can }  = usePermission();

  const [defectData,  setDefectData]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [status,      setStatus]      = useState('Open');
  const [copied,      setCopied]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);

  // localStorage'dan statü oku
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); setStatus(s[id] ?? 'Open'); } catch { setStatus('Open'); }
  }, [id]);

  const handleStatusChange = useCallback((newStatus) => {
    setStatus(newStatus);
    const now = new Date().toISOString();
    try {
      const ss = JSON.parse(localStorage.getItem(LS_KEY)            || '{}');
      const ts = JSON.parse(localStorage.getItem(`${LS_KEY}-times`) || '{}');
      localStorage.setItem(LS_KEY,             JSON.stringify({ ...ss, [id]: newStatus }));
      localStorage.setItem(`${LS_KEY}-times`,  JSON.stringify({ ...ts, [id]: now }));
      setSaveMsg('saved'); setTimeout(() => setSaveMsg(null), 2000);
    } catch { setSaveMsg('error'); setTimeout(() => setSaveMsg(null), 3000); }
  }, [id]);

  // Veri çekme — BUG-{runId} formatından runId çıkar
  const fetchDetail = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const match = String(id).match(/^BUG-(\d+)/);
      if (!match) throw new Error('Geçersiz hata ID formatı.');
      const runId = match[1];

      const [runRes, projsRes, casesRes] = await Promise.allSettled([
        testRunsApi.getOne(runId),
        projectsApi.getAll(),
        testCasesApi.getAll(),
      ]);

      if (runRes.status !== 'fulfilled') throw new Error('Test koşumu yüklenemedi veya silinmiş.');

      const run       = runRes.value.data;
      const projects  = projsRes.status === 'fulfilled' ? projsRes.value.data : [];
      const testCases = casesRes.status === 'fulfilled' ? casesRes.value.data : [];

      const failedItems = safeJSON(run.results).filter(r =>
        r.status === 'Failed' || r.status === 'Başarısız' ||
        r.run_status === 'Failed' || r.run_status === 'Başarısız'
      );

      const failedDetails = failedItems.map((r, idx) => {
        const caseId = r.case_id ?? r.test_case_id ?? r.id ?? null;
        const realTC = caseId != null ? testCases.find(tc => tc.id === caseId) : null;
        return {
          idx,
          caseId,
          title:        realTC?.title || r.test_case_title || (caseId != null ? `Test #${caseId}` : `Test ${idx + 1}`),
          errorMessage: r.actual_result || r.error || null,
          severity:     realTC?.priority || r.test_case_priority || 'Orta',
          description:  realTC?.description || null,
        };
      });

      const sevOrder  = { 'Kritik': 4, 'Yüksek': 3, 'Orta': 2, 'Düşük': 1 };
      const topSev    = failedDetails.reduce((max, item) =>
        (sevOrder[item.severity] || 2) > (sevOrder[max] || 2) ? item.severity : max, 'Orta'
      );
      const project   = projects.find(p => p.id === run.project_id);

      setDefectData({
        id,
        runId:       run.id,
        runName:     run.name ?? 'İsimsiz Koşum',
        projectName: project?.name ?? 'Bilinmeyen Proje',
        projectId:   project?.id   ?? null,
        severity:    topSev,
        failedCount: failedDetails.length,
        failedDetails,
        detectedAt:  run.created_at
          ? new Date(run.created_at).toLocaleString('tr-TR', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
          : 'Bilinmiyor',
      });
    } catch (err) {
      setError(err.message || 'Detaylar yüklenemedi.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleCopy = useCallback(() => {
    if (!defectData) return;
    const lines = [`Hata ID: ${defectData.id}`, `Koşum: ${defectData.runName}`, `Proje: ${defectData.projectName}`, `Hatalı Test Sayısı: ${defectData.failedCount}`, ''];
    defectData.failedDetails.forEach((item, i) => {
      lines.push(`[${i+1}] ${item.title}`);
      if (item.errorMessage) lines.push(`    Hata: ${item.errorMessage}`);
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [defectData]);

  if (loading) return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8"><Skeleton className="w-10 h-10 rounded-xl"/><div className="space-y-2"><Skeleton className="h-7 w-48"/><Skeleton className="h-4 w-64"/></div></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 space-y-4"><Skeleton className="h-48 rounded-2xl"/><Skeleton className="h-64 rounded-2xl"/></div><Skeleton className="h-80 rounded-2xl"/></div>
    </div>
  );

  if (error || !defectData) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-5 animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-800 rounded-3xl flex items-center justify-center"><Bug size={32} className="text-rose-500"/></div>
      <div><h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Detaylara Ulaşılamadı</h2><p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">{error}</p></div>
      <div className="flex gap-3">
        <button onClick={() => navigate('/defects')} className="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 transition-colors">Listeye Dön</button>
        <button onClick={fetchDetail} className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center gap-2"><RefreshCw size={15}/> Tekrar Dene</button>
      </div>
    </div>
  );

  const sevConfig = getSev(defectData.severity);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-7xl mx-auto">

      {/* HEADER */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/defects')}
          className="p-2.5 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-all shrink-0 shadow-sm">
          <ArrowLeft size={18}/>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <h1 className="text-sm font-bold text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">{defectData.id}</h1>
            <span className={`text-[11px] uppercase font-black tracking-wider px-2.5 py-1 rounded-md shrink-0 ${sevConfig.badge}`}>{defectData.severity}</span>
            <span className={`text-[11px] uppercase font-black tracking-wider px-2.5 py-1 rounded-md border shrink-0 ${getStatusCls(status)}`}>{getStatusLabel(status)}</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 shrink-0">
              {defectData.failedCount} Hatalı Test
            </span>
            <button onClick={handleCopy} className="ml-auto text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg shrink-0">
              {copied ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
              <span className="hidden sm:inline">{copied ? 'Kopyalandı' : 'Raporu Kopyala'}</span>
            </button>
          </div>
          <p className="text-lg text-slate-700 dark:text-slate-200 font-bold leading-snug">{defectData.runName} — Hata Raporu</p>
          <div className="flex items-center gap-3 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><Folder size={12}/> {defectData.projectName}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"/>
            <span className="flex items-center gap-1"><PlayCircle size={12}/> {defectData.runName}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"/>
            <span className="flex items-center gap-1"><Clock size={12}/> {defectData.detectedAt}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* SOL KOLON: Hatalı Test Listesi */}
        <div className="lg:col-span-2 space-y-4">

          {/* Özet banner */}
          <div className="bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center shrink-0">
              <Bug size={18} className="text-white"/>
            </div>
            <div>
              <p className="font-bold text-rose-700 dark:text-rose-400 text-sm">Bu koşumda {defectData.failedCount} test başarısız oldu</p>
              <p className="text-xs text-rose-600/70 dark:text-rose-500 mt-0.5">Her hatalı testin detayını aşağıda inceleyebilirsiniz.</p>
            </div>
          </div>

          {/* Hatalı test kartları */}
          <div className="space-y-3">
            {defectData.failedDetails.map((item, idx) => {
              const is         = getSev(item.severity);
              const isExpanded = expandedIdx === idx;
              return (
                <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                  {/* Kart başlığı */}
                  <button onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="w-full flex items-center gap-4 p-4 md:p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${is.badge}`}>{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-md shrink-0 ${is.badge}`}>{item.severity}</span>
                        {item.caseId && (
                          <span className="text-[10px] font-bold text-slate-400 font-mono">#{item.caseId}</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title}</p>
                      {item.errorMessage && !isExpanded && (
                        <p className="text-xs font-mono text-rose-500 dark:text-rose-400 mt-0.5 truncate opacity-80">⚠ {item.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-500/30">Başarısız</span>
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </div>
                  </button>

                  {/* Genişletilmiş içerik */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
                      {/* Hata log */}
                      <div className="bg-[#0d1117] p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Terminal size={13} className="text-rose-400"/>
                          <span className="text-xs font-bold font-mono text-slate-400">runtime_error.log</span>
                        </div>
                        {item.errorMessage ? (
                          <pre className="text-rose-400/90 font-mono text-xs whitespace-pre-wrap break-words leading-relaxed">
                            {item.errorMessage}
                          </pre>
                        ) : (
                          <span className="text-slate-500 italic text-xs">Hata mesajı bulunamadı.</span>
                        )}
                      </div>

                      {/* Test adımları (varsa) */}
                      {item.description && (() => {
                        let steps = null;
                        try {
                          const parsed = JSON.parse(item.description);
                          if (Array.isArray(parsed?.steps)) steps = parsed.steps;
                        } catch { /* düz metin */ }
                        if (steps) return (
                          <div className="p-4 space-y-2">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Test Adımları</p>
                            {steps.map((step, si) => (
                              <div key={si} className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Adım {si + 1}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  <div><p className="text-[10px] font-bold text-slate-400 mb-1">AKSİYON</p><p className="text-slate-700 dark:text-slate-300 font-medium">{step.action || '—'}</p></div>
                                  <div><p className="text-[10px] font-bold text-slate-400 mb-1">BEKLENEN</p><p className="text-slate-700 dark:text-slate-300 font-medium">{step.expectedResult || '—'}</p></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                        if (item.description && !item.description.startsWith('{')) return (
                          <div className="p-4"><p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.description}</p></div>
                        );
                        return null;
                      })()}

                      {/* Test case'e git */}
                      {item.caseId && (
                        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                          <button onClick={() => navigate('/test-cases')}
                            className="flex items-center gap-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors hover:underline underline-offset-2">
                            <ExternalLink size={13}/> Test Case #{item.caseId} Görüntüle
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* SAĞ KOLON */}
        <div className="space-y-5">

          {/* Statü */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Target size={14} className="text-indigo-400"/> Statü</h3>
            <div className={`px-4 py-3 rounded-xl border-2 flex items-center justify-center font-black text-sm mb-4 ${getStatusCls(status)}`}>
              {getStatusLabel(status)}
            </div>
            {can('defects.manage') ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">Durumu Güncelle</label>
                <select value={status} onChange={e => handleStatusChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>)}
                </select>
                {saveMsg === 'saved' && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 ml-1 animate-in fade-in duration-200"><CheckCircle2 size={12}/> Kaydedildi</p>}
                {saveMsg === 'error' && <p className="text-[11px] text-rose-500 font-medium flex items-center gap-1.5 ml-1"><AlertCircle size={12}/> Kaydedilemedi</p>}
                {!saveMsg && <p className="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-1.5 ml-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"/> Tarayıcıya kaydedilir.</p>}
              </div>
            ) : (
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">Statü değiştirmek için yetki gerekli.</p>
            )}
          </div>

          {/* Künye */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Künye</h3>
            <div className="space-y-4">
              {[
                { icon:<Folder size={16} className="text-indigo-400"/>,     label:'Proje',         value:defectData.projectName },
                { icon:<PlayCircle size={16} className="text-emerald-400"/>, label:'Koşum',        value:defectData.runName },
                { icon:<Clock size={16} className="text-amber-400"/>,        label:'Tespit Tarihi', value:defectData.detectedAt },
                { icon:<Bug size={16} className="text-rose-400"/>,           label:'Hatalı Test',   value:`${defectData.failedCount} test` },
              ].map(({ icon, label, value }) => (
                <div key={label}>
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">{icon} {label}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm ml-6 break-words">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Aksiyonlar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Hızlı Aksiyonlar</h3>
            <div className="space-y-2">
              <button onClick={() => navigate(`/test-runs/${defectData.runId}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800 group transition-colors text-left">
                <PlayCircle size={15} className="text-emerald-500 shrink-0 group-hover:scale-110 transition-transform"/>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Koşum Detayına Git</span>
              </button>
              <button onClick={() => navigate('/defects')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-100 dark:border-slate-800 group transition-colors text-left">
                <ArrowLeft size={15} className="text-slate-400 shrink-0 group-hover:scale-110 transition-transform"/>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Hata Listesine Dön</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DefectDetail;