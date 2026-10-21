import { useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import type { Lesson } from '../types';
import { useDictation } from '../lib/dictation';
import { sentimentOf, themesOf } from '../lib/suggestions';
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
    const themes = themesOf(next);
    if ([...themes].some((x) => x !== 'absent')) setAdjust(true);
  });
  const found = [...themesOf(bilan)].length;

  const save = () => {
    dictation.stop();
    useData.getState().patch('lessons', lesson.id, { status, rating: status === 'cancelled' ? null : rating, adjust, bilan });
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
    </Modal>
  );
}
