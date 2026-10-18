import React from 'react';
import { Link } from 'react-router-dom';
import { Check, X, SkipForward, RotateCcw, ChevronLeft, ChevronRight, Bug, ArrowLeft } from 'lucide-react';
import { Button, Ident, StatusBadge, EmptyState } from '../../components/ui';
import { textareaCls } from '../../components/ui/tokens';
import CodeBlock from '../test-cases/CodeBlock';
import { PriorityMark } from '../test-cases/parts';
import { caseIdent, EXECUTION_LABEL } from '../test-cases/model';
import { RESULT_LABEL, RESULT_TONE } from './model';

const cx = (...p) => p.filter(Boolean).join(' ');

const RESULT_BUTTONS = [
  { status: 'Passed', label: 'Geçti', key: 'P', icon: Check, on: 'bg-emerald-600 text-white ring-emerald-600', hover: 'hover:ring-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400' },
  { status: 'Failed', label: 'Kaldı', key: 'F', icon: X, on: 'bg-rose-600 text-white ring-rose-600', hover: 'hover:ring-rose-500 hover:text-rose-700 dark:hover:text-rose-400' },
  { status: 'Skipped', label: 'Atla', key: 'S', icon: SkipForward, on: 'bg-amber-500 text-white ring-amber-500', hover: 'hover:ring-amber-500 hover:text-amber-700 dark:hover:text-amber-400' },
];

/** Sağ bölme: seçili case'in adımları ve sonuç girişi. */
const RunCasePanel = ({
  result, tc, index, total, readOnly, onResult, onNote, noteRef, onPrev, onNext, onBack,
  onDefect, defectBusy, canDefect,
}) => {
  if (!result) return <EmptyState title="Soldan bir case seçin" className="h-full" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {onBack && (
              <button type="button" onClick={onBack} className="-ml-1 mr-1 rounded p-0.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Listeye dön">
                <ArrowLeft size={16} />
              </button>
            )}
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">{index + 1} / {total}</span>
            <Ident>{caseIdent(result.caseId)}</Ident>
            <StatusBadge tone={RESULT_TONE[result.status]}>{RESULT_LABEL[result.status]}</StatusBadge>
            <div className="ml-auto flex items-center">
              <Button variant="ghost" size="icon" onClick={onPrev} disabled={!onPrev} aria-label="Önceki case (k)" title="Önceki (k)"><ChevronLeft size={16} /></Button>
              <Button variant="ghost" size="icon" onClick={onNext} disabled={!onNext} aria-label="Sonraki case (j)" title="Sonraki (j)"><ChevronRight size={16} /></Button>
            </div>
          </div>
          {tc ? (
            <>
              <h2 className="text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                <Link to={`/test-cases?case=${tc.id}`} className="hover:underline">{tc.title}</Link>
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                <PriorityMark priority={tc.priority} />
                <span>{tc.type}</span>
                <span>{EXECUTION_LABEL[tc.execution_type]}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Bu case silinmiş; sonucu yine de kayıtlı.</p>
          )}
        </div>

        {tc?.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{tc.summary}</p>}
        {tc && (tc.steps.length > 0 ? (
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {tc.steps.map((s, i) => (
              <li key={s.id || i} className="grid grid-cols-[2rem_1fr] gap-x-3 px-3 py-3 sm:grid-cols-[2rem_1fr_1fr]">
                <span className="pt-0.5 font-mono text-xs tabular-nums text-slate-400">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{s.action || '—'}</p>
                  {s.image && <img src={s.image} alt={`Adım ${i + 1} görseli`} className="mt-2 max-h-40 rounded border border-slate-200 object-contain dark:border-slate-700" />}
                </div>
                <div className="col-start-2 mt-2 min-w-0 border-l-2 border-slate-200 pl-3 sm:col-start-3 sm:mt-0 dark:border-slate-700">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Beklenen</p>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{s.expectedResult || '—'}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : tc.gherkin_scenario ? (
          <CodeBlock code={tc.gherkin_scenario} language="gherkin" filename="senaryo.feature" />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Bu case'te adım tanımlı değil.</p>
        ))}

        <div>
          <label htmlFor="run-note" className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
            <span>{result.status === 'Failed' ? 'Ne oldu?' : 'Not'}</span>
            {!readOnly && <span className="text-xs font-normal text-slate-400">n ile odaklan · Esc ile çık</span>}
          </label>
          <textarea id="run-note" ref={noteRef} rows={result.status === 'Failed' ? 4 : 2} value={result.note}
            onChange={e => onNote(e.target.value)} readOnly={readOnly}
            placeholder={result.status === 'Failed' ? 'Gözlenen davranış, hata mesajı, ortam bilgisi…' : 'İsteğe bağlı'}
            className={cx(textareaCls, result.status === 'Failed' && !result.note.trim() && !readOnly && 'border-rose-300 dark:border-rose-500/50')} />
          {result.status === 'Failed' && canDefect && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" icon={<Bug size={13} />} onClick={onDefect} loading={defectBusy} disabled={!result.note.trim()}
                title={result.note.trim() ? undefined : 'Önce ne olduğunu yazın'}>Ayrı hata kaydı aç</Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">Kaldı sonucu alan tüm case'ler zaten koşumun ortak hata kaydında toplanır.</span>
            </div>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          {RESULT_BUTTONS.map(b => {
            const Icon = b.icon;
            const on = result.status === b.status;
            return (
              <button key={b.status} type="button" onClick={() => onResult(on ? 'Pending' : b.status)} aria-pressed={on}
                className={cx('inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                  on ? b.on : cx('bg-white text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700', b.hover))}>
                <Icon size={15} strokeWidth={2.5} />{b.label}
                <kbd className={cx('ml-1 rounded px-1 font-mono text-[10px]', on ? 'bg-white/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{b.key}</kbd>
              </button>
            );
          })}
          {result.status !== 'Pending' && (
            <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={() => onResult('Pending')}>Sıfırla</Button>
          )}
        </div>
      )}
    </div>
  );
};

export default RunCasePanel;
