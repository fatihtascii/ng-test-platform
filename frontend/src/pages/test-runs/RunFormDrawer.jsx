import React, { useMemo, useState } from 'react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { testRunsApi } from '../../api';
import { EDITABLE_RUN_STATUSES, RUN_STATUS_LABEL, toPayload, runIdent } from './model';

const today = () => new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });

/**
 * Koşum oluşturma / düzenleme paneli.
 * Oluştururken kapsam seçilir (plan ya da projenin tüm case'leri); sunucu o anki case
 * listesini koşuma sabitler.
 */
const RunFormDrawer = ({ run, initial, projects, plans, caseCounts, onClose, onSaved }) => {
  const editing = Boolean(run);
  const [form, setForm] = useState(() => editing
    ? { name: run.name, description: run.description || '', status: run.status, project_id: String(run.project_id), test_plan_id: run.test_plan_id ? String(run.test_plan_id) : '' }
    : {
        name: '', description: '', status: 'Aktif',
        project_id: String(initial?.project_id || (projects.length === 1 ? projects[0].id : '')),
        test_plan_id: initial?.test_plan_id ? String(initial.test_plan_id) : '',
      });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const projectPlans = useMemo(() => plans.filter(p => String(p.project_id) === form.project_id), [plans, form.project_id]);
  const plan = projectPlans.find(p => String(p.id) === form.test_plan_id);
  const scopeCount = plan ? plan.items.length : (caseCounts.get(Number(form.project_id)) || 0);
  const suggestedName = plan ? `${plan.title} · ${today()}` : form.project_id ? `${projects.find(p => String(p.id) === form.project_id)?.name || 'Koşum'} · ${today()}` : '';

  const submit = async () => {
    const name = form.name.trim() || (!editing ? suggestedName : '');
    const errs = {};
    if (!name) errs.name = 'Koşum adı gerekli.';
    if (!form.project_id) errs.project_id = 'Bir proje seçin.';
    if (!editing && scopeCount === 0) errs.scope = plan ? 'Seçilen planda case yok.' : 'Bu projede henüz case yok.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const base = { ...form, name, test_plan_id: form.test_plan_id || null };
      const { data } = editing
        ? await testRunsApi.update(run.id, toPayload({ ...run, ...base }))
        : await testRunsApi.create(toPayload(base, { results: '[]' }));
      toast.success(editing ? 'Koşum güncellendi.' : `${runIdent(data.id)} oluşturuldu; ${scopeCount} case koşulmayı bekliyor.`);
      onSaved(data, !editing);
    } catch (err) {
      toast.error(err.message || 'Kaydedilemedi.');
      setSaving(false);
    }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md"
      eyebrow={editing ? runIdent(run.id) : 'Yeni koşum'} title={editing ? 'Koşumu düzenle' : 'Koşum oluştur'}
      footer={<>
        <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">
          {!editing && form.project_id && <>Kapsam: <strong className="text-slate-700 dark:text-slate-200">{scopeCount} case</strong></>}
        </span>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Oluştur ve koş'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Proje" htmlFor="run-project" required error={errors.project_id}
          hint={editing ? 'Sonuçlar projeye bağlı olduğu için proje değiştirilemez.' : undefined}>
          <select id="run-project" value={form.project_id} disabled={editing}
            onChange={e => setForm(f => ({ ...f, project_id: e.target.value, test_plan_id: '' }))} className={inputCls}>
            <option value="" disabled>Proje seçin</option>
            {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Kapsam" htmlFor="run-plan" error={errors.scope}
          hint={editing ? 'Kapsam koşum oluşturulurken sabitlenir.' : plan ? `Planın ${plan.items.length} case'i koşulur; koşum bitince plan sonuçları güncellenir.` : 'Projedeki tüm case\'ler koşulur.'}>
          <select id="run-plan" value={form.test_plan_id} onChange={set('test_plan_id')} disabled={editing || !form.project_id}
            className={inputCls}>
            <option value="">Projedeki tüm case'ler ({caseCounts.get(Number(form.project_id)) || 0})</option>
            {projectPlans.map(p => <option key={p.id} value={String(p.id)}>Plan: {p.title} ({p.items.length})</option>)}
          </select>
        </Field>
        <Field label="Ad" htmlFor="run-name" required={editing} error={errors.name}
          hint={!editing && !form.name.trim() && suggestedName ? `Boş bırakılırsa: ${suggestedName}` : undefined}>
          <input id="run-name" data-autofocus value={form.name} onChange={set('name')} maxLength={500}
            placeholder={suggestedName || 'Örn. Sprint 12 regresyon'} className={inputCls} />
        </Field>
        <Field label="Açıklama" htmlFor="run-desc">
          <textarea id="run-desc" rows={3} value={form.description} onChange={set('description')}
            placeholder="Ortam, sürüm, dikkat edilecekler…" className={textareaCls} />
        </Field>
        {editing && (
          <Field label="Durum" htmlFor="run-status" hint="Tamamlandı yapılınca sonuçlar case'lere ve plana yansır.">
            <select id="run-status" value={form.status} onChange={set('status')} className={inputCls}>
              {EDITABLE_RUN_STATUSES.map(s => <option key={s} value={s}>{RUN_STATUS_LABEL[s]}</option>)}
              {!EDITABLE_RUN_STATUSES.includes(form.status) && <option value={form.status}>{RUN_STATUS_LABEL[form.status] || form.status}</option>}
            </select>
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default RunFormDrawer;
