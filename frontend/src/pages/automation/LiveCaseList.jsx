import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, MinusCircle, Loader2, Circle, ChevronRight } from 'lucide-react';
import { Ident } from '../../components/ui';

const META = {
  queued:  { icon: Circle, cls: 'text-slate-300 dark:text-slate-600', label: 'Sırada' },
  running: { icon: Loader2, cls: 'animate-spin text-indigo-600 dark:text-indigo-400', label: 'Koşuyor' },
  passed:  { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', label: 'Geçti' },
  failed:  { icon: XCircle, cls: 'text-rose-600 dark:text-rose-400', label: 'Kaldı' },
  skipped: { icon: MinusCircle, cls: 'text-amber-600 dark:text-amber-400', label: 'Atlandı' },
};

/** Koşumdaki case'lerin canlı durumu; kalan case'in hata mesajı açılabilir. */
const LiveCaseList = ({ cases, stopped }) => {
  const [open, setOpen] = useState(null);
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {cases.map(c => {
        const status = stopped && (c.status === 'queued' || c.status === 'running') ? 'skipped' : c.status;
        const m = META[status] || META.queued;
        const Icon = m.icon;
        const expandable = Boolean(c.error || c.reason);
        const isOpen = open === c.case_id;
        return (
          <li key={c.case_id}>
            <div className={`flex items-center gap-3 px-4 py-2 ${expandable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40' : ''}`}
              onClick={() => expandable && setOpen(isOpen ? null : c.case_id)} role={expandable ? 'button' : undefined} aria-expanded={expandable ? isOpen : undefined}>
              <Icon size={16} className={`shrink-0 ${m.cls}`} aria-label={m.label} />
              <Ident className="shrink-0">TC-{c.case_id}</Ident>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-white">{c.title}</span>
              {c.reason && <span className="hidden text-xs text-amber-700 sm:inline dark:text-amber-400">{c.reason}</span>}
              {c.duration != null && <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{c.duration < 1 ? '<1 sn' : `${c.duration.toFixed(1)} sn`}</span>}
              <span className={`w-14 shrink-0 text-right text-xs font-medium ${m.cls.replace('animate-spin', '')}`}>{m.label}</span>
              {expandable && <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
            </div>
            {isOpen && (
              <div className="space-y-2 px-4 pb-3 pl-11">
                {c.error && <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-rose-300">{c.error}</pre>}
                {c.reason && <p className="text-xs text-slate-600 dark:text-slate-300">{c.reason}</p>}
                <Link to={`/test-cases?case=${c.case_id}`} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Case'i aç</Link>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default LiveCaseList;
