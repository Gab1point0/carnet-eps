import { useState } from 'react';
import type { Lesson } from '../types';
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

  const save = () => {
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
        <span className="field-label">Remarque (facultatif)</span>
        <TextArea value={bilan} onChange={setBilan} minRows={3} placeholder="Ce qui a marché, ce qu'il faut changer, élèves à suivre…" />
      </div>
    </Modal>
  );
}
