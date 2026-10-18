import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Bug, Plus } from 'lucide-react';
import { StatusBadge, Skeleton } from '../../components/ui';
import { testCasesApi } from '../../api';
import { ITEM_LABEL, ITEM_TONE, planIdent } from '../test-plans/model';
import { STATUS_LABEL as DEFECT_LABEL, STATUS_TONE as DEFECT_TONE, defectIdent } from '../defects/model';

const Section = ({ icon, title, count, action, children }) => (
  <section className="mt-5">
    <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {icon}{title}{count > 0 && <span className="tabular-nums">({count})</span>}
      {action && <span className="ml-auto normal-case tracking-normal">{action}</span>}
    </h3>
    {children}
  </section>
);

const Row = ({ to, ident, title, badge }) => (
  <li>
    <Link to={to} className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-white dark:hover:bg-slate-900">
      <span className="min-w-0 flex-1">
        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{ident}</span>{' '}
        <span className="text-xs text-slate-800 [overflow-wrap:anywhere] group-hover:underline dark:text-slate-100">{title}</span>
      </span>
      <span className="shrink-0">{badge}</span>
    </Link>
  </li>
);

/**
 * Case panelinin yan sütunu: case'in yer aldığı planlar (kalem sonucuyla) ve açık hata kayıtları.
 * refreshKey: case güncellenince (ör. koşum sonucu) yeniden okunur.
 */
const CaseLinks = ({ c, can, refreshKey }) => {
  const [state, setState] = useState({ key: null });
  const key = `${c.id}:${refreshKey}`;
  useEffect(() => {
    let alive = true;
    testCasesApi.links(c.id)
      .then(({ data }) => alive && setState({ key, data }))
      .catch(() => alive && setState({ key, data: null }));
    return () => { alive = false; };
  }, [c.id, key]);

  if (state.key !== key) return <div className="mt-5 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8" /></div>;
  const d = state.data;
  if (!d) return null;
  const newBug = `/defects?new=1&project_id=${c.project_id}&case_id=${c.id}&title=${encodeURIComponent(c.title)}`;
  return (
    <>
      {d.can_plans && (
        <Section icon={<ClipboardList size={12} />} title="Planlar" count={d.plans.length}>
          {d.plans.length === 0
            ? <p className="text-xs text-slate-500 dark:text-slate-400">Bu case henüz bir planda değil.</p>
            : <ul className="-mx-1.5 space-y-0.5">
                {d.plans.map(p => (
                  <Row key={p.id} to={`/test-plans/${p.id}`} ident={planIdent(p.id)} title={p.title}
                    badge={<StatusBadge tone={ITEM_TONE[p.run_status]}>{ITEM_LABEL[p.run_status] || p.run_status}</StatusBadge>} />
                ))}
              </ul>}
        </Section>
      )}
      {d.can_defects && (
        <Section icon={<Bug size={12} />} title="Açık hata kayıtları" count={d.defects.length}
          action={can('defects.manage') && (
            <Link to={newBug} className="inline-flex items-center gap-0.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400"><Plus size={11} />Aç</Link>
          )}>
          {d.defects.length === 0
            ? <p className="text-xs text-slate-500 dark:text-slate-400">Açık hata kaydı yok.</p>
            : <ul className="-mx-1.5 space-y-0.5">
                {d.defects.map(x => (
                  <Row key={x.id} to={`/defects/${defectIdent(x.id)}`} ident={defectIdent(x.id)} title={x.title}
                    badge={<StatusBadge tone={DEFECT_TONE[x.status]}>{DEFECT_LABEL[x.status] || x.status}</StatusBadge>} />
                ))}
              </ul>}
        </Section>
      )}
    </>
  );
};

export default CaseLinks;
