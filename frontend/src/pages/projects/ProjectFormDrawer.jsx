import React, { useState } from 'react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { projectsApi } from '../../api';
import { PROJECT_STATUSES } from './model';

const HINT = {
  'Aktif': 'Test çalışması sürüyor.',
  'Beklemede': 'Geçici olarak durduruldu; kayıtlar korunur.',
  'Tamamlandı': 'Sürüm çıktı veya iş bitti; geçmiş için saklanır.',
};

/** Proje oluşturma / düzenleme */
const ProjectFormDrawer = ({ project, projects = [], onClose, onSaved }) => {
  const editing = Boolean(project);
  const [form, setForm] = useState({ name: project?.name || '', description: project?.description || '', status: project?.status || 'Aktif' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const name = form.name.replace(/\s+/g, ' ').trim();
    const errs = {};
    if (!name) errs.name = 'Proje adı gerekli.';
    else if (projects.some(p => p.id !== project?.id && p.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'))) errs.name = 'Bu adda bir proje zaten var.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { name, description: form.description.trim() || null, status: form.status };
      const { data } = editing ? await projectsApi.update(project.id, body) : await projectsApi.create(body);
      toast.success(editing ? 'Proje güncellendi.' : `${data.name} oluşturuldu.`);
      onSaved(data, !editing);
    } catch (e) {
      if (/zaten var/.test(e.message)) setErrors({ name: e.message });
      else toast.error(e.message || 'Kaydedilemedi.');
      setSaving(false);
    }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md" eyebrow={editing ? 'Proje' : 'Yeni proje'} title={editing ? project.name : 'Proje oluştur'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Oluştur'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Proje adı" htmlFor="p-name" required error={errors.name} hint="Ürün, uygulama veya modül adı.">
          <input id="p-name" data-autofocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={200}
            placeholder="Örn. Web mağaza" className={inputCls} />
        </Field>
        <Field label="Açıklama" htmlFor="p-desc" hint="Kapsam, ekip veya sürüm bilgisi.">
          <textarea id="p-desc" rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={5000} className={textareaCls} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Durum</legend>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {PROJECT_STATUSES.map(s => (
              <label key={s} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="radio" name="p-status" value={s} checked={form.status === s} onChange={() => setForm(f => ({ ...f, status: s }))} className="mt-1 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{s}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{HINT[s]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default ProjectFormDrawer;
