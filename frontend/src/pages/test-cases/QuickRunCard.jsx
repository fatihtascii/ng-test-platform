import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MonitorPlay, Loader2, Square, X, RotateCcw, CheckCircle2, XCircle, AlertTriangle, ExternalLink, ListFilter } from 'lucide-react';
import { Button } from '../../components/ui';
import { caseIdent } from './model';

// pytest hatasından tek satırlık özet: ilk "E   …" satırı, yoksa ilk satır
const shortError = (err) => {
  const lines = String(err || '').split('\n').map(l => l.trim()).filter(Boolean);
  const e = lines.find(l => /^E\s+/.test(l));
  return (e ? e.replace(/^E\s+/, '') : lines[0] || '').slice(0, 300);
};

const DONE = new Set(['passed', 'failed', 'skipped']);
const MAX_FAILS = 3;

/**
 * Listeden case'lerin tarayıcı açık (headed) koşumu: sağ altta küçük canlı kart.
 * run: useAutomationRun() · testCases: koşulan case'ler · onDone: koşum kaydedilince (listeyi tazelemek için)
 * onShowInList(runId): koşumun kalanlarını test case listesinde süzer
 * onRetry(ids): kalan / yarım kalan case'leri yeniden koşar (yeni koşum, yeni kart)
 * Tarayıcı penceresi backend'in çalıştığı makinede açılır; sayfadan çıkılırsa koşum durur.
 */
const QuickRunCard = ({ run, testCases, onClose, onDone, onRetry, onShowInList }) => {
  const { phase, logs, progress, summary, error } = run;
  const live = phase === 'connecting' || phase === 'running';
  const single = testCases.length === 1 ? testCases[0] : null;

  // Bitişte bir kez listeyi tazele (son sonuç sütunu güncellensin)
  const reported = useRef(false);
  useEffect(() => {
    if (phase !== 'finished' || reported.current) return;
    reported.current = true;
    onDone?.();
  }, [phase, onDone]);

  const last = [...logs].reverse().find(l => l.message?.trim());
  const counts = summary?.counts;
  const failed = counts?.failed > 0;
  const passed = phase === 'finished' && counts && !failed;
  const total = run.cases.length || testCases.length;
  const doneCount = run.cases.filter(c => DONE.has(c.status)).length;
  const current = run.cases.find(c => c.status === 'running');
  const fails = run.cases.filter(c => c.status === 'failed');
  const ids = testCases.map(c => c.id).join(',');
  const first = testCases[0];

  // Yeniden koşulacaklar: bitti → kalanlar; durduruldu → geçmeyenler; başlatılamadı → hepsi
  const passedIds = new Set(run.cases.filter(c => c.status === 'passed').map(c => c.case_id));
  const retryIds = phase === 'finished' ? fails.map(c => c.case_id)
    : phase === 'stopped' ? testCases.map(c => c.id).filter(id => !passedIds.has(id))
    : phase === 'error' ? testCases.map(c => c.id) : [];
  const retryLabel = phase === 'error' ? 'Tekrar dene'
    : single || retryIds.length === testCases.length ? 'Tekrar koş'
    : phase === 'stopped' ? `Kalanları koş (${retryIds.length})` : `Kalanları tekrar koş (${retryIds.length})`;

  return (
    <div role="status" aria-live="polite" aria-label="Tarayıcıda koşum"
      className="fixed inset-x-4 bottom-4 z-[80] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:left-auto sm:right-6 sm:w-96 dark:border-slate-700 dark:bg-slate-900">
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
              : passed ? (single ? 'Geçti' : 'Hepsi geçti')
              : failed ? (single ? 'Kaldı' : `${counts.failed} case kaldı`)
              : phase === 'stopped' ? 'Durduruldu'
              : phase === 'error' ? 'Koşulamadı' : 'Bitti'}
          </p>
          {single
            ? <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={single.title}>{caseIdent(single.id)} · {single.title}</p>
            : <p className="text-xs text-slate-500 dark:text-slate-400">
                {live && run.cases.length ? `${doneCount}/${total} bitti` : `${total} case`}
                {counts && ` · ${counts.passed || 0} geçti · ${counts.failed || 0} kaldı${counts.skipped ? ` · ${counts.skipped} atlandı` : ''}`}
              </p>}
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
          {!single && current && <p className="mt-2 truncate text-xs text-slate-700 dark:text-slate-200" title={current.title}>{caseIdent(current.case_id)} · {current.title}</p>}
          {last && <p className="mt-1.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={last.message}>{last.message}</p>}
          <p className="mt-2 text-[11px] text-slate-400">Tarayıcı penceresi NG Test sunucusunun çalıştığı makinede açılır. Bu sayfadan ayrılırsanız koşum durur.</p>
        </>
      )}
      {phase === 'stopped' && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Sonuçlar kaydedilmedi.</p>}
      {phase === 'error' && error && <p className="mt-2 text-xs text-rose-700 [overflow-wrap:anywhere] dark:text-rose-400">{error}</p>}
      {phase === 'finished' && failed && (
        single ? (
          <p className="mt-2 line-clamp-3 font-mono text-[11px] text-rose-700 [overflow-wrap:anywhere] dark:text-rose-400">
            {shortError(fails[0]?.error) || 'Ayrıntılar koşum kaydında.'}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {fails.slice(0, MAX_FAILS).map(c => (
              <li key={c.case_id} className="min-w-0 text-xs">
                <p className="truncate text-slate-800 dark:text-slate-100" title={c.title}>{caseIdent(c.case_id)} · {c.title}</p>
                {c.error && <p className="truncate font-mono text-[11px] text-rose-700 dark:text-rose-400" title={shortError(c.error)}>{shortError(c.error)}</p>}
              </li>
            ))}
            {fails.length > MAX_FAILS && <li className="text-xs text-slate-500 dark:text-slate-400">+{fails.length - MAX_FAILS} case daha</li>}
          </ul>
        )
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {live && <Button size="sm" icon={<Square size={13} />} onClick={run.stop} disabled={phase === 'connecting'}>Durdur</Button>}
        {!live && onRetry && retryIds.length > 0 && (
          <Button size="sm" variant="primary" icon={<RotateCcw size={13} />} onClick={() => onRetry(retryIds)} className="mr-auto">{retryLabel}</Button>
        )}
        {phase === 'finished' && !single && fails.length > 0 && summary?.run_id && onShowInList && (
          <button type="button" onClick={() => onShowInList(summary.run_id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <ListFilter size={12} /> Kalanları listede göster
          </button>
        )}
        {!live && summary?.run_id && (
          <Link to={`/test-runs/${summary.run_id}`} title="Koşum kaydını aç"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
            <span className="sr-only">Koşum kaydı </span>KS-{summary.run_id} <ExternalLink size={12} />
          </Link>
        )}
        {!live && (
          <Link to={`/automation?project=${first.project_id}${first.suite_id ? `&suite=${first.suite_id}` : ''}&cases=${ids}`}
            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Otomasyon sayfası
          </Link>
        )}
      </div>
    </div>
  );
};

export default QuickRunCard;
