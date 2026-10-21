import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Chip, EmptyState, Menu, PageHeader, Section, TextArea } from '../components/ui';
import { ActivityChip, ClassDot, LessonRow, formatDateRange } from '../components/cards';
import { ClassFormModal } from '../components/ClassForm';
import { NewCycleModal } from '../components/CycleModals';
import { useData } from '../store/data';
import { classCycles, cycleLessons } from '../store/selectors';
import { confirmDialog, toastUndo } from '../store/ui';
import { slotsSummary } from './Classes';
import { plural } from '../lib/util';

export function ClassDetailPage() {
  const { id = '' } = useParams();
  const klass = useData((s) => s.data.classes[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newCycle, setNewCycle] = useState(false);

  if (!klass) return <Navigate to="/classes" replace />;

  const cycles = classCycles(data, klass.id);
  const patch = (p: Partial<typeof klass>) => useData.getState().patch('classes', klass.id, p);

  return (
    <>
      <PageHeader
        back={
          <Link to="/classes" className="back-link">
            <ChevronLeft size={16} /> Classes
          </Link>
        }
        title={
          <span className="row" style={{ flexWrap: 'nowrap' }}>
            <ClassDot color={klass.color} size={16} />
            <input
              className="title-input"
              value={klass.name}
              onChange={(e) => patch({ name: e.target.value })}
              aria-label="Nom de la classe"
            />
          </span>
        }
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            {klass.level && <Chip>{klass.level}</Chip>}
            {klass.students != null && <span>{plural(klass.students, 'élève')}</span>}
            <span>{slotsSummary(klass)}</span>
          </span>
        }
        actions={
          <>
            <Button icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
              Modifier / emploi du temps
            </Button>
            <Menu
              items={[
                {
                  label: 'Supprimer la classe',
                  icon: <Trash2 size={16} />,
                  danger: true,
                  onClick: async () => {
                    const lessonCount = Object.values(data.lessons).filter((l) => l.classId === klass.id).length;
                    const ok = await confirmDialog({
                      title: `Supprimer ${klass.name} ?`,
                      message: `${plural(cycles.length, 'cycle')} et ${plural(lessonCount, 'séance')} seront supprimés. Vous pourrez annuler juste après.`,
                      confirmLabel: 'Supprimer',
                      danger: true,
                    });
                    if (!ok) return;
                    const undo = useData.getState().remove('classes', klass.id);
                    navigate('/classes');
                    toastUndo(`${klass.name} supprimée`, undo);
                  },
                },
              ]}
            />
          </>
        }
      />

      <Section
        title="Programmation de l'année"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setNewCycle(true)}>
            Nouveau cycle
          </Button>
        }
      >
        {cycles.length === 0 ? (
          <EmptyState icon="🗓️" title="Aucun cycle pour cette classe" action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setNewCycle(true)}>Créer le premier cycle</Button>}>
            Un cycle = une activité sur plusieurs séances (ex. « Volley-ball », 8 séances). Les séances sont créées et datées pour vous.
          </EmptyState>
        ) : (
          <div className="stack">
            {cycles.map((c) => {
              const lessons = cycleLessons(data, c.id);
              const prepared = lessons.filter((l) => l.blocks.length > 0).length;
              return (
                <Card key={c.id} className="cycle-card">
                  <Link to={`/cycles/${c.id}`} className="cycle-card-head">
                    <div className="grow">
                      <h3>{c.title || 'Cycle sans titre'}</h3>
                      <p className="muted small">
                        {formatDateRange(c.startDate, c.endDate)} · {plural(lessons.length, 'séance')} · {prepared}/{lessons.length} préparées
                      </p>
                    </div>
                    <ActivityChip activityId={c.activityId} />
                  </Link>
                  {lessons.length > 0 && (
                    <div className="lesson-list">
                      {lessons.map((l) => (
                        <LessonRow key={l.id} lesson={l} />
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Notes sur la classe">
        <TextArea
          value={klass.notes}
          onChange={(v) => patch({ notes: v })}
          minRows={3}
          placeholder="Profil du groupe, élèves à besoins particuliers, projets, rappels…"
        />
      </Section>

      {editing && (
        <ClassFormModal
          initial={klass}
          onClose={() => setEditing(false)}
          onSave={(k) => {
            useData.getState().put('classes', k);
            setEditing(false);
          }}
        />
      )}
      {newCycle && (
        <NewCycleModal
          klass={klass}
          onClose={() => setNewCycle(false)}
          onCreated={(cid) => {
            setNewCycle(false);
            navigate(`/cycles/${cid}`);
          }}
        />
      )}
    </>
  );
}
