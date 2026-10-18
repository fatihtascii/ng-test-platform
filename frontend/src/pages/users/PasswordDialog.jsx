import React, { useState } from 'react';
import { Wand2, KeyRound } from 'lucide-react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Modal } from '../../components/ui/overlay';
import { inputCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { usersApi } from '../../api';
import { PasswordRules } from './parts';
import { passwordOk, generatePassword } from './helpers';
import { CopyButton } from '../environments/parts';

const PasswordDialog = ({ user, onClose }) => {
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const ok = passwordOk(pw);

  const submit = async () => {
    setSaving(true);
    try {
      await usersApi.updatePassword(user.id, { password: pw });
      toast.success(`@${user.username} için yeni şifre kaydedildi.`);
      onClose();
    } catch (e) { toast.error(e.message || 'Şifre değiştirilemedi.'); setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} dismissable={!saving} size="sm" icon={<KeyRound size={18} />} title="Şifre sıfırla" description={`@${user.username}`}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} disabled={!ok} loading={saving}>Şifreyi kaydet</Button>
      </>}>
      <form onSubmit={e => { e.preventDefault(); if (ok) submit(); }} className="space-y-3">
        <Field label="Yeni şifre" htmlFor="pw-new">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input id="pw-new" data-autofocus type="text" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" spellCheck={false} className={`${inputCls} pr-9 font-mono`} />
              {pw && <CopyButton text={pw} label="Şifre" className="absolute right-1.5 top-1/2 -translate-y-1/2" />}
            </div>
            <Button type="button" icon={<Wand2 size={14} />} onClick={() => setPw(generatePassword())}>Üret</Button>
          </div>
          <PasswordRules value={pw} />
        </Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">Şifreyi kullanıcıyla güvenli bir kanaldan paylaşın; kullanıcı Profilim sayfasından değiştirebilir.</p>
      </form>
    </Modal>
  );
};

export default PasswordDialog;
