import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui';
import { Modal } from '../../components/ui/overlay';
import { inputCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { projectsApi } from '../../api';

/**
 * Proje silme onayı. Silinecek bağlı kayıtları sayar ve proje adının yazılmasını ister,
 * çünkü işlem case, plan, koşum, ortam ve hata kayıtlarını da kalıcı olarak siler.
 */
const DeleteProjectDialog = ({ project, onClose, onDeleted }) => {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const s = project.stats || {};
  const items = [
    [s.cases, 'test case'], [s.plans, 'test planı'], [s.runs, 'koşum'], [s.environments, 'ortam'], [s.open_defects, 'açık hata kaydı'],
  ].filter(([n]) => n > 0);
  const ok = typed.trim() === project.name;

  const remove = async () => {
    setBusy(true);
    try {
      await projectsApi.remove(project.id);
      toast.success(`${project.name} silindi.`);
      onDeleted(project);
    } catch (e) { toast.error(e.message || 'Silinemedi.'); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} dismissable={!busy} size="sm" icon={<AlertTriangle size={18} className="text-rose-500" />}
      title={`${project.name} silinsin mi?`}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
        <Button variant="danger" onClick={remove} disabled={!ok} loading={busy}>Projeyi sil</Button>
      </>}>
      <form className="space-y-3 text-sm" onSubmit={e => { e.preventDefault(); if (ok) remove(); }}>
        {items.length > 0 ? (
          <>
            <p className="text-slate-600 dark:text-slate-300">Projeyle birlikte şunlar da kalıcı olarak silinir:</p>
            <ul className="list-inside list-disc text-slate-700 dark:text-slate-200">
              {items.map(([n, l]) => <li key={l}><b className="font-semibold tabular-nums">{n}</b> {l}</li>)}
            </ul>
          </>
        ) : <p className="text-slate-600 dark:text-slate-300">Projede kayıt yok.</p>}
        <p className="text-slate-600 dark:text-slate-300">Bu işlem geri alınamaz. Onaylamak için proje adını yazın:</p>
        <input data-autofocus value={typed} onChange={e => setTyped(e.target.value)} placeholder={project.name} aria-label="Proje adı" className={inputCls} autoComplete="off" />
      </form>
    </Modal>
  );
};

export default DeleteProjectDialog;
