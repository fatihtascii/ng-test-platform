/**
 * Entegrasyonlar: Slack bildirimleri, Jira'ya hata aktarımı ve GitHub'dan otomasyon tetikleme.
 * Her sağlayıcı ayrı kaydedilir; gönderim geçmişi sunucuda tutulur. Parçalar ./integrations altında.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Blocks } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { PageHeader, Button, EmptyState, Skeleton } from '../components/ui';
import { integrationsApi, projectsApi, environmentsApi } from '../api';
import ProviderPanel from './integrations/ProviderPanel';
import GithubExtras from './integrations/GithubExtras';
import { PROVIDERS } from './integrations/model';

const load = () => Promise.all([
  integrationsApi.getAll(), projectsApi.getAll().catch(() => ({ data: [] })), environmentsApi.getAll().catch(() => ({ data: [] })),
]).then(([i, p, e]) => ({ items: Object.fromEntries(i.data.map(x => [x.provider, x])), projects: p.data, envs: e.data }));

const Integrations = () => {
  const { can } = usePermission();
  const canEdit = can('integrations.manage');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(() => load().then(d => { setData(d); setError(null); }).catch(e => setError(e.message || 'Yüklenemedi.')), []);
  useEffect(() => {
    let alive = true;
    load().then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(e.message || 'Yüklenemedi.'); });
    return () => { alive = false; };
  }, []);

  if (error && !data) {
    return <EmptyState icon={<Blocks size={24} />} title="Entegrasyonlar yüklenemedi" description={error} action={<Button onClick={reload}>Tekrar dene</Button>} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Entegrasyonlar"
        description="Koşum sonuçlarını Slack'e bildirin, hata kayıtlarını Jira'ya aktarın, GitHub'a kod gönderildiğinde otomasyon testlerini koşturun." />
      {!canEdit && data && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Ayarları görüntülüyorsunuz; değiştirmek için "entegrasyon yönetimi" izni gerekir.
        </p>
      )}
      {!data ? (
        <div className="space-y-5">{PROVIDERS.map(p => <Skeleton key={p.id} className="h-72" />)}</div>
      ) : PROVIDERS.map(def => (
        <ProviderPanel key={def.id} def={def} data={data.items[def.id]} projects={data.projects} envs={data.envs} canEdit={canEdit}
          onSaved={saved => setData(d => ({ ...d, items: { ...d.items, [def.id]: saved } }))}>
          {def.id === 'github' ? (form) => <GithubExtras form={form} /> : undefined}
        </ProviderPanel>
      ))}
    </div>
  );
};

export default Integrations;
