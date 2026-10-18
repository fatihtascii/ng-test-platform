import React from 'react';
import { Link } from 'react-router-dom';
import { Panel, Ident, StatusBadge } from '../../components/ui';
import { relativeTime, formatDate } from '../test-runs/model';
import { HistoryStrip } from './parts';

const PRIORITY_TONE = { 'Kritik': 'fail', 'Yüksek': 'blocked', 'Orta': 'pending', 'Düşük': 'draft' };

/** Dönemde en çok kalan testler. Kararsız: aynı dönemde geçip kalmaya devam eden test. */
const FailingCases = ({ items }) => (
  <Panel title="En çok kalan testler" bodyClassName="p-0" className="print:break-inside-avoid"
    actions={<span className="text-xs text-slate-500 dark:text-slate-400">kaldı / koşuldu</span>}>
    {items.length === 0 ? (
      <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Bu dönemde kalan test yok.</p>
    ) : (
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map(c => (
          <li key={c.caseId} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <Ident className="shrink-0">TC-{c.caseId}</Ident>
                {c.exists
                  ? <Link to={`/test-cases?case=${c.caseId}`} className="truncate text-sm font-medium text-slate-900 hover:underline dark:text-white">{c.title}</Link>
                  : <span className="truncate text-sm text-slate-500">{c.title}</span>}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                {c.flaky && <StatusBadge tone="blocked">Kararsız</StatusBadge>}
                {c.priority && <StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge>}
                {c.lastFail && (
                  <span title={formatDate(c.lastFail.at, true)}>
                    son kalış <Link to={`/test-runs/${c.lastFail.runId}?case=${c.caseId}`} className="hover:underline">KS-{c.lastFail.runId}</Link> · {relativeTime(c.lastFail.at)}
                  </span>
                )}
              </p>
            </div>
            <div className="hidden shrink-0 sm:block"><HistoryStrip history={c.history} /></div>
            <div className="w-16 shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">{c.Failed}<span className="font-normal text-slate-400"> / {c.executions}</span></p>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Panel>
);

export default FailingCases;
