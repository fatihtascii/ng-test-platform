/** Test case ekranlarında tekrar eden küçük gösterim parçaları. */
import React from 'react';
import { PRIORITY_RANK, EXECUTION_LABEL } from './model';

const cx = (...p) => p.filter(Boolean).join(' ');

/** Öncelik: dört çubuklu sinyal göstergesi. Renk yalnızca Kritik'te (risk anlamı taşır). */
export const PriorityMark = ({ priority, showLabel = true, className }) => {
  const rank = PRIORITY_RANK[priority] || 0;
  const critical = rank === 4;
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-sm', critical ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300', className)}
      title={`Öncelik: ${priority || '—'}`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map(i => (
          <span key={i} style={{ height: `${i * 25}%` }}
            className={cx('w-[3px] rounded-[1px]', i <= rank ? (critical ? 'bg-rose-500' : 'bg-slate-500 dark:bg-slate-400') : 'bg-slate-200 dark:bg-slate-700')} />
        ))}
      </span>
      {showLabel && priority}
    </span>
  );
};

export const ExecutionMark = ({ type, className }) => (
  <span className={cx('text-sm', type === 'Automated' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400', className)}>
    {EXECUTION_LABEL[type] || type}
  </span>
);

export const TagList = ({ tags, max = 3, className }) => {
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map(t => (
        <span key={t} className="rounded bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t}</span>
      ))}
      {tags.length > max && <span className="text-[11px] text-slate-400" title={tags.slice(max).join(', ')}>+{tags.length - max}</span>}
    </span>
  );
};

/** "BDD" / "Script" gibi içerik işaretleri */
export const Marker = ({ children, title }) => (
  <span title={title} className="rounded border border-slate-200 px-1 font-mono text-[10px] leading-4 text-slate-500 dark:border-slate-700 dark:text-slate-400">{children}</span>
);
