import React, { useEffect, useRef } from 'react';
import { Check, X, SkipForward } from 'lucide-react';
import { SearchInput } from '../../components/ui/data';
import { caseIdent } from '../test-cases/model';
import { RESULT_LABEL } from './model';

const cx = (...p) => p.filter(Boolean).join(' ');

export const ResultGlyph = ({ status, className }) => {
  const base = cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', className);
  if (status === 'Passed') return <span className={cx(base, 'bg-emerald-500 text-white')} aria-label="Geçti"><Check size={12} strokeWidth={3} /></span>;
  if (status === 'Failed') return <span className={cx(base, 'bg-rose-500 text-white')} aria-label="Kaldı"><X size={12} strokeWidth={3} /></span>;
  if (status === 'Skipped') return <span className={cx(base, 'bg-amber-500 text-white')} aria-label="Atlandı"><SkipForward size={11} strokeWidth={2.5} /></span>;
  return <span className={cx(base, 'border-[1.5px] border-dashed border-slate-300 dark:border-slate-600')} aria-label="Bekliyor" />;
};

const FILTERS = ['all', 'Pending', 'Failed', 'Passed', 'Skipped'];
const FILTER_LABEL = { all: 'Tümü', ...RESULT_LABEL };

/** Sol bölme: kapsamdaki case'ler, sonuç filtresi ve arama. */
const RunCaseList = ({ items, counts, filter, onFilter, query, onQuery, selectedId, onSelect }) => {
  const listRef = useRef(null);
  // Seçili satır görünür kalsın (klavyeyle gezinirken)
  useEffect(() => {
    listRef.current?.querySelector(`[data-case="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <SearchInput value={query} onChange={onQuery} placeholder="Case ara" />
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sonuca göre süz">
          {FILTERS.map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => onFilter(f)}
              className={cx('rounded-md px-2 py-0.5 text-xs',
                filter === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
              {FILTER_LABEL[f]} <span className="tabular-nums opacity-70">{f === 'all' ? counts.total : counts[f]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label="Case'ler">
        {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Bu filtrede case yok.</li>}
        {items.map(({ result, tc, index }) => (
          <li key={result.caseId} data-case={result.caseId} role="option" aria-selected={selectedId === result.caseId}>
            <button type="button" onClick={() => onSelect(result.caseId)}
              className={cx('flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left',
                selectedId === result.caseId
                  ? 'border-indigo-600 bg-indigo-50/70 dark:border-indigo-400 dark:bg-indigo-500/10'
                  : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50')}>
              <ResultGlyph status={result.status} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{tc?.title || 'Silinmiş case'}</span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {String(index + 1).padStart(2, '0')} · {caseIdent(result.caseId)}{tc?.priority === 'Kritik' && <span className="ml-1 text-rose-600 dark:text-rose-400">· Kritik</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RunCaseList;
