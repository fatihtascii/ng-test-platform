import React from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Panel, ResultBar, Ident, Button } from '../../components/ui';
import { parseResults, summarize, segmentsOf, relativeTime, formatDate } from '../test-runs/model';

/** Son otomasyon koşumları; kalan case'leri tek tıkla yeniden koşturma. */
const RecentRuns = ({ runs, onRerun, canRun, busy }) => (
  <Panel title="Son otomasyon koşumları" bodyClassName="p-0"
    actions={<Link to="/test-runs" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Tüm koşumlar</Link>}>
    {runs.length === 0 ? (
      <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Bu projede henüz otomasyon koşumu yok.</p>
    ) : (
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {runs.map(r => {
          const results = parseResults(r.results);
          const s = summarize(results);
          const failedIds = results.filter(x => x.status === 'Failed').map(x => x.caseId);
          const m = r.meta || {};
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link to={`/test-runs/${r.id}`} className="flex items-baseline gap-2 hover:underline">
                  <Ident className="shrink-0">KS-{r.id}</Ident>
                  <span className="truncate text-sm text-slate-900 dark:text-white" title={formatDate(r.created_at, true)}>{relativeTime(r.created_at)}</span>
                </Link>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {[m.browser, m.environment, m.duration != null && `${Math.round(m.duration)} sn`].filter(Boolean).join(' · ') || r.description}
                </p>
                <ResultBar height="h-1" className="mt-1.5" segments={segmentsOf(s)} />
              </div>
              <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${s.Failed ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {s.Failed ? `${s.Failed} kaldı` : s.rate != null ? `%${s.rate}` : '—'}
              </span>
              {canRun && failedIds.length > 0 && (
                <Button size="sm" variant="runSoft" icon={<RotateCcw size={13} />} disabled={busy} onClick={() => onRerun(failedIds)}
                  title="Bu koşumda kalan case'leri tekrar koştur">Kalanları koş</Button>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </Panel>
);

export default RecentRuns;
