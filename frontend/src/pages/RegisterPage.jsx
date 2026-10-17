import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle2, Check, X } from 'lucide-react';
import { authApi } from '../api';
import AuthLayout, { AuthField } from '../components/AuthLayout';
import { Button } from '../components/ui';
import { inputCls } from '../components/ui/tokens';

// Backend kuralıyla aynı (users/service.validate_password_strength).
// Eski form 6 karakteri yeterli sayıyordu; sunucu reddedince kullanıcı nedenini anlamıyordu.
const PASSWORD_RULES = [
  { id: 'len',   label: 'En az 8 karakter',    test: (p) => p.length >= 8 },
  { id: 'upper', label: 'En az 1 büyük harf',  test: (p) => /[A-ZÇĞİÖŞÜ]/.test(p) },
  { id: 'digit', label: 'En az 1 rakam',       test: (p) => /\d/.test(p) },
];
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;

const RegisterPage = () => {
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '' });
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const rules = PASSWORD_RULES.map(r => ({ ...r, ok: r.test(form.password) }));
  const match = form.password.length > 0 && form.password === confirm;
  const usernameOk = USERNAME_RE.test(form.username);
  const ready = form.full_name.trim() && usernameOk && rules.every(r => r.ok) && match;

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setError('');
    setLoading(true);
    try {
      await authApi.register({ ...form, email: form.email.trim() || null });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.message || 'Hesap oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout title="Hesabınız oluşturuldu" subtitle="Giriş sayfasına yönlendiriliyorsunuz.">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 size={16} /> Yeni hesaplar izleyici rolüyle açılır; yöneticiniz rolünüzü değiştirebilir.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Hesap oluştur"
      subtitle="Ekibinizin test planlarını ve koşum sonuçlarını görüntüleyin."
      footer={<>Zaten hesabınız var mı? <Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Giriş yapın</Link></>}
    >
      <form onSubmit={handleRegister} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <AuthField label="Ad soyad" htmlFor="full_name">
          <input id="full_name" autoComplete="name" value={form.full_name} onChange={update('full_name')} className={inputCls} />
        </AuthField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthField label="Kullanıcı adı" htmlFor="username"
            hint={form.username && !usernameOk ? 'Harf, rakam, _ veya -; 3–50 karakter.' : null}>
            <input id="username" autoComplete="username" value={form.username} onChange={update('username')} className={inputCls} />
          </AuthField>
          <AuthField label="E-posta (isteğe bağlı)" htmlFor="email">
            <input id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} className={inputCls} />
          </AuthField>
        </div>

        <AuthField label="Şifre" htmlFor="password">
          <div className="relative">
            <input id="password" type={showPw ? 'text' : 'password'} autoComplete="new-password"
              value={form.password} onChange={update('password')} className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </AuthField>

        <AuthField label="Şifre (tekrar)" htmlFor="confirm">
          <input id="confirm" type={showPw ? 'text' : 'password'} autoComplete="new-password"
            value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
        </AuthField>

        {(form.password || confirm) && (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {[...rules, { id: 'match', label: 'Şifreler eşleşiyor', ok: match }].map(r => (
              <li key={r.id} className={`flex items-center gap-1.5 ${r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                {r.ok ? <Check size={13} /> : <X size={13} />} {r.label}
              </li>
            ))}
          </ul>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!ready} className="w-full justify-center">
          Hesap oluştur
        </Button>
      </form>
    </AuthLayout>
  );
};

export default RegisterPage;
