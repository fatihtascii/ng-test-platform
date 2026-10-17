import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { projectsApi, testCasesApi, testRunsApi } from '../api';
import {
  Play, Terminal, Server, Globe, Cpu, FlaskConical,
  CheckSquare, Loader2, CheckCircle2, AlertCircle,
  StopCircle, RefreshCw, Wifi, WifiOff, Activity,
  ChevronDown, Settings2, MonitorPlay, Shield,
  Clock, BarChart3, ArrowRight, Circle, Square,
  Maximize2, Minimize2
} from 'lucide-react';
import { withToken } from '../auth';

const fmt = (s) =>
  String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

const PRIORITY_CLS = {
  'Kritik': 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  'Yüksek': 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  'Orta':   'text-blue-400 bg-blue-500/10 border-blue-500/25',
  'Düşük':  'text-slate-500 bg-slate-500/10 border-slate-500/20',
};
const LOG_CLS = {
  error:   'text-rose-400 font-medium',
  success: 'text-emerald-400 font-medium',
  warn:    'text-amber-300',
  running: 'text-sky-300',
  info:    'text-slate-300',
};
const SEL = 'w-full appearance-none bg-slate-950/80 border border-white/8 hover:border-white/15 text-slate-200 text-[13px] font-medium rounded-xl px-4 py-2.5 pr-9 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-40 cursor-pointer transition-all';

const Skel = ({ cls }) => <div className={"animate-pulse bg-slate-800/60 rounded-xl " + cls} />;

const StatCard = ({ label, value, color, accent, pulse }) => (
  <div className={"relative flex flex-col items-center justify-center py-4 px-3 rounded-2xl border overflow-hidden " + accent}>
    {pulse && value > 0 && <span className="absolute inset-0 rounded-2xl animate-ping bg-emerald-500/5 pointer-events-none" />}
    <span className={"text-3xl font-black tabular-nums tracking-tight " + color}>{value}</span>
    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 mt-1">{label}</span>
  </div>
);

const AutomationRun = () => {
  const { can }  = usePermission();
  const location = useLocation();

  const [projects,       setProjects]       = useState([]);
  const [automatedCases, setAutomatedCases] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [environment,    setEnvironment]    = useState('QA');
  const [browser,        setBrowser]        = useState('Chrome');
  const [headless,       setHeadless]       = useState(true);
  const [selectedCases,  setSelectedCases]  = useState([]);
  const [isRunning,      setIsRunning]      = useState(false);
  const [progress,       setProgress]       = useState(0);
  const [logs,           setLogs]           = useState([]);
  const [results,        setResults]        = useState({ passed: 0, failed: 0, skipped: 0, total: 0 });
  const [wsStatus,       setWsStatus]       = useState('idle');
  const wsStatusRef                         = useRef('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [fullscreen,     setFullscreen]     = useState(false);
  const [toast,          setToast]          = useState(null);

  const resultsRef        = useRef({ passed: 0, failed: 0, skipped: 0, total: 0 });
  const startTimeRef      = useRef(null);
  const caseResultsRef    = useRef([]);
  const automatedCasesRef = useRef([]);
  const toastTimerRef     = useRef(null);
  const terminalRef       = useRef(null);
  const wsRef             = useRef(null);
  const timerRef          = useRef(null);

  const WS_BASE = useRef(
    (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/^http/, 'ws')
  ).current;

  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const updWs = useCallback((s) => { wsStatusRef.current = s; setWsStatus(s); }, []);

  const addLog = useCallback((message, type = 'info') => {
    const ts = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    setLogs(prev => [...prev, { time: ts, message, type, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [pR, cR] = await Promise.allSettled([projectsApi.getAll(), testCasesApi.getAll()]);
        if (pR.status === 'fulfilled') setProjects(pR.value.data || []);
        else setError('Projeler yüklenemedi.');
        if (cR.status === 'fulfilled') {
          const all = cR.value.data || [];
          setAutomatedCases(all.filter(tc => {
            if (tc.execution_type === 'Automated') return true;
            try { return JSON.parse(tc.description || '{}').execution_type === 'Automated'; }
            catch { return false; }
          }));
        }
      } catch { setError('Sunucuya bağlanılamadı.'); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { automatedCasesRef.current = automatedCases; }, [automatedCases]);
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);
  useEffect(() => () => {
    clearInterval(timerRef.current); clearTimeout(toastTimerRef.current);
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const c = p.get('cases'); const pr = p.get('project');
    if (pr) setSelectedProject(pr);
    if (c) setSelectedCases(c.split(',').map(Number).filter(Boolean));
  }, [location.search]);

  const projectCases = automatedCases.filter(tc =>
    !selectedProject || String(tc.project_id) === String(selectedProject)
  );

  const toggleCase = (id) => {
    if (isRunning) return;
    setSelectedCases(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (isRunning || !projectCases.length) return;
    const ids = projectCases.map(tc => tc.id);
    setSelectedCases(ids.every(id => selectedCases.includes(id)) ? [] : ids);
  };

  const handleStop = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' })); wsRef.current.close();
    }
    clearInterval(timerRef.current); setIsRunning(false); updWs('disconnected');
    addLog('■ Koşum durduruldu.', 'warn');
  };

  const handleRun = () => {
    if (!selectedProject) { showToast('error', 'Bir proje seçin.'); return; }
    if (!selectedCases.length) { showToast('error', 'En az bir test seçin.'); return; }

    setIsRunning(true); setProgress(0); setLogs([]); setElapsedSeconds(0);
    startTimeRef.current = new Date();
    resultsRef.current = { passed: 0, failed: 0, skipped: 0, total: selectedCases.length };
    caseResultsRef.current = [];
    setResults({ passed: 0, failed: 0, skipped: 0, total: selectedCases.length });
    updWs('connecting');
    timerRef.current = setInterval(() => setElapsedSeconds(p => p + 1), 1000);

    const ws = new WebSocket(withToken(`${WS_BASE}/ws/run-test`));
    wsRef.current = ws;

    ws.onopen = () => {
      updWs('connected');
      addLog('◎ Bağlantı kuruldu — ortam hazırlanıyor...', 'info');
      ws.send(JSON.stringify({
        environment, browser, headless,
        project_id: parseInt(selectedProject, 10),
        cases: selectedCases.map(id => parseInt(id, 10)),
        test_case_ids: selectedCases.map(id => parseInt(id, 10)),
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.detail) {
          addLog('✕ ' + (data.detail === 'Not Found' ? 'Otomasyon kodu bulunamadı.' : data.detail), 'error');
          clearInterval(timerRef.current); setIsRunning(false); updWs('error'); ws.close();
          showToast('error', 'Koşum başarısız.'); return;
        }
        if (data.type === 'done') {
          clearInterval(timerRef.current); setIsRunning(false); setProgress(100);
          updWs('disconnected'); ws.close();
          addLog('✓ Koşum tamamlandı.', 'success'); showToast('success', 'Otomasyon tamamlandı.');
          try {
            const snap = resultsRef.current;
            const dur = Math.round((new Date() - startTimeRef.current) / 1000);
            const nowStr = new Date().toLocaleString('tr-TR', { hour12: false });
            const cr = caseResultsRef.current;
            let details = cr.length > 0
              ? cr.map(r => ({ test_case_id: r.test_case_id, status: r.status, actual_result: r.actual_result || null }))
              : selectedCases.map((cid, i) => ({
                  test_case_id: cid,
                  status: i < snap.passed ? 'Passed' : i < snap.passed + snap.failed ? 'Failed' : 'Skipped',
                  actual_result: null,
                }));
            if (details.length < selectedCases.length) {
              const covered = new Set(details.map(r => r.test_case_id));
              selectedCases.forEach(cid => { if (!covered.has(cid)) details.push({ test_case_id: cid, status: 'Skipped', actual_result: null }); });
            }
            await testRunsApi.create({
              name: 'Otomasyon Koşumu — ' + nowStr,
              description: snap.total + ' test · ' + snap.passed + ' geçti · ' + snap.failed + ' başarısız · ' + dur + 's',
              status: snap.failed > 0 ? 'Başarısız' : 'Tamamlandı',
              project_id: parseInt(selectedProject, 10),
              results: JSON.stringify(details),
            });
            addLog('↗ Sonuçlar kaydedildi.', 'info');
            const fc = details.filter(r => r.status === 'Failed').length;
            if (fc > 0) { addLog('⚠ ' + fc + ' hata Defect listesine eklendi.', 'warn'); showToast('error', '🔥 ' + fc + ' hata tespit edildi.'); }
          } catch (e) { addLog('⚠ Kayıt hatası: ' + e.message, 'warn'); }
          return;
        }
        if (typeof data.progress === 'number') setProgress(data.progress);
        if (data.message) {
          addLog(data.message, data.type || 'info');
          const mu = data.message.toUpperCase();
          const ip = mu.includes('PASSED');
          const ie = (mu.includes('FAILED') || mu.includes('ERROR')) && !mu.includes('COLLECTED');
          const isk = mu.includes('SKIPPED') || mu.includes('XFAIL');
          if (ip || ie) {
            const idx = caseResultsRef.current.length;
            const cid = selectedCases[idx] ?? null;
            let note = null;
            if (ie) { const after = data.message.split(/FAILED|ERROR/i).pop()?.trim(); if (after?.length > 2) note = after.replace(/^[\s\-:]+/, '').slice(0, 500); }
            caseResultsRef.current = [...caseResultsRef.current, { test_case_id: cid, status: ip ? 'Passed' : 'Failed', actual_result: note }];
          }
          if (ip || ie || isk || data.type === 'success' || data.type === 'error') {
            setResults(prev => {
              const next = { ...prev };
              if (ip || data.type === 'success') next.passed += 1;
              else if (ie || data.type === 'error') next.failed += 1;
              else if (isk) next.skipped += 1;
              else return prev;
              resultsRef.current = next;
              if (typeof data.progress !== 'number' && next.total > 0)
                setProgress(Math.round(((next.passed + next.failed + next.skipped) / next.total) * 100));
              return next;
            });
          }
        }
      } catch { addLog('⚠ Format hatası.', 'warn'); }
    };

    ws.onerror = () => {
      clearInterval(timerRef.current); setIsRunning(false); updWs('error');
      addLog('✕ WebSocket bağlantı hatası.', 'error'); showToast('error', 'Bağlantı koptu.');
    };

    ws.onclose = () => {
      clearInterval(timerRef.current); setIsRunning(false);
      if (wsStatusRef.current !== 'error') updWs('disconnected');
      const fr = caseResultsRef.current;
      if (fr.length > 0) {
        const p = fr.filter(r => r.status === 'Passed').length;
        const f = fr.filter(r => r.status === 'Failed').length;
        const s = fr.filter(r => r.status === 'Skipped').length;
        setResults(prev => ({ ...prev, passed: Math.max(prev.passed, p), failed: Math.max(prev.failed, f), skipped: Math.max(prev.skipped, s) }));
        setProgress(Math.round(((p + f + s) / fr.length) * 100));
      }
    };
  };

  const wsBadge = {
    idle:         <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700"><Circle size={6} className="fill-slate-700" />Hazır</span>,
    connecting:   <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500"><Loader2 size={10} className="animate-spin" />Bağlanıyor</span>,
    connected:    <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400"><Wifi size={10} />Bağlı</span>,
    disconnected: <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600"><WifiOff size={10} />Kesildi</span>,
    error:        <span className="flex items-center gap-1.5 text-[11px] font-medium text-rose-400"><AlertCircle size={10} />Hata</span>,
  }[wsStatus];

  const total = results.passed + results.failed + results.skipped;
  const pct   = total > 0 ? Math.round((results.passed / total) * 100) : null;

  if (loading) return (
    <div className="min-h-full bg-[#06080f] -m-8 p-6 space-y-4">
      <Skel cls="h-14 w-72" />
      <div className="grid grid-cols-4 gap-3">{[0,1,2,3].map(i => <Skel key={i} cls="h-20" />)}</div>
      <div className="grid xl:grid-cols-2 gap-4"><Skel cls="h-96" /><Skel cls="h-96" /></div>
    </div>
  );

  return (
    <div className="min-h-full bg-[#06080f] text-slate-100 -m-8 p-6 pb-10">

      {toast && (
        <div className={"fixed top-5 right-5 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-[13px] font-semibold border backdrop-blur-xl animate-in fade-in slide-in-from-top-3 duration-300 " + (toast.type === 'success' ? 'bg-emerald-950/95 border-emerald-800/60 text-emerald-300' : 'bg-rose-950/95 border-rose-800/60 text-rose-300')}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
            <MonitorPlay size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-white tracking-tight">Otomasyon Komuta Merkezi</h1>
            <p className="text-[11px] text-slate-600 mt-0.5 font-medium">Playwright · pytest · Gerçek Zamanlı Terminal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="flex items-center gap-3 bg-slate-900/70 border border-white/8 rounded-xl px-4 py-2">
              <div className="w-28">
                <div className="flex justify-between text-[9px] mb-1.5 font-bold uppercase tracking-widest">
                  <span className="text-slate-600">İlerleme</span>
                  <span className="text-indigo-400">%{progress}</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500" style={{ width: progress + '%' }} />
                </div>
              </div>
              <Loader2 size={13} className="text-indigo-400 animate-spin shrink-0" />
            </div>
          )}
          <div className="flex items-center gap-2 bg-slate-900/60 border border-white/8 rounded-xl px-3.5 py-2">
            <Clock size={12} className="text-slate-600" />
            <span className="font-mono text-[13px] font-bold text-slate-300 tabular-nums">{fmt(elapsedSeconds)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-950/60 border border-rose-900/60 text-rose-400 px-4 py-3 rounded-xl text-[13px] mb-5 font-medium">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {/* STAT KARTLARI */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Seçilen"   value={selectedCases.length} color="text-slate-200"   accent="border-white/6 bg-slate-900/40" />
        <StatCard label="Geçen"     value={results.passed}       color="text-emerald-400" accent="border-emerald-900/40 bg-emerald-950/30" pulse={isRunning} />
        <StatCard label="Başarısız" value={results.failed}       color="text-rose-400"    accent="border-rose-900/40 bg-rose-950/30" />
        <StatCard label="Atlanan"   value={results.skipped}      color="text-amber-400"   accent="border-amber-900/30 bg-amber-950/20" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-4">

        {/* SOL PANEL */}
        <div className="space-y-4">

          {/* Konfigürasyon */}
          <div className="bg-slate-900/50 border border-white/6 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2.5">
              <Settings2 size={14} className="text-indigo-400" />
              <span className="text-[13px] font-semibold text-slate-300">Konfigürasyon</span>
            </div>
            <div className="p-4 space-y-3.5">
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 mb-1.5"><Server size={9} className="opacity-60" />Hedef Proje</label>
                <div className="relative">
                  <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedCases([]); }} disabled={isRunning} className={SEL}>
                    <option value="" disabled>Proje Seçin</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 block mb-1.5">Ortam</label>
                  <div className="relative">
                    <select value={environment} onChange={e => setEnvironment(e.target.value)} disabled={isRunning} className={SEL}>
                      <option value="QA">QA (Test)</option><option value="Staging">Staging</option><option value="Prod">Production</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 block mb-1.5">Tarayıcı</label>
                  <div className="relative">
                    <select value={browser} onChange={e => setBrowser(e.target.value)} disabled={isRunning} className={SEL}>
                      <option>Chrome</option><option>Firefox</option><option>Edge</option><option>Safari</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div onClick={() => !isRunning && setHeadless(h => !h)}
                className={"flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none " + (headless ? 'bg-indigo-500/8 border-indigo-500/20 hover:border-indigo-500/35' : 'bg-white/3 border-white/8 hover:border-white/15') + (isRunning ? ' opacity-40 pointer-events-none' : '')}>
                <div>
                  <p className="text-[13px] font-semibold text-slate-200">Headless Mod</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">Tarayıcı arka planda çalışır</p>
                </div>
                <div className="relative shrink-0" style={{ width: '38px', height: '21px' }}>
                  <div className={"absolute inset-0 rounded-full transition-colors " + (headless ? 'bg-indigo-500' : 'bg-slate-700')} />
                  <div className={"absolute top-[2px] w-[17px] h-[17px] rounded-full bg-white shadow-md transition-all " + (headless ? 'left-[19px]' : 'left-[2px]')} />
                </div>
              </div>
            </div>
          </div>

          {/* Test Listesi */}
          <div className="bg-slate-900/50 border border-white/6 rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: '400px' }}>
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FlaskConical size={14} className="text-violet-400" />
                <span className="text-[13px] font-semibold text-slate-300">Otomatik Testler</span>
                {projectCases.length > 0 && (
                  <span className="text-[10px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-lg">{selectedCases.length}/{projectCases.length}</span>
                )}
              </div>
              <button onClick={selectAll} disabled={!selectedProject || isRunning || !projectCases.length}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-30 transition-colors">
                {projectCases.length > 0 && projectCases.every(tc => selectedCases.includes(tc.id)) ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {!selectedProject ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Server size={28} className="text-slate-800 mb-3" /><p className="text-[12px] text-slate-700 font-medium">Proje seçin</p>
                </div>
              ) : projectCases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Cpu size={28} className="text-slate-800 mb-3" /><p className="text-[12px] text-slate-700 font-medium">Otomatik test bulunamadı</p>
                </div>
              ) : projectCases.map(tc => {
                const sel = selectedCases.includes(tc.id);
                return (
                  <div key={tc.id} onClick={() => toggleCase(tc.id)}
                    className={"flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-all border " + (sel ? 'bg-indigo-500/10 border-indigo-500/25' : 'border-transparent hover:bg-white/4') + (isRunning ? ' opacity-50 cursor-not-allowed' : '')}>
                    <div className={"flex items-center justify-center rounded-md border transition-all shrink-0 " + (sel ? 'bg-indigo-500 border-indigo-500' : 'border-slate-700')} style={{ width: '17px', height: '17px' }}>
                      {sel && <CheckSquare size={10} strokeWidth={3} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-slate-200 truncate">{tc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-700">#{tc.id}</span>
                        {tc.priority && <span className={"text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border " + (PRIORITY_CLS[tc.priority] || PRIORITY_CLS['Orta'])}>{tc.priority}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t border-white/5 space-y-2 shrink-0">
              {can('automation.execute') ? (
                <>
                  <button onClick={handleRun} disabled={isRunning || !selectedCases.length || !selectedProject}
                    className="w-full py-3 rounded-xl font-bold text-[13px] disabled:opacity-40 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-600/20 text-white transition-all">
                    {isRunning ? <><Loader2 size={14} className="animate-spin" />Koşuluyor...</> : <><Play size={14} className="fill-white" />{selectedCases.length} Testi Başlat<ArrowRight size={13} /></>}
                  </button>
                  {isRunning && (
                    <button onClick={handleStop}
                      className="w-full py-2.5 rounded-xl font-bold text-[12px] flex items-center justify-center gap-2 bg-rose-950/50 hover:bg-rose-950/80 border border-rose-800/40 text-rose-400 transition-all">
                      <StopCircle size={13} />Durdur
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center text-[11px] text-slate-700 py-2.5 border border-slate-800 bg-slate-900/40 rounded-xl">
                  <Shield size={11} className="inline mr-1.5" />Yetki gerekli
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TERMİNAL */}
        <div className={"flex flex-col " + (fullscreen ? 'fixed inset-4 z-50 rounded-2xl overflow-hidden shadow-2xl' : '')} style={fullscreen ? {} : { height: '600px' }}>
          <div className="bg-[#0c1018] border border-white/6 border-b-0 rounded-t-2xl px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <button onClick={handleStop} className="w-3 h-3 rounded-full bg-rose-500/70 hover:bg-rose-500 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-amber-500/40" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/40" />
              </div>
              <div className="w-px h-4 bg-white/8" />
              <Terminal size={13} className="text-slate-600" />
              <span className="text-[11px] font-mono text-slate-600 tracking-wide">execution-console.log</span>
              <div className="bg-black/50 px-2.5 py-0.5 rounded-lg border border-white/5">{wsBadge}</div>
            </div>
            <div className="flex items-center gap-2">
              {pct !== null && !isRunning && (
                <div className="flex items-center gap-1.5 bg-white/4 border border-white/6 rounded-lg px-2.5 py-1">
                  <BarChart3 size={10} className="text-slate-600" />
                  <span className={"text-[10px] font-bold " + (pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400')}>%{pct} başarı</span>
                </div>
              )}
              <button onClick={() => !isRunning && setLogs([])} disabled={isRunning}
                className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-500 disabled:opacity-30 transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
                <RefreshCw size={10} />Temizle
              </button>
              <button onClick={() => setFullscreen(f => !f)} className="p-1.5 text-slate-700 hover:text-slate-500 hover:bg-white/5 rounded-lg transition-colors">
                {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>
          </div>

          <div ref={terminalRef} className="flex-1 bg-[#080d14] px-5 py-4 overflow-y-auto font-mono text-[12px] leading-[1.75] border-x border-white/6 min-h-0">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center select-none">
                <Activity size={38} className="text-slate-800 mb-4" />
                <p className="text-slate-700 text-[13px] font-medium">Terminal hazır</p>
                <p className="text-slate-800 text-[11px] mt-1">Koşum başlatıldığında loglar burada görünür</p>
              </div>
            ) : logs.map(log => (
              <div key={log.id} className="flex gap-3 group hover:bg-white/[0.018] px-1.5 py-0.5 rounded-lg -mx-1.5 transition-colors">
                <span className="text-slate-800 shrink-0 tabular-nums select-none">[{log.time}]</span>
                <span className={(LOG_CLS[log.type] || 'text-slate-400') + ' break-all'}>{log.message}</span>
              </div>
            ))}
            {isRunning && (
              <div className="flex gap-3 px-1.5 -mx-1.5 mt-1">
                <span className="text-slate-800 tabular-nums">[{new Date().toLocaleTimeString('tr-TR', { hour12: false })}]</span>
                <span className="text-indigo-600 animate-pulse font-bold">▌</span>
              </div>
            )}
          </div>

          <div className="bg-[#0c1018] border border-t-0 border-white/6 rounded-b-2xl px-5 py-2.5 flex items-center gap-4 shrink-0">
            <div className="flex-1 h-0.5 bg-slate-900 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full transition-all duration-500" style={{ width: progress + '%' }} />
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono shrink-0">
              <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 size={10} />{results.passed} geçti</span>
              <span className="flex items-center gap-1.5 text-rose-600"><AlertCircle size={10} />{results.failed} başarısız</span>
              {results.skipped > 0 && <span className="flex items-center gap-1.5 text-amber-600"><Square size={9} />{results.skipped} atlandı</span>}
              <span className="text-slate-800 border-l border-slate-900 pl-4 tabular-nums">{fmt(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AutomationRun;