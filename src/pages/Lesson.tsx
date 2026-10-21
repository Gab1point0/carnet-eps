import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Ban, BookmarkPlus, CalendarClock, ChevronLeft, ClipboardCheck, Copy, Library, Play, Plus, Printer, Trash2 } from 'lucide-react';
import { ReviewModal, RATINGS } from '../components/ReviewModal';
import { ProposalsPanel } from '../components/ProposalsPanel';
import type { Block, BlockKind, ID, Lesson } from '../types';
import { Button, Card, Chip, Field, Menu, Modal, PageHeader, Section, Select, TagInput, TextArea } from '../components/ui';
import { ClassDot } from '../components/cards';
import { ActivitySelect, DateField, TimeField } from '../components/forms';
import { BlockEditor, DEFAULT_MINUTES, cloneBlockWithNewId } from '../components/BlockEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { useData } from '../store/data';
import { activityOf, classCycles, lessonTotalMinutes, useYearClasses } from '../store/selectors';
import { blockFromExercise, cancelAndShift, duplicateLesson, postponeLesson, saveBlockAsExercise, saveLessonAsTemplate } from '../store/actions';
import { newBlock } from '../store/model';
import { confirmDialog, toast, toastUndo } from '../store/ui';
import { BLOCK_KINDS, BLOCK_KIND_ORDER } from '../lib/defaults';
import { durationOf, formatLong, formatDuration, weekdayOf } from '../lib/dates';
import { cls } from '../lib/util';

export function LessonPage() {
  const { id = '' } = useParams();
  const lesson = useData((s) => s.data.lessons[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [picker, setPicker] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  if (!lesson) return <Navigate to="/classes" replace />;

  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const activityId = lesson.activityId ?? cycle?.activityId ?? null;
  const court = activityOf(data, activityId)?.court ?? 'blank';
  const isTemplate = lesson.classId === null;

  const patch = (p: Partial<Lesson>) => useData.getState().patch('lessons', lesson.id, p);
  const setBlocks = (blocks: Block[]) => patch({ blocks });
  const patchBlock = (bid: ID, p: Partial<Block>) => setBlocks(lesson.blocks.map((b) => (b.id === bid ? { ...b, ...p } : b)));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lesson.blocks.length) return;
    const next = [...lesson.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };
  const addBlock = (kind: BlockKind) => {
    setBlocks([...lesson.blocks, newBlock(kind, '', DEFAULT_MINUTES[kind])]);
  };

  const planned = lesson.start && lesson.end ? durationOf(lesson.start, lesson.end) : 0;
  const total = lessonTotalMinutes(lesson);

  const onDateChange = (date: string | null) => {
    const p: Partial<Lesson> = { date };
    if (date && klass) {
      const slot = klass.slots.find((s) => s.weekday === weekdayOf(date));
      if (slot) {
        p.start = slot.start;
        p.end = slot.end;
      }
    }
    patch(p);
  };

  const backTo = cycle ? `/cycles/${cycle.id}` : klass ? `/classes/${klass.id}` : '/library';
  const backLabel = cycle ? cycle.title || 'Cycle' : klass ? klass.name : 'Bibliothèque';

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
            value={lesson.title}
            placeholder="Titre de la séance"
            onChange={(e) => patch({ title: e.target.value })}
            aria-label="Titre de la séance"
          />
        }
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            {klass && (
              <span className="row" style={{ gap: 6 }}>
                <ClassDot color={klass.color} /> {klass.name}
              </span>
            )}
            {isTemplate && <Chip>Modèle de la bibliothèque</Chip>}
            {lesson.date && <span>{formatLong(lesson.date)}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="primary" icon={<Play size={17} />} onClick={() => navigate(`/lessons/${lesson.id}/run`)}>
              Mode cours
            </Button>
            {!isTemplate && (
              <Button icon={<ClipboardCheck size={17} />} onClick={() => setReviewing(true)}>
                Bilan {lesson.rating ? RATINGS.find((r) => r.value === lesson.rating)?.emoji : ''}
              </Button>
            )}
            <Menu
              items={[
                {
                  label: 'Reporter la séance (décaler la suite du cycle)',
                  icon: <CalendarClock size={16} />,
                  hidden: isTemplate || !lesson.cycleId || !lesson.date || lesson.status !== 'planned',
                  onClick: () => {
                    const r = postponeLesson(lesson.id);
                    if (r) toast(`Séance reportée : ${r.moved} séance${r.moved > 1 ? 's' : ''} décalée${r.moved > 1 ? 's' : ''}.`, { tone: 'success', ms: 10000, action: { label: 'Annuler', run: r.undo } });
                  },
                },
                {
                  label: 'Annuler la séance et décaler la suite',
                  icon: <Ban size={16} />,
                  hidden: isTemplate || !lesson.cycleId || !lesson.date || lesson.status !== 'planned',
                  onClick: () => {
                    const r = cancelAndShift(lesson.id);
                    if (r) toast('Séance annulée, la suite du cycle remonte sur les créneaux.', { tone: 'success', ms: 10000, action: { label: 'Annuler', run: r.undo } });
                  },
                },
                { label: 'Imprimer / PDF', icon: <Printer size={16} />, onClick: () => navigate(`/lessons/${lesson.id}/print`) },
                { label: 'Dupliquer vers une classe / une date…', icon: <Copy size={16} />, onClick: () => setDuplicating(true) },
                {
                  label: 'Enregistrer comme séance modèle',
                  icon: <BookmarkPlus size={16} />,
                  hidden: isTemplate,
                  onClick: () => {
                    saveLessonAsTemplate(lesson.id);
                    toast('Séance modèle ajoutée à la bibliothèque', { tone: 'success' });
                  },
                },
                {
                  label: 'Supprimer la séance',
                  icon: <Trash2 size={16} />,
                  danger: true,
                  onClick: async () => {
                    const ok = await confirmDialog({ title: 'Supprimer cette séance ?', message: 'Vous pourrez annuler juste après.', confirmLabel: 'Supprimer', danger: true });
                    if (!ok) return;
                    const undo = useData.getState().remove('lessons', lesson.id);
                    navigate(backTo);
                    toastUndo('Séance supprimée', undo);
                  },
                },
              ]}
            />
          </>
        }
      />

      <Card>
        <div className="lesson-meta">
          {!isTemplate && (
            <div className="field lesson-meta-state">
              <span className="field-label">État</span>
              <div className="ae-modes" role="group">
                {(
                  [
                    ['planned', 'Prévue'],
                    ['done', 'Faite'],
                    ['cancelled', 'Annulée'],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" className={cls('seg', lesson.status === v && 'seg-on')} onClick={() => patch({ status: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!isTemplate && (
            <Field label="Date">
              <DateField value={lesson.date} onChange={onDateChange} />
            </Field>
          )}
          <Field label="Début">
            <TimeField value={lesson.start} onChange={(v) => patch({ start: v })} />
          </Field>
          <Field label="Fin">
            <TimeField value={lesson.end} onChange={(v) => patch({ end: v })} />
          </Field>
          {(isTemplate || !cycle) && (
            <Field label="Activité">
              <ActivitySelect value={lesson.activityId} onChange={(a) => patch({ activityId: a })} />
            </Field>
          )}
        </div>
      </Card>

      <div className="grid grid-2">
        <Field label="🎯 Objectif de la séance">
          <TextArea value={lesson.objective} onChange={(v) => patch({ objective: v })} minRows={3} placeholder="Ce que les élèves doivent savoir faire à la fin de la séance." />
        </Field>
        <Field label="🧰 Matériel">
          <TextArea value={lesson.materials} onChange={(v) => patch({ materials: v })} minRows={3} placeholder="Ballons, plots, chasubles, filets, sono…" />
        </Field>
      </div>
      <Field label="⚠️ Sécurité / organisation">
        <TextArea value={lesson.safety} onChange={(v) => patch({ safety: v })} minRows={2} placeholder="Zones de sécurité, rotation, élèves à surveiller, rappel des consignes…" />
      </Field>

      <ProposalsPanel lesson={lesson} />

      <Section
        title="Déroulé de la séance"
        actions={
          <Button size="sm" icon={<Library size={15} />} onClick={() => setPicker(true)}>
            Depuis la bibliothèque
          </Button>
        }
      >
        <Timeline lesson={lesson} planned={planned} total={total} />

        {lesson.blocks.length === 0 && (
          <div className="empty empty-compact">
            <p className="muted">Construisez la séance bloc par bloc : échauffement, situations, jeu, retour au calme…</p>
          </div>
        )}

        <div className="stack">
          {lesson.blocks.map((b, i) => (
            <BlockEditor
              key={b.id}
              block={b}
              index={i}
              count={lesson.blocks.length}
              court={court}
              activityId={activityId}
              onChange={(p) => patchBlock(b.id, p)}
              onMove={(d) => moveBlock(i, d)}
              onDelete={() => {
                const before = lesson.blocks;
                setBlocks(lesson.blocks.filter((x) => x.id !== b.id));
                toastUndo('Bloc supprimé', () => setBlocks(before));
              }}
              onDuplicate={() => {
                const next = [...lesson.blocks];
                next.splice(i + 1, 0, cloneBlockWithNewId(b));
                setBlocks(next);
              }}
              onSaveToLibrary={() => {
                saveBlockAsExercise(b, activityId);
                toast('Situation enregistrée dans la bibliothèque', { tone: 'success' });
              }}
            />
          ))}
        </div>

        <div className="add-blocks">
          <span className="muted small">Ajouter :</span>
          {BLOCK_KIND_ORDER.map((k) => (
            <button key={k} type="button" className="chip chip-btn" onClick={() => addBlock(k)} style={{ ['--chip' as string]: BLOCK_KINDS[k].color }}>
              <Plus size={12} /> {BLOCK_KINDS[k].icon} {BLOCK_KINDS[k].label}
            </button>
          ))}
        </div>
      </Section>

      <div className="grid grid-2">
        <Field label="📝 Bilan après la séance">
          <TextArea
            value={lesson.bilan}
            onChange={(v) => patch({ bilan: v })}
            minRows={4}
            placeholder="Ce qui a fonctionné, ce qu'il faut ajuster, élèves à suivre… (visible uniquement pour vous)"
          />
        </Field>
        <Field label="🏷️ Étiquettes">
          <TagInput value={lesson.tags} onChange={(tags) => patch({ tags })} suggestions={['évaluation', 'ceinture', 'météo', 'salle', 'sortie']} />
        </Field>
      </div>

      {picker && (
        <ExercisePicker
          initialActivity={activityId}
          onClose={() => setPicker(false)}
          onPick={(ex) => {
            setBlocks([...lesson.blocks, blockFromExercise(ex)]);
            setPicker(false);
            toast(`« ${ex.title || 'Situation'} » ajoutée`, { tone: 'success' });
          }}
        />
      )}
      {reviewing && <ReviewModal lesson={lesson} onClose={() => setReviewing(false)} />}
      {duplicating && (
        <DuplicateLessonModal
          lesson={lesson}
          onClose={() => setDuplicating(false)}
          onDone={(newId) => {
            setDuplicating(false);
            navigate(`/lessons/${newId}`);
          }}
        />
      )}
    </>
  );
}

function Timeline({ lesson, planned, total }: { lesson: Lesson; planned: number; total: number }) {
  if (!lesson.blocks.length) return null;
  const scale = Math.max(planned, total, 1);
  const diff = planned ? total - planned : 0;
  return (
    <div className="timeline">
      <div className="timeline-bar" aria-hidden>
        {lesson.blocks.map((b) => (
          <div key={b.id} title={`${b.title || BLOCK_KINDS[b.kind].label} · ${b.minutes} min`} style={{ width: `${(b.minutes / scale) * 100}%`, background: BLOCK_KINDS[b.kind].color }} />
        ))}
        {planned > total && <div className="timeline-free" style={{ width: `${((planned - total) / scale) * 100}%` }} />}
      </div>
      <div className="timeline-legend small">
        <strong>{formatDuration(total)}</strong> de contenu
        {planned > 0 && (
          <span className={cls(diff > 0 && 'warn-text')}>
            {' '}
            · séance de {formatDuration(planned)}
            {diff > 0 ? ` — dépasse de ${diff} min` : diff < 0 ? ` — reste ${-diff} min` : ' — pile le bon temps'}
          </span>
        )}
      </div>
    </div>
  );
}

function DuplicateLessonModal({ lesson, onClose, onDone }: { lesson: Lesson; onClose: () => void; onDone: (id: ID) => void }) {
  const classes = useYearClasses();
  const data = useData((s) => s.data);
  const [classId, setClassId] = useState<ID | ''>(lesson.classId ?? '');
  const cycles = useMemo(() => (classId ? classCycles(data, classId) : []), [data, classId]);
  const [cycleId, setCycleId] = useState<ID | ''>(lesson.cycleId && lesson.classId === classId ? lesson.cycleId : '');
  const [date, setDate] = useState<string | null>(null);

  return (
    <Modal
      title="Dupliquer la séance"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const id = duplicateLesson(lesson.id, {
                classId: classId || null,
                cycleId: classId ? cycleId || null : null,
                date: classId ? date : null,
                title: lesson.title,
              });
              toast('Séance dupliquée', { tone: 'success' });
              onDone(id);
            }}
          >
            Dupliquer
          </Button>
        </>
      }
    >
      <Field label="Classe de destination" hint="Laissez vide pour copier dans la bibliothèque (séance modèle).">
        <Select<string>
          value={classId}
          onChange={(v) => {
            setClassId(v);
            setCycleId('');
          }}
          placeholder="— Bibliothèque (modèle) —"
          options={classes.map((k) => ({ value: k.id, label: k.name }))}
        />
      </Field>
      {classId && (
        <>
          <Field label="Cycle">
            <Select<string>
              value={cycleId}
              onChange={setCycleId}
              placeholder="— Aucun cycle —"
              options={cycles.map((c) => ({ value: c.id, label: c.title || 'Cycle sans titre' }))}
            />
          </Field>
          <Field label="Date (facultatif)">
            <DateField value={date} onChange={setDate} />
          </Field>
        </>
      )}
    </Modal>
  );
}
