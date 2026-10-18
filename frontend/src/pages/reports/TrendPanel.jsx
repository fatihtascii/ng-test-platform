import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Panel, ResultLegend } from '../../components/ui';
import { fmtPct } from './metrics';

// Tema değişkenleri: açık/koyu temada Tailwind @theme renkleriyle aynı
const C = {
  pass: 'var(--color-emerald-500)', fail: 'var(--color-rose-500)', skip: 'var(--color-amber-500)',
  line: 'var(--color-indigo-600)', grid: 'var(--color-slate-200)', tick: 'var(--color-slate-400)',
};
// Izgara, imleç ve dilim aralıkları temaya göre CSS ile boyanır (SVG özniteliğinden önceliklidir)
const CHART_CLS = [
  'px-2 pb-3 pt-4',
  '[&_.recharts-cartesian-grid_line]:stroke-slate-200 dark:[&_.recharts-cartesian-grid_line]:stroke-slate-800',
  '[&_.recharts-tooltip-cursor]:fill-slate-100 dark:[&_.recharts-tooltip-cursor]:fill-slate-800',
  '[&_.recharts-bar-rectangle_path]:stroke-white dark:[&_.recharts-bar-rectangle_path]:stroke-slate-900 [&_.recharts-bar-rectangle_path]:[stroke-width:1px]',
].join(' ');
const axis = { tick: { fontSize: 11, fill: C.tick }, tickLine: false, axisLine: false };

const TipBox = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  const rows = [['Geçti', b.Passed, C.pass], ['Kaldı', b.Failed, C.fail], ['Atlandı', b.Skipped, C.skip]];
  return (
    <div className="min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1 font-medium text-slate-900 dark:text-white">{b.label}</p>
      {rows.map(([l, v, c]) => (
        <p key={l} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}<span className="ml-auto tabular-nums font-medium text-slate-900 dark:text-white">{v}</span>
        </p>
      ))}
      <p className="mt-1 border-t border-slate-100 pt-1 text-slate-600 dark:border-slate-800 dark:text-slate-300">
        Geçme oranı <span className="float-right font-medium tabular-nums text-slate-900 dark:text-white">{fmtPct(b.rate)}</span>
      </p>
      <p className="text-slate-500 dark:text-slate-400">{b.runs} koşum</p>
    </div>
  );
};

/** Dönem içi sonuç trendi: üstte sonuç adetleri (yığılmış), altta geçme oranı — tek eksenli iki grafik */
const TrendPanel = ({ trend, weekly }) => {
  const [table, setTable] = useState(false);
  const total = trend.reduce((s, b) => s + b.Passed + b.Failed + b.Skipped, 0);
  const legend = [
    { label: 'Geçti', value: trend.reduce((s, b) => s + b.Passed, 0), tone: 'pass' },
    { label: 'Kaldı', value: trend.reduce((s, b) => s + b.Failed, 0), tone: 'fail' },
    { label: 'Atlandı', value: trend.reduce((s, b) => s + b.Skipped, 0), tone: 'blocked' },
  ];
  const interval = trend.length > 16 ? Math.ceil(trend.length / 8) - 1 : 0;

  return (
    <Panel title={weekly ? 'Haftalık sonuç trendi' : 'Günlük sonuç trendi'} className="print:break-inside-avoid"
      actions={total > 0 && (
        <button type="button" onClick={() => setTable(t => !t)} className="text-xs font-medium text-indigo-600 hover:underline print:hidden dark:text-indigo-400">
          {table ? 'Grafik' : 'Tablo'}
        </button>
      )}>
      {total === 0 ? (
        <p className="flex h-56 items-center justify-center text-sm text-slate-500 dark:text-slate-400">Bu dönemde sonuç girilmiş koşum yok.</p>
      ) : table ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr><th className="px-4 py-2 text-left font-medium">{weekly ? 'Hafta' : 'Gün'}</th><th className="px-3 py-2 text-right font-medium">Koşum</th><th className="px-3 py-2 text-right font-medium">Geçti</th><th className="px-3 py-2 text-right font-medium">Kaldı</th><th className="px-3 py-2 text-right font-medium">Atlandı</th><th className="px-4 py-2 text-right font-medium">Oran</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {trend.filter(b => b.runs).map(b => (
                <tr key={b.t}><td className="px-4 py-1.5">{b.label}</td><td className="px-3 py-1.5 text-right">{b.runs}</td><td className="px-3 py-1.5 text-right">{b.Passed}</td><td className="px-3 py-1.5 text-right">{b.Failed}</td><td className="px-3 py-1.5 text-right">{b.Skipped}</td><td className="px-4 py-1.5 text-right">{fmtPct(b.rate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={CHART_CLS}>
          <ResultLegend segments={legend} className="mb-3 px-3 text-xs" />
          <div className="h-48" role="img" aria-label="Dönem içi sonuç adetleri">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 160 }}>
              <BarChart data={trend} margin={{ top: 4, right: 12, bottom: 0, left: -6 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="0" />
                <XAxis dataKey="short" {...axis} interval={interval} />
                <YAxis {...axis} allowDecimals={false} width={44} />
                <Tooltip content={<TipBox />}  />
                <Bar dataKey="Passed" stackId="r" fill={C.pass} isAnimationActive={false} />
                <Bar dataKey="Failed" stackId="r" fill={C.fail} isAnimationActive={false} />
                <Bar dataKey="Skipped" stackId="r" fill={C.skip} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 px-3 text-xs font-medium text-slate-500 dark:text-slate-400">Geçme oranı</p>
          <div className="h-28" role="img" aria-label="Dönem içi geçme oranı">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 160 }}>
              <LineChart data={trend} margin={{ top: 6, right: 12, bottom: 0, left: -6 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="short" {...axis} interval={interval} />
                <YAxis {...axis} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={v => `%${v}`} width={44} />
                <Tooltip content={<TipBox />} cursor={{ stroke: C.tick, strokeDasharray: '3 3' }} />
                <Line dataKey="rate" stroke={C.line} strokeWidth={2} dot={{ r: 3, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Panel>
  );
};

export default TrendPanel;
