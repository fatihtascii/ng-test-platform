import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Pencil, Trash2, RotateCcw, CircleDot, UserRound, Flag, Type, Sparkles } from 'lucide-react';
import { Avatar, Button, Skeleton, StatusBadge } from '../../components/ui';
import { ConfirmDialog } from '../../components/ui/overlay';
import { textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { defectsApi } from '../../api';
import { relativeTime, formatDate } from '../test-runs/model';
import { STATUS_LABEL, STATUS_TONE, SEVERITY_TONE } from './model';

const Who = ({ a }) => <span className="font-medium text-slate-800 dark:text-slate-100">{a.user_name || (a.user_id ? 'Silinmiş kullanıcı' : 'Sistem')}</span>;

const Time = ({ iso }) => (
  <time dateTime={iso} title={formatDate(iso, true)} className="whitespace-nowrap text-xs text-slate-400">{relativeTime(iso)}</time>
);

/** Alan değişikliği satırı */
const ChangeLine = ({ a }) => {
  let icon = CircleDot, text;
  switch (a.kind) {
    case 'created':
      icon = Sparkles;
      text = <>kaydı açtı{a.body && <span className="text-slate-500 dark:text-slate-400"> — {a.body}</span>}</>;
      break;
    case 'status':
      text = <>durumu <StatusBadge tone={STATUS_TONE[a.from_value]}>{STATUS_LABEL[a.from_value] || a.from_value}</StatusBadge> → <StatusBadge tone={STATUS_TONE[a.to_value]}>{STATUS_LABEL[a.to_value] || a.to_value}</StatusBadge> yaptı</>;
      break;
    case 'reopened':
      icon = RotateCcw;
      text = <>kaydı yeniden açtı{a.body && <span className="text-slate-500 dark:text-slate-400"> — {a.body}</span>}</>;
      break;
    case 'severity':
      icon = Flag;
      text = <>önemi <StatusBadge tone={SEVERITY_TONE[a.from_value]}>{a.from_value}</StatusBadge> → <StatusBadge tone={SEVERITY_TONE[a.to_value]}>{a.to_value}</StatusBadge> yaptı</>;
      break;
    case 'assignee':
      icon = UserRound;
      text = !a.to_value ? <>atamayı kaldırdı{a.from_value && <> ({a.from_value})</>}</>
        : a.from_value ? <>atananı <b className="font-medium">{a.from_value}</b> → <b className="font-medium">{a.to_value}</b> yaptı</>
        : <><b className="font-medium">{a.to_value}</b> kişisine atadı</>;
      break;
    case 'title':
      icon = Type;
      text = <>başlığı değiştirdi <span className="text-slate-500 line-through dark:text-slate-400">{a.from_value}</span></>;
      break;
    default:
      text = a.kind;
  }
  const Icon = icon;
  return (
    <li className="relative flex gap-3 pl-1">
      <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 ${a.kind === 'reopened' ? 'text-rose-500' : 'text-slate-400'}`}>
        <Icon size={12} />
      </span>
      <p className="min-w-0 flex-1 py-0.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
        <Who a={a} /> {text} · <Time iso={a.created_at} />
      </p>
    </li>
  );
};

const CommentItem = ({ a, mine, canDelete, onEdit, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.body);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!draft.trim() || draft.trim() === a.body) { setEditing(false); return; }
    setSaving(true);
    const ok = await onEdit(a, draft.trim());
    setSaving(false);
    if (ok) setEditing(false);
  };
  return (
    <li className="relative flex gap-3">
      <Avatar user={{ full_name: a.user_name, username: a.user_name || '?' }} size="sm" className="relative z-10 mt-1 ml-1 ring-2 ring-white dark:ring-slate-900" />
      <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-sm dark:border-slate-800">
          <Who a={a} /><Time iso={a.created_at} />
          {a.updated_at && <span className="text-xs text-slate-400" title={formatDate(a.updated_at, true)}>(düzenlendi)</span>}
          {(mine || canDelete) && !editing && (
            <span className="ml-auto flex gap-0.5">
              {mine && <button type="button" onClick={() => { setDraft(a.body); setEditing(true); }} aria-label="Yorumu düzenle" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><Pencil size={13} /></button>}
              <button type="button" onClick={() => onDelete(a)} aria-label="Yorumu sil" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={13} /></button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="space-y-2 p-2">
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} className={textareaCls} aria-label="Yorum" autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Vazgeç</Button>
              <Button size="sm" variant="primary" onClick={save} loading={saving}>Kaydet</Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words px-3 py-2 text-sm text-slate-700 dark:text-slate-200">{a.body}</p>
        )}
      </div>
    </li>
  );
};

/**
 * Yorumlar ve değişiklik geçmişi tek zaman akışında.
 * refreshKey değişince yeniden yüklenir (ör. durum değişikliğinden sonra).
 */
const ActivityFeed = ({ defectId, refreshKey, canComment, me }) => {
  const [state, setState] = useState({ key: null, items: [], error: null });
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const loadKey = `${defectId}:${refreshKey}`;

  useEffect(() => {
    let alive = true;
    defectsApi.activity(defectId)
      .then(({ data }) => { if (alive) setState({ key: loadKey, items: data, error: null }); })
      .catch(e => { if (alive) setState({ key: loadKey, items: [], error: e.message || 'Geçmiş yüklenemedi.' }); });
    return () => { alive = false; };
  }, [defectId, loadKey]);

  const loading = state.key !== loadKey && !state.items.length;
  const items = state.items;
  const setItems = useCallback((fn) => setState(s => ({ ...s, items: fn(s.items) })), []);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const { data } = await defectsApi.addComment(defectId, text);
      setItems(list => [...list, data]);
      setBody('');
    } catch (e) { toast.error(e.message || 'Yorum eklenemedi.'); }
    finally { setSending(false); }
  };

  const edit = async (a, text) => {
    try {
      const { data } = await defectsApi.updateComment(defectId, a.id, text);
      setItems(list => list.map(x => x.id === a.id ? data : x));
      return true;
    } catch (e) { toast.error(e.message || 'Yorum güncellenemedi.'); return false; }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await defectsApi.removeComment(defectId, confirm.id);
      setItems(list => list.filter(x => x.id !== confirm.id));
      setConfirm(null);
    } catch (e) { toast.error(e.message || 'Yorum silinemedi.'); }
    finally { setDeleting(false); }
  };

  const comments = items.filter(a => a.kind === 'comment').length;

  return (
    <section aria-labelledby="activity-h">
      <h2 id="activity-h" className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
        <MessageSquare size={15} className="text-slate-400" /> Geçmiş ve yorumlar
        {comments > 0 && <span className="rounded bg-slate-100 px-1.5 text-xs font-normal tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{comments} yorum</span>}
      </h2>
      {state.error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{state.error}</p>}
      {loading ? (
        <div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-16 w-full" /><Skeleton className="h-5 w-1/2" /></div>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[16px] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
          {items.length === 0 && <li className="pl-10 text-sm text-slate-500">Henüz kayıt yok.</li>}
          {items.map(a => a.kind === 'comment'
            ? <CommentItem key={a.id} a={a} mine={me && a.user_id === me.id} canDelete={me && (a.user_id === me.id || me.role === 'admin')}
                onEdit={edit} onDelete={setConfirm} />
            : <ChangeLine key={a.id} a={a} />)}
        </ol>
      )}

      {canComment && (
        <form className="mt-4 flex gap-3" onSubmit={e => { e.preventDefault(); send(); }}>
          <Avatar user={me} size="sm" className="mt-1 ml-1" />
          <div className="min-w-0 flex-1 space-y-2">
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className={textareaCls} aria-label="Yeni yorum"
              placeholder="Yorum yazın: bulgular, kök neden, düzeltmenin hangi sürümde olduğu…"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
            <div className="flex items-center justify-between gap-2">
              <span className="hidden text-xs text-slate-400 sm:inline">Ctrl + Enter ile gönder</span>
              <Button type="submit" size="sm" variant="primary" disabled={!body.trim()} loading={sending} className="ml-auto">Yorum ekle</Button>
            </div>
          </div>
        </form>
      )}

      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={remove} loading={deleting}
        confirmLabel="Sil" title="Yorum silinsin mi?" description="Bu işlem geri alınamaz." />
    </section>
  );
};

export default ActivityFeed;
