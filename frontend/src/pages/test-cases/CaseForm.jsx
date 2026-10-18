import React, { useState } from 'react';
import { X, Wand2, FileCode2 } from 'lucide-react';
import { Button } from '../../components/ui';
import { Field, Tabs } from '../../components/ui/data';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { testCasesApi } from '../../api';
import StepEditor from './StepEditor';
import CodeBlock from './CodeBlock';
import { TEST_TYPES, PRIORITIES, STATUSES, EXECUTION_LABEL, GHERKIN_SUGGESTIONS, PLAYWRIGHT_TEMPLATE } from './model';

const selectCls = `${inputCls} pr-8`;
const MAX_TAGS = 20;

const TagInput = ({ value, onChange, suggestions }) => {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const t = raw.trim().replace(/,$/, '').slice(0, 40);
    if (!t || value.some(v => v.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr')) || value.length >= MAX_TAGS) { setDraft(''); return; }
    onChange([...value, t]); setDraft('');
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900">
      {value.map(t => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-slate-100 py-0.5 pl-1.5 pr-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t}
          <button type="button" onClick={() => onChange(value.filter(v => v !== t))} aria-label={`${t} etiketini kaldır`}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X size={11} /></button>
        </span>
      ))}
      <input id="tc-tags" list="tc-tag-suggestions" value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
          else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : 'smoke, ödeme, regresyon…'}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" />
      <datalist id="tc-tag-suggestions">
        {suggestions.filter(s => !value.includes(s)).map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
};

/**
 * Oluşturma / düzenleme formu. Form durumu sayfada tutulur (kaydedilmemiş değişiklik
 * kontrolü için); bu bileşen yalnızca alanları çizer ve değişiklikleri bildirir.
 */
const CaseForm = ({ form, setForm, errors, mode, projects, tagSuggestions }) => {
  const [tab, setTab] = useState(form.automation_script ? 'script' : form.gherkin_scenario ? 'bdd' : 'steps');
  const [bdd, setBdd] = useState({ loading: false, code: '' });
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const onInput = (k) => (e) => set(k)(e.target.value);

  const generateBdd = async () => {
    setBdd({ loading: true, code: '' });
    try {
      const { data } = await testCasesApi.generateBDD({ gherkin: form.gherkin_scenario });
      setBdd({ loading: false, code: data.code });
    } catch (err) {
      setBdd({ loading: false, code: '' });
      toast.error(err.message || 'Kod üretilemedi.');
    }
  };

  const filledSteps = form.steps.filter(s => s.action?.trim()).length;
  const tabs = [
    { id: 'steps', label: 'Adımlar', count: filledSteps },
    { id: 'bdd', label: 'BDD', dot: Boolean(form.gherkin_scenario.trim()) },
    { id: 'script', label: 'Otomasyon script\'i', dot: Boolean(form.automation_script.trim()) },
  ];

  return (
    <div className="space-y-6 p-5">
      {errors.automation_script && tab !== 'script' && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {errors.automation_script}
          <button type="button" onClick={() => setTab('script')} className="shrink-0 font-medium underline">Script'e git</button>
        </div>
      )}
      <section className="space-y-4">
        <Field label="Başlık" htmlFor="tc-title" required error={errors.title}>
          <input id="tc-title" data-autofocus value={form.title} onChange={onInput('title')} maxLength={500}
            placeholder="Örn. Geçerli bilgilerle giriş yapılabilir" className={inputCls} aria-invalid={Boolean(errors.title)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proje" htmlFor="tc-project" required error={errors.project_id}>
            <select id="tc-project" value={form.project_id} onChange={onInput('project_id')} className={selectCls}>
              <option value="" disabled>Proje seçin</option>
              {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Tür" htmlFor="tc-type">
            <select id="tc-type" value={form.type} onChange={onInput('type')} className={selectCls}>
              {TEST_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Öncelik" htmlFor="tc-priority">
            <select id="tc-priority" value={form.priority} onChange={onInput('priority')} className={selectCls}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Yürütme" htmlFor="tc-exec" hint={form.execution_type === 'Automated' ? 'Otomasyon ekranından koşulabilmesi için script gerekir.' : undefined}>
            <select id="tc-exec" value={form.execution_type}
              onChange={e => { set('execution_type')(e.target.value); if (e.target.value === 'Automated') setTab('script'); }}
              className={selectCls}>
              {Object.entries(EXECUTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {mode === 'edit' && (
            <Field label="Son sonuç" htmlFor="tc-status" hint="Koşumlar bittiğinde otomatik güncellenir.">
              <select id="tc-status" value={form.status} onChange={onInput('status')} className={selectCls}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          )}
          <Field label="Etiketler" htmlFor="tc-tags" className="sm:col-span-2" hint="Enter veya virgülle ekleyin.">
            <TagInput value={form.tags} onChange={set('tags')} suggestions={tagSuggestions} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />

        {tab === 'steps' && <StepEditor steps={form.steps} onChange={set('steps')} />}

        {tab === 'bdd' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">Örnekle başla:</span>
              {GHERKIN_SUGGESTIONS.map(s => (
                <button key={s.label} type="button" onClick={() => set('gherkin_scenario')(s.text)}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white">
                  {s.label}
                </button>
              ))}
            </div>
            <textarea value={form.gherkin_scenario} onChange={onInput('gherkin_scenario')} rows={10} spellCheck={false}
              aria-label="Gherkin senaryosu"
              placeholder={'Feature: Kullanıcı girişi\n\n  Scenario: Başarılı giriş\n    Given Kullanıcı giriş sayfasındadır\n    When Geçerli bilgileri girer\n    Then Genel durum sayfası açılır'}
              className={`${textareaCls} font-mono text-[13px] leading-relaxed`} />
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<Wand2 size={13} />} onClick={generateBdd} loading={bdd.loading}
                disabled={form.gherkin_scenario.trim().length < 10}>pytest-bdd iskeleti üret</Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">Üretilen kod kaydedilmez; kopyalayıp projenize ekleyin.</span>
            </div>
            {bdd.code && <CodeBlock code={bdd.code} language="python" filename="pytest-bdd" />}
          </div>
        )}

        {tab === 'script' && (
          <div className="space-y-2">
            {form.execution_type !== 'Automated' && (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Bu case manuel. Script'i otomasyon ekranından koşmak için yürütmeyi <strong>Otomasyon</strong> yapın.
              </p>
            )}
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <div className="flex h-9 items-center justify-between border-b border-slate-800 px-3">
                <span className="font-mono text-xs text-slate-400">test_tc_{form.id || 'yeni'}.py</span>
                <div className="flex items-center gap-1">
                  {form.automation_script && (
                    <button type="button" onClick={() => set('automation_script')('')}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100">Temizle</button>
                  )}
                  <button type="button" disabled={Boolean(form.automation_script.trim())}
                    onClick={() => set('automation_script')(PLAYWRIGHT_TEMPLATE)}
                    title={form.automation_script.trim() ? 'Önce mevcut script\'i temizleyin' : undefined}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40">
                    <FileCode2 size={12} /> Playwright şablonu
                  </button>
                </div>
              </div>
              <textarea value={form.automation_script} onChange={onInput('automation_script')} spellCheck={false}
                aria-label="Otomasyon script'i" aria-invalid={Boolean(errors.automation_script)}
                onKeyDown={e => {
                  if (e.key !== 'Tab' || e.shiftKey) return;
                  e.preventDefault();
                  const el = e.currentTarget; const { selectionStart: a, selectionEnd: b } = el;
                  const v = el.value.slice(0, a) + '    ' + el.value.slice(b);
                  set('automation_script')(v);
                  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 4; });
                }}
                placeholder="# pytest + Playwright test kodu"
                className="block h-80 w-full resize-y bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600" />
            </div>
            {errors.automation_script
              ? <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{errors.automation_script}</p>
              : <p className="text-xs text-slate-500 dark:text-slate-400">Script sunucuda pytest ile çalıştırılır. Tab dört boşluk ekler.</p>}
          </div>
        )}
      </section>
    </div>
  );
};

export default CaseForm;
