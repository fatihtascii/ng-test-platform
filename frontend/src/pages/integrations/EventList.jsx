import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { relativeTime, formatDate } from '../test-runs/model';
import { EVENT_LABEL } from './model';

/** Son gönderimler: başarılı/başarısız, olay türü, mesaj ve zaman */
const EventList = ({ events, loading }) => {
  if (loading) return <p className="px-1 py-3 text-sm text-slate-500">Yükleniyor…</p>;
  if (!events.length) return <p className="px-1 py-3 text-sm text-slate-500 dark:text-slate-400">Henüz gönderim yok.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {events.map(e => (
        <li key={e.id} className="flex gap-2.5 py-2">
          {e.ok
            ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Başarılı" />
            : <XCircle size={15} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-label="Başarısız" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-200">{EVENT_LABEL[e.event] || e.event}</span>
              {e.ref && <span className="font-mono">{e.ref}</span>}
              <time className="ml-auto shrink-0" title={formatDate(e.created_at, true)}>{relativeTime(e.created_at)}</time>
            </p>
            {e.message && <p className={`mt-0.5 break-words text-xs ${e.ok ? 'text-slate-600 dark:text-slate-300' : 'text-rose-700 dark:text-rose-300'}`}>{e.message}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
};

export default EventList;
