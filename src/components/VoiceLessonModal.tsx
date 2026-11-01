import { useMemo, useRef, useState } from 'react';
import { Check, Mic, MicOff, X } from 'lucide-react';
import type { Lesson } from '../types';
import { Button, Modal, TextArea } from './ui';
import { Markdown } from './Markdown';
import { useData } from '../store/data';
import { activityOf } from '../store/selectors';
import { confirmDialog, toast } from '../store/ui';
import { useDictation } from '../lib/dictation';
import { applyChanges, emptyDraft, fieldLabel, ingest, type Change, type Draft, type VoiceCtx } from '../lib/voiceLesson';
import { BLOCK_KINDS } from '../lib/defaults';
import { durationOf } from '../lib/dates';
import { cls } from '../lib/util';

const OP_LABEL: Record<Change['op'], string> = { add: 'Ajouter', update: 'Modifier', remove: 'Retirer', field: 'Renseigner' };

/** Dicter une séance : les phrases deviennent des changements proposés, à garder ou non un par un avant de les appliquer. */
export function VoiceLessonModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const data = useData((s) => s.data);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [review, setReview] = useState(false);
  const [typed, setTyped] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [unclear, setUnclear] = useState<string[]>([]);

  const ctx: VoiceCtx = useMemo(() => {
    const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
    const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
    return {
      students: klass?.students ?? null,
      activity: activityOf(data, lesson.activityId ?? cycle?.activityId ?? null)?.name ?? '',
      planned: lesson.start && lesson.end ? durationOf(lesson.start, lesson.end) : 0,
      activities: data.settings.activities.map((a) => a.name),
    };
  }, [data, lesson]);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const hear = (text: string) => {
    const r = ingest(draftRef.current, lesson, text, ctx);
    draftRef.current = r.draft;
    setDraft(r.draft);
    setLog((cur) => [...cur, ...r.understood]);
    setUnclear(r.unclear);
  };
  const dictation = useDictation(hear);

  const kept = draft.changes.filter((c) => !rejected.has(c.id));
  const toggle = (id: string) =>
    setRejected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sendTyped = () => {
    if (!typed.trim()) return;
    hear(typed);
    setTyped('');
  };

  const openReview = () => {
    dictation.stop();
    setReview(true);
  };
  /** Retour à la dictée : ce qui n'a pas été gardé disparaît, pour être redit autrement. */
  const backToDictation = () => {
    const next = { changes: kept, lastId: kept.some((c) => c.id === draft.lastId) ? draft.lastId : null };
    draftRef.current = next;
    setDraft(next);
    setRejected(new Set());
    setReview(false);
  };

  const apply = () => {
    const before: Partial<Lesson> = { blocks: lesson.blocks, objective: lesson.objective, materials: lesson.materials, safety: lesson.safety, title: lesson.title };
    useData.getState().patch('lessons', lesson.id, applyChanges(lesson, kept));
    toast(`${kept.length} changement${kept.length > 1 ? 's' : ''} appliqué${kept.length > 1 ? 's' : ''} à la séance`, {
      tone: 'success',
      ms: 10000,
      action: { label: 'Annuler', run: () => useData.getState().patch('lessons', lesson.id, before) },
    });
    onClose();
  };

  const close = async () => {
    dictation.stop();
    if (draft.changes.length) {
      const ok = await confirmDialog({ title: 'Abandonner cette dictée ?', message: 'Les changements proposés ne seront pas appliqués.', confirmLabel: 'Abandonner', danger: true });
      if (!ok) return;
    }
    onClose();
  };

  const after = applyChanges(lesson, kept).blocks ?? [];
  const totalAfter = after.reduce((s, b) => s + (b.minutes || 0), 0);

  return (
    <Modal
      title={review ? 'Changements à valider' : 'Dicter la séance'}
      onClose={close}
      footer={
        review ? (
          <>
            <Button variant="ghost" onClick={backToDictation}>
              Continuer à dicter
            </Button>
            <Button variant="primary" icon={<Check size={16} />} onClick={apply} disabled={kept.length === 0}>
              Appliquer {kept.length} changement{kept.length > 1 ? 's' : ''}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Fermer
            </Button>
            <Button variant="primary" onClick={openReview} disabled={draft.changes.length === 0}>
              Voir les changements ({draft.changes.length})
            </Button>
          </>
        )
      }
    >
      {!review && (
        <>
          {dictation.supported ? (
            <button type="button" className={cls('dictate-btn', dictation.listening && 'dictate-on')} onClick={dictation.listening ? dictation.stop : dictation.start}>
              {dictation.listening ? <MicOff size={22} /> : <Mic size={22} />}
              <span>{dictation.listening ? 'Je vous écoute… touchez pour arrêter' : 'Parler'}</span>
            </button>
          ) : (
            <p className="muted small">La dictée n'est pas disponible dans ce navigateur (essayez Chrome ou Safari). Vous pouvez utiliser le micro du clavier dans la zone ci-dessous.</p>
          )}
          {dictation.error && <p className="error-text small">{dictation.error}</p>}
          {dictation.interim && <p className="muted small dictate-interim">… {dictation.interim}</p>}

          <div className="voice-type">
            <TextArea value={typed} onChange={setTyped} minRows={2} placeholder="Ou écrivez ici : « échauffement 15 minutes, éducatifs puis footing »" />
            <Button size="sm" onClick={sendTyped} disabled={!typed.trim()}>
              Ajouter
            </Button>
          </div>

          {unclear.map((u) => (
            <p key={u} className="error-text small">
              {u}
            </p>
          ))}

          {draft.changes.length === 0 ? (
            <div className="muted small">
              <p>Dites ce que vous voulez, en une fois ou petit à petit. Par exemple :</p>
              <ul>
                <li>« Échauffement 15 minutes, éducatifs puis footing »</li>
                <li>« Une situation de match où les points sont bonifiés quand on tape en revers »</li>
                <li>« Finalement l'échauffement 20 minutes »</li>
                <li>« Pas en revers mais en coup droit »</li>
                <li>« Ajoute du gainage à l'échauffement », « Enlève le match »</li>
              </ul>
            </div>
          ) : (
            <>
              <p className="field-label">Ce qui sera proposé</p>
              <ul className="voice-summary">
                {draft.changes.map((c) => (
                  <li key={c.id} className={cls(c.id === draft.lastId && 'voice-last')}>
                    <Summary c={c} />
                  </li>
                ))}
              </ul>
              {log.length > 0 && <p className="muted small">Dernière action : {log[log.length - 1]}</p>}
            </>
          )}
        </>
      )}

      {review && (
        <>
          <p className="muted small">
            Gardez ou écartez chaque changement. Pour redire ce qui a été mal compris, écartez-le puis touchez « Continuer à dicter ».
            {ctx.planned > 0 && ` Après validation : ${totalAfter} min de contenu pour un créneau de ${ctx.planned} min.`}
          </p>
          <div className="stack">
            {draft.changes.map((c) => {
              const off = rejected.has(c.id);
              return (
                <div key={c.id} className={cls('voice-change', off && 'voice-off')}>
                  <div className="row-between">
                    <strong>
                      <Summary c={c} />
                    </strong>
                    <div className="row" style={{ gap: 6 }}>
                      <Button size="sm" variant={off ? undefined : 'primary'} icon={<Check size={14} />} onClick={() => off && toggle(c.id)}>
                        Garder
                      </Button>
                      <Button size="sm" variant={off ? 'danger' : undefined} icon={<X size={14} />} onClick={() => !off && toggle(c.id)}>
                        Ne pas garder
                      </Button>
                    </div>
                  </div>
                  {!off && c.op !== 'remove' && c.op !== 'field' && <Markdown text={c.text} />}
                  {!off && c.op !== 'remove' && c.op !== 'field' && c.materials && <Markdown text={c.materials} />}
                  {!off && c.spoken && (
                    <p className="muted small">
                      Compris à partir de : « {c.spoken} »
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

function Summary({ c }: { c: Change }) {
  if (c.op === 'field' && c.field) {
    return (
      <>
        {fieldLabel(c.field)} : {c.value}
      </>
    );
  }
  const k = BLOCK_KINDS[c.kind];
  return (
    <>
      {k.icon} {OP_LABEL[c.op]} : {c.title || k.label}
      {c.op !== 'remove' && ` · ${c.estimated ? '≈ ' : ''}${c.minutes} min${c.estimated ? ' (estimé)' : ''}`}
    </>
  );
}
