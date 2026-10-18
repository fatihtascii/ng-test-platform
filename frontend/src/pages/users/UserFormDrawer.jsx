import React, { useState } from 'react';
import { Wand2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls } from '../../components/ui/tokens';
import { ROLE_DOT } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { usersApi } from '../../api';
import { PasswordRules } from './parts';
import { USERNAME_RE, EMAIL_RE, passwordOk, generatePassword } from './helpers';
import { CopyButton } from '../environments/parts';

/** Kullanıcı oluşturma / düzenleme. Rol seçiminde her rolün izin sayısı ve açıklaması görünür. */
const UserFormDrawer = ({ user, roles, actorIsAdmin, onClose, onSaved }) => {
  const editing = Boolean(user);
  const [form, setForm] = useState({
    username: user?.username || '', full_name: user?.full_name || '', email: user?.email || '',
    role: user?.role || 'viewer', password: '',
  });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  // Admin rolünü yalnızca admin verebilir (sunucu da reddeder)
  const assignable = roles.filter(r => actorIsAdmin || r.name !== 'admin');

  const submit = async () => {
    const errs = {};
    if (!editing && !USERNAME_RE.test(form.username)) errs.username = '3-50 karakter; harf, rakam, _ ve - kullanılabilir.';
    if (!form.full_name.trim()) errs.full_name = 'Ad soyad gerekli.';
    if (form.email && !EMAIL_RE.test(form.email.trim())) errs.email = 'Geçerli bir e-posta girin.';
    if (!editing && !passwordOk(form.password)) errs.password = 'Şifre kurallara uymuyor.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const { data } = editing
        ? await usersApi.update(user.id, { full_name: form.full_name.trim(), email: form.email.trim() || null, role: form.role })
        : await usersApi.create({ username: form.username, full_name: form.full_name.trim(), email: form.email.trim() || null, role: form.role, password: form.password });
      toast.success(editing ? 'Kullanıcı güncellendi.' : `@${data.username} oluşturuldu. Şifreyi kullanıcıyla güvenli bir kanaldan paylaşın.`);
      onSaved(data, !editing);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md" eyebrow={editing ? `@${user.username}` : 'Yeni kullanıcı'} title={editing ? (user.full_name || user.username) : 'Kullanıcı ekle'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Oluştur'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        {!editing && (
          <Field label="Kullanıcı adı" htmlFor="u-username" required error={errors.username} hint="Girişte kullanılır, sonradan değiştirilemez.">
            <input id="u-username" data-autofocus value={form.username} onChange={set('username')} autoComplete="off" spellCheck={false} placeholder="ayse.yilmaz" className={`${inputCls} font-mono`} />
          </Field>
        )}
        <Field label="Ad soyad" htmlFor="u-name" required error={errors.full_name}>
          <input id="u-name" data-autofocus={editing || undefined} value={form.full_name} onChange={set('full_name')} placeholder="Ayşe Yılmaz" className={inputCls} />
        </Field>
        <Field label="E-posta" htmlFor="u-email" error={errors.email} hint="İsteğe bağlı; girişte kullanıcı adı yerine de kullanılabilir.">
          <input id="u-email" type="email" value={form.email} onChange={set('email')} placeholder="ayse@ornek.com" className={inputCls} />
        </Field>
        {!editing && (
          <Field label="Geçici şifre" htmlFor="u-pass" required error={errors.password}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input id="u-pass" type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete="new-password" className={`${inputCls} pr-16 font-mono`} />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
                  {form.password && <CopyButton text={form.password} label="Şifre" />}
                  <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Gizle' : 'Göster'} className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </div>
              <Button type="button" icon={<Wand2 size={14} />} onClick={() => { setForm(f => ({ ...f, password: generatePassword() })); setShow(true); }}>Üret</Button>
            </div>
            <PasswordRules value={form.password} />
          </Field>
        )}
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Rol</legend>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {assignable.map(r => (
              <label key={r.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="radio" name="role" value={r.name} checked={form.role === r.name} onChange={set('role')} className="mt-1 accent-indigo-600" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                    <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[r.color] || ROLE_DOT.slate}`} aria-hidden />{r.display_name}
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{r.name === 'admin' ? 'tüm izinler' : `${r.permissions?.length || 0} izin`}</span>
                  </span>
                  {r.description && <span className="block text-xs text-slate-500 dark:text-slate-400">{r.description}</span>}
                </span>
              </label>
            ))}
          </div>
          {editing && user.role === 'admin' && !actorIsAdmin && <p className="mt-1 text-xs text-slate-500">Admin hesabını yalnızca admin değiştirebilir.</p>}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default UserFormDrawer;
