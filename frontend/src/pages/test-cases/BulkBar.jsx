import React, { useState } from 'react';
import { X, Play, MonitorPlay, ClipboardList, Trash2, Download } from 'lucide-react';
import { Button } from '../../components/ui';
import { STATUSES } from './model';

/**
 * Seçim varken tablonun üstünde görünen işlem çubuğu.
 * Her işlem yalnızca yetkisi olana gösterilir; yetki kontrolü çağıran tarafta yapılır (null = gizle).
 */
const BulkBar = ({ count, hiddenCount, onClear, onStatus, onAddToPlan, onAutomation, onBrowserRun, browserBusy, automatableCount, onExport, onDelete, busy }) => {
  const [status, setStatus] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10"
      role="region" aria-label="Toplu işlemler">
      <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{count} case seçili</span>
      {hiddenCount > 0 && (
        <span className="text-xs text-indigo-700/80 dark:text-indigo-300/80">({hiddenCount} tanesi mevcut filtrede görünmüyor)</span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {onStatus && (
          <div className="flex items-center gap-1">
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Yeni sonuç"
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <option value="">Sonucu değiştir…</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button size="sm" disabled={!status || busy === 'status'} loading={busy === 'status'}
              onClick={() => onStatus(status).then(ok => ok && setStatus(''))}>Uygula</Button>
          </div>
        )}
        {onAddToPlan && <Button size="sm" variant="accentSoft" icon={<ClipboardList size={13} />} onClick={onAddToPlan}>Plana ekle</Button>}
        {onAutomation && (
          <Button size="sm" variant="runSoft" icon={<Play size={13} />} onClick={onAutomation} disabled={!automatableCount}
            title={automatableCount ? undefined : 'Seçimde script\'i olan otomasyon case\'i yok'}>
            Otomasyonda koş{automatableCount ? ` (${automatableCount})` : ''}
          </Button>
        )}
        {onBrowserRun && (
          <Button size="sm" variant="runSoft" icon={<MonitorPlay size={13} />} onClick={onBrowserRun} disabled={!automatableCount || browserBusy}
            title={browserBusy ? 'Bir tarayıcı koşumu sürüyor' : automatableCount ? 'Seçilen otomasyon case\'lerini burada, tarayıcı görünür koş' : 'Seçimde otomasyon case\'i yok'}>
            Tarayıcıda çalıştır{automatableCount ? ` (${automatableCount})` : ''}
          </Button>
        )}
        <Button size="sm" icon={<Download size={13} />} onClick={onExport}>CSV</Button>
        {onDelete && <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={onDelete}>Sil</Button>}
        <button type="button" onClick={onClear} aria-label="Seçimi temizle"
          className="rounded-md p-1 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-500/20"><X size={15} /></button>
      </div>
    </div>
  );
};

export default BulkBar;
