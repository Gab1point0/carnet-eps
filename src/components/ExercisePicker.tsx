import { useMemo, useState } from 'react';
import { Film, Search } from 'lucide-react';
import type { Exercise, ID } from '../types';
import { Modal, Select, TextInput } from './ui';
import { useData } from '../store/data';
import { activityOf, useExercises, useSettings } from '../store/selectors';
import { BLOCK_KINDS } from '../lib/defaults';
import { normalize } from '../lib/util';

/** Fenêtre de choix d'une situation dans la bibliothèque. */
export function ExercisePicker({
  initialActivity,
  onPick,
  onClose,
}: {
  initialActivity: ID | null;
  onPick: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const exercises = useExercises();
  const settings = useSettings();
  const data = useData((s) => s.data);
  const [q, setQ] = useState('');
  const [activity, setActivity] = useState<ID | ''>(initialActivity ?? '');

  const list = useMemo(() => {
    const nq = normalize(q);
    return exercises.filter(
      (e) =>
        (!activity || e.activityId === activity) &&
        (!nq || normalize(`${e.title} ${e.tags.join(' ')} ${e.text}`).includes(nq)),
    );
  }, [exercises, q, activity]);

  return (
    <Modal title="Ajouter depuis la bibliothèque" onClose={onClose} wide>
      <div className="grid grid-2">
        <div style={{ position: 'relative' }}>
          <TextInput value={q} onChange={setQ} placeholder="Rechercher une situation…" autoFocus style={{ paddingLeft: 36 }} />
          <Search size={17} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} />
        </div>
        <Select<string>
          value={activity}
          onChange={(v) => setActivity(v)}
          placeholder="Toutes les activités"
          options={settings.activities.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` }))}
        />
      </div>
      {exercises.length === 0 ? (
        <p className="muted">La bibliothèque est vide. Enregistrez une situation depuis une séance (menu « … » d'un bloc) ou créez-en dans la Bibliothèque.</p>
      ) : list.length === 0 ? (
        <p className="muted">Aucune situation ne correspond.</p>
      ) : (
        <div className="picker-list">
          {list.map((e) => {
            const act = activityOf(data, e.activityId);
            return (
              <button key={e.id} type="button" className="picker-item" onClick={() => onPick(e)}>
                <span className="picker-kind" style={{ background: BLOCK_KINDS[e.kind].color }} />
                <span className="grow">
                  <strong>{e.title || 'Sans titre'}</strong>
                  <span className="muted small">
                    {' '}
                    {act ? `${act.emoji} ${act.name}` : ''} · {e.minutes} min
                  </span>
                </span>
                {e.animation && <Film size={16} className="muted" />}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
