import React, { useState } from 'react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls, textareaCls, ROLE_DOT, ROLE_COLORS } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { rolesApi } from '../../api';

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
const slug = (s) => s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => TR[c]).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);

/** Rol oluşturma / düzenleme. Oluştururken başka bir rolün izinleri başlangıç olarak kopyalanabilir. */
const RoleFormDrawer = ({ role, copyFrom, roles, onClose, onSaved }) => {
  const editing = Boolean(role);
  const [form, setForm] = useState({
    display_name: role?.display_name || (copyFrom ? `${copyFrom.display_name} (kopya)` : ''),
    name: role?.name || '', description: role?.description || '', color: role?.color || copyFrom?.color || 'indigo',
    base: copyFrom ? String(copyFrom.id) : '',
  });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const key = editing ? role.name : (keyTouched ? form.name : slug(form.display_name));

  const submit = async () => {
    const errs = {};
    if (!form.display_name.trim()) errs.display_name = 'Rol adı gerekli.';
    if (!editing && !/^[a-z0-9_]{2,30}$/.test(key)) errs.name = 'Küçük harf, rakam ve _ (2-30 karakter).';
    if (!editing && roles.some(r => r.name === key)) errs.name = 'Bu anahtar kullanımda.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      let saved;
      if (editing) {
        ({ data: saved } = await rolesApi.update(role.id, { display_name: form.display_name.trim(), description: form.description.trim() || null, color: form.color }));
      } else {
        ({ data: saved } = await rolesApi.create({ name: key, display_name: form.display_name.trim(), description: form.description.trim() || null, color: form.color }));
        const base = roles.find(r => String(r.id) === form.base);
        if (base?.permissions?.length) ({ data: saved } = await rolesApi.updatePermissions(saved.id, { permission_ids: base.permissions.map(p => p.id) }));
      }
      toast.success(editing ? 'Rol güncellendi.' : `${saved.display_name} rolü oluşturuldu; izinlerini tablodan ayarlayın.`);
      onSaved(saved, !editing);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md" eyebrow={editing ? (role.is_system ? 'Sistem rolü' : 'Rol') : 'Yeni rol'} title={editing ? role.display_name : 'Rol oluştur'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Oluştur'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Rol adı" htmlFor="r-display" required error={errors.display_name}>
          <input id="r-display" data-autofocus value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Örn. Geliştirici" className={inputCls} maxLength={100} />
        </Field>
        <Field label="Anahtar" htmlFor="r-key" error={errors.name} hint={editing ? 'Anahtar değiştirilemez; kullanıcı kayıtları bu anahtarla bağlı.' : 'Sistemde rolü tanımlar; sonradan değiştirilemez.'}>
          <input id="r-key" value={key} disabled={editing} onChange={e => { setKeyTouched(true); setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })); }}
            className={`${inputCls} font-mono`} spellCheck={false} maxLength={30} />
        </Field>
        <Field label="Açıklama" htmlFor="r-desc">
          <textarea id="r-desc" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Bu rol kimler için, neleri yapabilir?" className={textareaCls} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Renk</legend>
          <div className="flex gap-2" role="radiogroup">
            {ROLE_COLORS.map(c => (
              <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset ${form.color === c ? 'ring-2 ring-indigo-600 dark:ring-indigo-400' : 'ring-slate-200 dark:ring-slate-700'}`}>
                <span className={`h-3 w-3 rounded-full ${ROLE_DOT[c]}`} />
              </button>
            ))}
          </div>
        </fieldset>
        {!editing && (
          <Field label="Başlangıç izinleri" htmlFor="r-base" hint="Seçilen rolün izinleri kopyalanır; sonra tablodan değiştirebilirsiniz.">
            <select id="r-base" value={form.base} onChange={e => setForm(f => ({ ...f, base: e.target.value }))} className={inputCls}>
              <option value="">Boş başla (hiç izin yok)</option>
              {roles.filter(r => r.name !== 'admin').map(r => <option key={r.id} value={String(r.id)}>{r.display_name} ({r.permissions?.length || 0} izin)</option>)}
            </select>
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default RoleFormDrawer;
