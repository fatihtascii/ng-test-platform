import React, { useState } from 'react';
import { X, Download, Copy } from 'lucide-react';
import { Button } from '../../components/ui';
import { STATUSES, userName } from './model';

const selectCls = 'h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

/** Seçim varken görünen toplu işlem çubuğu. onStatus/onAssign null ise (yetki yok) gizlenir. */
const DefectBulkBar = ({ count, hiddenCount, assignees, onStatus, onAssign, onExport, onCopy, onClear, busy }) => {
  const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10"
      role="region" aria-label="Toplu işlemler">
      <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{count} kayıt seçili</span>
      {hiddenCount > 0 && <span className="text-xs text-indigo-700/80 dark:text-indigo-300/80">({hiddenCount} tanesi mevcut filtrede görünmüyor)</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {onStatus && (
          <div className="flex items-center gap-1">
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Yeni durum" className={selectCls}>
              <option value="">Durumu değiştir…</option>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <Button size="sm" disabled={!status || Boolean(busy)} loading={busy === 'status'}
              onClick={() => onStatus(status).then(ok => ok && setStatus(''))}>Uygula</Button>
          </div>
        )}
        {onAssign && (
          <div className="flex items-center gap-1">
            <select value={assignee} onChange={e => setAssignee(e.target.value)} aria-label="Atanacak kişi" className={selectCls}>
              <option value="">Ata…</option>
              <option value="none">Atamayı kaldır</option>
              {assignees.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
            </select>
            <Button size="sm" disabled={!assignee || Boolean(busy)} loading={busy === 'assign'}
              onClick={() => onAssign(assignee === 'none' ? null : Number(assignee)).then(ok => ok && setAssignee(''))}>Uygula</Button>
          </div>
        )}
        <Button size="sm" icon={<Copy size={13} />} onClick={onCopy}>Kopyala</Button>
        <Button size="sm" icon={<Download size={13} />} onClick={onExport}>CSV</Button>
        <button type="button" onClick={onClear} aria-label="Seçimi temizle"
          className="rounded-md p-1 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-500/20"><X size={15} /></button>
      </div>
    </div>
  );
};

export default DefectBulkBar;
