/**
 * NG Test arayüz bileşenleri.
 *
 * Tüm sayfalar aynı dili konuşsun diye ortak parçalar burada. Renkler index.css'teki
 * anlamlı ölçeklerden gelir: emerald=geçti, rose=kaldı, amber=bloklu, violet=bekliyor.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { TONES, toneOf, initialsOf } from './tokens';

const cx = (...parts) => parts.filter(Boolean).join(' ');

// ── Sonuç şeridi (imza öğesi) ─────────────────────────────────
/**
 * segments: [{ label, value, tone }]
 * Oranları tek bir bölümlü çubukta gösterir. Değer 0 olan bölümler çizilmez.
 */
export const ResultBar = ({ segments, height = 'h-2', className, title }) => {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);
  if (!total) {
    return <div className={cx('w-full rounded-sm bg-slate-100 dark:bg-slate-800', height, className)} title="Henüz sonuç yok" />;
  }
  return (
    <div className={cx('flex w-full gap-px overflow-hidden rounded-sm', height, className)}
      role="img" aria-label={title || segments.map(s => `${s.label}: ${s.value}`).join(', ')}>
      {segments.filter(s => s.value > 0).map(s => (
        <div key={s.label} className={TONES[s.tone]?.bar || TONES.pending.bar}
          style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
};

export const ResultLegend = ({ segments, className }) => (
  <dl className={cx('flex flex-wrap items-center gap-x-5 gap-y-1 text-sm', className)}>
    {segments.map(s => (
      <div key={s.label} className="flex items-center gap-2">
        <span className={cx('h-2 w-2 rounded-full', TONES[s.tone]?.dot)} aria-hidden />
        <dt className="text-slate-500 dark:text-slate-400">{s.label}</dt>
        <dd className="font-semibold text-slate-900 dark:text-slate-100">{s.value}</dd>
      </div>
    ))}
  </dl>
);

// ── Statü rozeti ──────────────────────────────────────────────
export const StatusBadge = ({ status, tone, children, className }) => {
  const t = TONES[tone || toneOf(status)] || TONES.pending;
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', t.soft, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />
      {children || status}
    </span>
  );
};

// ── Buton ─────────────────────────────────────────────────────
const BUTTON_VARIANTS = {
  primary:   'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-600/50',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
  ghost:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger:    'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50',
};
const BUTTON_SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
};
export const Button = ({ variant = 'secondary', size = 'md', icon, loading, children, className, ...props }) => (
  <button
    className={cx(
      'inline-flex shrink-0 items-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
      BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className,
    )}
    disabled={loading || props.disabled}
    {...props}
  >
    {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
    {children}
  </button>
);

// ── Sayfa başlığı ─────────────────────────────────────────────
export const PageHeader = ({ title, description, actions, meta }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {meta}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

// ── Panel ─────────────────────────────────────────────────────
export const Panel = ({ title, actions, children, className, bodyClassName }) => (
  <section className={cx('rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900', className)}>
    {(title || actions) && (
      <header className="flex h-11 items-center justify-between gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

// ── Boş durum ─────────────────────────────────────────────────
export const EmptyState = ({ icon, title, description, action, className }) => (
  <div className={cx('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    {icon && <div className="mb-3 text-slate-400">{icon}</div>}
    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// ── Yükleniyor iskeleti ───────────────────────────────────────
export const Skeleton = ({ className }) => (
  <div className={cx('animate-pulse rounded-md bg-slate-100 dark:bg-slate-800', className)} />
);

// ── Kimlik (TC-12, BUG-4) ─────────────────────────────────────
export const Ident = ({ children, className }) => (
  <span className={cx('font-mono text-xs text-slate-500 dark:text-slate-400', className)}>{children}</span>
);

// ── Avatar ────────────────────────────────────────────────────
export const Avatar = ({ user, size = 'md', className }) => (
  <span className={cx(
    'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100',
    size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-8 w-8 text-xs',
    className,
  )} aria-hidden>
    {initialsOf(user?.full_name, user?.username)}
  </span>
);


// ── Ürün işareti: üç bölümlü sonuç şeridi ─────────────────────
export const BrandMark = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <rect x="1" y="3" width="18" height="3.2" rx="1" className="fill-emerald-500" />
    <rect x="1" y="8.4" width="11" height="3.2" rx="1" className="fill-rose-500" />
    <rect x="13" y="8.4" width="6" height="3.2" rx="1" className="fill-slate-300 dark:fill-slate-600" />
    <rect x="1" y="13.8" width="7" height="3.2" rx="1" className="fill-indigo-600 dark:fill-indigo-400" />
  </svg>
);
