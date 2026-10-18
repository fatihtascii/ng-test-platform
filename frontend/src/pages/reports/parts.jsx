import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

/**
 * Tek değerli gösterge. delta: önceki döneme göre fark; goodWhen 'up' | 'down' rengi belirler.
 * deltaUnit: 'pp' (yüzde puan) veya '' (adet)
 */
export const KpiTile = ({ label, value, sub, delta, deltaUnit = '', goodWhen = 'up', hint }) => {
  let deltaEl = null;
  if (delta != null && Number.isFinite(delta)) {
    const zero = Math.abs(delta) < 0.05;
    const good = zero ? null : (delta > 0) === (goodWhen === 'up');
    const Icon = zero ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
    const txt = `${delta > 0 ? '+' : ''}${deltaUnit === 'pp' ? delta.toFixed(1) : Math.round(delta)}${deltaUnit === 'pp' ? ' puan' : ''}`;
    deltaEl = (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good == null ? 'text-slate-500 dark:text-slate-400' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
        title="Önceki eşit döneme göre">
        <Icon size={13} aria-hidden />{zero ? 'değişmedi' : txt}
      </span>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900 print:break-inside-avoid" title={hint}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
        {deltaEl}{sub && <span>{sub}</span>}
      </div>
    </div>
  );
};

/** Bir case'in son sonuçları: soldan sağa eskiden yeniye küçük kareler */
const DOT = { Passed: 'bg-emerald-500', Failed: 'bg-rose-500', Skipped: 'bg-amber-500' };
const DOT_LABEL = { Passed: 'Geçti', Failed: 'Kaldı', Skipped: 'Atlandı' };
export const HistoryStrip = ({ history }) => (
  <span className="inline-flex gap-0.5" role="img" aria-label={`Son sonuçlar: ${history.map(s => DOT_LABEL[s]).join(', ')}`}>
    {history.map((s, i) => <span key={i} className={`h-3 w-1.5 rounded-[2px] ${DOT[s]}`} title={DOT_LABEL[s]} />)}
  </span>
);

/** Yatay oran çubuğu (tek değer) */
export const Meter = ({ value, tone = 'bg-indigo-600', className = '' }) => (
  <span className={`block h-1.5 w-full overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800 ${className}`} aria-hidden>
    <span className={`block h-full rounded-sm ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
  </span>
);
