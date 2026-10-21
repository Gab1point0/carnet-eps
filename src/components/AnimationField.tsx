import { lazy, Suspense, useState } from 'react';
import { Film, Pencil, Trash2 } from 'lucide-react';
import type { Animation, CourtId } from '../types';
import { createAnimation } from '../animation/engine';
import { AnimationPlayer } from '../animation/Player';
import { Button } from './ui';
import { confirmDialog } from '../store/ui';

const Editor = lazy(() => import('../animation/Editor').then((m) => ({ default: m.AnimationEditor })));

/** Aperçu animé + boutons pour créer, modifier ou supprimer l'animation d'une situation. */
export function AnimationField({
  value,
  onChange,
  defaultCourt = 'blank',
  title,
}: {
  value: Animation | null;
  onChange: (a: Animation | null) => void;
  defaultCourt?: CourtId;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);

  const create = () => {
    onChange(createAnimation(defaultCourt));
    setEditing(true);
  };

  return (
    <div className="stack">
      {value ? (
        <>
          <AnimationPlayer animation={value} compact maxHeight="340px" />
          <div className="row">
            <Button size="sm" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
              Modifier l'animation
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={15} />}
              onClick={async () => {
                if (await confirmDialog({ title: "Supprimer l'animation ?", message: 'Le schéma et ses étapes seront perdus.', confirmLabel: 'Supprimer', danger: true })) {
                  onChange(null);
                }
              }}
            >
              Supprimer
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" icon={<Film size={16} />} onClick={create}>
          Ajouter une animation / un schéma
        </Button>
      )}
      {editing && value && (
        <Suspense fallback={null}>
          <Editor value={value} onChange={onChange} onClose={() => setEditing(false)} title={title} />
        </Suspense>
      )}
    </div>
  );
}
