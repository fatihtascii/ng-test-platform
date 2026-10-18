import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge, Ident } from '../../components/ui';
import { SearchInput, Checkbox } from '../../components/ui/data';

const PRIORITY_TONE = { 'Kritik': 'fail', 'Yüksek': 'blocked', 'Orta': 'pending', 'Düşük': 'draft' };
const LAST_TONE = { 'Başarılı': 'pass', 'Başarısız': 'fail' };
const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');

/** Otomasyon case'lerini seçme listesi. Script'i olmayan case seçilemez. */
const CasePicker = ({ cases, selected, onChange, disabled }) => {
  const [q, setQ] = useState('');
  const visible = useMemo(() => {
    const n = trLower(q.trim());
    return cases.filter(c => !n || trLower(c.title).includes(n) || `tc-${c.id}` === n || String(c.id) === n);
  }, [cases, q]);
  const runnable = visible.filter(c => c.hasScript);
  const allOn = runnable.length > 0 && runnable.every(c => selected.has(c.id));
  const someOn = runnable.some(c => selected.has(c.id));

  const toggle = (id) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); };
  const toggleAll = () => {
    const n = new Set(selected);
    runnable.forEach(c => (allOn ? n.delete(c.id) : n.add(c.id)));
    onChange(n);
  };

  if (!cases.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Bu projede otomasyon case'i yok. Bir case'in yürütme tipini "Otomasyon" yapıp Playwright script'i ekleyin.
        <Link to="/test-cases?exec=Automated" className="mt-2 block font-medium text-indigo-600 hover:underline dark:text-indigo-400">Case'lere git</Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder="Case ara" />
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <label className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Checkbox checked={allOn} indeterminate={someOn && !allOn} onChange={toggleAll} disabled={disabled || !runnable.length} label="Görünenleri seç" />
          <span>{q ? 'Görünenlerin tümü' : 'Tümü'}</span>
          <span className="ml-auto tabular-nums">{selected.size} seçili</span>
        </label>
        <ul className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">Eşleşen case yok.</li>}
          {visible.map(c => (
            <li key={c.id}>
              <label className={`flex items-start gap-2.5 px-3 py-2 ${c.hasScript && !disabled ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'opacity-60'}`}>
                <Checkbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} disabled={disabled || !c.hasScript} label={`TC-${c.id} seç`} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <Ident className="shrink-0">TC-{c.id}</Ident>
                    <span className="truncate text-sm text-slate-900 dark:text-white">{c.title}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5">
                    {c.priority && <StatusBadge tone={PRIORITY_TONE[c.priority]}>{c.priority}</StatusBadge>}
                    {LAST_TONE[c.status] && <StatusBadge tone={LAST_TONE[c.status]}>Son: {c.status === 'Başarılı' ? 'geçti' : 'kaldı'}</StatusBadge>}
                    {!c.hasScript && <span className="text-xs text-amber-700 dark:text-amber-400">Script yok</span>}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CasePicker;
