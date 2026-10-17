import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UserCircle2, Mail, AtSign, CalendarDays, Shield, KeyRound,
  Eye, EyeOff, Check, X, Loader2, AlertCircle, CheckCircle2, Save,
} from 'lucide-react';
import { authApi } from '../api';
import { updateStoredUser } from '../auth';

// ── Sabitler ──────────────────────────────────────────────────────
const ROLE_LABELS = {
  admin: 'Admin', manager: 'Test Yöneticisi', tester: 'Test Uzmanı', viewer: 'İzleyici',
};
const ROLE_STYLES = {
  admin:   'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
  manager: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
  tester:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
  viewer:  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};
const MODULE_LABELS = {
  projects: 'Projeler', test_cases: 'Test Case', test_plans: 'Test Planları', test_runs: 'Test Koşumları',
  defects: 'Hatalar', reports: 'Raporlar', automation: 'Otomasyon', environments: 'Ortamlar & Veri',
  users: 'Kullanıcılar', roles: 'Roller', integrations: 'Entegrasyonlar',
};
const ACTION_LABELS = {
  view: 'Görüntüleme', create: 'Oluşturma', edit: 'Düzenleme', delete: 'Silme',
  execute: 'Çalıştırma', manage: 'Yönetim', export: 'Dışa aktarma',
};
// Backend kuralı (users/service.validate_password_strength) ile aynı
const PASSWORD_RULES = [
  { id: 'len',   label: 'En az 8 karakter', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'En az 1 büyük harf', test: (p) => /[A-ZÇĞİÖŞÜ]/.test(p) },
  { id: 'digit', label: 'En az 1 rakam', test: (p) => /\d/.test(p) },
];

// Sidebar/Topbar ile aynı palet → aynı kullanıcı her yerde aynı renkte görünür
const AVATAR_COLORS = [
  'bg-indigo-500','bg-violet-500','bg-blue-500',
  'bg-emerald-500','bg-rose-500','bg-amber-500','bg-pink-500','bg-teal-500',
];
const avatarColor = (s = '') => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};
const initials = (u) =>
  (u?.full_name || u?.username || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 ' +
  'text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 ' +
  'focus:ring-indigo-500/40 focus:border-indigo-400 transition disabled:opacity-60 disabled:cursor-not-allowed';

// ── Küçük bileşenler ──────────────────────────────────────────────
const Card = ({ title, icon, description, children }) => (
  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
    <div className="mb-5">
      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">{icon}{title}</h2>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
    </div>
    {children}
  </section>
);

const Field = ({ label, htmlFor, hint, children }) => (
  <div>
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
  </div>
);

const Notice = ({ notice }) => {
  if (!notice) return null;
  const ok = notice.type === 'success';
  return (
    <div role="status" className={`flex items-start gap-2 text-sm rounded-xl px-3.5 py-2.5 border ${
      ok ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400'
         : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-400'}`}>
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
      <span>{notice.message}</span>
    </div>
  );
};

const PasswordInput = ({ id, value, onChange, show, onToggle, autoComplete, placeholder }) => (
  <div className="relative">
    <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange}
      autoComplete={autoComplete} placeholder={placeholder} className={`${inputCls} pr-10`} />
    <button type="button" onClick={onToggle} tabIndex={-1}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}>
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
);

// ── Sayfa ─────────────────────────────────────────────────────────
const Profile = () => {
  const [me, setMe]           = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [info, setInfo]             = useState({ full_name: '', email: '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoNotice, setInfoNotice] = useState(null);

  const [pw, setPw]             = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw]     = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const { data } = await authApi.me();
      setMe(data);
      setInfo({ full_name: data.full_name || '', email: data.email || '' });
    } catch (err) {
      setLoadError(err.message || 'Profil bilgileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const infoDirty = !!me && (info.full_name !== (me.full_name || '') || info.email !== (me.email || ''));

  const saveInfo = async (e) => {
    e.preventDefault();
    if (!infoDirty) return;
    setSavingInfo(true); setInfoNotice(null);
    try {
      const payload = { full_name: info.full_name };
      if (info.email !== (me.email || '')) payload.email = info.email || null;
      const { data } = await authApi.updateMe(payload);
      setMe((prev) => ({ ...prev, ...data }));
      setInfo({ full_name: data.full_name || '', email: data.email || '' });
      updateStoredUser({ full_name: data.full_name, email: data.email });
      setInfoNotice({ type: 'success', message: 'Profil bilgileriniz güncellendi.' });
    } catch (err) {
      setInfoNotice({ type: 'error', message: err.message });
    } finally {
      setSavingInfo(false);
    }
  };

  const ruleResults = PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(pw.next) }));
  const pwStrong    = ruleResults.every((r) => r.ok);
  const pwMatch     = pw.next.length > 0 && pw.next === pw.confirm;
  const pwReady     = pw.current && pwStrong && pwMatch;

  const savePassword = async (e) => {
    e.preventDefault();
    if (!pwReady) return;
    setSavingPw(true); setPwNotice(null);
    try {
      await authApi.changeMyPassword({ current_password: pw.current, new_password: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      setShowPw(false);
      setPwNotice({ type: 'success', message: 'Şifreniz değiştirildi. Bir sonraki girişte yeni şifrenizi kullanın.' });
    } catch (err) {
      setPwNotice({ type: 'error', message: err.message });
    } finally {
      setSavingPw(false);
    }
  };

  const permissionGroups = useMemo(() => {
    const groups = {};
    (me?.permissions || []).forEach((key) => {
      const [mod, action] = key.split('.');
      (groups[mod] ||= []).push(ACTION_LABELS[action] || action);
    });
    return Object.entries(groups)
      .map(([mod, actions]) => ({ mod, label: MODULE_LABELS[mod] || mod, actions }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [me]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <Notice notice={{ type: 'error', message: loadError }} />
        <button onClick={load} className="mt-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Tekrar dene</button>
      </div>
    );
  }

  const memberSince = me.created_at
    ? new Date(me.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <UserCircle2 size={24} className="text-indigo-500" /> Profilim
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Hesap bilgilerinizi ve şifrenizi yönetin.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Sol: özet kartı */}
        <aside className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 lg:sticky lg:top-6">
          <div className="flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-2xl ${avatarColor(me.username)} text-white text-2xl font-bold flex items-center justify-center shadow-sm`}>
              {initials(me)}
            </div>
            <p className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{me.full_name || me.username}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">@{me.username}</p>
            <span className={`mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold ${ROLE_STYLES[me.role] || ROLE_STYLES.viewer}`}>
              <Shield size={11} /> {ROLE_LABELS[me.role] || me.role}
            </span>
          </div>
          <dl className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3 text-sm">
            <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
              <Mail size={15} className="text-slate-400 shrink-0" />
              <dd className="truncate">{me.email || <span className="text-slate-400">E-posta eklenmemiş</span>}</dd>
            </div>
            {memberSince && (
              <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
                <CalendarDays size={15} className="text-slate-400 shrink-0" />
                <dd>{memberSince} tarihinden beri üye</dd>
              </div>
            )}
          </dl>
        </aside>

        {/* Sağ: formlar */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Kişisel bilgiler" icon={<UserCircle2 size={17} className="text-indigo-500" />}>
            <form onSubmit={saveInfo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Ad soyad" htmlFor="full_name">
                  <input id="full_name" className={inputCls} value={info.full_name} autoComplete="name"
                    onChange={(e) => setInfo({ ...info, full_name: e.target.value })} placeholder="Adınız Soyadınız" />
                </Field>
                <Field label="E-posta" htmlFor="email">
                  <input id="email" type="email" className={inputCls} value={info.email} autoComplete="email"
                    onChange={(e) => setInfo({ ...info, email: e.target.value })} placeholder="ornek@sirket.com" />
                </Field>
              </div>
              <Field label="Kullanıcı adı" htmlFor="username" hint="Kullanıcı adı ve rol yalnızca yönetici tarafından değiştirilebilir.">
                <div className="relative">
                  <AtSign size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="username" className={`${inputCls} pl-9`} value={me.username} disabled readOnly />
                </div>
              </Field>
              <Notice notice={infoNotice} />
              <div className="flex justify-end">
                <button type="submit" disabled={!infoDirty || savingInfo}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {savingInfo ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Kaydet
                </button>
              </div>
            </form>
          </Card>

          <Card title="Şifre değiştir" icon={<KeyRound size={17} className="text-indigo-500" />}
            description="Güvenliğiniz için mevcut şifrenizi doğrulamanız gerekir.">
            <form onSubmit={savePassword} className="space-y-4">
              <Field label="Mevcut şifre" htmlFor="current_password">
                <PasswordInput id="current_password" value={pw.current} show={showPw} onToggle={() => setShowPw((s) => !s)}
                  onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Yeni şifre" htmlFor="new_password">
                  <PasswordInput id="new_password" value={pw.next} show={showPw} onToggle={() => setShowPw((s) => !s)}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
                </Field>
                <Field label="Yeni şifre (tekrar)" htmlFor="confirm_password">
                  <PasswordInput id="confirm_password" value={pw.confirm} show={showPw} onToggle={() => setShowPw((s) => !s)}
                    onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
                </Field>
              </div>
              {(pw.next || pw.confirm) && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {ruleResults.map((r) => (
                    <li key={r.id} className={`flex items-center gap-1.5 ${r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {r.ok ? <Check size={13} /> : <X size={13} />} {r.label}
                    </li>
                  ))}
                  <li className={`flex items-center gap-1.5 ${pwMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {pwMatch ? <Check size={13} /> : <X size={13} />} Şifreler eşleşiyor
                  </li>
                </ul>
              )}
              <Notice notice={pwNotice} />
              <div className="flex justify-end">
                <button type="submit" disabled={!pwReady || savingPw}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {savingPw ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Şifreyi değiştir
                </button>
              </div>
            </form>
          </Card>

          <Card title="Yetkilerim" icon={<Shield size={17} className="text-indigo-500" />}
            description={`"${ROLE_LABELS[me.role] || me.role}" rolünüzün izinleri. Değişiklik için bir yöneticiye başvurun.`}>
            {permissionGroups.length === 0 ? (
              <p className="text-sm text-slate-400">Rolünüze tanımlı izin yok.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {permissionGroups.map((g) => (
                  <div key={g.mod} className="rounded-xl border border-slate-100 dark:border-slate-800 px-3.5 py-3">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{g.label}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.actions.map((a) => (
                        <span key={a} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
