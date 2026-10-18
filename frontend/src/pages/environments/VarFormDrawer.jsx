import React, { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { variablesApi } from '../../api';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const normalizeKey = (v) => v.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');

/**
 * Değişken / sır formu. Kapsam: global → proje → ortam (dar kapsam genişi ezer).
 * Sır düzenlenirken mevcut değer gösterilmez; alan boş bırakılırsa değer korunur.
 */
const VarFormDrawer = ({ variable, initial, projects, environments, variables, onClose, onSaved }) => {
  const editing = Boolean(variable);
  const [form, setForm] = useState(() => ({
    key: variable?.key || '',
    value: variable && !variable.is_secret ? variable.value : '',
    is_secret: variable?.is_secret || false,
    project_id: String(variable?.project_id || initial?.project_id || ''),
    env_id: String(variable?.env_id || initial?.env_id || ''),
  }));
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const keepSecret = editing && variable.is_secret;

  const projectEnvs = useMemo(() => environments.filter(e => !form.project_id || String(e.project_id) === form.project_id), [environments, form.project_id]);
  const scopeLabel = form.env_id ? `yalnızca ${environments.find(e => String(e.id) === form.env_id)?.name} ortamında`
    : form.project_id ? `${projects.find(p => String(p.id) === form.project_id)?.name} projesinin tüm ortamlarında` : 'tüm projelerde';
  // Aynı anahtar daha geniş bir kapsamda varsa bilgi verilir (bu kayıt onu ezer)
  const shadowed = useMemo(() => {
    const k = form.key;
    if (!k) return null;
    return variables.find(v => v.key === k && v.id !== variable?.id && (
      (form.env_id && !v.env_id && (!v.project_id || String(v.project_id) === form.project_id || String(v.project_id) === String(environments.find(e => String(e.id) === form.env_id)?.project_id))) ||
      (!form.env_id && form.project_id && !v.env_id && !v.project_id)
    ));
  }, [form.key, form.env_id, form.project_id, variables, variable, environments]);

  const submit = async () => {
    const errs = {};
    if (!KEY_RE.test(form.key)) errs.key = 'Büyük harfle başlamalı; yalnızca A-Z, 0-9 ve _ (ör. ADMIN_PASSWORD).';
    if (!form.value && !keepSecret) errs.value = 'Değer gerekli.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const payload = {
      key: form.key,
      // Sırda alan boşsa sunucuya maskeli değer gider; sunucu kayıtlı değeri korur
      value: form.value || (keepSecret ? variable.value : ''),
      is_secret: form.is_secret,
      project_id: form.project_id ? Number(form.project_id) : null,
      env_id: form.env_id ? Number(form.env_id) : null,
    };
    try {
      const { data } = editing ? await variablesApi.update(variable.id, payload) : await variablesApi.create(payload);
      toast.success(editing ? `${data.key} güncellendi.` : `${data.key} eklendi.`);
      onSaved(data, !editing);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md" eyebrow={editing ? 'Değişken' : 'Yeni değişken'} title={editing ? variable.key : 'Değişken ekle'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Ekle'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Anahtar" htmlFor="var-key" required error={errors.key} hint="Script'te os.environ[&quot;ANAHTAR&quot;] ile okunur.">
          <input id="var-key" data-autofocus value={form.key} onChange={e => setForm(f => ({ ...f, key: normalizeKey(e.target.value) }))}
            placeholder="ADMIN_PASSWORD" className={`${inputCls} font-mono`} spellCheck={false} maxLength={200} />
        </Field>
        <Field label="Değer" htmlFor="var-value" required={!keepSecret} error={errors.value}
          hint={keepSecret ? 'Mevcut değer gizli. Değiştirmek için yeni değeri yazın; boş bırakırsanız korunur.' : undefined}>
          <div className="relative">
            <input id="var-value" type={form.is_secret && !show ? 'password' : 'text'} autoComplete="off" value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder={keepSecret ? '•••••••• (değişmedi)' : 'Değer'} className={`${inputCls} pr-10 font-mono`} spellCheck={false} />
            {form.is_secret && (
              <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Gizle' : 'Göster'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            )}
          </div>
        </Field>
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <input type="checkbox" checked={form.is_secret} onChange={e => setForm(f => ({ ...f, is_secret: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-indigo-600" />
          <span>
            <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Sır</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Listede maskelenir, yalnızca ortam yöneticisi tek tek açabilir; koşum loglarında da gizlenir.</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proje" htmlFor="var-project">
            <select id="var-project" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value, env_id: '' }))} className={inputCls}>
              <option value="">Tüm projeler (global)</option>
              {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Ortam" htmlFor="var-env">
            <select id="var-env" value={form.env_id} onChange={e => setForm(f => ({ ...f, env_id: e.target.value }))} className={inputCls} disabled={!projectEnvs.length}>
              <option value="">Tüm ortamlar</option>
              {projectEnvs.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
            </select>
          </Field>
        </div>
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Bu değer {scopeLabel} geçerli olur. Aynı anahtar birden çok kapsamda varsa dar olan kazanır: ortam &gt; proje &gt; global.
          {shadowed && <> Bu kayıt, daha geniş kapsamdaki <span className="font-mono">{shadowed.key}</span> değerini ezer.</>}
        </p>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default VarFormDrawer;
