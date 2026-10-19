import React, { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, Smartphone } from 'lucide-react';
import { Button, StatusBadge } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Modal } from '../../components/ui/overlay';
import { inputCls } from '../../components/ui/tokens';
import { mobileApi } from '../../api';
import { API_BASE, withToken } from '../../auth';
import { caseIdent } from './model';

const LEVEL_CLS = { ok: 'text-emerald-400', error: 'text-rose-400', info: 'text-slate-300' };

const fetchDevices = () => mobileApi.devices()
  .then(({ data }) => ({ list: Array.isArray(data) ? data : [] }))
  .catch(err => ({ list: [], error: err.message }));

const MobileRunDialog = ({ testCase, onClose }) => {
  const [devices, setDevices] = useState({ loading: true, list: [] });
  const [deviceId, setDeviceId] = useState('');
  const [cfg, setCfg] = useState({ app_path: '', app_package: '', app_activity: '', bundle_id: '', appium_server: 'http://localhost:4723' });
  const [run, setRun] = useState({ phase: 'setup' });   // setup | starting | running | done
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);
  const esRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchDevices().then(r => alive && setDevices({ loading: false, ...r }));
    return () => { alive = false; esRef.current?.close(); };
  }, []);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [logs]);

  const rescan = () => {
    setDevices(d => ({ ...d, loading: true }));
    fetchDevices().then(r => setDevices({ loading: false, ...r }));
  };

  const device = devices.list.find(d => d.id === deviceId) || devices.list[0];
  const android = device?.platform === 'android';
  const set = (k) => (e) => setCfg(c => ({ ...c, [k]: e.target.value }));

  const start = async () => {
    setRun({ phase: 'starting' }); setLogs([]);
    try {
      const { data } = await mobileApi.run({
        test_case_id: testCase.id, device_id: device.id, platform: device.platform,
        app_path: cfg.app_path.trim(),
        app_package: android ? cfg.app_package.trim() || null : null,
        app_activity: android ? cfg.app_activity.trim() || null : null,
        bundle_id: android ? null : cfg.bundle_id.trim() || null,
        appium_server: cfg.appium_server.trim(),
      });
      setRun({ phase: 'running', id: data.run_id });
      const es = new EventSource(withToken(`${API_BASE}/api/mobile/run/${data.run_id}/logs/stream`));
      esRef.current = es;
      es.onmessage = (e) => {
        let entry;
        try { entry = JSON.parse(e.data); } catch { return; }
        if (entry.msg === '[DONE]') { es.close(); setRun(r => ({ ...r, phase: 'done', result: entry.status })); return; }
        setLogs(prev => [...prev, entry]);
      };
      es.onerror = () => { es.close(); setRun(r => r.phase === 'running' ? { ...r, phase: 'done', result: 'unknown' } : r); };
    } catch (err) {
      setRun({ phase: 'setup', error: err.message });
    }
  };

  const busy = run.phase === 'starting' || run.phase === 'running';
  const canStart = device && cfg.app_path.trim() && cfg.appium_server.trim() && !busy;

  return (
    <Modal open onClose={onClose} dismissable={!busy} size="md" icon={<Smartphone size={18} />}
      title="Mobil cihazda koş" description={`${caseIdent(testCase.id)} · ${testCase.title}`}
      footer={run.phase === 'setup' || run.phase === 'starting' ? (
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button variant="run" icon={<Play size={14} />} onClick={start} disabled={!canStart} loading={run.phase === 'starting'}>Koşuyu başlat</Button>
        </>
      ) : (
        <>
          {run.phase === 'done' && <Button variant="ghost" onClick={() => setRun({ phase: 'setup' })}>Yeniden koş</Button>}
          <Button onClick={onClose} disabled={busy}>Kapat</Button>
        </>
      )}>
      {run.phase === 'setup' || run.phase === 'starting' ? (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Cihaz</span>
              <button type="button" onClick={rescan} disabled={devices.loading}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:hover:text-white">
                <RefreshCw size={12} className={devices.loading ? 'animate-spin' : ''} /> Yeniden tara
              </button>
            </div>
            {devices.loading ? (
              <p className="text-sm text-slate-500">Bağlı cihazlar taranıyor…</p>
            ) : devices.list.length === 0 ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                {devices.error || 'Cihaz bulunamadı. Android için `adb devices`, iOS için açık bir Simulator gerekir.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800" role="radiogroup" aria-label="Cihaz">
                {devices.list.map(d => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <input type="radio" name="device" checked={device?.id === d.id} onChange={() => setDeviceId(d.id)} className="accent-indigo-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{d.name}</span>
                      <span className="block truncate font-mono text-xs text-slate-500">{d.platform === 'android' ? 'Android' : 'iOS'} {d.version} · {d.id}</span>
                    </span>
                    {d.is_emulator && <span className="text-xs text-slate-400">emülatör</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Field label="Uygulama dosyası" htmlFor="m-app" required hint="Appium sunucusunun erişebildiği .apk / .app / .ipa yolu">
            <input id="m-app" value={cfg.app_path} onChange={set('app_path')} placeholder="/Users/…/app-debug.apk" className={`${inputCls} font-mono`} />
          </Field>
          {device && (android ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="App package" htmlFor="m-pkg"><input id="m-pkg" value={cfg.app_package} onChange={set('app_package')} placeholder="com.ornek.app" className={`${inputCls} font-mono`} /></Field>
              <Field label="App activity" htmlFor="m-act"><input id="m-act" value={cfg.app_activity} onChange={set('app_activity')} placeholder=".MainActivity" className={`${inputCls} font-mono`} /></Field>
            </div>
          ) : (
            <Field label="Bundle ID" htmlFor="m-bundle"><input id="m-bundle" value={cfg.bundle_id} onChange={set('bundle_id')} placeholder="com.ornek.app" className={`${inputCls} font-mono`} /></Field>
          ))}
          <Field label="Appium sunucusu" htmlFor="m-appium">
            <input id="m-appium" value={cfg.appium_server} onChange={set('appium_server')} className={`${inputCls} font-mono`} />
          </Field>
          {run.error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{run.error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {run.phase === 'running' ? <StatusBadge tone="info">Çalışıyor</StatusBadge>
              : run.result === 'passed' ? <StatusBadge tone="pass">Geçti</StatusBadge>
              : run.result === 'failed' ? <StatusBadge tone="fail">Kaldı</StatusBadge>
              : <StatusBadge tone="pending">Bağlantı kesildi</StatusBadge>}
            <span className="font-mono text-xs text-slate-500">koşu {run.id}</span>
          </div>
          <div ref={logRef} className="h-60 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed" aria-live="polite">
            {logs.length === 0 && <p className="text-slate-500">Log bekleniyor…</p>}
            {logs.map((l, i) => (
              <p key={i} className={LEVEL_CLS[l.level] || 'text-slate-300'}><span className="mr-2 select-none text-slate-600">{l.time}</span>{l.msg}</p>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default MobileRunDialog;
