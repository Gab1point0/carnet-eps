import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarOff, CalendarPlus, ClipboardCheck, ClipboardList, Play, Plus, Sparkles, Users } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Section } from '../components/ui';
import { ReviewModal } from '../components/ReviewModal';
import { TodoSection } from '../components/TodoSection';
import { ClosureModal } from '../components/ClosureModal';
import { ClassDot, LessonRow, StatusIcon } from '../components/cards';
import { NewYearModal } from '../components/YearModals';
import { useData } from '../store/data';
import { useCurrentYear, useSettings, useYearClasses, useYearLessons } from '../store/selectors';
import { loadSample } from '../store/sample';
import { newLesson } from '../store/model';
import { toast } from '../store/ui';
import { holidayOn } from '../lib/holidays';
import { addDays, formatDay, todayISO, weekdayOf } from '../lib/dates';
import { plural } from '../lib/util';
import type { Klass, Lesson, Slot } from '../types';

export function DashboardPage() {
  const year = useCurrentYear();
  const classes = useYearClasses();
  const lessons = useYearLessons();
  const settings = useSettings();
  const exercisesCount = useData((s) => Object.keys(s.data.exercises).length);
  const navigate = useNavigate();
  const [newYear, setNewYear] = useState(false);
  const [reviewing, setReviewing] = useState<Lesson | null>(null);
  const [closing, setClosing] = useState(false);
  const today = todayISO();
  const nowHM = new Date().toTimeString().slice(0, 5);

  const classById = useMemo(() => new Map(classes.map((k) => [k.id, k])), [classes]);

  const todayLessons = lessons.filter((l) => l.date === today && l.status !== 'cancelled');
  const upcoming = lessons.filter((l) => l.date && l.date > today && l.date <= addDays(today, 7) && l.status !== 'cancelled');
  // Séances passées sans bilan (les plus récentes d'abord).
  const toReview = lessons
    .filter((l) => l.status === 'planned' && l.date && (l.date < today || (l.date === today && l.end < nowHM)) && year && l.date >= year.start)
    .reverse();
  const toPrepare = lessons.filter((l) => l.date && l.date >= today && l.date <= addDays(today, 14) && l.blocks.length === 0 && l.status !== 'cancelled');

  // Créneaux d'aujourd'hui qui n'ont pas encore de séance.
  const freeSlots = useMemo(() => {
    const out: Array<{ klass: Klass; slot: Slot }> = [];
    if (!year || holidayOn(year.holidays, today) || today < year.start || today > year.end) return out;
    for (const k of classes) {
      for (const s of k.slots) {
        if (s.weekday !== weekdayOf(today)) continue;
        if (!todayLessons.some((l) => l.classId === k.id && l.start === s.start)) out.push({ klass: k, slot: s });
      }
    }
    return out.sort((a, b) => a.slot.start.localeCompare(b.slot.start));
  }, [year, classes, todayLessons, today]);

  const holiday = year ? holidayOn(year.holidays, today) : undefined;
  const stats = useMemo(() => {
    const done = lessons.filter((l) => l.status === 'done').length;
    const prepared = lessons.filter((l) => l.blocks.length > 0).length;
    return { total: lessons.length, done, prepared };
  }, [lessons]);

  const createAt = (klass: Klass, slot: Slot) => {
    const l = newLesson(klass.id, null, 0, 'Nouvelle séance');
    l.date = today;
    l.start = slot.start;
    l.end = slot.end;
    useData.getState().put('lessons', l);
    navigate(`/lessons/${l.id}`);
  };

  // ── Premier lancement ────────────────────────────────────────────────────

  if (!year) {
    return (
      <>
        <PageHeader title="Bienvenue 👋" subtitle="Votre carnet de cours EPS, sur ordinateur comme sur téléphone." />
        <Card className="welcome">
          <h2>Commençons</h2>
          <ol className="welcome-steps">
            <li>Créez l'<strong>année scolaire</strong> (avec les vacances officielles).</li>
            <li>Ajoutez vos <strong>classes</strong> et leur emploi du temps.</li>
            <li>Créez des <strong>cycles</strong> : les séances se datent toutes seules.</li>
            <li>Préparez vos <strong>séances</strong>, avec des schémas animés si vous le souhaitez.</li>
          </ol>
          <div className="row">
            <Button variant="primary" icon={<CalendarPlus size={18} />} onClick={() => setNewYear(true)}>
              Créer l'année scolaire
            </Button>
            <Button
              icon={<Sparkles size={18} />}
              onClick={() => {
                loadSample();
                toast("Exemple chargé : vous pouvez tout modifier ou tout supprimer.", { tone: 'success' });
              }}
            >
              Explorer avec un exemple
            </Button>
          </div>
        </Card>
        {newYear && <NewYearModal onClose={() => setNewYear(false)} />}
      </>
    );
  }

  const greeting = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <>
      <PageHeader
        title={`${greeting}${settings.teacher ? ` ${settings.teacher}` : ''} 👋`}
        subtitle={<span className="cap-first">{formatDay(today)}</span>}
        actions={
          <>
            <Button icon={<ClipboardList size={17} />} onClick={() => navigate('/preparation')}>
              Préparation
            </Button>
            <Button icon={<CalendarOff size={17} />} onClick={() => setClosing(true)}>
              Jour sans cours
            </Button>
            <Button icon={<Users size={17} />} onClick={() => navigate('/classes')}>
              Mes classes
            </Button>
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate('/library')}>
              Bibliothèque
            </Button>
          </>
        }
      />

      {classes.length === 0 && (
        <EmptyState icon="🏫" title={`L'année ${year.label} est prête`} action={<Button variant="primary" onClick={() => navigate('/classes')}>Ajouter mes classes</Button>}>
          Ajoutez vos classes avec leur emploi du temps, ou reportez l'année précédente depuis la page Classes.
        </EmptyState>
      )}

      {classes.length > 0 && (
        <>
          <Section title="Aujourd'hui">
            {holiday && (
              <Card className="callout">
                🌴 <strong>{holiday.label}</strong> — pas de cours aujourd'hui.
              </Card>
            )}
            {!holiday && todayLessons.length === 0 && freeSlots.length === 0 && <p className="muted">Aucun cours prévu aujourd'hui. Profitez-en pour préparer la suite !</p>}
            <div className="stack">
              {todayLessons.map((l) => {
                const k = l.classId ? classById.get(l.classId) : undefined;
                return (
                  <Card key={l.id} className="today-card" style={{ ['--class' as string]: k?.color }}>
                    <Link to={`/lessons/${l.id}`} className="today-main">
                      <div className="today-time">
                        <strong>{l.start}</strong>
                        <span className="muted small">{l.end}</span>
                      </div>
                      <div className="grow">
                        <div className="row" style={{ gap: 8 }}>
                          {k && <ClassDot color={k.color} size={12} />}
                          <strong>{k?.name}</strong>
                          <StatusIcon status={l.status} size={16} />
                        </div>
                        <div>{l.title || 'Séance sans titre'}</div>
                        <div className="muted small">{l.blocks.length ? `${plural(l.blocks.length, 'bloc')} préparés` : 'Pas encore préparée'}</div>
                      </div>
                    </Link>
                    <Button size="sm" variant="primary" icon={<Play size={15} />} onClick={() => navigate(`/lessons/${l.id}/run`)} disabled={!l.blocks.length}>
                      Mode cours
                    </Button>
                  </Card>
                );
              })}
              {freeSlots.map(({ klass, slot }) => (
                <Card key={`${klass.id}-${slot.id}`} className="today-card today-free" style={{ ['--class' as string]: klass.color }}>
                  <div className="today-main">
                    <div className="today-time">
                      <strong>{slot.start}</strong>
                      <span className="muted small">{slot.end}</span>
                    </div>
                    <div className="grow">
                      <div className="row" style={{ gap: 8 }}>
                        <ClassDot color={klass.color} size={12} />
                        <strong>{klass.name}</strong>
                      </div>
                      <div className="muted small">Créneau sans séance{slot.place ? ` · ${slot.place}` : ''}</div>
                    </div>
                  </div>
                  <Button size="sm" icon={<Plus size={15} />} onClick={() => createAt(klass, slot)}>
                    Créer la séance
                  </Button>
                </Card>
              ))}
            </div>
          </Section>

          <TodoSection lessons={lessons} today={today} />

          {toReview.length > 0 && (
            <Section title={`Bilans à faire (${toReview.length})`} actions={<span className="muted small">30 secondes par séance</span>}>
              <Card style={{ padding: 6 }} className="lesson-list">
                {toReview.slice(0, 5).map((l) => {
                  const k = l.classId ? classById.get(l.classId) : undefined;
                  return (
                    <div key={l.id} className="lesson-row">
                      <Link to={`/lessons/${l.id}`} className="lesson-row-main">
                        {k && <ClassDot color={k.color} size={12} />}
                        <div className="lesson-row-text">
                          <div className="lesson-row-title">
                            <strong>{k?.name}</strong> <span>{l.title || 'Séance sans titre'}</span>
                          </div>
                          <div className="lesson-row-meta muted small">
                            {l.date} · {l.start}–{l.end}
                          </div>
                        </div>
                      </Link>
                      <Button size="sm" icon={<ClipboardCheck size={15} />} onClick={() => setReviewing(l)}>
                        Bilan
                      </Button>
                    </div>
                  );
                })}
              </Card>
              {toReview.length > 5 && <p className="muted small">… et {toReview.length - 5} autres séances passées sans bilan.</p>}
            </Section>
          )}

          {toPrepare.length > 0 && (
            <Section title={`À préparer (${toPrepare.length})`} actions={<span className="muted small">dans les 14 jours</span>}>
              <Card style={{ padding: 6 }} className="lesson-list">
                {toPrepare.slice(0, 6).map((l) => (
                  <LessonRow key={l.id} lesson={l} klass={l.classId ? classById.get(l.classId) : undefined} showClass />
                ))}
              </Card>
            </Section>
          )}

          <Section title="Cette semaine" actions={<Link to="/planning" className="small">Voir le planning →</Link>}>
            {upcoming.length === 0 ? (
              <p className="muted">Pas d'autre séance prévue dans les 7 prochains jours.</p>
            ) : (
              <Card style={{ padding: 6 }} className="lesson-list">
                {upcoming.map((l) => (
                  <LessonRow key={l.id} lesson={l} klass={l.classId ? classById.get(l.classId) : undefined} showClass />
                ))}
              </Card>
            )}
          </Section>

          <div className="grid grid-2">
            <Card className="stat">
              <ClipboardList size={20} />
              <div>
                <strong>
                  {stats.prepared}/{stats.total}
                </strong>
                <span className="muted small"> séances préparées</span>
                <div className="progress" style={{ marginTop: 6 }}>
                  <div style={{ width: `${stats.total ? (stats.prepared / stats.total) * 100 : 0}%` }} />
                </div>
              </div>
            </Card>
            <Card className="stat">
              <Users size={20} />
              <div>
                <strong>{plural(classes.length, 'classe')}</strong>
                <span className="muted small">
                  {' '}
                  · {stats.done} séances faites · {plural(exercisesCount, 'situation')} en bibliothèque
                </span>
              </div>
            </Card>
          </div>
        </>
      )}
      {reviewing && <ReviewModal lesson={reviewing} onClose={() => setReviewing(null)} />}
      {closing && year && <ClosureModal yearId={year.id} onClose={() => setClosing(false)} />}
    </>
  );
}
