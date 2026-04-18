import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import {
  Play, Terminal, Settings, Server, Globe, Cpu,
  CheckSquare, Loader2, CheckCircle2, AlertCircle,
  Clock, StopCircle, RefreshCw, Wifi, WifiOff
} from 'lucide-react';

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// Süreyi "00:00" formatına çevir
const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const AutomationRun = () => {
  // HOOK BURAYA TAŞINDI!
  const { can } = usePermission();
  
  const [projects, setProjects]             = useState([]);
  const [automatedCases, setAutomatedCases] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);

  // Konfigürasyon
  const [selectedProject, setSelectedProject] = useState('');
  const [environment, setEnvironment]         = useState('QA');
  const [browser, setBrowser]                 = useState('Chrome');
  const [headless, setHeadless]               = useState(true);

  // Seçim
  const [selectedCases, setSelectedCases] = useState([]);

  // Koşum state
  const [isRunning, setIsRunning]           = useState(false);
  const [progress, setProgress]             = useState(0);
  const [logs, setLogs]                     = useState([]);
  const [results, setResults]               = useState({ passed: 0, failed: 0, skipped: 0, total: 0 });
  const [wsStatus, setWsStatus]             = useState('idle'); // idle | connecting | connected | disconnected | error
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Refs
  const terminalRef = useRef(null);
  const wsRef       = useRef(null);   // WebSocket referansı — stop butonu için
  const timerRef    = useRef(null);   // Süre sayacı

  // ── Veri Çekme ──────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      try {
        const [projRes, casesRes] = await Promise.all([
          fetch('http://127.0.0.1:8000/projects'),
          fetch('http://127.0.0.1:8000/test-cases'),
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
        if (!projRes.ok) setError('Projeler yüklenemedi.');
      } catch {
        setError('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Terminal otomatik scroll
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Sayaç temizleme
  useEffect(() => () => {
    clearInterval(timerRef.current);
  }, []);

  // ── Yardımcılar ──────────────────────────────────────────────
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
    setSelectedCases(
      selectedCases.length === projectCases.length ? [] : projectCases.map(tc => tc.id)
    );
  };

  // ── Koşumu Durdur ────────────────────────────────────────────
  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
    }
    clearInterval(timerRef.current);
    setIsRunning(false);
    setWsStatus('disconnected');
    addLog('[WARN] Koşum kullanıcı tarafından durduruldu.', 'warn');
  };

  // ── Koşumu Başlat ────────────────────────────────────────────
  const handleRunTests = () => {
    if (!selectedProject) { showToast('error', 'Lütfen bir proje seçin.'); return; }
    if (selectedCases.length === 0) { showToast('error', 'En az bir test senaryosu seçin.'); return; }

    // State sıfırla
    setIsRunning(true);
    setProgress(0);
    setLogs([]);
    setElapsedSeconds(0);
    setResults({ passed: 0, failed: 0, skipped: 0, total: selectedCases.length });
    setWsStatus('connecting');

    // Süre sayacını başlat
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    const ws = new WebSocket('ws://127.0.0.1:8000/ws/run-test');
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      addLog('[INFO] WebSocket bağlantısı kuruldu. Koşum başlatılıyor...', 'info');
      ws.send(JSON.stringify({
        environment,
        browser,
        headless,
        project_id: selectedProject,
        cases:      selectedCases,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'done') {
          clearInterval(timerRef.current);
          setIsRunning(false);
          setProgress(100);
          setWsStatus('disconnected');
          ws.close();
          addLog('[INFO] Koşum tamamlandı.', 'success');
          showToast('success', 'Otomasyon koşumu tamamlandı.');
          return;
        }

        // Progress güncelle
        if (typeof data.progress === 'number') {
          setProgress(data.progress);
        }

        addLog(data.message, data.type);

        // Sonuçları güncelle
        if (data.type === 'success') {
          setResults(prev => ({
            ...prev,
            passed:  prev.passed + 1,
          }));
        } else if (data.type === 'error') {
          setResults(prev => ({ ...prev, failed: prev.failed + 1 }));
        } else if (data.type === 'skip') {
          setResults(prev => ({ ...prev, skipped: prev.skipped + 1 }));
        }

        // Backend progress göndermiyorsa frontend'de hesapla
        setResults(prev => {
          const done = prev.passed + prev.failed + prev.skipped;
          if (prev.total > 0) setProgress(Math.round((done / prev.total) * 100));
          return prev;
        });

      } catch {
        addLog(`[RAW] ${event.data}`, 'info');
      }
    };

    ws.onerror = () => {
      clearInterval(timerRef.current);
      setWsStatus('error');
      setIsRunning(false);
      addLog('[CRITICAL] WebSocket bağlantı hatası! Backend çalışıyor mu?', 'error');
      showToast('error', 'WebSocket bağlantısı kurulamadı.');
    };

    ws.onclose = (e) => {
      clearInterval(timerRef.current);
      setIsRunning(false);
      if (wsStatus !== 'error') setWsStatus('disconnected');
    };
  };

  // ── Render: Loading ──────────────────────────────────────────
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

  // ── WS Durum badge ───────────────────────────────────────────
  const wsStatusBadge = {
    idle:         null,
    connecting:   <span className="flex items-center gap-1 text-xs text-amber-500"><Loader2 size={12} className="animate-spin" /> Bağlanıyor</span>,
    connected:    <span className="flex items-center gap-1 text-xs text-emerald-500"><Wifi size={12} /> Bağlı</span>,
    disconnected: <span className="flex items-center gap-1 text-xs text-slate-400"><WifiOff size={12} /> Bağlantı Kesildi</span>,
    error:        <span className="flex items-center gap-1 text-xs text-rose-500"><AlertCircle size={12} /> Hata</span>,
  }[wsStatus];

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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Play size={22} className="text-emerald-500 fill-emerald-500/20" /> Otomasyon Komuta Merkezi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Otomatik test senaryolarını yapılandırın, tetikleyin ve canlı izleyin.
          </p>
        </div>

        {/* Progress Bar (koşum sırasında) */}
        {isRunning && (
          <div className="flex items-center gap-4 w-full lg:w-80 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-bold text-indigo-500">İşleniyor...</span>
                <span className="font-bold dark:text-white">%{progress}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
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
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
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
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Hedef Proje</label>
                <select value={selectedProject}
                  onChange={(e) => { setSelectedProject(e.target.value); setSelectedCases([]); }}
                  disabled={isRunning}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-50 transition-all">
                  <option value="" disabled>Proje Seçin</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Ortam</label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <select value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={isRunning}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-xl pl-8 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-50 transition-all">
                      <option value="QA">QA (Test)</option>
                      <option value="Staging">Staging</option>
                      <option value="Prod">Production</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Tarayıcı</label>
                  <select value={browser} onChange={(e) => setBrowser(e.target.value)} disabled={isRunning}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white disabled:opacity-50 transition-all">
                    <option value="Chrome">Chrome</option>
                    <option value="Firefox">Firefox</option>
                    <option value="Edge">Edge</option>
                    <option value="Safari">Safari</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <input type="checkbox" id="headless" checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)} disabled={isRunning}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <label htmlFor="headless" className="text-sm font-medium text-slate-800 dark:text-white cursor-pointer">Headless Mod</label>
                  <p className="text-xs text-slate-400 mt-0.5">Tarayıcı görünmeden arka planda çalışır.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Test Seçimi */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col max-h-[440px]">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between items-center shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckSquare size={15} className="text-indigo-500" /> Otomatik Testler
                {projectCases.length > 0 && (
                  <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-md">
                    {selectedCases.length}/{projectCases.length}
                  </span>
                )}
              </h3>
              <button onClick={selectAllCases}
                disabled={!selectedProject || isRunning || projectCases.length === 0}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 transition-opacity">
                {selectedCases.length === projectCases.length && projectCases.length > 0 ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {!selectedProject ? (
                <div className="py-10 text-center">
                  <Server size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">Proje seçin.</p>
                </div>
              ) : projectCases.length === 0 ? (
                <div className="py-10 text-center">
                  <Cpu size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400">Bu projede otomatik test yok.</p>
                  <p className="text-xs text-slate-400 mt-1">Test Senaryoları'nda Yürütme: Automated seçin.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {projectCases.map(tc => {
                    const isSelected = selectedCases.includes(tc.id);
                    return (
                      <div key={tc.id} onClick={() => toggleCaseSelection(tc.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${
                          isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}>
                          {isSelected && <CheckSquare size={12} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{tc.title}</p>
                          <p className="text-xs text-slate-400">#{tc.id} · {tc.priority}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 space-y-2 shrink-0">
              
              {/* ÖRNEK YETKİ KULLANIMI: Başlat ve Durdur Butonları Yetkiye Bağlandı */}
              {can('automation.execute') ? (
                <>
                  <button onClick={handleRunTests}
                    disabled={isRunning || selectedCases.length === 0 || !selectedProject}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 text-sm">
                    {isRunning
                      ? <><Loader2 size={16} className="animate-spin" /> Koşuluyor...</>
                      : <><Play size={16} className="fill-white" /> {selectedCases.length} Testi Başlat</>
                    }
                  </button>
                  {isRunning && (
                    <button onClick={handleStop}
                      className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm">
                      <StopCircle size={15} /> Durdur
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center text-xs font-semibold text-rose-500 py-2">
                  Otomasyon çalıştırma yetkiniz yok.
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
              { label: 'Seçilen', value: selectedCases.length, bg: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800', text: 'dark:text-white', sub: 'text-slate-500' },
              { label: 'Geçen',   value: results.passed,  bg: 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-400', sub: 'text-emerald-600 dark:text-emerald-500' },
              { label: 'Başarısız',value: results.failed, bg: 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30', text: 'text-rose-700 dark:text-rose-400', sub: 'text-rose-600 dark:text-rose-500' },
              { label: 'Süre',    value: formatDuration(elapsedSeconds), bg: 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700', text: 'dark:text-white', sub: 'text-slate-500' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} p-4 rounded-2xl text-center`}>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${card.sub}`}>{card.label}</p>
                <p className={`text-xl font-bold ${card.text}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Terminal */}
          <div className="flex-1 bg-[#0d1117] rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col min-h-[500px]">
            {/* Terminal Header */}
            <div className="bg-[#161b22] px-4 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                {/* Trafik ışıkları */}
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/70" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
                </div>
                <Terminal size={14} className="text-slate-500" />
                <span className="text-xs font-mono text-slate-400">execution-console.log</span>
                {wsStatusBadge}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { if (!isRunning) setLogs([]); }}
                  disabled={isRunning || logs.length === 0}
                  className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors text-xs flex items-center gap-1"
                  title="Temizle">
                  <RefreshCw size={13} /> Temizle
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div ref={terminalRef}
              className="flex-1 p-5 overflow-y-auto font-mono text-[12.5px] leading-relaxed space-y-1 scroll-smooth">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <Cpu size={44} className="text-slate-400 mb-4" />
                  <p className="text-slate-400">Terminal hazır. Koşum bekleniyor...</p>
                </div>
              ) : logs.map((log, idx) => (
                <div key={idx} className="flex gap-3 hover:bg-white/5 px-2 py-0.5 rounded transition-colors">
                  <span className="text-slate-600 shrink-0 select-none tabular-nums">[{log.time}]</span>
                  <span className={`break-all ${
                    log.type === 'error'   ? 'text-rose-400'    :
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'warn'    ? 'text-amber-300'   :
                    log.type === 'running' ? 'text-blue-300'    :
                    'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {isRunning && (
                <div className="flex gap-3 px-2 py-0.5">
                  <span className="text-slate-700 tabular-nums">[{new Date().toLocaleTimeString('tr-TR', { hour12: false })}]</span>
                  <span className="text-slate-600 animate-pulse">█</span>
                </div>
              )}
            </div>

            {/* Terminal Footer — özet */}
            {!isRunning && results.total > 0 && (
              <div className="bg-[#161b22] border-t border-slate-800 px-5 py-2.5 flex items-center gap-6 text-xs font-mono">
                <span className="text-slate-500">Özet:</span>
                <span className="text-emerald-400">✓ {results.passed} geçti</span>
                <span className="text-rose-400">✗ {results.failed} başarısız</span>
                {results.skipped > 0 && <span className="text-amber-400">— {results.skipped} atlandı</span>}
                <span className="text-slate-500 ml-auto">Süre: {formatDuration(elapsedSeconds)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationRun;