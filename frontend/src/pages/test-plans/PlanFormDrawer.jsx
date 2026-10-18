import React, { useState } from 'react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { testPlansApi } from '../../api';
import { PLAN_STATUSES, planIdent } from './model';

const PlanFormDrawer = ({ plan, initialProject, projects, onClose, onSaved }) => {
  const editing = Boolean(plan);
  const [form, setForm] = useState(() => ({
    title: plan?.title || '', description: plan?.description || '', status: plan?.status || 'Aktif',
    project_id: String(plan?.project_id || initialProject || (projects.length === 1 ? projects[0].id : '')),
    start_date: plan?.start_date || '', end_date: plan?.end_date || '',
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const hasItems = (plan?.items?.length || 0) > 0;

  const submit = async () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Plan adı gerekli.';
    if (!form.project_id) errs.project_id = 'Bir proje seçin.';
    if (form.start_date && form.end_date && form.end_date < form.start_date) errs.end_date = 'Bitiş, başlangıçtan önce olamaz.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(), description: form.description.trim() || null, status: form.status,
      project_id: Number(form.project_id), start_date: form.start_date || null, end_date: form.end_date || null,
    };
    try {
      const { data } = editing ? await testPlansApi.update(plan.id, payload) : await testPlansApi.create(payload);
      toast.success(editing ? 'Plan güncellendi.' : `${planIdent(data.id)} oluşturuldu.`);
      onSaved(data, !editing);
    } catch (err) {
      toast.error(err.message || 'Kaydedilemedi.');
      setSaving(false);
    }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md"
      eyebrow={editing ? planIdent(plan.id) : 'Yeni test planı'} title={editing ? 'Planı düzenle' : 'Test planı oluştur'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Oluştur'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Ad" htmlFor="plan-title" required error={errors.title}>
          <input id="plan-title" data-autofocus value={form.title} onChange={set('title')} maxLength={500}
            placeholder="Örn. Sürüm 4.12 regresyonu" className={inputCls} />
        </Field>
        <Field label="Proje" htmlFor="plan-project" required error={errors.project_id}
          hint={hasItems ? 'Plana case eklendiği için proje değiştirilemez.' : undefined}>
          <select id="plan-project" value={form.project_id} onChange={set('project_id')} disabled={hasItems} className={inputCls}>
            <option value="" disabled>Proje seçin</option>
            {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlangıç" htmlFor="plan-start">
            <input id="plan-start" type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
          </Field>
          <Field label="Bitiş" htmlFor="plan-end" error={errors.end_date}>
            <input id="plan-end" type="date" value={form.end_date} min={form.start_date || undefined} onChange={set('end_date')} className={inputCls} />
          </Field>
        </div>
        <Field label="Açıklama" htmlFor="plan-desc">
          <textarea id="plan-desc" rows={3} value={form.description} onChange={set('description')}
            placeholder="Kapsam, hedef sürüm, giriş/çıkış kriterleri…" className={textareaCls} />
        </Field>
        {editing && (
          <Field label="Durum" htmlFor="plan-status">
            <select id="plan-status" value={form.status} onChange={set('status')} className={inputCls}>
              {PLAN_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default PlanFormDrawer;
