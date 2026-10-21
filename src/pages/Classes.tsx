import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CopyPlus, Plus, Users } from 'lucide-react';
import { Button, Card, Chip, EmptyState, PageHeader } from '../components/ui';
import { ClassDot } from '../components/cards';
import { ClassFormModal } from '../components/ClassForm';
import { DuplicateYearModal, NewYearModal } from '../components/YearModals';
import { useData } from '../store/data';
import { useCurrentYear, useYears, useYearClasses, useYearCycles, useYearLessons } from '../store/selectors';
import { newKlass } from '../store/model';
import { formatShort, todayISO, WEEKDAYS_SHORT } from '../lib/dates';
import { plural } from '../lib/util';
import type { Klass } from '../types';

export function slotsSummary(k: Klass): string {
  if (!k.slots.length) return 'Aucun créneau';
  return [...k.slots]
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start))
    .map((s) => `${WEEKDAYS_SHORT[s.weekday - 1]} ${s.start}–${s.end}`)
    .join(' · ');
}

export function ClassesPage() {
  const year = useCurrentYear();
  const years = useYears();
  const classes = useYearClasses();
  const cycles = useYearCycles();
  const lessons = useYearLessons();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<Klass | null>(null);
  const [newYear, setNewYear] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const stats = useMemo(() => {
    const today = todayISO();
    const map = new Map<string, { cycles: number; lessons: number; done: number; next?: string }>();
    for (const k of classes) map.set(k.id, { cycles: 0, lessons: 0, done: 0 });
    for (const c of cycles) if (c.classId && map.has(c.classId)) map.get(c.classId)!.cycles++;
    for (const l of lessons) {
      const s = l.classId ? map.get(l.classId) : undefined;
      if (!s) continue;
      s.lessons++;
      if (l.status === 'done') s.done++;
      if (l.date && l.date >= today && l.status !== 'cancelled' && (!s.next || l.date < s.next)) s.next = l.date;
    }
    return map;
  }, [classes, cycles, lessons]);

  const previousYear = year ? years.find((y) => y.start < year.start) : undefined;

  if (!year) {
    return (
      <>
        <PageHeader title="Classes" />
        <EmptyState icon="📅" title="Commençons par l'année scolaire" action={<Button variant="primary" onClick={() => setNewYear(true)}>Créer l'année scolaire</Button>}>
          Chaque année contient ses classes, ses cycles et ses séances.
        </EmptyState>
        {newYear && <NewYearModal onClose={() => setNewYear(false)} />}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle={`Année ${year.label} · ${plural(classes.length, 'classe')}`}
        actions={
          <>
            {years.length > 1 && classes.length > 0 && (
              <Button icon={<CopyPlus size={17} />} onClick={() => setDuplicating(true)}>
                Reporter sur une nouvelle année
              </Button>
            )}
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreating(newKlass(year.id, classes.length))}>
              Nouvelle classe
            </Button>
          </>
        }
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={<Users size={38} />}
          title="Aucune classe pour cette année"
          action={
            <>
              <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreating(newKlass(year.id, 0))}>
                Ajouter ma première classe
              </Button>
              {previousYear && (
                <Button icon={<CopyPlus size={17} />} onClick={() => setDuplicating(true)}>
                  Reporter {previousYear.label}
                </Button>
              )}
            </>
          }
        >
          Ajoutez vos classes avec leur emploi du temps : les séances de chaque cycle seront ensuite datées automatiquement.
        </EmptyState>
      ) : (
        <div className="grid grid-cards">
          {classes.map((k) => {
            const s = stats.get(k.id)!;
            return (
              <Link key={k.id} to={`/classes/${k.id}`} className="class-card" style={{ ['--class' as string]: k.color }}>
                <Card className="card-click class-card-inner">
                  <div className="row-between">
                    <h3 className="class-card-name">
                      <ClassDot color={k.color} size={14} /> {k.name}
                    </h3>
                    {k.level && <Chip>{k.level}</Chip>}
                  </div>
                  <p className="muted small">{slotsSummary(k)}</p>
                  <div className="class-card-stats">
                    <span>
                      <strong>{s.cycles}</strong> {s.cycles > 1 ? 'cycles' : 'cycle'}
                    </span>
                    <span>
                      <strong>{s.lessons}</strong> {s.lessons > 1 ? 'séances' : 'séance'}
                    </span>
                    {k.students != null && (
                      <span>
                        <strong>{k.students}</strong> {k.students > 1 ? 'élèves' : 'élève'}
                      </span>
                    )}
                  </div>
                  {s.lessons > 0 && (
                    <div className="progress" aria-label={`${s.done} séances faites sur ${s.lessons}`}>
                      <div style={{ width: `${(s.done / s.lessons) * 100}%` }} />
                    </div>
                  )}
                  <p className="small muted">{s.next ? `Prochaine séance : ${formatShort(s.next)}` : s.lessons ? 'Aucune séance à venir' : 'Pas encore de séance'}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {creating && (
        <ClassFormModal
          initial={creating}
          onClose={() => setCreating(null)}
          onSave={(k) => {
            useData.getState().put('classes', k);
            setCreating(null);
            navigate(`/classes/${k.id}`);
          }}
        />
      )}
      {duplicating && (previousYear || years.length > 0) && (
        <DuplicateYearModal from={classes.length ? year : (previousYear ?? year)} onClose={() => setDuplicating(false)} />
      )}
      {newYear && <NewYearModal onClose={() => setNewYear(false)} />}
    </>
  );
}
