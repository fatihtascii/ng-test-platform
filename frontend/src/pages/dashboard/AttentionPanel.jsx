import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Info, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Panel } from '../../components/ui';

const TONE = {
  fail: { icon: AlertOctagon, cls: 'text-rose-600 dark:text-rose-400', count: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' },
  warn: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', count: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' },
  info: { icon: Info, cls: 'text-slate-400 dark:text-slate-500', count: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};
const SHOW = 8;

/** Genel durum: tek listede yapılacaklar (kaynak: dashboard/attention.js) */
const AttentionPanel = ({ items, loading }) => {
  const [all, setAll] = useState(false);
  const urgent = items.filter(i => i.tone === 'fail').length;
  const shown = all ? items : items.slice(0, SHOW);
  return (
    <Panel title={<span className="flex items-center gap-2">Dikkat gerektirenler
      {!loading && items.length > 0 && <span className={`rounded-full px-1.5 text-xs font-medium tabular-nums ${urgent ? TONE.fail.count : TONE.info.count}`}>{items.length}</span>}</span>}
      bodyClassName="p-0">
      {loading ? null : items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
          <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> Şu an dikkat gerektiren bir şey yok.
        </p>
      ) : (
        <>
          <ul className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0 dark:divide-slate-800">
            {shown.map(i => {
              const t = TONE[i.tone]; const Icon = t.icon;
              return (
                <li key={i.key} className="md:border-b md:border-slate-100 md:odd:border-r dark:md:border-slate-800">
                  <Link to={i.to} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Icon size={16} className={`shrink-0 ${t.cls}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{i.title}</span>
                      {i.detail && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{i.detail}</span>}
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-slate-300 group-hover:text-slate-500 dark:text-slate-600" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {items.length > SHOW && (
            <button type="button" onClick={() => setAll(v => !v)}
              className="w-full border-t border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-800/50 dark:hover:text-white">
              {all ? 'Daha az göster' : `${items.length - SHOW} madde daha`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
};

export default AttentionPanel;
