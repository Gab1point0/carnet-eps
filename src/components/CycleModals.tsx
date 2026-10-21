import { useMemo, useState } from 'react';
import type { Cycle, ID, Klass } from '../types';
import { Button, Field, Modal, NumberInput, Select, Tabs, TextInput } from './ui';
import { ActivitySelect, DateField } from './forms';
import { useData } from '../store/data';
import { activityOf, classCycles, cycleLessons, useCurrentYear, useYearClasses } from '../store/selectors';
import { copyCycle, createCycleWithLessons, regenerateDates } from '../store/actions';
import { nextOccurrences } from '../lib/schedule';
import { addDays, formatDM, todayISO } from '../lib/dates';
import { toast } from '../store/ui';

/** Date de départ conseillée pour le prochain cycle d'une classe. */
export function suggestedStart(klass: Klass, yearStart: string, yearEnd: string): string {
  const data = useData.getState().data;
  const ends = classCycles(data, klass.id)
    .map((c) => c.endDate)
    .filter((d): d is string => !!d)
    .sort();
  const last = ends[ends.length - 1];
  if (last) return addDays(last, 1);
  const today = todayISO();
  return today >= yearStart && today <= yearEnd ? today : yearStart;
}

export function NewCycleModal({
  klass,
  onClose,
  onCreated,
}: {
  klass: Klass;
  onClose: () => void;
  onCreated: (cycleId: ID) => void;
}) {
  const year = useCurrentYear();
  const data = useData((s) => s.data);
  const [tab, setTab] = useState<'new' | 'template'>('new');
  const [activityId, setActivityId] = useState<ID | null>(null);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState<number | null>(8);
  const [start, setStart] = useState<string | null>(() => (year ? suggestedStart(klass, year.start, year.end) : todayISO()));
  const [templateId, setTemplateId] = useState<ID | ''>('');

  const templates = useMemo(
    () => Object.values(data.cycles).filter((c) => c.classId === null).sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    [data.cycles],
  );
  const template = templates.find((t) => t.id === templateId);
  const templateCount = template ? cycleLessons(data, template.id).length : 0;
  const n = tab === 'new' ? count ?? 0 : templateCount;

  const preview = useMemo(() => {
    if (!start || !n || !klass.slots.length) return null;
    const occ = nextOccurrences(klass.slots, start, year?.holidays ?? [], { count: n });
    return occ.length ? { first: occ[0].date, last: occ[occ.length - 1].date, found: occ.length } : null;
  }, [start, n, klass.slots, year?.holidays]);

  const create = () => {
    if (tab === 'new') {
      const act = activityOf(data, activityId);
      const id = createCycleWithLessons(klass.id, {
        title: title.trim() || act?.name || 'Nouveau cycle',
        activityId,
        startDate: start,
        count: Math.max(1, count ?? 1),
      });
      toast('Cycle créé avec ses séances', { tone: 'success' });
      onCreated(id);
    } else if (template) {
      const id = copyCycle(template.id, klass.id, start);
      toast('Cycle ajouté depuis le modèle', { tone: 'success' });
      onCreated(id);
    }
  };

  return (
    <Modal
      title={`Nouveau cycle — ${klass.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={create} disabled={tab === 'template' && !template}>
            Créer le cycle
          </Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'new', label: 'Nouveau cycle' },
          { id: 'template', label: `Depuis un modèle (${templates.length})` },
        ]}
      />
      {tab === 'new' ? (
        <>
          <Field label="Activité">
            <ActivitySelect
              value={activityId}
              onChange={(id) => {
                const prev = activityOf(data, activityId)?.name;
                setActivityId(id);
                if (!title || title === prev) setTitle(activityOf(data, id)?.name ?? '');
              }}
            />
          </Field>
          <Field label="Titre du cycle">
            <TextInput value={title} onChange={setTitle} placeholder="Ex. Badminton — jouer en simple" />
          </Field>
          <div className="grid grid-2">
            <Field label="Nombre de séances">
              <NumberInput value={count} min={1} max={40} onChange={setCount} />
            </Field>
            <Field label="Première séance à partir du">
              <DateField value={start} onChange={setStart} />
            </Field>
          </div>
        </>
      ) : templates.length === 0 ? (
        <p className="muted">
          Aucun cycle modèle dans la bibliothèque. Depuis un cycle existant, utilisez « Enregistrer comme modèle » pour en créer.
        </p>
      ) : (
        <>
          <Field label="Cycle modèle">
            <Select<string>
              value={templateId}
              onChange={(v) => setTemplateId(v)}
              placeholder="— Choisir un modèle —"
              options={templates.map((t) => ({
                value: t.id,
                label: `${activityOf(data, t.activityId)?.emoji ?? '📘'} ${t.title} (${cycleLessons(data, t.id).length} séances)`,
              }))}
            />
          </Field>
          <Field label="Première séance à partir du">
            <DateField value={start} onChange={setStart} />
          </Field>
        </>
      )}
      <div className="callout">
        {!klass.slots.length ? (
          <>Cette classe n'a pas encore d'emploi du temps : les séances seront créées sans date (vous pourrez ajouter les créneaux ensuite).</>
        ) : preview ? (
          <>
            {preview.found} séance{preview.found > 1 ? 's' : ''} du <strong>{formatDM(preview.first)}</strong> au <strong>{formatDM(preview.last)}</strong>, placées automatiquement sur les créneaux de la classe (vacances et jours fériés évités).
          </>
        ) : (
          <>Choisissez une date de départ pour proposer un calendrier.</>
        )}
      </div>
    </Modal>
  );
}

/** Copie un cycle (et ses séances) vers une autre classe de l'année. */
export function CopyCycleModal({ cycle, onClose, onDone }: { cycle: Cycle; onClose: () => void; onDone: (id: ID) => void }) {
  const classes = useYearClasses();
  const year = useCurrentYear();
  const others = classes.filter((k) => k.id !== cycle.classId);
  const [classId, setClassId] = useState<ID | ''>(others[0]?.id ?? '');
  const [start, setStart] = useState<string | null>(() => {
    const k = others[0];
    return k && year ? suggestedStart(k, year.start, year.end) : todayISO();
  });
  return (
    <Modal
      title="Copier ce cycle vers une autre classe"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!classId}
            onClick={() => {
              const id = copyCycle(cycle.id, classId || null, start);
              toast('Cycle copié', { tone: 'success' });
              onDone(id);
            }}
          >
            Copier
          </Button>
        </>
      }
    >
      {others.length === 0 ? (
        <p className="muted">Il n'y a pas d'autre classe cette année. Créez-en une d'abord.</p>
      ) : (
        <>
          <Field label="Classe de destination">
            <Select<string>
              value={classId}
              onChange={(v) => {
                setClassId(v);
                const k = classes.find((x) => x.id === v);
                if (k && year) setStart(suggestedStart(k, year.start, year.end));
              }}
              options={others.map((k) => ({ value: k.id, label: k.name }))}
            />
          </Field>
          <Field label="Première séance à partir du">
            <DateField value={start} onChange={setStart} />
          </Field>
        </>
      )}
    </Modal>
  );
}

/** Recalcule les dates de toutes les séances d'un cycle selon l'emploi du temps. */
export function RedateModal({ cycle, onClose }: { cycle: Cycle; onClose: () => void }) {
  const [start, setStart] = useState<string | null>(cycle.startDate ?? todayISO());
  return (
    <Modal
      title="Recalculer les dates des séances"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!start}
            onClick={() => {
              const n = regenerateDates(cycle.id, start!);
              toast(n ? `${n} séances redatées` : "La classe n'a pas de créneau : dates effacées", { tone: n ? 'success' : 'info' });
              onClose();
            }}
          >
            Recalculer
          </Button>
        </>
      }
    >
      <p className="muted">
        Les séances sont replacées dans l'ordre, une par créneau de l'emploi du temps de la classe, en évitant vacances et jours fériés. Le contenu des séances n'est pas modifié.
      </p>
      <Field label="Première séance à partir du">
        <DateField value={start} onChange={setStart} />
      </Field>
    </Modal>
  );
}
