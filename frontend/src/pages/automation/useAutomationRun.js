/**
 * Otomasyon koşumu oturumu (WebSocket /ws/run-test).
 * Sunucu olayları: plan, case, log satırları (info/warn/error/success/running), summary, stopped, done.
 * Sonuçları sunucu kaydeder; istemci yalnızca gösterir (eskiden ikinci bir koşum da açılıyordu).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { withToken } from '../../auth';

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/^http/, 'ws');
const MAX_LOGS = 5000;
const LOG_TYPES = new Set(['info', 'warn', 'error', 'success', 'running']);

const initial = { phase: 'idle', cases: [], logs: [], progress: 0, summary: null, error: null, startedAt: null, endedAt: null, config: null };

export const useAutomationRun = () => {
  const [state, setState] = useState(initial);
  const wsRef = useRef(null);
  const bufRef = useRef([]);          // log satırları kareye bir kez yazılır (çok satırda donmasın)
  const frameRef = useRef(0);
  const seqRef = useRef(0);

  const flush = useCallback(() => {
    frameRef.current = 0;
    const add = bufRef.current;
    if (!add.length) return;
    bufRef.current = [];
    setState(s => {
      const logs = s.logs.concat(add);
      return { ...s, logs: logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs };
    });
  }, []);

  const pushLog = useCallback((type, message) => {
    bufRef.current.push({ id: ++seqRef.current, type, message, time: new Date().toLocaleTimeString('tr-TR', { hour12: false }) });
    if (!frameRef.current) frameRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const finish = useCallback((phase, patch = {}) => {
    flush();
    setState(s => (['finished', 'stopped', 'error'].includes(s.phase) ? s : { ...s, phase, endedAt: Date.now(), ...patch }));
  }, [flush]);

  const handle = useCallback((d) => {
    if (d.type === 'plan') {
      setState(s => ({ ...s, phase: 'running', cases: d.cases.map(c => ({ ...c, duration: null, error: null })) }));
      if (d.message) pushLog('running', `[SİSTEM] ${d.message}`);
      return;
    }
    if (d.type === 'case') {
      setState(s => ({
        ...s,
        progress: typeof d.progress === 'number' ? d.progress : s.progress,
        cases: s.cases.map(c => (c.case_id === d.case_id
          ? { ...c, status: d.status, duration: d.duration ?? c.duration, error: d.error ?? c.error } : c)),
      }));
      return;
    }
    if (d.type === 'summary') { setState(s => ({ ...s, summary: d, progress: 100 })); return; }
    if (d.type === 'stopped') { pushLog('warn', d.message); finish('stopped'); return; }
    if (d.type === 'done') { pushLog('success', d.message); finish('finished'); return; }
    if (LOG_TYPES.has(d.type)) {
      if (d.message) pushLog(d.type, d.message);
      if (typeof d.progress === 'number') setState(s => (d.progress > s.progress ? { ...s, progress: d.progress } : s));
      // Sunucunun koşumu başlatmadan/yarıda bıraktığı hata: bağlantı kapanınca gösterilir
      if (d.type === 'error' && d.message?.startsWith('[HATA]')) setState(s => ({ ...s, error: d.message.replace(/^\[HATA\]\s*/, '') }));
    }
  }, [finish, pushLog]);

  const start = useCallback((config) => {
    if (wsRef.current) return;
    bufRef.current = [];
    setState({ ...initial, phase: 'connecting', startedAt: Date.now(), config });
    const ws = new WebSocket(withToken(`${WS_BASE}/ws/run-test`));
    wsRef.current = ws;
    ws.onopen = () => {
      pushLog('info', '◎ Sunucuya bağlanıldı, ortam hazırlanıyor…');
      ws.send(JSON.stringify({
        cases: config.cases, browser: config.browser, headless: config.headless, environment_id: config.environmentId || null,
        // Depo profili: case listesi yerine depo + pytest -m ifadesi
        ...(config.suiteId ? { suite_id: config.suiteId, marker: config.marker ?? '' } : {}),
      }));
    };
    ws.onmessage = (e) => {
      let d;
      try { d = JSON.parse(e.data); } catch { pushLog('warn', 'Sunucudan okunamayan bir mesaj geldi.'); return; }
      handle(d);
      // Koşum bitti: bağlantı hemen bırakılır, hemen ardından yeni koşum (ör. "kalanları tekrar koş") başlatılabilsin
      if ((d.type === 'done' || d.type === 'stopped') && wsRef.current === ws) { wsRef.current = null; ws.close(); }
    };
    ws.onerror = () => { if (wsRef.current === ws) pushLog('error', '✕ Bağlantı hatası.'); };
    ws.onclose = (e) => {
      if (wsRef.current && wsRef.current !== ws) return;   // eski bağlantı; yeni koşumun durumuna dokunmaz
      wsRef.current = null;
      setState(s => {
        if (['finished', 'stopped', 'error'].includes(s.phase)) return s;
        const reason = e.code === 4401 ? 'Oturum süresi doldu; tekrar giriş yapın.'
          : e.code === 4403 ? 'Otomasyon çalıştırma yetkiniz yok.'
          : s.error || 'Bağlantı beklenmedik şekilde kapandı.';
        return { ...s, phase: 'error', error: reason, endedAt: Date.now() };
      });
      flush();
    };
  }, [flush, handle, pushLog]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }));
    pushLog('warn', '■ Durdurma isteği gönderildi…');
  }, [pushLog]);

  const reset = useCallback(() => { if (!wsRef.current) setState(initial); }, []);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    // Sayfadan çıkılırsa bağlantı kapanır; sunucu süreci sonlandırır
    if (wsRef.current) wsRef.current.close();
  }, []);

  const busy = state.phase === 'connecting' || state.phase === 'running';
  return { ...state, busy, start, stop, reset };
};
