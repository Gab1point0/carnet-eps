import { useMemo, useRef, useState } from 'react';
import { Check, Loader, Mic, MicOff, X } from 'lucide-react';
import type { Lesson } from '../types';
import { Button, Modal, TextArea } from './ui';
import { Markdown } from './Markdown';
import { useData } from '../store/data';
import { teachingCtx } from './AiBlockTools';
import { confirmDialog, toast } from '../store/ui';
import { useDictation } from '../lib/dictation';
import { applyChanges, emptyDraft, fieldLabel, ingest, type Change, type Draft } from '../lib/voiceLesson';
import { aiReady } from '../lib/ai';
import { aiIngest, type TeachingCtx } from '../lib/aiTasks';
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

  const ctx: TeachingCtx = useMemo(() => teachingCtx(data, lesson), [data, lesson]);
  const useAi = aiReady();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const hear = async (text: string) => {
    setNotice('');
    let r;
    if (useAi) {
      setBusy(true);
      try {
        r = await aiIngest(draftRef.current, lesson, text, ctx);
      } catch (e) {
        // Claude indisponible : rien n'est perdu, les mots-clés prennent le relais.
        setNotice(`${e instanceof Error ? e.message : 'Claude est indisponible.'} Cette partie a été comprise avec les mots-clés.`);
        r = ingest(draftRef.current, lesson, text, ctx);
      } finally {
        setBusy(false);
      }
    } else r = ingest(draftRef.current, lesson, text, ctx);
    draftRef.current = r.draft;
    setDraft(r.draft);
    setLog((cur) => [...cur, ...r.understood]);
    setUnclear(r.unclear);
  };
  // Ce qui est dicté attend dans la zone de texte : une pause ne valide rien, seul le bouton termine la partie.
  const dictation = useDictation((text) => setTyped((cur) => (cur.trim() ? `${cur.trim()} ${text}` : text)));

  const kept = draft.changes.filter((c) => !rejected.has(c.id));
  const toggle = (id: string) =>
    setRejected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** « J'ai terminé cette partie » : ce qui a été dit devient un changement proposé. */
  const finishPart = async () => {
    const text = `${typed} ${dictation.flush()}`.trim();
    if (!text) return;
    setTyped('');
    await hear(text);
  };

  const openReview = async () => {
    dictation.stop();
    await finishPart();
    setReview(true);
  };
  const hasPending = !!typed.trim() || !!dictation.interim.trim();
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
            <Button onClick={openReview} disabled={busy || (draft.changes.length === 0 && !hasPending)}>
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
            <TextArea value={typed} onChange={setTyped} minRows={3} placeholder="Ce que vous dites s'écrit ici. Prenez votre temps : les pauses ne valident rien. Vous pouvez aussi écrire ou corriger." />
            <Button variant="primary" icon={<Check size={16} />} onClick={finishPart} disabled={!hasPending || busy}>
              J'ai terminé cette partie
            </Button>
          </div>

          {busy && (
            <p className="muted small row" style={{ gap: 6 }}>
              <Loader size={14} className="spin" /> Claude met en forme cette partie…
            </p>
          )}
          {notice && <p className="error-text small">{notice}</p>}
          {!useAi && <p className="muted small">Mise en forme par mots-clés. Pour que Claude comprenne vos phrases, ajoutez une clé dans Réglages, « Assistant IA ».</p>}
          {unclear.map((u) => (
            <p key={u} className="error-text small">
              {u}
            </p>
          ))}

          {draft.changes.length === 0 ? (
            <div className="muted small">
              <p>Dites une partie de la séance, puis touchez « J'ai terminé cette partie ». Par exemple :</p>
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
                  {!off && (c.heard ?? c.spoken) && (
                    <p className="muted small">
                      Compris à partir de : « {c.heard ?? c.spoken} »
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
