import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MonitorPlay, Loader2, Square, X, CheckCircle2, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui';
import { caseIdent } from './model';

/**
 * Listeden tek case'in tarayıcı açık (headed) koşumu: sağ altta küçük canlı kart.
 * run: useAutomationRun() · testCase: koşulan case · onDone: koşum kaydedilince (listeyi tazelemek için)
 * Tarayıcı penceresi backend'in çalıştığı makinede açılır; sayfadan çıkılırsa koşum durur.
 */
// pytest hatasından tek satırlık özet: ilk "E   …" satırı, yoksa ilk satır
const shortError = (err) => {
  const lines = String(err || '').split('\n').map(l => l.trim()).filter(Boolean);
  const e = lines.find(l => /^E\s+/.test(l));
  return (e ? e.replace(/^E\s+/, '') : lines[0] || '').slice(0, 300);
};

const QuickRunCard = ({ run, testCase, onClose, onDone }) => {
  const { phase, logs, progress, summary, error } = run;
  const live = phase === 'connecting' || phase === 'running';
  const ident = caseIdent(testCase.id);

  // Bitişte bir kez listeyi tazele (son sonuç sütunu güncellensin)
  const reported = useRef(false);
  useEffect(() => {
    if (phase !== 'finished' || reported.current) return;
    reported.current = true;
    onDone?.();
  }, [phase, onDone]);

  const last = [...logs].reverse().find(l => l.message?.trim());
  const failed = summary?.counts?.failed > 0;
  const passed = phase === 'finished' && summary && !failed;

  return (
    <div role="status" aria-live="polite" aria-label="Tarayıcıda koşum"
      className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:left-auto sm:right-6 sm:w-96 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${passed ? 'text-emerald-600' : failed || phase === 'error' ? 'text-rose-600' : 'text-indigo-600 dark:text-indigo-400'}`}>
          {live ? <Loader2 size={18} className="animate-spin" />
            : passed ? <CheckCircle2 size={18} />
            : failed ? <XCircle size={18} />
            : phase === 'error' ? <AlertTriangle size={18} /> : <MonitorPlay size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {phase === 'connecting' ? 'Hazırlanıyor…'
              : phase === 'running' ? 'Tarayıcıda koşuluyor…'
              : passed ? 'Geçti'
              : failed ? 'Kaldı'
              : phase === 'stopped' ? 'Durduruldu'
              : phase === 'error' ? 'Koşulamadı' : 'Bitti'}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={testCase.title}>{ident} · {testCase.title}</p>
        </div>
        {!live && (
          <button type="button" onClick={onClose} aria-label="Kapat"
            className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X size={16} />
          </button>
        )}
      </div>

      {live && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${Math.max(progress, 4)}%` }} />
          </div>
          {last && <p className="mt-2 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={last.message}>{last.message}</p>}
          <p className="mt-2 text-[11px] text-slate-400">Tarayıcı penceresi NG Test sunucusunun çalıştığı makinede açılır. Bu sayfadan ayrılırsanız koşum durur.</p>
        </>
      )}
      {phase === 'error' && error && <p className="mt-2 text-xs text-rose-700 [overflow-wrap:anywhere] dark:text-rose-400">{error}</p>}
      {phase === 'finished' && failed && (
        <p className="mt-2 line-clamp-3 font-mono text-[11px] text-rose-700 [overflow-wrap:anywhere] dark:text-rose-400">
          {shortError(run.cases.find(c => c.error)?.error) || 'Ayrıntılar koşum kaydında.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {live && <Button size="sm" icon={<Square size={13} />} onClick={run.stop} disabled={phase === 'connecting'}>Durdur</Button>}
        {!live && summary?.run_id && (
          <Link to={`/test-runs/${summary.run_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
            KS-{summary.run_id} koşumunu aç <ExternalLink size={12} />
          </Link>
        )}
        {!live && (
          <Link to={`/automation?project=${testCase.project_id}${testCase.suite_id ? `&suite=${testCase.suite_id}` : ''}&cases=${testCase.id}`}
            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Otomasyon sayfası
          </Link>
        )}
      </div>
    </div>
  );
};

export default QuickRunCard;
