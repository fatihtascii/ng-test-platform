import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { suitesApi } from '../../api';
import { suggestProfiles } from './suiteModel';

const isMasked = (v) => typeof v === 'string' && v.startsWith('••••');

/** Otomasyon deposu bağlama / düzenleme */
const SuiteFormDrawer = ({ suite, projects, envs, defaultProject, onClose, onSaved }) => {
  const editing = Boolean(suite);
  const [form, setForm] = useState(() => ({
    name: suite?.name || '', project_id: String(suite?.project_id || defaultProject || projects[0]?.id || ''),
    repo_url: suite?.repo_url || '', branch: suite?.branch || 'main', token: suite?.token || '',
    test_path: suite?.test_path || 'tests', environment_id: suite?.environment_id ? String(suite.environment_id) : '',
    workers: suite?.workers || 1, timeout_minutes: suite?.timeout_minutes || 120,
    profiles: suite?.profiles?.length ? suite.profiles : [{ name: 'Tümü', marker: '' }],
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const projectEnvs = envs.filter(e => String(e.project_id) === form.project_id);
  const suggestions = suggestProfiles(suite?.sync_summary?.markers).filter(p => !form.profiles.some(x => x.marker === p.marker));

  const setProfile = (i, k, v) => setForm(f => ({ ...f, profiles: f.profiles.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));

  const submit = async () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Ad gerekli.';
    if (!/^https:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+/.test(form.repo_url.trim()) && !form.repo_url.startsWith('/')) errs.repo_url = 'https://github.com/sahip/depo biçiminde girin.';
    if (!form.project_id) errs.project_id = 'Proje seçin.';
    const profiles = form.profiles.filter(p => p.name.trim());
    if (new Set(profiles.map(p => p.name.trim())).size !== profiles.length) errs.profiles = 'Profil adları benzersiz olmalı.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const body = {
      name: form.name.trim(), project_id: Number(form.project_id), repo_url: form.repo_url.trim(), branch: form.branch.trim() || 'main',
      test_path: form.test_path.trim() || 'tests', environment_id: form.environment_id ? Number(form.environment_id) : null,
      workers: Number(form.workers) || 1, timeout_minutes: Number(form.timeout_minutes) || 120, profiles,
      ...(isMasked(form.token) ? {} : { token: form.token.trim() }),
    };
    try {
      const { data } = editing ? await suitesApi.update(suite.id, body) : await suitesApi.create(body);
      toast.success(editing ? 'Depo ayarları kaydedildi.' : 'Depo bağlandı; şimdi senkronize edin.');
      onSaved(data, !editing);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md" eyebrow={editing ? 'Otomasyon deposu' : 'Yeni depo'} title={editing ? suite.name : 'Otomasyon deposu bağla'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Bağla'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Mevcut bir pytest/Playwright projesini bağlayın. NG Test depoyu sunucuya çeker, kendi sanal ortamını kurar, testleri case olarak içe aktarır ve projenin kendi <code>conftest</code>'iyle koşturur. Depodaki kod değiştirilmez.
        </p>
        <Field label="Ad" htmlFor="s-name" required error={errors.name}>
          <input id="s-name" data-autofocus value={form.name} onChange={set('name')} placeholder="easycontact admin testleri" className={inputCls} />
        </Field>
        <Field label="NG Test projesi" htmlFor="s-project" required error={errors.project_id} hint="Testler bu projeye case olarak aktarılır.">
          <select id="s-project" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value, environment_id: '' }))} className={inputCls}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="GitHub deposu" htmlFor="s-repo" required error={errors.repo_url}>
          <input id="s-repo" value={form.repo_url} onChange={set('repo_url')} placeholder="https://github.com/sirket/admin-tests" className={`${inputCls} font-mono text-[13px]`} spellCheck={false} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dal" htmlFor="s-branch"><input id="s-branch" value={form.branch} onChange={set('branch')} className={`${inputCls} font-mono text-[13px]`} /></Field>
          <Field label="Test klasörü" htmlFor="s-path"><input id="s-path" value={form.test_path} onChange={set('test_path')} className={`${inputCls} font-mono text-[13px]`} /></Field>
        </div>
        <Field label="Erişim token'ı" htmlFor="s-token" hint={isMasked(form.token) ? 'Kayıtlı. Değiştirmek için yeni değeri yazın; silmek için boşaltın.' : 'Özel depo için "Contents: read" izinli bir GitHub token\'ı. Açık depoda boş bırakın.'}>
          <input id="s-token" type={isMasked(form.token) ? 'text' : 'password'} value={form.token} onChange={set('token')} onFocus={e => isMasked(form.token) && e.target.select()}
            placeholder="github_pat_…" className={`${inputCls} font-mono text-[13px]`} autoComplete="off" />
        </Field>
        <Field label="Ortam" htmlFor="s-env" hint="Değişkenleri (BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD…) testlere ortam değişkeni olarak verilir; .env dosyasının yerini tutar. Şifreleri gizli değişken yapın.">
          <select id="s-env" value={form.environment_id} onChange={set('environment_id')} className={inputCls}>
            <option value="">Ortamsız</option>
            {projectEnvs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paralel işçi" htmlFor="s-workers" hint="1'den büyükse pytest-xdist (-n) kullanılır.">
            <input id="s-workers" type="number" min={1} max={16} value={form.workers} onChange={set('workers')} className={inputCls} />
          </Field>
          <Field label="Zaman aşımı (dk)" htmlFor="s-timeout">
            <input id="s-timeout" type="number" min={5} max={720} value={form.timeout_minutes} onChange={set('timeout_minutes')} className={inputCls} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Koşum profilleri</legend>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Tek tıkla koşulan hazır seçimler. İfade pytest <code>-m</code> biçimindedir; boş bırakılırsa tüm testler koşar.</p>
          <div className="space-y-2">
            {form.profiles.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input value={p.name} onChange={e => setProfile(i, 'name', e.target.value)} placeholder="Ad" aria-label="Profil adı" className={`${inputCls} w-36`} />
                <input value={p.marker} onChange={e => setProfile(i, 'marker', e.target.value)} placeholder="ör. smoke and not data_producing" aria-label="pytest -m ifadesi" className={`${inputCls} flex-1 font-mono text-[13px]`} />
                <button type="button" onClick={() => setForm(f => ({ ...f, profiles: f.profiles.filter((_, j) => j !== i) }))} aria-label="Profili kaldır"
                  className="rounded-md px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><X size={14} /></button>
              </div>
            ))}
          </div>
          {errors.profiles && <p className="mt-1 text-xs text-rose-600">{errors.profiles}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setForm(f => ({ ...f, profiles: [...f.profiles, { name: '', marker: '' }] }))}>Profil ekle</Button>
            {suggestions.map(s => (
              <button key={s.name} type="button" onClick={() => setForm(f => ({ ...f, profiles: [...f.profiles, s] }))}
                className="rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-600 dark:text-slate-300">+ {s.name}</button>
            ))}
          </div>
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default SuiteFormDrawer;
