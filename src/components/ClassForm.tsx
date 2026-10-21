import { useState } from 'react';
import type { Klass } from '../types';
import { Button, ColorSwatches, Field, Modal, NumberInput, TextInput } from './ui';
import { SlotsEditor } from './forms';
import { CLASS_COLORS } from '../lib/defaults';
import { useData } from '../store/data';

/** Création / modification d'une classe (nom, niveau, effectif, couleur, emploi du temps). */
export function ClassFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Klass;
  onSave: (k: Klass) => void;
  onClose: () => void;
}) {
  const [k, setK] = useState<Klass>(initial);
  const levels = useData((s) => s.data.settings.levels);
  const patch = (p: Partial<Klass>) => setK((cur) => ({ ...cur, ...p }));
  const isNew = !initial.name;

  return (
    <Modal
      title={isNew ? 'Nouvelle classe' : 'Modifier la classe'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" disabled={!k.name.trim()} onClick={() => onSave({ ...k, name: k.name.trim() })}>
            {isNew ? 'Créer la classe' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <div className="grid grid-2">
        <Field label="Nom de la classe">
          <TextInput value={k.name} onChange={(v) => patch({ name: v })} placeholder="Ex. 6e A" autoFocus />
        </Field>
        <Field label="Niveau">
          <TextInput value={k.level} onChange={(v) => patch({ level: v })} placeholder="Ex. 6e" list="levels-list" />
          <datalist id="levels-list">
            {levels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Effectif (facultatif)">
          <NumberInput value={k.students} min={0} max={60} onChange={(v) => patch({ students: v })} />
        </Field>
        <div className="field">
          <span className="field-label">Couleur</span>
          <ColorSwatches value={k.color} onChange={(c) => patch({ color: c })} colors={CLASS_COLORS} />
        </div>
        <Field label="Cours en commun avec un collègue (facultatif)" hint="Laissez vide si la classe n'est pas partagée.">
          <TextInput value={k.sharedWith ?? ''} onChange={(v) => patch({ sharedWith: v })} placeholder="Ex. un collègue, classe de M. Martin…" />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Emploi du temps hebdomadaire</span>
        <SlotsEditor slots={k.slots} onChange={(slots) => patch({ slots })} />
        <span className="field-hint">Les séances d'un cycle seront datées automatiquement sur ces créneaux (vacances et jours fériés exclus).</span>
      </div>
    </Modal>
  );
}
