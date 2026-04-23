import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePermission } from '../hooks/usePermission';
import {
  Play, Terminal, Server, Globe, Cpu,
  CheckSquare, Loader2, CheckCircle2, AlertCircle,
  StopCircle, RefreshCw, Wifi, WifiOff
} from 'lucide-react';

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const AutomationRun = () => {
  const { can } = usePermission();

  const [projects, setProjects]             = useState([]);
  const [automatedCases, setAutomatedCases] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);

  const [selectedProject, setSelectedProject] = useState('');
  const [environment, setEnvironment]         = useState('QA');
  const [browser, setBrowser]                 = useState('Chrome');
  const [headless, setHeadless]               = useState(true);

  const [selectedCases, setSelectedCases] = useState([]);

  const [isRunning, setIsRunning]           = useState(false);
  const [progress, setProgress]             = useState(0);
  const [logs, setLogs]                     = useState([]);
  const [results, setResults]               = useState({ passed: 0, failed: 0, skipped: 0, total: 0 });
  
  const [wsStatus, setWsStatus]             = useState('idle');
  const wsStatusRef                         = useRef('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const terminalRef = useRef(null);
  const wsRef       = useRef(null);
  const timerRef    = useRef(null);

  const API_BASE = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000';
  const WS_BASE  = API_BASE.replace(/^http/, 'ws');

  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const updateWsStatus = useCallback((status) => {
    wsStatusRef.current = status;
    setWsStatus(status);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      try {
        const [projRes, casesRes] = await Promise.all([
          fetch(`${API_BASE}/projects`).catch(() => ({ ok: false })),
          fetch(`${API_BASE}/test-cases`).catch(() => ({ ok: false })),
        ]);

        if (projRes.ok) setProjects(await projRes.json());
        if (casesRes.ok) {
          const all = await casesRes.json();
          setAutomatedCases(all.filter(tc => {
            if (tc.execution_type === 'Automated' || tc.executionType === 'Automated') return true;
            try {
              if (typeof tc.description === 'string' && tc.description.trim().startsWith('{')) {
                const desc = JSON.parse(tc.description);
                return desc.execution_type === 'Automated' || desc.executionType === 'Automated';
              }
            } catch { /* ignore */ }
            return false;
          }));
        }
        if (!projRes.ok) setError('Projeler tam olarak yüklenemedi. Sunucu bağlantınızı kontrol edin.');
      } catch {
        setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [API_BASE]);

  // Terminal scroll ayarı
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Cleanup: Sayfa değiştirildiğinde bağlantıları güvenlice kapat
  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearTimeout(toastTimerRef.current);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
  }, []);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    setLogs(prev => [...prev, { time: timestamp, message, type }]);
  }, []);

  const projectCases = automatedCases.filter(tc =>
    !selectedProject || String(tc.project_id) === String(selectedProject)
  );

  const toggleCaseSelection = (id) => {
    if (isRunning) return;
    setSelectedCases(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const selectAllCases = () => {
    if (isRunning || projectCases.length === 0) return;
    const allIds = projectCases.map(tc => tc.id);
    const allSelected = allIds.every(id => selectedCases.includes(id));
    setSelectedCases(allSelected ? [] : allIds);
  };

  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
    }
    clearInterval(timerRef.current);
    setIsRunning(false);
    updateWsStatus('disconnected');
    addLog('[DURDURULDU] Koşum kullanıcı tarafından manuel olarak kesildi.', 'warn');
  };

  const handleRunTests = () => {
    if (!selectedProject) { showToast('error', 'Lütfen bir proje seçin.'); return; }
    if (selectedCases.length === 0) { showToast('error', 'En az bir test senaryosu seçin.'); return; }

    const totalCases = selectedCases.length;

    setIsRunning(true);
    setProgress(0);
    setLogs([]);
    setElapsedSeconds(0);
    setResults({ passed: 0, failed: 0, skipped: 0, total: totalCases });
    updateWsStatus('connecting');

    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    const ws = new WebSocket(`${WS_BASE}/ws/run-test`);
    wsRef.current = ws;

    ws.onopen = () => {
      updateWsStatus('connected');
      addLog('[SİSTEM] WebSocket bağlantısı kuruldu. Koşum ortamı hazırlanıyor...', 'info');
      
      // Güvenli Payload: Backend ID'leri Integer bekleyebilir
      ws.send(JSON.stringify({
        environment,
        browser,
        headless,
        project_id: parseInt(selectedProject, 10),
        cases: selectedCases.map(id => parseInt(id, 10)),
        test_case_ids: selectedCases.map(id => parseInt(id, 10)) // Alternatif key desteği
      }));
    };

    ws.onmessage = (event) => {
      try {
        let rawData = event.data;
        // Backend bazen JSON.stringify yerine str() dönerse diye güvenlik yaması
        if (typeof rawData === 'string' && rawData.startsWith("{'") && rawData.endsWith("'}")) {
            rawData = rawData.replace(/'/g, '"');
        }
        
        const data = JSON.parse(rawData);

        // 🎯 HATA YAKALAYICI (Code Not Found Fix)
        if (data.detail) {
          const errMsg = data.detail === 'Not Found' 
            ? 'Backend bu teste ait çalıştırılabilir bir otomasyon kodu (script) bulamadı.' 
            : data.detail;
            
          addLog(`[HATA] ${errMsg}`, 'error');
          clearInterval(timerRef.current);
          setIsRunning(false);
          updateWsStatus('error');
          ws.close();
          showToast('error', 'Koşum Başarısız: Kod Bulunamadı.');
          return;
        }

        if (data.type === 'done') {
          clearInterval(timerRef.current);
          setIsRunning(false);
          setProgress(100);
          updateWsStatus('disconnected');
          ws.close();
          addLog('[SİSTEM] Koşum başarıyla tamamlandı.', 'success');
          showToast('success', 'Otomasyon koşumu tamamlandı.');
          return;
        }

        if (typeof data.progress === 'number') {
          setProgress(data.progress);
        }

        // Sadece geçerli mesajı olanları logla
        if (data.message) {
          addLog(data.message, data.type || 'info');
        }

        // İstatistikleri Canlı Güncelle
        setResults(prev => {
          const next = { ...prev };
          if (data.type === 'success') next.passed  += 1;
          else if (data.type === 'error')  next.failed  += 1;
          else if (data.type === 'skip')   next.skipped += 1;

          // Backend progress göndermezse frontend hesaplasın
          if (typeof data.progress !== 'number' && next.total > 0) {
            const done = next.passed + next.failed + next.skipped;
            setProgress(Math.round((done / next.total) * 100));
          }

          return next;
        });

      } catch (err) {
        addLog(`[SİSTEM] Beklenmeyen Format: ${event.data}`, 'warn');
      }
    };

    ws.onerror = () => {
      clearInterval(timerRef.current);
      updateWsStatus('error');
      setIsRunning(false);
      addLog('[CRİTİCAL] WebSocket bağlantı hatası! Sunucu yanıt vermiyor.', 'error');
      showToast('error', 'Sunucu bağlantısı koptu.');
    };

    ws.onclose = () => {
      clearInterval(timerRef.current);
      setIsRunning(false);
      if (wsStatusRef.current !== 'error') {
        updateWsStatus('disconnected');
      }
    };
  };

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <div className="xl:col-span-2 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
          <Skeleton className="h-[500px] rounded-2xl" />
        </div>
      </div>
    </div>
  );

  const wsStatusBadge = {
    idle:         null,
    connecting:   <span className="flex items-center gap-1 text-xs font-bold text-amber-500"><Loader2 size={12} className="animate-spin" /> Bağlanıyor</span>,
    connected:    <span className="flex items-center gap-1 text-xs font-bold text-emerald-500"><Wifi size={12} /> Bağlı</span>,
    disconnected: <span className="flex items-center gap-1 text-xs font-bold text-slate-400"><WifiOff size={12} /> Bağlantı Kesildi</span>,
    error:        <span className="flex items-center gap-1 text-xs font-bold text-rose-500"><AlertCircle size={12} /> Hata</span>,
  }[wsStatus];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-bold border animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Play size={22} className="text-emerald-500 fill-emerald-500/20" /> Otomasyon Komuta Merkezi
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            Otomatik test senaryolarını yapılandırın, tetikleyin ve canlı izleyin.
          </p>
        </div>

        {isRunning && (
          <div className="flex items-center gap-4 w-full lg:w-80 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in zoom-in-95 duration-300">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-bold text-indigo-500">İşleniyor...</span>
                <span className="font-bold text-slate-800 dark:text-white">%{progress}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
                <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }} />
              </div>
            </div>
            <Loader2 size={18} className="text-indigo-500 animate-spin shrink-0" />
          </div>
        )}
      </div>

      {/* Hata Banner */}
      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-bold shadow-sm">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── SOL KOLON ── */}
        <div className="space-y-5">

          {/* Koşum Ayarları */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-5">
              <Server size={17} className="text-indigo-500" /> Koşum Ayarları
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Hedef Proje</label>
                <select value={selectedProject}
                  onChange={(e) => { setSelectedProject(e.target.value); setSelectedCases([]); }}
                  disabled={isRunning}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-50 transition-all cursor-pointer">
                  <option value="" disabled>Proje Seçin</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Ortam</label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <select value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={isRunning}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold text-sm rounded-xl pl-8 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-50 transition-all cursor-pointer">
                      <option value="QA">QA (Test)</option>
                      <option value="Staging">Staging</option>
                      <option value="Prod">Production</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Tarayıcı</label>
                  <select value={browser} onChange={(e) => setBrowser(e.target.value)} disabled={isRunning}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-semibold text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-50 transition-all cursor-pointer">
                    <option value="Chrome">Chrome</option>
                    <option value="Firefox">Firefox</option>
                    <option value="Edge">Edge</option>
                    <option value="Safari">Safari</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/60 mt-4 pt-4">
                <input type="checkbox" id="headless" checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)} disabled={isRunning}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                />
                <div>
                  <label htmlFor="headless" className="text-sm font-bold text-slate-800 dark:text-white cursor-pointer">Headless Mod</label>
                  <p className="text-xs text-slate-500 mt-0.5">Tarayıcı penceresi görünmeden arka planda çalışır.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Test Seçimi */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[440px]">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckSquare size={15} className="text-indigo-500" /> Otomatik Testler
                {projectCases.length > 0 && (
                  <span className="text-xs font-black bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700 shadow-sm">
                    {selectedCases.length}/{projectCases.length}
                  </span>
                )}
              </h3>
              <button onClick={selectAllCases}
                disabled={!selectedProject || isRunning || projectCases.length === 0}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 transition-opacity">
                {projectCases.length > 0 && projectCases.every(tc => selectedCases.includes(tc.id))
                  ? 'Seçimi Kaldır'
                  : 'Tümünü Seç'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {!selectedProject ? (
                <div className="py-12 text-center">
                  <Server size={32} className="mx-auto text-slate-200 dark:text-slate-700 mb-3" />
                  <p className="text-sm font-medium text-slate-400">Önce bir proje seçmelisiniz.</p>
                </div>
              ) : projectCases.length === 0 ? (
                <div className="py-12 text-center">
                  <Cpu size={32} className="mx-auto text-slate-200 dark:text-slate-700 mb-3" />
                  <p className="text-sm font-medium text-slate-400">Bu projede otomatik test bulunamadı.</p>
                  <p className="text-xs text-slate-400 mt-1">Test Senaryoları'nda Yürütme tipi 'Automated' olmalıdır.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {projectCases.map(tc => {
                    const isSelected = selectedCases.includes(tc.id);
                    return (
                      <div key={tc.id} onClick={() => toggleCaseSelection(tc.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-indigo-50/50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors shrink-0 shadow-sm ${
                          isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}>
                          {isSelected && <CheckSquare size={12} strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{tc.title}</p>
                          <p className="text-xs font-semibold text-slate-400 tracking-tight">#{tc.id} · {tc.priority}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-2 shrink-0">
              {can('automation.execute') ? (
                <>
                  <button onClick={handleRunTests}
                    disabled={isRunning || selectedCases.length === 0 || !selectedProject}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 text-sm border border-transparent">
                    {isRunning
                      ? <><Loader2 size={16} className="animate-spin" /> Koşuluyor...</>
                      : <><Play size={16} className="fill-white" /> {selectedCases.length} Testi Başlat</>
                    }
                  </button>
                  {isRunning && (
                    <button onClick={handleStop}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm shadow-md shadow-rose-600/20">
                      <StopCircle size={16} /> Durdur
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center text-xs font-bold text-rose-500 py-2 border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/10 rounded-xl">
                  Otomasyon tetikleme yetkiniz bulunmuyor.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SAĞ KOLON ── */}
        <div className="xl:col-span-2 space-y-5 flex flex-col">

          {/* Sonuç Kartları */}
          <div className="grid grid-cols-4 gap-4 shrink-0">
            {[
              { label: 'Seçilen',    value: selectedCases.length,        bg: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800',                         text: 'text-slate-900 dark:text-white',                           sub: 'text-slate-500' },
              { label: 'Geçen',      value: results.passed,              bg: 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30',         text: 'text-emerald-600 dark:text-emerald-400',    sub: 'text-emerald-600 dark:text-emerald-500' },
              { label: 'Başarısız',  value: results.failed,              bg: 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30',                     text: 'text-rose-600 dark:text-rose-400',          sub: 'text-rose-600 dark:text-rose-500' },
              { label: 'Süre',       value: formatDuration(elapsedSeconds), bg: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700',                  text: 'text-slate-700 dark:text-white',                           sub: 'text-slate-500' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} p-4 rounded-2xl text-center shadow-sm`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${card.sub}`}>{card.label}</p>
                <p className={`text-2xl font-black tabular-nums ${card.text}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Terminal */}
          <div className="flex-1 bg-[#0d1117] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col min-h-[500px] relative">
            <div className="bg-[#161b22] px-5 py-3.5 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <div className="h-4 w-px bg-slate-700 mx-1"></div>
                <Terminal size={15} className="text-indigo-400" />
                <span className="text-xs font-bold font-mono text-slate-300">execution-console.log</span>
                <div className="ml-2 bg-black/50 px-2 py-0.5 rounded-md border border-white/5 shadow-inner">
                  {wsStatusBadge}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { if (!isRunning) setLogs([]); }}
                  disabled={isRunning}
                  className="text-slate-400 hover:text-white disabled:opacity-30 transition-colors text-xs font-bold flex items-center gap-1.5"
                  title="Terminali Temizle">
                  <RefreshCw size={13} /> Temizle
                </button>
              </div>
            </div>

            <div ref={terminalRef}
              className="flex-1 p-5 overflow-y-auto font-mono text-xs leading-relaxed space-y-1.5 scroll-smooth scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <Cpu size={48} className="text-slate-400 mb-4" />
                  <p className="text-slate-400 font-medium">Terminal hazır. Koşum bekleniyor...</p>
                </div>
              ) : logs.map((log, idx) => (
                <div key={idx} className="flex gap-3 hover:bg-white/5 px-2 py-1 rounded transition-colors break-words">
                  <span className="text-slate-500 shrink-0 select-none tabular-nums font-bold">[{log.time}]</span>
                  <span className={`${
                    log.type === 'error'   ? 'text-rose-400 font-bold'    :
                    log.type === 'success' ? 'text-emerald-400 font-bold' :
                    log.type === 'warn'    ? 'text-amber-300'   :
                    log.type === 'running' ? 'text-blue-300'    :
                    'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {isRunning && (
                <div className="flex gap-3 px-2 py-1 mt-2">
                  <span className="text-slate-600 tabular-nums font-bold">[{new Date().toLocaleTimeString('tr-TR', { hour12: false })}]</span>
                  <span className="text-indigo-400 animate-pulse">█</span>
                </div>
              )}
            </div>

            {/* Özet Çubuğu */}
            {!isRunning && results.total > 0 && (
              <div className="bg-[#161b22] border-t border-slate-800 px-6 py-3 flex items-center gap-6 text-xs font-mono font-bold">
                <span className="text-slate-400 uppercase tracking-widest text-[10px]">Özet</span>
                <span className="text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={14}/> {results.passed} geçti</span>
                <span className="text-rose-400 flex items-center gap-1.5"><AlertCircle size={14}/> {results.failed} başarısız</span>
                {results.skipped > 0 && <span className="text-amber-400">— {results.skipped} atlandı</span>}
                <span className="text-slate-400 ml-auto border-l border-slate-700 pl-6">Süre: {formatDuration(elapsedSeconds)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationRun;