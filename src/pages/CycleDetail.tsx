import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookmarkPlus, CalendarClock, ChevronLeft, Copy, Plus, Trash2, X } from 'lucide-react';
import { Button, Card, EmptyState, Field, IconButton, Menu, PageHeader, Section, TextArea } from '../components/ui';
import { ActivityChip, ClassDot, LessonRow, formatDateRange } from '../components/cards';
import { ActivitySelect, DateField, SlotPicker } from '../components/forms';
import { CopyCycleModal, RedateModal } from '../components/CycleModals';
import { useData } from '../store/data';
import { cycleLessons } from '../store/selectors';
import { addLessonToCycle, copyCycle, moveLesson } from '../store/actions';
import { confirmDialog, toast, toastUndo } from '../store/ui';
import { plural } from '../lib/util';

export function CycleDetailPage() {
  const { id = '' } = useParams();
  const cycle = useData((s) => s.data.cycles[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [copying, setCopying] = useState(false);
  const [redating, setRedating] = useState(false);

  if (!cycle) return <Navigate to="/classes" replace />;

  const klass = cycle.classId ? data.classes[cycle.classId] : undefined;
  const isTemplate = cycle.classId === null;
  const lessons = cycleLessons(data, cycle.id);
  const patch = (p: Partial<typeof cycle>) => useData.getState().patch('cycles', cycle.id, p);

  const backTo = klass ? `/classes/${klass.id}` : '/library';
  const backLabel = klass ? klass.name : 'Bibliothèque';

  return (
    <>
      <PageHeader
        back={
          <Link to={backTo} className="back-link">
            <ChevronLeft size={16} /> {backLabel}
          </Link>
        }
        title={
          <input
            className="title-input"
            value={cycle.title}
            placeholder="Titre du cycle"
            onChange={(e) => patch({ title: e.target.value })}
            aria-label="Titre du cycle"
          />
        }
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            {klass && (
              <span className="row" style={{ gap: 6 }}>
                <ClassDot color={klass.color} /> {klass.name}
              </span>
            )}
            {isTemplate && <span className="chip">Modèle de la bibliothèque</span>}
            <ActivityChip activityId={cycle.activityId} />
            <span>{formatDateRange(cycle.startDate, cycle.endDate)}</span>
          </span>
        }
        actions={
          <Menu
            items={[
              { label: 'Copier vers une autre classe…', icon: <Copy size={16} />, hidden: isTemplate, onClick: () => setCopying(true) },
              {
                label: 'Enregistrer comme modèle de cycle',
                icon: <BookmarkPlus size={16} />,
                hidden: isTemplate,
                onClick: () => {
                  copyCycle(cycle.id, null);
                  toast('Modèle ajouté à la bibliothèque', { tone: 'success' });
                },
              },
              {
                label: 'Supprimer le cycle',
                icon: <Trash2 size={16} />,
                danger: true,
                onClick: async () => {
                  const ok = await confirmDialog({
                    title: 'Supprimer ce cycle ?',
                    message: `Ses ${plural(lessons.length, 'séance')} seront supprimées. Vous pourrez annuler juste après.`,
                    confirmLabel: 'Supprimer',
                    danger: true,
                  });
                  if (!ok) return;
                  const undo = useData.getState().remove('cycles', cycle.id);
                  navigate(backTo);
                  toastUndo('Cycle supprimé', undo);
                },
              },
            ]}
          />
        }
      />

      <Card>
        <div className="grid grid-2">
          <Field label="Activité">
            <ActivitySelect value={cycle.activityId} onChange={(a) => patch({ activityId: a })} />
          </Field>
          {!isTemplate && (
            <>
              <Field label="Début du cycle">
                <DateField value={cycle.startDate} onChange={(v) => patch({ startDate: v })} />
              </Field>
              <Field label="Fin du cycle">
                <DateField value={cycle.endDate} min={cycle.startDate ?? undefined} onChange={(v) => patch({ endDate: v })} />
              </Field>
            </>
          )}
        </div>
        {!isTemplate && klass && klass.slots.length > 1 && (
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">Créneaux utilisés par ce cycle</span>
            <SlotPicker slots={klass.slots} value={cycle.slotIds ?? []} onChange={(slotIds) => patch({ slotIds })} />
            <span className="field-hint">Après un changement, utilisez « Recalculer les dates » pour replacer les séances sur les bons créneaux.</span>
          </div>
        )}
      </Card>

      <div className="grid grid-2">
        <Field label="Objectifs du cycle">
          <TextArea value={cycle.objectives} onChange={(v) => patch({ objectives: v })} minRows={4} placeholder="Ce que les élèves vont apprendre, en une ou deux phrases." />
        </Field>
        <Field label="Attendus de fin de cycle / compétences visées">
          <TextArea value={cycle.competences} onChange={(v) => patch({ competences: v })} minRows={4} placeholder="Niveau attendu, AFLP, compétences travaillées…" />
        </Field>
        <Field label="Évaluation">
          <TextArea value={cycle.evaluation} onChange={(v) => patch({ evaluation: v })} minRows={4} placeholder="Modalités, critères, barème, date de l'évaluation…" />
        </Field>
        <Field label="Notes">
          <TextArea value={cycle.notes} onChange={(v) => patch({ notes: v })} minRows={4} placeholder="Matériel à réserver, installations, rappels…" />
        </Field>
      </div>

      <Section
        title={`Séances (${lessons.length})`}
        actions={
          <>
            {!isTemplate && klass && klass.slots.length > 0 && (
              <Button size="sm" icon={<CalendarClock size={16} />} onClick={() => setRedating(true)}>
                Recalculer les dates
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => {
                const lid = addLessonToCycle(cycle.id);
                navigate(`/lessons/${lid}`);
              }}
            >
              Ajouter une séance
            </Button>
          </>
        }
      >
        {lessons.length === 0 ? (
          <EmptyState title="Aucune séance dans ce cycle">Ajoutez les séances une par une, ou recréez le cycle en indiquant un nombre de séances.</EmptyState>
        ) : (
          <Card className="lesson-list" style={{ padding: 6 }}>
            {lessons.map((l, i) => (
              <LessonRow
                key={l.id}
                lesson={l}
                actions={
                  <div className="lesson-row-actions">
                    <IconButton label="Monter" disabled={i === 0} onClick={() => moveLesson(cycle.id, l.id, -1)}>
                      <ArrowUp size={17} />
                    </IconButton>
                    <IconButton label="Descendre" disabled={i === lessons.length - 1} onClick={() => moveLesson(cycle.id, l.id, 1)}>
                      <ArrowDown size={17} />
                    </IconButton>
                    <IconButton
                      label="Supprimer la séance"
                      onClick={() => {
                        const undo = useData.getState().remove('lessons', l.id);
                        toastUndo('Séance supprimée', undo);
                      }}
                    >
                      <X size={17} />
                    </IconButton>
                  </div>
                }
              />
            ))}
          </Card>
        )}
      </Section>

      {copying && (
        <CopyCycleModal
          cycle={cycle}
          onClose={() => setCopying(false)}
          onDone={(newId) => {
            setCopying(false);
            navigate(`/cycles/${newId}`);
          }}
        />
      )}
      {redating && <RedateModal cycle={cycle} onClose={() => setRedating(false)} />}
    </>
  );
}
