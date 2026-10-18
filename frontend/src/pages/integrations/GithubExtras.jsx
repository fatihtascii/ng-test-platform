import React from 'react';
import { API_BASE } from '../../auth';
import { CopyButton } from '../environments/parts';

const Code = ({ children, copy, label }) => (
  <div className="relative">
    <pre className="overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 pr-10 font-mono text-xs leading-relaxed text-slate-200">{children}</pre>
    <CopyButton text={copy ?? children} label={label} className="absolute right-1.5 top-1.5 text-slate-400 hover:text-white" />
  </div>
);

/** Webhook adresi ve herhangi bir CI'dan tetikleme örneği */
const GithubExtras = ({ form }) => {
  const base = new URL(API_BASE, window.location.origin).toString().replace(/\/$/, '');
  const curl = `curl -fsS -X POST ${base}/automation/runs \\
  -H "Authorization: Bearer $NG_TEST_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"project_id": ${form.projectId || 1}${form.environmentId ? `, "environment_id": ${form.environmentId}` : ''}}' \\
  | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r["url"]); sys.exit(0 if r["passed"] else 1)'`;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Webhook adresi (Payload URL)</p>
        <Code label="Webhook adresi">{`${base}/webhooks/github`}</Code>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Olaylar: {form.triggerOn === 'deployment' ? '"Deployment statuses"' : '"Just the push event"'}. Sunucu GitHub'dan erişilebilir olmalı.</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Başka bir CI'dan (Jenkins, GitLab, Actions adımı)</p>
        <Code label="Komut">{curl}</Code>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Koşum bitene kadar bekler; kalan test varsa komut hata koduyla çıkar. Token, "otomasyon çalıştırma" izni olan bir kullanıcının oturum token'ıdır ve oturum süresi dolunca geçersiz olur.</p>
      </div>
    </div>
  );
};

export default GithubExtras;
