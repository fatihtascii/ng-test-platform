import React from 'react';
import { MoreHorizontal, MonitorPlay, Loader2, Clock } from 'lucide-react';
import { StatusBadge, Ident, Skeleton } from '../../components/ui';
import { SortHeader, Checkbox, Pagination } from '../../components/ui/data';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/overlay';
import { PriorityMark, ExecutionMark, TagList, Marker } from './parts';
import { caseIdent, formatDate } from './model';

// Satırdaki "tarayıcıda çalıştır" düğmesi; aynı anda tek tarayıcı koşumu
const RunButton = ({ c, quickRun }) => {
  const state = quickRun.stateOf(c.id);            // running | queued | done | null
  const id = caseIdent(c.id);
  const label = state === 'running' ? `${id} koşuluyor` : state === 'queued' ? `${id} sırada`
    : state === 'done' ? `${id} bitti` : quickRun.busy ? 'Başka bir koşum sürüyor' : `${id} tarayıcıda çalıştır`;
  return (
    <button type="button" onClick={() => quickRun.onRun(c)} disabled={quickRun.busy} aria-label={label} title={label}
      className={`rounded-md p-1 disabled:cursor-not-allowed ${state === 'running' || state === 'queued' ? 'text-indigo-600 dark:text-indigo-400'
        : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300'}`}>
      {state === 'running' ? <Loader2 size={16} className="animate-spin" />
        : state === 'queued' ? <Clock size={16} className="opacity-60" /> : <MonitorPlay size={16} />}
    </button>
  );
};

/**
 * rowActions(c) → [{ icon, label, onSelect, tone } | 'sep']
 * quickRun → { canRun(c), onRun(c), stateOf(id), busy }: otomasyon case'lerinde tarayıcıda koş düğmesi
 * Satıra tıklamak detayı açar; seçim kutusu, koş düğmesi ve menü tıklaması satırı açmaz.
 */
const CaseTable = ({
  rows, total, loading, selectable, selected, onToggle, onTogglePage,
  sort, onSort, projectName, onOpen, activeId, rowActions, quickRun,
  page, pageSize, onPage, onPageSize, empty,
}) => {
  const pageIds = rows.map(r => r.id);
  const pickedOnPage = pageIds.filter(id => selected.has(id)).length;
  const colCount = 8 + (selectable ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="relative overflow-x-auto">
        <table className="w-full table-fixed text-left text-sm sm:min-w-[640px]">
          <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 py-2.5 pl-4 pr-1">
                  <Checkbox label="Bu sayfadakilerin tümünü seç"
                    checked={pageIds.length > 0 && pickedOnPage === pageIds.length}
                    indeterminate={pickedOnPage > 0 && pickedOnPage < pageIds.length}
                    onChange={() => onTogglePage(pageIds, pickedOnPage !== pageIds.length)} />
                </th>
              )}
              <SortHeader label="Test case" sortKey="title" sort={sort} onSort={onSort} className={selectable ? 'pl-2' : 'pl-4'} />
              <SortHeader label="Proje" sortKey="project" sort={sort} onSort={onSort} className="hidden w-40 md:table-cell" />
              <th scope="col" className="hidden w-32 px-3 py-2.5 font-medium xl:table-cell">Tür</th>
              <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium lg:table-cell">Yürütme</th>
              <SortHeader label="Öncelik" sortKey="priority" sort={sort} onSort={onSort} className="hidden w-28 sm:table-cell" />
              <SortHeader label="Son sonuç" sortKey="status" sort={sort} onSort={onSort} className="w-32 sm:w-36" />
              <SortHeader label="Güncellendi" sortKey="updated" sort={sort} onSort={onSort} className="hidden w-32 xl:table-cell" />
              <th scope="col" className={`${quickRun ? 'w-20' : 'w-12'} px-3 py-2.5`}><span className="sr-only">İşlemler</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={colCount} className="px-4 py-3"><div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-14" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-20" />
                  </div></td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount}>{empty}</td></tr>
            ) : rows.map(c => {
              const isSel = selected.has(c.id);
              const actions = rowActions(c);
              return (
                <tr key={c.id} onClick={() => onOpen(c.id)}
                  className={`group cursor-pointer ${activeId === c.id ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : isSel ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                  {selectable && (
                    <td className="py-2.5 pl-4 pr-1" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={isSel} onChange={() => onToggle(c.id)} label={`${caseIdent(c.id)} seç`} />
                    </td>
                  )}
                  <td className={`max-w-0 py-2.5 pr-3 ${selectable ? 'pl-2' : 'pl-4'}`}>
                    <div className="flex gap-2">
                      <Ident className="hidden w-14 shrink-0 pt-px sm:inline">{caseIdent(c.id)}</Ident>
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={e => { e.stopPropagation(); onOpen(c.id); }}
                          className="block max-w-full truncate text-left font-medium text-slate-900 hover:underline focus-visible:underline dark:text-white">
                          {c.title}
                        </button>
                        <Ident className="sm:hidden">{caseIdent(c.id)}</Ident>
                        {(c.tagList.length > 0 || c.gherkin_scenario || c.automation_script) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {c.automation_script && <Marker title="Otomasyon script'i var">script</Marker>}
                            {c.gherkin_scenario && <Marker title="BDD senaryosu var">bdd</Marker>}
                            <TagList tags={c.tagList} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden truncate px-3 py-2.5 text-slate-600 md:table-cell dark:text-slate-300">{projectName(c.project_id)}</td>
                  <td className="hidden truncate px-3 py-2.5 text-slate-500 xl:table-cell dark:text-slate-400" title={c.type}>{c.type}</td>
                  <td className="hidden px-3 py-2.5 lg:table-cell"><ExecutionMark type={c.execution_type} /></td>
                  <td className="hidden px-3 py-2.5 sm:table-cell"><PriorityMark priority={c.priority} /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-500 xl:table-cell dark:text-slate-400">{formatDate(c.updated_at || c.created_at)}</td>
                  <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                    {quickRun?.canRun(c) && <RunButton c={c} quickRun={quickRun} />}
                    {actions.length > 0 && (
                      <Menu trigger={({ ref, toggle, open }) => (
                        <button ref={ref} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`${caseIdent(c.id)} işlemleri`}
                          className={`rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${open ? 'bg-slate-100 text-slate-700 dark:bg-slate-800' : ''}`}>
                          <MoreHorizontal size={16} />
                        </button>
                      )}>
                        {actions.map((a, i) => a === 'sep'
                          ? <MenuSeparator key={`sep-${i}`} />
                          : <MenuItem key={a.label} icon={a.icon} tone={a.tone} onSelect={a.onSelect}>{a.label}</MenuItem>)}
                      </Menu>
                    )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && total > 0 && (
        <Pagination page={page} pageSize={pageSize} total={total} onPage={onPage} onPageSize={onPageSize} />
      )}
    </div>
  );
};

export default CaseTable;
