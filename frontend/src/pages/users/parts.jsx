import React from 'react';
import { ROLE_DOT } from '../../components/ui/tokens';
import { PASSWORD_RULES } from './helpers';

/** Rol rozeti: nötr zemin, rolün kimlik rengi yalnızca noktada. */
export const RoleBadge = ({ role, name }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
    <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[role?.color] || ROLE_DOT.slate}`} aria-hidden />
    {role?.display_name || name || '—'}
  </span>
);

export const PasswordRules = ({ value }) => (
  <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
    {PASSWORD_RULES.map(r => {
      const ok = r.test(value);
      return <li key={r.label} className={ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>{ok ? '✓' : '·'} {r.label}</li>;
    })}
  </ul>
);
