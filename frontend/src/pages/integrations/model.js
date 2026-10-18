/**
 * Entegrasyon tanımları: her sağlayıcının ne yaptığı ve form alanları.
 * Alan tipleri: text | secret | select | checkbox | project | environment
 */
export const PROVIDERS = [
  {
    id: 'slack', name: 'Slack', summary: 'Koşum sonuçlarını ve yeni hata kayıtlarını bir kanala bildirir.',
    does: [
      'Koşum bittiğinde özet mesajı (geçen/kalan, geçme oranı, koşum ve hata bağlantısı)',
      'Yeni hata kaydı açıldığında bildirim',
    ],
    setup: 'Slack\'te bir "Incoming Webhook" oluşturup adresini yapıştırın (api.slack.com/apps → Incoming Webhooks).',
    fields: [
      { key: 'slackWebhook', label: 'Webhook adresi', type: 'secret', required: true, placeholder: 'https://hooks.slack.com/services/…' },
      { key: 'notifyOn', label: 'Koşum bildirimi', type: 'select', options: [['failures', 'Yalnız kalan test varsa'], ['all', 'Her koşum bitişinde'], ['never', 'Gönderme']] },
      { key: 'notifyDefects', label: 'Yeni hata kaydını bildir', type: 'checkbox' },
      { key: 'slackChannel', label: 'Kanal (isteğe bağlı)', type: 'text', placeholder: '#test-sonuclari', hint: 'Yeni Slack uygulamalarında kanal webhook\'a bağlıdır; bu alan eski tip webhook\'larda geçerlidir.' },
    ],
  },
  {
    id: 'jira', name: 'Jira', summary: 'Hata kayıtlarını Jira\'da kayıt olarak açar.',
    does: [
      'Hata detayındaki "Jira\'ya aktar" düğmesi kaydı Jira\'da açar; anahtar (ör. QA-12) hata kaydına bağlanır',
      'İsteğe bağlı: koşumdan ya da elle açılan her yeni hata kaydı otomatik aktarılır',
      'Önem derecesi Jira önceliğine çevrilir (Kritik → Highest …)',
    ],
    setup: 'Jira Cloud adresiniz, hesap e-postanız ve id.atlassian.com → Security → API token adresinden oluşturduğunuz token.',
    fields: [
      { key: 'jiraUrl', label: 'Jira adresi', type: 'text', required: true, placeholder: 'https://sirketiniz.atlassian.net' },
      { key: 'jiraEmail', label: 'Hesap e-postası', type: 'text', required: true, placeholder: 'qa@sirket.com' },
      { key: 'jiraToken', label: 'API token', type: 'secret', required: true },
      { key: 'jiraProjectKey', label: 'Proje anahtarı', type: 'text', required: true, placeholder: 'QA', upper: true },
      { key: 'jiraIssueType', label: 'Kayıt tipi', type: 'text', placeholder: 'Bug', hint: 'Jira projenizdeki tip adı (Bug, Hata, Task…).' },
      { key: 'autoCreate', label: 'Yeni hata kayıtlarını otomatik aktar', type: 'checkbox' },
    ],
  },
  {
    id: 'github', name: 'GitHub', summary: 'Kod gönderildiğinde ya da deploy bittiğinde otomasyon testlerini koşturur, sonucu commit\'e yazar.',
    does: [
      'Seçilen dala push (veya başarılı deployment) olunca projenin otomasyon testleri koşar',
      'Commit\'e "NG Test / otomasyon" durumu yazılır: sürüyor → geçti / kaldı, koşum bağlantısıyla',
      'İstek imzası webhook secret ile doğrulanır',
    ],
    setup: 'Depo → Settings → Webhooks → Add webhook: aşağıdaki adres, içerik tipi application/json, aynı secret. Token\'ın "Commit statuses: write" izni olmalı.',
    fields: [
      { key: 'githubRepo', label: 'Depo', type: 'text', required: true, placeholder: 'sirket/web-magaza' },
      { key: 'githubToken', label: 'Erişim token\'ı', type: 'secret', required: true, placeholder: 'github_pat_…' },
      { key: 'githubSecret', label: 'Webhook secret', type: 'secret', required: true, hint: 'GitHub\'daki webhook ayarına aynı değeri girin.' },
      { key: 'projectId', label: 'Koşulacak proje', type: 'project', required: true },
      { key: 'environmentId', label: 'Ortam', type: 'environment', hint: 'Seçilirse adresi ve değişkenleri testlere aktarılır.' },
      { key: 'triggerOn', label: 'Tetikleyici', type: 'select', options: [['push', 'Dala push'], ['deployment', 'Başarılı deployment']] },
      { key: 'githubBranch', label: 'Dal', type: 'text', placeholder: 'main', showIf: (f) => f.triggerOn !== 'deployment' },
      { key: 'reportStatus', label: 'Sonucu commit durumu olarak yaz', type: 'checkbox' },
    ],
  },
];

export const EVENT_LABEL = {
  test: 'Bağlantı denemesi', run_finished: 'Koşum bildirimi', defect_created: 'Hata bildirimi',
  issue_created: 'Jira kaydı', push: 'Push', deployment_status: 'Deployment',
};

export const isMasked = (v) => typeof v === 'string' && v.startsWith('••••');

export const missingRequired = (provider, form) =>
  provider.fields.filter(f => f.required && (f.showIf ? f.showIf(form) : true) && (form[f.key] === '' || form[f.key] == null)).map(f => f.label);
