import React from 'react';
import { Panel, ResultBar } from '../../components/ui';
import { relativeTime } from '../test-runs/model';
import { fmtPct } from './metrics';

/** Proje karşılaştırması; satıra tıklamak raporu o projeye daraltır */
const ProjectTable = ({ rows, onSelect }) => (
  <Panel title="Projeler" bodyClassName="p-0" className="print:break-inside-avoid">
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-sm sm:min-w-[640px]">
        <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <tr>
            <th scope="col" className="w-1/4 py-2 pl-4 pr-3 font-medium">Proje</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Koşum</th>
            <th scope="col" className="hidden w-[28%] px-3 py-2 font-medium md:table-cell">Sonuçlar</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Geçme</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Kapsam</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Açık hata</th>
            <th scope="col" className="hidden py-2 pl-3 pr-4 font-medium lg:table-cell">Son koşum</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(p => {
            const c = p.counts;
            return (
              <tr key={p.id} onClick={() => onSelect(p.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="max-w-0 py-2.5 pl-4 pr-3">
                  <button type="button" onClick={e => { e.stopPropagation(); onSelect(p.id); }} className="block max-w-full truncate text-left font-medium text-slate-900 hover:underline dark:text-white">{p.name}</button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{p.cases} case</span>
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{p.runs}</td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <ResultBar height="h-1.5" segments={[
                    { label: 'Geçti', value: c.Passed, tone: 'pass' }, { label: 'Kaldı', value: c.Failed, tone: 'fail' },
                    { label: 'Atlandı', value: c.Skipped, tone: 'blocked' }, { label: 'Bekliyor', value: c.Pending, tone: 'pending' },
                  ]} />
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900 dark:text-white">{fmtPct(p.rate)}</td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-600 sm:table-cell dark:text-slate-300" title={`${p.covered}/${p.cases} case koşuldu`}>
                  {p.cases ? fmtPct((p.covered / p.cases) * 100) : '—'}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${p.openDefects ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-slate-400'}`}>{p.openDefects}</td>
                <td className="hidden py-2.5 pl-3 pr-4 text-xs text-slate-500 lg:table-cell dark:text-slate-400">{p.lastRun ? relativeTime(p.lastRun.created_at) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Panel>
);

export default ProjectTable;
