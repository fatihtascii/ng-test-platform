import React from 'react';
import { Link } from 'react-router-dom';
import { Bug } from 'lucide-react';

/** Case'in açık hata kaydı rozeti (BUG-N; birden fazlaysa "+N"). Tıklayınca kayda gider, satırı açmaz. */
const BugMark = ({ bugs }) => {
  if (!bugs?.length) return null;
  const first = bugs[0];
  return (
    <Link to={`/defects/BUG-${first.id}`} onClick={e => e.stopPropagation()}
      title={bugs.length > 1 ? `${bugs.length} açık hata kaydı` : 'Açık hata kaydı'}
      className="inline-flex items-center gap-0.5 rounded border border-rose-200 px-1 font-mono text-[10px] font-medium leading-4 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10">
      <Bug size={10} />BUG-{first.id}{bugs.length > 1 && ` +${bugs.length - 1}`}
    </Link>
  );
};

export default BugMark;
