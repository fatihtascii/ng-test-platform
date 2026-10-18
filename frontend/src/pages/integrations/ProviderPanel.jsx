import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Ticket, GitBranch, PlugZap, Save } from 'lucide-react';
import { Button, StatusBadge } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { inputCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { integrationsApi } from '../../api';
import EventList from './EventList';
import { isMasked, missingRequired } from './model';

const ICON = { slack: MessageSquare, jira: Ticket, github: GitBranch };

const Switch = ({ checked, onChange, disabled, label }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} disabled={disabled}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

/** Tek bir entegrasyonun ayarları, bağlantı denemesi ve gönderim geçmişi */
const ProviderPanel = ({ def, data, projects, envs, canEdit, onSaved, children }) => {
  const [form, setForm] = useState(() => ({ ...data.config }));
  const [active, setActive] = useState(data.is_active);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [events, setEvents] = useState({ loading: true, items: [] });
  const Icon = ICON[def.id];

  const loadEvents = useCallback(() => integrationsApi.events(def.id, 8)
    .then(r => setEvents({ loading: false, items: r.data })).catch(() => setEvents({ loading: false, items: [] })), [def.id]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  const dirty = useMemo(() => active !== data.is_active
    || Object.keys(form).some(k => (form[k] ?? '') !== (data.config[k] ?? '')), [form, active, data]);
  const missing = missingRequired(def, form);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (active && missing.length) { toast.error(`Açmadan önce doldurun: ${missing.join(', ')}`); return; }
    setSaving(true);
    try {
      const { data: saved } = await integrationsApi.save(def.id, { is_active: active, config: form });
      onSaved(saved);
      setForm({ ...saved.config });
      setActive(saved.is_active);
      toast.success(`${def.name} ayarları kaydedildi.`);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const { data: r } = await integrationsApi.test(def.id, { config: form });
      toast.success(r.message);
    } catch (e) { toast.error(e.message || 'Bağlantı kurulamadı.'); }
    finally { setTesting(false); loadEvents(); }
  };

  const state = data.is_active && data.configured ? { tone: 'pass', label: 'Açık' }
    : data.is_active ? { tone: 'blocked', label: 'Ayar eksik' } : { tone: 'pending', label: 'Kapalı' };
  const projectEnvs = envs.filter(e => form.projectId == null || form.projectId === '' || String(e.project_id) === String(form.projectId));

  const renderField = (f) => {
    if (f.showIf && !f.showIf(form)) return null;
    const id = `${def.id}-${f.key}`;
    const disabled = !canEdit;
    if (f.type === 'checkbox') {
      return (
        <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
          <input type="checkbox" checked={Boolean(form[f.key])} onChange={e => set(f.key, e.target.checked)} disabled={disabled} className="h-4 w-4 accent-indigo-600" />
          {f.label}
        </label>
      );
    }
    let control;
    if (f.type === 'select') {
      control = <select id={id} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} disabled={disabled} className={inputCls}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    } else if (f.type === 'project') {
      control = (
        <select id={id} value={form[f.key] ?? ''} onChange={e => setForm(x => ({ ...x, projectId: e.target.value ? Number(e.target.value) : null, environmentId: null }))} disabled={disabled} className={inputCls}>
          <option value="">Seçin</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      );
    } else if (f.type === 'environment') {
      control = (
        <select id={id} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value ? Number(e.target.value) : null)} disabled={disabled || !form.projectId} className={inputCls}>
          <option value="">Ortamsız</option>
          {projectEnvs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      );
    } else {
      const masked = f.type === 'secret' && isMasked(form[f.key]);
      control = (
        <input id={id} type={f.type === 'secret' && !masked ? 'password' : 'text'} value={form[f.key] ?? ''} placeholder={f.placeholder}
          onChange={e => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
          onFocus={e => { if (masked) e.target.select(); }} disabled={disabled} autoComplete="off" spellCheck={false}
          className={`${inputCls} ${f.type !== 'text' || f.key.toLowerCase().includes('url') ? 'font-mono text-[13px]' : ''}`} />
      );
    }
    const hint = f.type === 'secret' && isMasked(form[f.key]) ? 'Kayıtlı. Değiştirmek için yeni değeri yazın.' : f.hint;
    return <Field key={f.key} label={f.label} htmlFor={id} required={f.required} hint={hint}>{control}</Field>;
  };

  return (
    <section aria-labelledby={`${def.id}-h`} className={`rounded-2xl border bg-white dark:bg-slate-900 ${state.tone === 'pass' ? 'border-indigo-200 dark:border-indigo-500/30' : 'border-slate-200 dark:border-slate-800'}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${def.id}-h`} className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">{def.name} <StatusBadge tone={state.tone}>{state.label}</StatusBadge></h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{def.summary}</p>
        </div>
        <Switch checked={active} onChange={setActive} disabled={!canEdit} label={`${def.name} açık`} />
      </header>
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">{def.fields.map(renderField)}</div>
          {children?.(form)}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button icon={<PlugZap size={14} />} onClick={test} loading={testing} disabled={missing.length > 0}
                title={missing.length ? `Eksik: ${missing.join(', ')}` : 'Kaydetmeden dener'}>Bağlantıyı dene</Button>
              <Button variant="primary" icon={<Save size={14} />} onClick={save} loading={saving} disabled={!dirty}>Kaydet</Button>
              {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Kaydedilmemiş değişiklik var</span>}
            </div>
          )}
        </div>
        <aside className="min-w-0 space-y-4 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Ne yapar</p>
            <ul className="list-disc space-y-1 pl-4 text-slate-700 dark:text-slate-300">{def.does.map(d => <li key={d}>{d}</li>)}</ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Kurulum</p>
            <p className="text-slate-600 dark:text-slate-300">{def.setup}</p>
          </div>
          <div>
            <p className="mb-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">Son gönderimler</p>
            <EventList events={events.items} loading={events.loading} />
          </div>
        </aside>
      </div>
    </section>
  );
};

export default ProviderPanel;
