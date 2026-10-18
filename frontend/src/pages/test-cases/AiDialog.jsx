import React, { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Modal } from '../../components/ui/overlay';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { PROMPT_SUGGESTIONS, TEST_TYPES, PRIORITIES } from './model';
import { PriorityMark } from './parts';

const KEY_NAME = 'ng-gemini-key';
const readKey = () => {
  try { return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME) || ''; } catch { return ''; }
};
const remembered = () => { try { return Boolean(localStorage.getItem(KEY_NAME)); } catch { return false; } };
const storeKey = (key, remember) => {
  try {
    sessionStorage.setItem(KEY_NAME, key);
    if (remember) localStorage.setItem(KEY_NAME, key); else localStorage.removeItem(KEY_NAME);
  } catch { /* depolama kapalı: anahtar yalnızca bu pencerede kalır */ }
};

const SYSTEM_PROMPT = `Sen deneyimli bir QA mühendisisin. İstenen özellik için tek bir test case üret.
YALNIZCA şu biçimde geçerli JSON döndür:
{"title":"...","type":"<${TEST_TYPES.join('|')}>","priority":"<${PRIORITIES.join('|')}>","steps":[{"action":"...","expectedResult":"..."}]}
Kurallar: 4-8 adım, Türkçe, her adımın gözlemlenebilir bir beklenen sonucu olsun, uygunsa bir negatif kontrol ekle.`;

async function generate(apiKey, prompt) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    // Anahtar URL yerine başlıkta: tarayıcı geçmişine ve vekil sunucu loglarına düşmez
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nİstek: ${prompt}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Gemini isteği başarısız (${res.status}).`);
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try {
    const parsed = JSON.parse(text.replace(/```(json)?/gi, '').trim());
    if (!parsed.title || !Array.isArray(parsed.steps) || !parsed.steps.length) throw new Error();
    return parsed;
  } catch {
    throw new Error('Yanıt beklenen biçimde değil; tekrar deneyin.');
  }
}

const AiDialog = ({ open, onClose, onImport }) => {
  const [apiKey, setApiKey] = useState(readKey);
  const [remember, setRemember] = useState(remembered);
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    if (!apiKey.trim() || !prompt.trim()) return;
    storeKey(apiKey.trim(), remember);
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', result: await generate(apiKey.trim(), prompt.trim()) });
    } catch (err) {
      setState({ status: 'error', error: err.message });
    }
  };

  const result = state.result;
  return (
    <Modal open={open} onClose={onClose} size="lg" title="AI ile test case taslağı"
      description="Google Gemini bir taslak önerir; forma aktarıp düzenledikten sonra kaydedersiniz."
      dismissable={state.status !== 'loading'}
      footer={result ? (
        <>
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={run}>Yeniden üret</Button>
          <Button variant="primary" onClick={() => onImport(result)}>Forma aktar</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose} disabled={state.status === 'loading'}>Vazgeç</Button>
          <Button variant="primary" icon={<Sparkles size={14} />} onClick={run} loading={state.status === 'loading'}
            disabled={!apiKey.trim() || !prompt.trim()}>Taslak üret</Button>
        </>
      )}>
      {!result ? (
        <div className="space-y-4">
          <Field label="Gemini API anahtarı" htmlFor="ai-key"
            hint="Anahtar yalnızca tarayıcınızdan Google'a gönderilir, NG Test sunucusuna gitmez.">
            <input id="ai-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} className={inputCls} placeholder="AIza…" />
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              Bu tarayıcıda hatırla
            </label>
          </Field>
          <Field label="Neyi test etmek istiyorsunuz?" htmlFor="ai-prompt">
            <textarea id="ai-prompt" data-autofocus rows={4} value={prompt} onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }}
              placeholder="Örn. Kayıtlı kullanıcının şifresini e-postayla sıfırlaması" className={textareaCls} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {PROMPT_SUGGESTIONS.map(s => (
              <button key={s.label} type="button" onClick={() => setPrompt(s.text)}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white">
                {s.label}
              </button>
            ))}
          </div>
          {state.status === 'error' && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{state.error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">{result.title}</p>
            <div className="mt-1 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>{result.type}</span><PriorityMark priority={result.priority} /><span>{result.steps.length} adım</span>
            </div>
          </div>
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {result.steps.map((s, i) => (
              <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-2 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-slate-400">{i + 1}</span>
                <div>
                  <p className="text-slate-900 dark:text-slate-100">{s.action}</p>
                  {(s.expectedResult || s.expected) && <p className="mt-0.5 text-slate-500 dark:text-slate-400">→ {s.expectedResult || s.expected}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
};

export default AiDialog;
