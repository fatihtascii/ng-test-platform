import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui';
import { Field } from '../../components/ui/data';
import { Drawer } from '../../components/ui/overlay';
import { inputCls, textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { defectsApi, fetchAllTestCases } from '../../api';
import { STATUSES, SEVERITIES, defectIdent, userName } from './model';

/**
 * Hata kaydı oluşturma / düzenleme.
 * initial: başka sayfadan gelindiğinde ön doldurma ({ project_id, test_case_id, test_run_id, title })
 */
const DefectFormDrawer = ({ defect, initial = {}, projects, assignees, onClose, onSaved }) => {
  const editing = Boolean(defect);
  const [form, setForm] = useState(() => ({
    title: defect?.title ?? initial.title ?? '',
    description: defect?.description ?? initial.description ?? '',
    project_id: String(defect?.project_id ?? initial.project_id ?? (projects.length === 1 ? projects[0].id : '')),
    severity: defect?.severity ?? initial.severity ?? 'Orta',
    status: defect?.status ?? 'Open',
    assignee_id: defect?.assignee_id != null ? String(defect.assignee_id) : (initial.assignee_id ? String(initial.assignee_id) : ''),
    test_case_id: initial.test_case_id ? String(initial.test_case_id) : '',
  }));
  const [cases, setCases] = useState({ projectId: null, items: [] });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // İlgili test case seçimi yalnızca yeni kayıtta; seçili projenin case'leri yüklenir
  useEffect(() => {
    if (editing || !form.project_id) return undefined;
    let alive = true;
    fetchAllTestCases({ project_id: form.project_id })
      .then(items => { if (alive) setCases({ projectId: form.project_id, items }); })
      .catch(() => { if (alive) setCases({ projectId: form.project_id, items: [] }); });
    return () => { alive = false; };
  }, [editing, form.project_id]);

  const projectCases = useMemo(
    () => (cases.projectId === form.project_id ? cases.items : []),
    [cases, form.project_id]);

  const submit = async () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Başlık gerekli.';
    if (!form.project_id) errs.project_id = 'Proje seçin.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const body = {
      title: form.title.trim(), description: form.description.trim() || null,
      project_id: Number(form.project_id), severity: form.severity, status: form.status,
      assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
    };
    try {
      let data;
      if (editing) {
        ({ data } = await defectsApi.update(defect.id, body));
      } else {
        const caseId = form.test_case_id && projectCases.some(c => String(c.id) === form.test_case_id) ? Number(form.test_case_id) : null;
        ({ data } = await defectsApi.create({ ...body, test_case_id: caseId, test_run_id: initial.test_run_id ? Number(initial.test_run_id) : null }));
      }
      toast.success(editing ? `${defectIdent(data.id)} güncellendi.` : `${defectIdent(data.id)} oluşturuldu.`);
      onSaved(data, !editing);
    } catch (e) { toast.error(e.message || 'Kaydedilemedi.'); setSaving(false); }
  };

  return (
    <Drawer open onClose={saving ? () => {} : onClose} size="md"
      eyebrow={editing ? defectIdent(defect.id) : 'Yeni hata'} title={editing ? 'Hata kaydını düzenle' : 'Hata kaydı aç'}
      footer={<>
        <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={saving}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} loading={saving}>{editing ? 'Kaydet' : 'Oluştur'}</Button>
      </>}>
      <form className="space-y-4 p-5" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Field label="Başlık" htmlFor="d-title" required error={errors.title}
          hint={editing && defect.source === 'auto' ? 'Koşumdan üretilen kayıtta başlık, koşum tekrar hata verdiğinde yeniden yazılır.' : undefined}>
          <input id="d-title" data-autofocus value={form.title} onChange={set('title')} maxLength={500}
            placeholder="Örn. Sepete ürün eklenince toplam güncellenmiyor" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Proje" htmlFor="d-project" required error={errors.project_id}>
            <select id="d-project" value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value, test_case_id: '' }))} className={inputCls}>
              <option value="">Seçin</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Önem" htmlFor="d-sev">
            <select id="d-sev" value={form.severity} onChange={set('severity')} className={inputCls}>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Durum" htmlFor="d-status">
            <select id="d-status" value={form.status} onChange={set('status')} className={inputCls}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Atanan" htmlFor="d-assignee">
            <select id="d-assignee" value={form.assignee_id} onChange={set('assignee_id')} className={inputCls}>
              <option value="">Atanmamış</option>
              {assignees.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
            </select>
          </Field>
        </div>
        {!editing && (
          <Field label="İlgili test case" htmlFor="d-case" hint="İsteğe bağlı. Seçilirse case kayda hatalı test olarak eklenir.">
            <select id="d-case" value={form.test_case_id} onChange={set('test_case_id')} className={inputCls} disabled={!form.project_id}>
              <option value="">{form.project_id ? 'Yok' : 'Önce proje seçin'}</option>
              {projectCases.map(c => <option key={c.id} value={c.id}>TC-{c.id} · {c.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Açıklama" htmlFor="d-desc" hint="Tekrar etme adımları, beklenen ve gerçekleşen sonuç, ortam bilgisi.">
          <textarea id="d-desc" rows={8} value={form.description} onChange={set('description')} className={textareaCls}
            placeholder={'Adımlar:\n1. …\n\nBeklenen: …\nGerçekleşen: …'} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
};

export default DefectFormDrawer;
