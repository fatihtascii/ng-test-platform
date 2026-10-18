import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug } from 'lucide-react';
import { Button } from '../../components/ui';
import { Modal } from '../../components/ui/overlay';
import { textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { defectsApi } from '../../api';
import { caseIdent } from '../test-cases/model';
import { ITEM_STATUSES, ITEM_LABEL, planIdent } from './model';

const ON = { 'Bekliyor': 'bg-slate-700 text-white ring-slate-700', 'Başarılı': 'bg-emerald-600 text-white ring-emerald-600', 'Başarısız': 'bg-rose-600 text-white ring-rose-600', 'Atlandı': 'bg-amber-500 text-white ring-amber-500' };

/** Tek kalemin sonucu ve notu. Kaldı ise ayrı hata kaydı da açılabilir. */
const PlanItemDialog = ({ item, plan, readOnly, canDefect, onClose, onSave }) => {
  const [status, setStatus] = useState(item.run_status);
  const [note, setNote] = useState(item.note || '');
  const [busy, setBusy] = useState(null);
  const dirty = status !== item.run_status || note !== (item.note || '');

  const save = async () => {
    setBusy('save');
    const ok = await onSave(status, note.trim() || null);
    if (ok) onClose(); else setBusy(null);
  };

  const defect = async () => {
    setBusy('defect');
    try {
      const { data } = await defectsApi.create({
        title: `${item.test_case_title || caseIdent(item.test_case_id)} — ${plan.title}`.slice(0, 500),
        description: `${planIdent(plan.id)} planında kaldı.\n\n${note.trim()}`,
        severity: item.test_case_priority || 'Orta', status: 'Open',
        project_id: plan.project_id, test_case_id: item.test_case_id,
        failed_details: [{ case_id: item.test_case_id, title: item.test_case_title, error: note.trim() || null, severity: item.test_case_priority }],
      });
      toast.success(`BUG-${data.id} açıldı.`);
    } catch (e) { toast.error(e.message || 'Hata kaydı açılamadı.'); }
    finally { setBusy(null); }
  };

  return (
    <Modal open onClose={onClose} dismissable={!busy} size="md" title={item.test_case_title || 'Silinmiş case'}
      description={`${caseIdent(item.test_case_id)} · ${plan.title}`}
      footer={readOnly ? <Button onClick={onClose}>Kapat</Button> : <>
        <Link to={`/test-cases?case=${item.test_case_id}`} className="mr-auto text-sm text-slate-500 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white">Case'i aç</Link>
        <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>Vazgeç</Button>
        <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={!dirty}>Kaydet</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sonuç">
          {ITEM_STATUSES.map(s => (
            <button key={s} type="button" role="radio" aria-checked={status === s} disabled={readOnly} onClick={() => setStatus(s)}
              className={`h-9 rounded-lg px-3.5 text-sm font-medium ring-1 ring-inset disabled:cursor-default ${status === s ? ON[s] : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800'}`}>
              {ITEM_LABEL[s]}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="item-note" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{status === 'Başarısız' ? 'Ne oldu?' : 'Not'}</label>
          <textarea id="item-note" data-autofocus rows={4} value={note} onChange={e => setNote(e.target.value)} readOnly={readOnly}
            placeholder={status === 'Başarısız' ? 'Gözlenen davranış, hata mesajı, ortam…' : 'İsteğe bağlı'} className={textareaCls} />
        </div>
        {status === 'Başarısız' && canDefect && !readOnly && (
          <Button size="sm" icon={<Bug size={13} />} onClick={defect} loading={busy === 'defect'} disabled={!note.trim()}
            title={note.trim() ? undefined : 'Önce ne olduğunu yazın'}>Hata kaydı aç</Button>
        )}
      </div>
    </Modal>
  );
};

export default PlanItemDialog;
