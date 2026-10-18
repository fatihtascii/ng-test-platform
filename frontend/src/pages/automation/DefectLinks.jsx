import React from 'react';
import { Link } from 'react-router-dom';
import { Bug, CheckCircle2 } from 'lucide-react';

const MAX_LINKS = 4;
const GROUPS = [
  ['opened', 'yeni bug', 'text-rose-700 dark:text-rose-400'],
  ['reopened', 'yeniden açıldı', 'text-rose-700 dark:text-rose-400'],
  ['updated', "açık bug'a not", 'text-slate-600 dark:text-slate-300'],
  ['resolved', 'çözüldü', 'text-emerald-700 dark:text-emerald-400'],
];

const Ids = ({ ids }) => (
  <>
    {ids.slice(0, MAX_LINKS).map((id, i) => (
      <React.Fragment key={id}>
        {i > 0 && ', '}
        <Link to={`/defects/BUG-${id}`} className="font-medium hover:underline">BUG-{id}</Link>
      </React.Fragment>
    ))}
    {ids.length > MAX_LINKS && <> +{ids.length - MAX_LINKS}</>}
  </>
);

/**
 * Otomasyon koşumunun hata kaydı özeti (sunucunun summary.defects alanı):
 * { opened, reopened, updated, resolved: [id], grouped: id|null }
 */
const DefectLinks = ({ defects, className = '' }) => {
  if (!defects) return null;
  const items = GROUPS.filter(([k]) => defects[k]?.length);
  if (!items.length && !defects.grouped) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}>
      {defects.grouped && (
        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400" title="Çok sayıda test ilk kez kaldı; tek kayıtta toplandı">
          <Bug size={12} /> toplu kayıt: <Ids ids={[defects.grouped]} />
        </span>
      )}
      {items.map(([k, label, cls]) => (
        <span key={k} className={`inline-flex items-center gap-1 ${cls}`}>
          {k === 'resolved' ? <CheckCircle2 size={12} /> : <Bug size={12} />}
          {defects[k].length} {label}: <Ids ids={defects[k]} />
        </span>
      ))}
    </span>
  );
};

export default DefectLinks;
