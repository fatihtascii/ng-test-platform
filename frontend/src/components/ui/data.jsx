/**
 * Veri tabloları ve liste ekranları için ortak parçalar:
 * sıralanabilir başlık, seçim kutusu, sayfalama, arama ve filtre kutuları.
 */
import React, { useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, Search, X, ChevronDown } from 'lucide-react';

const cx = (...p) => p.filter(Boolean).join(' ');

// ── Sıralanabilir tablo başlığı ───────────────────────────────
/** sort: { key, direction: 'asc' | 'desc' } */
export const SortHeader = ({ label, sortKey, sort, onSort, className }) => {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cx('px-3 py-2.5 font-medium', className)}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={cx('-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-slate-900 dark:hover:text-slate-100',
          active && 'text-slate-900 dark:text-slate-100')}>
        {label}
        <Icon size={13} className={active ? '' : 'opacity-40'} aria-hidden />
      </button>
    </th>
  );
};

// ── Seçim kutusu (üç durumlu) ─────────────────────────────────
export const Checkbox = ({ checked, indeterminate = false, onChange, label, className, disabled }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} disabled={disabled}
      className={cx('h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600 dark:border-slate-600', className)} />
  );
};

// ── Sayfalama ─────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const Pagination = ({ page, pageSize, total, onPage, onPageSize, className }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400', className)}>
      <span className="tabular-nums">{total} kayıttan {from}–{to}</span>
      <div className="flex items-center gap-3">
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            Sayfa başına
            <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}
              className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Önceki sayfa"
            className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronLeft size={16} /></button>
          <span className="min-w-[3.5rem] text-center tabular-nums text-slate-700 dark:text-slate-200">{page} / {pages}</span>
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Sonraki sayfa"
            className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
};

// ── Arama kutusu ──────────────────────────────────────────────
export const SearchInput = React.forwardRef(({ value, onChange, placeholder = 'Ara', className, shortcut }, ref) => (
  <div className={cx('relative', className)}>
    <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
    <input ref={ref} type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-14 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white [&::-webkit-search-cancel-button]:hidden" />
    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Aramayı temizle"
          className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X size={14} /></button>
      ) : shortcut ? (
        <kbd className="rounded border border-slate-200 px-1 font-mono text-[10px] text-slate-400 dark:border-slate-700">{shortcut}</kbd>
      ) : null}
    </div>
  </div>
));
SearchInput.displayName = 'SearchInput';

// ── Filtre seçici ─────────────────────────────────────────────
/**
 * Boş değerde etiketi, seçili değerde "Etiket: değer" gösterir; seçiliyken vurgulanır.
 * options: [[value, label]]
 */
export const FilterSelect = ({ label, value, onChange, options, className }) => {
  const current = options.find(([v]) => String(v) === String(value));
  return (
    <label className={cx(
      'relative inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border pl-2.5 pr-7 text-sm',
      value
        ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      className,
    )}>
      <span className="whitespace-nowrap">{label}{current && value ? <>: <span className="font-medium">{current[1]}</span></> : null}</span>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 opacity-60" aria-hidden />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">Tümü</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
};

// ── Form alanı ────────────────────────────────────────────────
export const Field = ({ label, htmlFor, hint, error, required, children, className }) => (
  <div className={className}>
    {label && (
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}{required && <span className="ml-0.5 text-rose-600" aria-hidden>*</span>}
      </label>
    )}
    {children}
    {error ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
      : hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
  </div>
);

// ── Sekmeler ──────────────────────────────────────────────────
/** tabs: [{ id, label, count? }] */
export const Tabs = ({ tabs, value, onChange, className }) => (
  <div role="tablist" className={cx('flex gap-4 border-b border-slate-200 dark:border-slate-800', className)}>
    {tabs.map(t => (
      <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
        className={cx('-mb-px flex items-center gap-1.5 border-b-2 pb-2 pt-1 text-sm',
          value === t.id
            ? 'border-indigo-600 font-medium text-slate-900 dark:border-indigo-400 dark:text-white'
            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}>
        {t.label}
        {t.count != null && <span className="rounded bg-slate-100 px-1 text-[11px] tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t.count}</span>}
        {t.dot && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-label="değişiklik var" />}
      </button>
    ))}
  </div>
);
