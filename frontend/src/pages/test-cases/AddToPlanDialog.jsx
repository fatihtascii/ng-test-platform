import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { Button, StatusBadge, Skeleton } from '../../components/ui';
import { Modal } from '../../components/ui/overlay';
import { toast } from '../../components/ui/toast';
import { testPlansApi } from '../../api';
import { caseIdent } from './model';

/** Seçili case'leri bir test planına ekler. Plan yalnızca kendi projesindeki case'leri kabul eder. */
const AddToPlanDialog = ({ cases, projectName, onClose }) => {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    testPlansApi.getAll()
      .then(({ data }) => alive && setPlans(data))
      .catch(err => alive && setError(err.message));
    return () => { alive = false; };
  }, []);

  const projectIds = useMemo(() => new Set(cases.map(c => c.project_id)), [cases]);
  const options = useMemo(() => (plans || [])
    .filter(p => projectIds.has(p.project_id))
    .sort((a, b) => (a.status === 'Aktif' ? -1 : 0) - (b.status === 'Aktif' ? -1 : 0) || b.id - a.id)
    .map(p => {
      const inPlan = new Set(p.items.map(i => i.test_case_id));
      const eligible = cases.filter(c => c.project_id === p.project_id);
      return { plan: p, eligible, already: eligible.filter(c => inPlan.has(c.id)).length };
    }), [plans, cases, projectIds]);

  const choice = options.find(o => o.plan.id === picked);

  const submit = async () => {
    if (!choice) return;
    const ids = choice.eligible.map(c => c.id);
    setSaving(true);
    try {
      const { data } = await testPlansApi.bulkAdd(choice.plan.id, ids);
      const skippedOther = cases.length - ids.length;
      const parts = [`${data.added} case "${choice.plan.title}" planına eklendi`];
      if (data.skipped) parts.push(`${data.skipped} tanesi zaten plandaydı`);
      if (skippedOther) parts.push(`${skippedOther} tanesi başka projede olduğu için atlandı`);
      toast.success(parts.join(', ') + '.');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Plana eklenemedi.');
      setSaving(false);
    }
  };

  const title = cases.length === 1 ? `${caseIdent(cases[0].id)} planına ekle` : `${cases.length} case'i plana ekle`;
  return (
    <Modal open onClose={onClose} dismissable={!saving} size="md" icon={<ClipboardList size={18} />}
      title="Plana ekle" description={cases.length === 1 ? cases[0].title : title}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} disabled={!choice || choice.already === choice.eligible.length} loading={saving}>
          {choice ? `${choice.eligible.length - choice.already} case ekle` : 'Plan seçin'}
        </Button>
      </>}>
      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p>
        : !plans ? <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
        : options.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Seçili case'lerin projesinde test planı yok.{' '}
            <Link to="/test-plans" className="text-indigo-600 hover:underline dark:text-indigo-400">Test planı oluşturun</Link>.
          </div>
        ) : (
          <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800" role="radiogroup" aria-label="Test planı">
            {options.map(({ plan, eligible, already }) => {
              const full = already === eligible.length;
              return (
                <label key={plan.id} className={`flex items-center gap-3 px-3 py-2.5 ${full ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                  <input type="radio" name="plan" disabled={full} checked={picked === plan.id} onChange={() => setPicked(plan.id)} className="accent-indigo-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{plan.title}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {projectName(plan.project_id)} · {plan.items.length} case
                      {already > 0 && ` · seçimden ${already} tanesi zaten ekli`}
                      {projectIds.size > 1 && ` · seçimden ${eligible.length} tanesi bu projede`}
                    </span>
                  </span>
                  <StatusBadge status={plan.status} />
                </label>
              );
            })}
          </div>
        )}
    </Modal>
  );
};

export default AddToPlanDialog;
