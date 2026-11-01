import { useRef, useState } from 'react';
import { BookmarkPlus, Mic, MicOff } from 'lucide-react';
import { extractSituations } from '../store/actions';
import type { Lesson } from '../types';
import { useDictation } from '../lib/dictation';
import { sentimentOf, themesOf } from '../lib/suggestions';
import { EVAL_KINDS, LEVELS, parseLevels, total, type Levels } from '../lib/levels';
import { Button, Modal, TextArea } from './ui';
import { useData } from '../store/data';
import { cls } from '../lib/util';
import { toast } from '../store/ui';

export const RATINGS = [
  { value: 1, emoji: '😕', label: 'À revoir' },
  { value: 2, emoji: '🙂', label: 'Correct' },
  { value: 3, emoji: '😀', label: 'Très bien' },
];

/** Bilan en quelques secondes après une séance : faite ou annulée, ressenti, à ajuster, remarque. */
export function ReviewModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [status, setStatus] = useState<Lesson['status']>(lesson.status === 'planned' ? 'done' : lesson.status);
  const [rating, setRating] = useState<number | null>(lesson.rating);
  const [adjust, setAdjust] = useState(lesson.adjust);
  const [bilan, setBilan] = useState(lesson.bilan);

  const [evalKind, setEvalKind] = useState<Lesson['evalKind']>(lesson.evalKind);
  const [levels, setLevels] = useState<Levels>(lesson.levels ?? [0, 0, 0, 0]);
  const evalRef = useRef(evalKind);
  evalRef.current = evalKind;
  const bilanRef = useRef(bilan);
  bilanRef.current = bilan;
  const ratingRef = useRef(rating);
  ratingRef.current = rating;

  // Dictée : chaque phrase s'ajoute au bilan ; ressenti et « à ajuster » sont devinés si pas déjà renseignés.
  const dictation = useDictation((t) => {
    const next = bilanRef.current.trim() ? `${bilanRef.current.trim()} ${t}` : t;
    setBilan(next);
    if (ratingRef.current === null) {
      const s = sentimentOf(next);
      if (s) setRating(s);
    }
    if (evalRef.current) {
      const parsed = parseLevels(next);
      if (parsed) setLevels(parsed);
    }
    const themes = themesOf(next);
    if ([...themes].some((x) => x !== 'absent')) setAdjust(true);
  });
  const found = [...themesOf(bilan)].length;

  const save = () => {
    dictation.stop();
    useData.getState().patch('lessons', lesson.id, {
      status,
      rating: status === 'cancelled' ? null : rating,
      adjust,
      bilan,
      evalKind,
      levels: evalKind && total(levels) > 0 ? levels : null,
    });
    toast('Bilan enregistré', { tone: 'success' });
    onClose();
  };

  return (
    <Modal
      title={`Bilan — ${lesson.title || 'séance'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Plus tard
          </Button>
          <Button variant="primary" onClick={save}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="field-label">La séance a-t-elle eu lieu ?</span>
        <div className="ae-modes" role="group">
          {(
            [
              ['done', 'Faite'],
              ['cancelled', 'Annulée'],
              ['planned', 'Pas encore'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" className={cls('seg', status === v && 'seg-on')} onClick={() => setStatus(v)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {status !== 'cancelled' && (
        <div className="field">
          <span className="field-label">Comment s'est-elle passée ?</span>
          <div className="rating">
            {RATINGS.map((r) => (
              <button key={r.value} type="button" className={cls('rating-btn', rating === r.value && 'rating-on')} onClick={() => setRating(rating === r.value ? null : r.value)}>
                <span className="rating-emoji">{r.emoji}</span>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="field">
        <span className="field-label">Séance d'évaluation ?</span>
        <div className="ae-modes" role="group">
          <button type="button" className={cls('seg', evalKind === null && 'seg-on')} onClick={() => setEvalKind(null)}>
            Non
          </button>
          {(Object.keys(EVAL_KINDS) as Array<keyof typeof EVAL_KINDS>).map((k) => (
            <button key={k} type="button" className={cls('seg', evalKind === k && 'seg-on')} onClick={() => setEvalKind(k)}>
              {EVAL_KINDS[k].emoji} {EVAL_KINDS[k].label}
            </button>
          ))}
        </div>
      </div>
      {evalKind && (
        <div className="field">
          <span className="field-label">Niveau de la classe : combien d'élèves à chaque degré ? (sans noms)</span>
          <div className="levels-grid">
            {LEVELS.map((lv, i) => (
              <div key={lv.label} className="level-cell" style={{ ['--lv' as string]: lv.color }}>
                <strong>{lv.label}</strong>
                <div className="stepper">
                  <button type="button" aria-label={`Moins de ${lv.short}`} onClick={() => setLevels((c) => c.map((n, j) => (j === i ? Math.max(0, n - 1) : n)) as Levels)}>
                    −
                  </button>
                  <span>{levels[i]}</span>
                  <button type="button" aria-label={`Plus de ${lv.short}`} onClick={() => setLevels((c) => c.map((n, j) => (j === i ? n + 1 : n)) as Levels)}>
                    +
                  </button>
                </div>
                <span className="muted small">{lv.hint}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            Vous pouvez le dicter : « six débutants, dix en cours, huit acquis, deux avancés. » Les séances suivantes seront adaptées à ce niveau (propositions à accepter ou refuser).
          </p>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
        🔧 À ajuster ou à retravailler pour la prochaine fois
      </label>
      <div className="field">
        <span className="field-label">Bilan (à l'oral ou à l'écrit)</span>
        {dictation.supported ? (
          <button type="button" className={cls('dictate-btn', dictation.listening && 'dictate-on')} onClick={dictation.listening ? dictation.stop : dictation.start}>
            {dictation.listening ? <MicOff size={22} /> : <Mic size={22} />}
            <span>{dictation.listening ? 'Je vous écoute… touchez pour arrêter' : 'Dicter le bilan'}</span>
          </button>
        ) : (
          <p className="muted small">La dictée n'est pas disponible dans ce navigateur (essayez Chrome ou Safari). Sur téléphone, le micro du clavier fonctionne aussi dans la zone ci-dessous.</p>
        )}
        {dictation.error && <p className="error-text small">{dictation.error}</p>}
        {dictation.interim && <p className="muted small dictate-interim">… {dictation.interim}</p>}
        <TextArea value={bilan} onChange={setBilan} minRows={4} placeholder="Ce qui a marché, ce qu'il faut changer, élèves à suivre… Vous pouvez dire « virgule », « point », « à la ligne »." />
        {found > 0 && <p className="muted small">💡 {found} point{found > 1 ? 's' : ''} repéré{found > 1 ? 's' : ''} : des ajustements vous seront proposés sur la séance suivante.</p>}
      </div>
      <LibraryPicker lesson={lesson} />
    </Modal>
  );
}

/** Choisir des exercices de la séance et les envoyer dans la bibliothèque de situations. */
function LibraryPicker({ lesson }: { lesson: Lesson }) {
  const exercises = useData((s) => s.data.exercises);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const blocks = lesson.blocks.filter((b) => b.kind !== 'warmup' && b.kind !== 'cooldown');
  if (blocks.length === 0) return null;

  const known = new Set(Object.values(exercises).map((e) => `${e.title}\u0000${e.text}`));
  const inLibrary = (b: Lesson['blocks'][number]) => known.has(`${b.title || 'Sans titre'}\u0000${b.text}`);
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const send = () => {
    const { created } = extractSituations([lesson.id], { blockIds: [...picked] });
    toast(`${created} exercice${created > 1 ? 's' : ''} ajouté${created > 1 ? 's' : ''} à la bibliothèque`, { tone: 'success' });
    setPicked(new Set());
  };

  return (
    <div className="field">
      <span className="field-label">Ajouter à la bibliothèque</span>
      <div className="lib-picks">
        {blocks.map((b) => {
          const there = inLibrary(b);
          return (
            <button key={b.id} type="button" disabled={there} aria-pressed={picked.has(b.id)} className={cls('lib-pick', picked.has(b.id) && 'lib-pick-on')} onClick={() => toggle(b.id)}>
              <span>{there ? '✓' : picked.has(b.id) ? '☑' : '☐'}</span>
              <span>
                {b.title || 'Sans titre'}
                {there && <span className="muted small"> · déjà dans la bibliothèque</span>}
              </span>
            </button>
          );
        })}
      </div>
      <Button size="sm" icon={<BookmarkPlus size={15} />} onClick={send} disabled={picked.size === 0}>
        Valider ({picked.size})
      </Button>
    </div>
  );
}
