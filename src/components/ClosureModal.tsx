import { useMemo, useState } from 'react';
import type { ID } from '../types';
import { Button, Field, Modal, TextInput } from './ui';
import { DateField } from './forms';
import { closeDays, previewClosure } from '../store/actions';
import { todayISO } from '../lib/dates';
import { toast } from '../store/ui';
import { plural } from '../lib/util';

/** Déclare une période sans cours : le calendrier est mis à jour et la suite des cycles est décalée. */
export function ClosureModal({ yearId, initialDate, onClose }: { yearId: ID; initialDate?: string; onClose: () => void }) {
  const [start, setStart] = useState<string>(initialDate ?? todayISO());
  const [end, setEnd] = useState<string>(initialDate ?? todayISO());
  const [label, setLabel] = useState('Journée sans cours');

  const preview = useMemo(() => previewClosure(yearId, start, end < start ? start : end), [yearId, start, end]);

  const apply = () => {
    const last = end < start ? start : end;
    const r = closeDays(yearId, start, last, label.trim());
    toast(
      `${label || 'Période'} ajoutée : ${plural(r.moved, 'séance')} décalée${r.moved > 1 ? 's' : ''}.`,
      { tone: 'success', ms: 10000, action: { label: 'Annuler', run: r.undo } },
    );
    onClose();
  };

  return (
    <Modal
      title="Journée ou période sans cours"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={apply}>
            Décaler les séances
          </Button>
        </>
      }
    >
      <p className="muted">
        Sortie scolaire, grève, intempéries, salle indisponible… La période est ajoutée au calendrier et, dans chaque cycle concerné, les séances suivantes glissent sur les prochains créneaux.
      </p>
      <Field label="Motif">
        <TextInput value={label} onChange={setLabel} />
      </Field>
      <div className="grid grid-2">
        <Field label="Du">
          <DateField
            value={start}
            onChange={(v) => {
              if (!v) return;
              setStart(v);
              if (end < v) setEnd(v);
            }}
          />
        </Field>
        <Field label="Au (inclus)">
          <DateField value={end} min={start} onChange={(v) => v && setEnd(v)} />
        </Field>
      </div>
      <div className="callout">
        {preview.lessons === 0 ? (
          <>Aucune séance planifiée sur cette période : le calendrier sera simplement mis à jour.</>
        ) : (
          <>
            <strong>{plural(preview.lessons, 'séance')}</strong> concernée{preview.lessons > 1 ? 's' : ''}, dans <strong>{plural(preview.cycles, 'cycle')}</strong>. La suite de chaque cycle sera décalée.
            {preview.standalone > 0 && <> {plural(preview.standalone, 'séance isolée')} (hors cycle) {preview.standalone > 1 ? 'devront' : 'devra'} être déplacée{preview.standalone > 1 ? 's' : ''} à la main.</>}
          </>
        )}
      </div>
      <p className="muted small">Vous pourrez annuler juste après la validation.</p>
    </Modal>
  );
}
