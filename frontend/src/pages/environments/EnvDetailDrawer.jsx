import React, { useEffect, useState } from 'react';
import { ExternalLink, Pencil, Plus } from 'lucide-react';
import { Button, Skeleton, StatusBadge } from '../../components/ui';
import { Drawer } from '../../components/ui/overlay';
import { environmentsApi } from '../../api';
import CodeBlock from '../test-cases/CodeBlock';
import { CopyButton } from './parts';

const SOURCE = { env: { label: 'Ortam', tone: 'accent' }, project: { label: 'Proje', tone: 'info' }, global: { label: 'Global', tone: 'pending' } };

/** Ortamda koşulan testlerin göreceği değişkenler: kapsamlar birleşmiş, kazanan değerle. */
const EnvDetailDrawer = ({ env, projectName, canManage, onClose, onEdit, onAddVar }) => {
  const [state, setState] = useState({ id: null });
  useEffect(() => {
    let alive = true;
    environmentsApi.resolved(env.id)
      .then(({ data }) => alive && setState({ id: env.id, data }))
      .catch(e => alive && setState({ id: env.id, error: e.message }));
    return () => { alive = false; };
  }, [env.id, env.url]);

  const sample = `import os\n\ndef test_giris(page, base_url):\n    page.goto(f"{base_url}/login")          # ${env.url}/login\n    page.fill("#user", os.environ["API_USER"])\n`;

  return (
    <Drawer open onClose={onClose} size="lg" eyebrow={projectName(env.project_id)} title={env.name}
      actions={canManage && <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit}>Düzenle</Button>}>
      <div className="space-y-6 p-5">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Temel adres</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate font-mono text-sm text-slate-900 dark:text-slate-100">{env.url}</span>
            <CopyButton text={env.url} label="Adres" />
            <a href={env.url} target="_blank" rel="noreferrer noopener" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Yeni sekmede aç"><ExternalLink size={14} /></a>
          </div>
          {env.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{env.description}</p>}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Koşumda geçerli değişkenler</h3>
            {canManage && <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={onAddVar}>Bu ortama ekle</Button>}
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Otomasyon bu ortamda koşulunca aşağıdakiler test sürecine ortam değişkeni olarak verilir. Aynı anahtar birden çok kapsamda varsa dar olan kazanır.</p>
          {state.id !== env.id ? <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9" />)}</div>
            : state.error ? <p className="text-sm text-rose-600">{state.error}</p>
            : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/60 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    <tr><th className="w-2/5 px-3 py-2 font-medium">Anahtar</th><th className="px-3 py-2 font-medium">Değer</th><th className="w-24 px-3 py-2 font-medium">Kaynak</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {state.data.map(v => (
                      <tr key={v.key}>
                        <td className="truncate px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100">{v.key}</td>
                        <td className={`truncate px-3 py-2 font-mono text-xs ${v.is_secret ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300'}`} title={v.is_secret ? 'Sır' : v.value}>{v.value}</td>
                        <td className="px-3 py-2"><StatusBadge tone={SOURCE[v.source].tone}>{SOURCE[v.source].label}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">Script'te kullanım</h3>
          <CodeBlock code={sample} language="python" filename="test_ornek.py" />
        </section>
      </div>
    </Drawer>
  );
};

export default EnvDetailDrawer;
