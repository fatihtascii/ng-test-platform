import React from 'react';
import { Link } from 'react-router-dom';
import { Panel, Ident } from '../../components/ui';
import { TONES } from '../../components/ui/tokens';

const SEV_TONE = { 'Kritik': 'fail', 'Yüksek': 'blocked', 'Orta': 'pending', 'Düşük': 'draft' };

/** Açık hataların önem dağılımı, dönemde açılan/çözülen ve en eski açık kayıtlar */
const DefectSummary = ({ m, periodLabel }) => {
  const max = Math.max(1, ...m.bySeverity.map(s => s.count));
  return (
    <Panel title="Hatalar" className="print:break-inside-avoid"
      actions={<Link to="/defects?status=active" className="text-xs font-medium text-indigo-600 hover:underline print:hidden dark:text-indigo-400">Tümünü aç</Link>}>
      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[['Açık', m.open], [`Açılan`, m.opened], ['Çözülen', m.resolved]].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800/50">
              <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{v}</dd>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{l}</dt>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Açılan ve çözülen: {periodLabel.toLocaleLowerCase('tr-TR')}.
          {m.avgResolveDays != null && <> Ortalama çözüm süresi <b className="font-medium text-slate-700 dark:text-slate-200">{m.avgResolveDays < 1 ? '1 günden az' : `${m.avgResolveDays.toFixed(1)} gün`}</b>.</>}
          {m.unassigned > 0 && <> {m.unassigned} açık kayıt kimseye atanmamış.</>}
        </p>
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Açık hatalar, öneme göre</p>
          <ul className="space-y-1.5">
            {m.bySeverity.map(s => (
              <li key={s.severity} className="grid grid-cols-[4rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="text-slate-600 dark:text-slate-300">{s.severity}</span>
                <span className="h-2 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
                  <span className={`block h-full rounded-sm ${TONES[SEV_TONE[s.severity]].bar}`} style={{ width: `${(s.count / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-slate-900 dark:text-white">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
        {m.oldest.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">En uzun süredir açık</p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {m.oldest.map(d => (
                <li key={d.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <Ident className="shrink-0">BUG-{d.id}</Ident>
                  <Link to={`/defects/BUG-${d.id}`} className="min-w-0 flex-1 truncate text-slate-800 hover:underline dark:text-slate-100">{d.title}</Link>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{d.ageDays} gün</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
};

export default DefectSummary;
