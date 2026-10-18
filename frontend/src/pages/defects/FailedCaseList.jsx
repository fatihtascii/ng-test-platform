import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { StatusBadge, Ident } from '../../components/ui';
import { SEVERITY_TONE, caseSteps } from './model';

/** Hata kaydındaki başarısız testler. cases: case_id → test case (adımlar için, varsa) */
const FailedCaseList = ({ details, cases, runId, manual = false }) => {
  const [openIdx, setOpenIdx] = useState(() => (details.length === 1 ? 0 : null));
  if (!details.length) return null;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {details.map((f, idx) => {
        const tc = f.case_id ? cases[f.case_id] : null;
        const steps = caseSteps(tc?.description);
        const open = openIdx === idx;
        return (
          <li key={`${f.case_id}-${idx}`}>
            <button type="button" onClick={() => setOpenIdx(open ? null : idx)} aria-expanded={open}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <ChevronRight size={15} className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  {f.case_id && <Ident className="shrink-0">TC-{f.case_id}</Ident>}
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{tc?.title || f.title || `Test ${idx + 1}`}</span>
                </span>
                {f.error && !open && <span className="mt-0.5 block truncate font-mono text-xs text-rose-600 dark:text-rose-400">{String(f.error).split('\n')[0]}</span>}
              </span>
              {f.severity && <StatusBadge tone={SEVERITY_TONE[f.severity]} className="shrink-0">{f.severity}</StatusBadge>}
            </button>
            {open && (
              <div className="space-y-3 px-4 pb-4 pl-11">
                {(f.error || !manual) && <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">Gerçekleşen sonuç / hata</p>
                  {f.error
                    ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-rose-300">{f.error}</pre>
                    : <p className="px-3 py-2 text-xs italic text-slate-500">Hata mesajı girilmemiş.</p>}
                </div>}
                {steps.length > 0 && (
                  <ol className="space-y-1.5">
                    {steps.map((s, i) => (
                      <li key={s.id || i} className="grid grid-cols-[1.5rem_1fr] gap-x-2 text-sm sm:grid-cols-[1.5rem_1fr_1fr]">
                        <span className="text-xs tabular-nums text-slate-400">{i + 1}.</span>
                        <span className="text-slate-700 dark:text-slate-200">{s.action || '—'}</span>
                        {s.expectedResult && <span className="col-start-2 text-slate-500 sm:col-start-auto dark:text-slate-400"><span className="text-xs">Beklenen: </span>{s.expectedResult}</span>}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {f.case_id && (tc
                    ? <Link to={`/test-cases?case=${f.case_id}`} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"><ExternalLink size={12} /> Case'i aç</Link>
                    : <span className="text-slate-400">Case silinmiş</span>)}
                  {runId && <Link to={f.case_id ? `/test-runs/${runId}?case=${f.case_id}` : `/test-runs/${runId}`} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"><ExternalLink size={12} /> Koşumda göster</Link>}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default FailedCaseList;
