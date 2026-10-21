import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Copy, ListPlus, Trash2 } from 'lucide-react';
import type { BlockKind, ID } from '../types';
import { Button, Card, Field, Menu, Modal, NumberInput, PageHeader, Select, TagInput, TextArea, TextInput } from '../components/ui';
import { ActivitySelect } from '../components/forms';
import { AnimationField } from '../components/AnimationField';
import { useData } from '../store/data';
import { activityOf, compareByDate, useYearClasses } from '../store/selectors';
import { insertExerciseInLesson } from '../store/actions';
import { newExercise } from '../store/model';
import { confirmDialog, toast, toastUndo } from '../store/ui';
import { BLOCK_KINDS, BLOCK_KIND_ORDER } from '../lib/defaults';
import { formatShort } from '../lib/dates';
import { deepClone } from '../lib/util';

export function ExerciseEditorPage() {
  const { id = '' } = useParams();
  const ex = useData((s) => s.data.exercises[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  if (!ex) return <Navigate to="/library" replace />;

  const patch = (p: Partial<typeof ex>) => useData.getState().patch('exercises', ex.id, p);
  const court = activityOf(data, ex.activityId)?.court ?? 'blank';
  const allTags = Array.from(new Set(Object.values(data.exercises).flatMap((e) => e.tags))).sort();

  return (
    <>
      <PageHeader
        back={
          <Link to="/library" className="back-link">
            <ChevronLeft size={16} /> Bibliothèque
          </Link>
        }
        title={
          <input
            className="title-input"
            value={ex.title}
            placeholder="Titre de la situation"
            onChange={(e) => patch({ title: e.target.value })}
            aria-label="Titre de la situation"
          />
        }
        actions={
          <>
            <Button variant="primary" icon={<ListPlus size={17} />} onClick={() => setAdding(true)}>
              Ajouter à une séance
            </Button>
            <Menu
              items={[
                {
                  label: 'Dupliquer',
                  icon: <Copy size={16} />,
                  onClick: () => {
                    const fresh = newExercise(`${ex.title} (copie)`);
                    useData.getState().put('exercises', { ...deepClone(ex), id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt });
                    navigate(`/exercises/${fresh.id}`);
                  },
                },
                {
                  label: 'Supprimer',
                  icon: <Trash2 size={16} />,
                  danger: true,
                  onClick: async () => {
                    const ok = await confirmDialog({ title: 'Supprimer cette situation ?', message: 'Les séances qui l\'utilisent déjà ne sont pas modifiées.', confirmLabel: 'Supprimer', danger: true });
                    if (!ok) return;
                    const undo = useData.getState().remove('exercises', ex.id);
                    navigate('/library');
                    toastUndo('Situation supprimée', undo);
                  },
                },
              ]}
            />
          </>
        }
      />

      <Card>
        <div className="grid grid-2">
          <Field label="Activité">
            <ActivitySelect value={ex.activityId} onChange={(a) => patch({ activityId: a })} />
          </Field>
          <Field label="Type">
            <Select<BlockKind>
              value={ex.kind}
              onChange={(v) => v && patch({ kind: v })}
              options={BLOCK_KIND_ORDER.map((k) => ({ value: k, label: `${BLOCK_KINDS[k].icon} ${BLOCK_KINDS[k].label}` }))}
            />
          </Field>
          <Field label="Durée conseillée (min)">
            <NumberInput value={ex.minutes} min={0} max={240} onChange={(v) => patch({ minutes: v ?? 0 })} />
          </Field>
          <Field label="Matériel">
            <TextInput value={ex.materials} placeholder="Ex. 12 plots, 6 ballons" onChange={(v) => patch({ materials: v })} />
          </Field>
        </div>
      </Card>

      <Field label="Consignes, organisation, critères de réussite, variables">
        <TextArea
          value={ex.text}
          minRows={8}
          onChange={(v) => patch({ text: v })}
          placeholder={'## Organisation\n2 équipes de 4, un demi-terrain chacune…\n\n## Consignes\n- Marquer en 3 passes maximum\n\n## Variables\n- Ajouter un défenseur\n- Réduire le terrain'}
        />
        <span className="field-hint">Mise en forme : **gras**, *italique*, listes avec « - », titres avec « ## ».</span>
      </Field>

      <Field label="Schéma / animation">
        <AnimationField value={ex.animation} onChange={(a) => patch({ animation: a })} defaultCourt={court} title={ex.title || 'Situation'} />
      </Field>

      <Field label="Étiquettes">
        <TagInput value={ex.tags} onChange={(tags) => patch({ tags })} suggestions={allTags} />
      </Field>

      {adding && <AddToLessonModal exerciseId={ex.id} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddToLessonModal({ exerciseId, onClose }: { exerciseId: ID; onClose: () => void }) {
  const classes = useYearClasses();
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [classId, setClassId] = useState<ID | ''>(classes[0]?.id ?? '');
  const lessons = useMemo(
    () => Object.values(data.lessons).filter((l) => l.classId === classId).sort(compareByDate),
    [data.lessons, classId],
  );
  const [lessonId, setLessonId] = useState<ID | ''>('');

  return (
    <Modal
      title="Ajouter à une séance"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            disabled={!lessonId}
            onClick={() => {
              insertExerciseInLesson(lessonId, exerciseId);
              toast('Situation ajoutée à la séance', { tone: 'success' });
              onClose();
              navigate(`/lessons/${lessonId}`);
            }}
          >
            Ajouter
          </Button>
        </>
      }
    >
      {classes.length === 0 ? (
        <p className="muted">Aucune classe cette année.</p>
      ) : (
        <>
          <Field label="Classe">
            <Select<string>
              value={classId}
              onChange={(v) => {
                setClassId(v);
                setLessonId('');
              }}
              options={classes.map((k) => ({ value: k.id, label: k.name }))}
            />
          </Field>
          <Field label="Séance">
            <Select<string>
              value={lessonId}
              onChange={setLessonId}
              placeholder="— Choisir une séance —"
              options={lessons.map((l) => ({ value: l.id, label: `${l.date ? formatShort(l.date) + ' · ' : ''}${l.title || 'Séance sans titre'}` }))}
            />
          </Field>
        </>
      )}
    </Modal>
  );
}
