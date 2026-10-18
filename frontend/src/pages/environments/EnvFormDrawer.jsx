import React, { useState } from 'react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { environmentsApi } from '../../api';

const isHttpUrl = (v) => { try { const u = new URL(v); return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host); } catch { return false; } };

const EnvFormDrawer = ({ env, initialProject, projects, onClose, onSaved }) => {
  const editing = Boolean(env);
  const [form, setForm] = useState({
    name: env?.name || '', url: env?.url || '', description: env?.description || '',
    project_id: String(env?.project_id || initialProject || (projects.length === 1 ? projects[0].id : '')),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Ortam adı gerekli.';
    if (!form.project_id) errs.project_id = 'Bir proje seçin.';
    if (!isHttpUrl(form.url.trim())) errs.url = 'http:// veya https:// ile başlayan geçerli bir adres girin.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const payload = { name: form.name.trim(), url: form.url.trim(), description: form.description.trim() || null, project_id: Number(form.project_id) };
    try {
      const { data } = editing ? await environmentsApi.update(env.id, payload) : await environmentsApi.create(payload);
      toast.success(editing ? 'Ortam güncellendi.' : `${data.name} ortamı eklendi.`);
      onSaved(data, !editing);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md" eyebrow={editing ? 'Ortam' : 'Yeni ortam'} title={editing ? env.name : 'Ortam ekle'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Ad" htmlFor="env-name" required error={errors.name}>
          <input id="env-name" data-autofocus value={form.name} onChange={set('name')} maxLength={200} placeholder="Staging, Production, QA-TR…" className={inputCls} />
        </Field>
        <Field label="Proje" htmlFor="env-project" required error={errors.project_id}>
          <select id="env-project" value={form.project_id} onChange={set('project_id')} className={inputCls}>
            <option value="" disabled>Proje seçin</option>
            {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Temel adres" htmlFor="env-url" required error={errors.url}
          hint="Otomasyonda BASE_URL ve Playwright'ın base_url'i olarak verilir.">
          <input id="env-url" value={form.url} onChange={set('url')} placeholder="https://staging.ornek.com" className={`${inputCls} font-mono`} spellCheck={false} />
        </Field>
        <Field label="Açıklama" htmlFor="env-desc">
          <textarea id="env-desc" rows={3} value={form.description} onChange={set('description')} placeholder="Erişim notları, veri durumu, sahibi…" className={textareaCls} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default EnvFormDrawer;
