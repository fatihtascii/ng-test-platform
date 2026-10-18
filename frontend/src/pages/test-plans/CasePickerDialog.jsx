import React, { useEffect, useMemo, useState } from 'react';
import { Button, Ident, Skeleton } from '../../components/ui';
import { Checkbox, SearchInput, FilterSelect } from '../../components/ui/data';
import { Modal } from '../../components/ui/overlay';
import { fetchAllTestCases } from '../../api';
import { parseCase, caseIdent, PRIORITIES, EXECUTION_LABEL, matchesQuery } from '../test-cases/model';
import { PriorityMark, TagList } from '../test-cases/parts';

/** Projedeki case'lerden plana eklenecekleri seçtirir (çoklu seçim, arama, filtre). */
const CasePickerDialog = ({ projectId, existing, onClose, onAdd }) => {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [prio, setPrio] = useState('');
  const [exec, setExec] = useState('');
  const [tag, setTag] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAllTestCases({ project_id: projectId })
      .then(list => alive && setCases(list.map(parseCase).sort((a, b) => a.id - b.id)))
      .catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [projectId]);

  const available = useMemo(() => (cases || []).filter(c => !existing.has(c.id)), [cases, existing]);
  const tags = useMemo(() => [...new Set(available.flatMap(c => c.tagList))].sort((a, b) => a.localeCompare(b, 'tr')), [available]);
  const visible = useMemo(() => available.filter(c =>
    matchesQuery(c, q, () => '') && (!prio || c.priority === prio) && (!exec || c.execution_type === exec) && (!tag || c.tagList.includes(tag))
  ), [available, q, prio, exec, tag]);

  const pickedVisible = visible.filter(c => picked.has(c.id)).length;
  const toggle = (id) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleVisible = () => setPicked(prev => {
    const n = new Set(prev);
    const on = pickedVisible !== visible.length;
    visible.forEach(c => on ? n.add(c.id) : n.delete(c.id));
    return n;
  });

  const submit = async () => {
    setSaving(true);
    const ok = await onAdd([...picked]);
    if (!ok) setSaving(false);
  };

  return (
    <Modal open onClose={onClose} dismissable={!saving} size="lg" title="Plana case ekle"
      description={cases ? `Projede ${cases.length} case var; ${available.length} tanesi henüz planda değil.` : undefined}
      bodyClassName="p-0"
      footer={<>
        <span className="mr-auto text-sm text-slate-500 dark:text-slate-400">{picked.size} case seçili</span>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} disabled={!picked.size} loading={saving}>{picked.size ? `${picked.size} case ekle` : 'Case seçin'}</Button>
      </>}>
      <div className="space-y-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
        <SearchInput value={q} onChange={setQ} placeholder="Başlık, TC-ID, etiket veya adım ara" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Öncelik" value={prio} onChange={setPrio} options={PRIORITIES.map(p => [p, p])} />
          <FilterSelect label="Yürütme" value={exec} onChange={setExec} options={Object.entries(EXECUTION_LABEL)} />
          {tags.length > 0 && <FilterSelect label="Etiket" value={tag} onChange={setTag} options={tags.map(t => [t, t])} />}
        </div>
      </div>
      {error ? <p className="p-5 text-sm text-rose-600">{error}</p>
        : !cases ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>
        : available.length === 0 ? <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Projedeki tüm case'ler zaten bu planda.</p>
        : (
          <div>
            <label className="flex items-center gap-3 border-b border-slate-100 px-5 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <Checkbox checked={visible.length > 0 && pickedVisible === visible.length} indeterminate={pickedVisible > 0 && pickedVisible < visible.length}
                onChange={toggleVisible} label="Görünenlerin tümünü seç" />
              Görünen {visible.length} case'in tümü
            </label>
            <ul className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {visible.map(c => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Checkbox checked={picked.has(c.id)} onChange={() => toggle(c.id)} label={`${caseIdent(c.id)} seç`} />
                    <Ident className="w-12 shrink-0">{caseIdent(c.id)}</Ident>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{c.title}</span>
                      <TagList tags={c.tagList} />
                    </span>
                    <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">{EXECUTION_LABEL[c.execution_type]}</span>
                    <PriorityMark priority={c.priority} showLabel={false} />
                  </label>
                </li>
              ))}
              {visible.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Filtrelere uyan case yok.</li>}
            </ul>
          </div>
        )}
    </Modal>
  );
};

export default CasePickerDialog;
