import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { Lesson } from '../types';
import { useData } from '../store/data';
import { activityOf, useYearClasses, useYearLessons } from '../store/selectors';
import { Button, Card, PageHeader, Section } from '../components/ui';
import { ClassDot } from '../components/cards';
import { formatDay, timeToMin, todayISO } from '../lib/dates';
import { lessonMaterialTexts, mergeMaterials } from '../lib/materials';
import { venueOf } from '../lib/venues';
import { cls } from '../lib/util';

const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Jour à afficher : aujourd'hui s'il reste une séance, sinon le prochain jour de cours. */
export function dayToShow(lessons: Lesson[], today: string, minute: number): string | null {
  const live = lessons.filter((l) => l.status !== 'cancelled' && l.date);
  if (live.some((l) => l.date === today && timeToMin(l.end) > minute)) return today;
  return live.find((l) => l.date! > today)?.date ?? null;
}

/** Séance en cours, ou qui commence dans les 15 minutes : celle que l'on veut ouvrir au gymnase. */
export function currentLesson(lessons: Lesson[], today: string, minute: number): Lesson | undefined {
  return lessons.find((l) => l.status !== 'cancelled' && l.date === today && timeToMin(l.start) - 15 <= minute && minute < timeToMin(l.end));
}

/** Vue du jour, pensée pour le téléphone au gymnase : séance en cours, suivantes, matériel de la journée. */
export function TodayPage() {
  const lessons = useYearLessons();
  const classes = useYearClasses();
  const settings = useData((s) => s.data.settings);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [minute, setMinute] = useState(nowMin);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = setInterval(() => setMinute(nowMin()), 30_000);
    return () => clearInterval(t);
  }, []);

  const today = todayISO();
  const day = dayToShow(lessons, today, minute);
  const list = useMemo(() => lessons.filter((l) => l.date === day && l.status !== 'cancelled'), [lessons, day]);
  const current = day === today ? currentLesson(list, today, minute) : undefined;
  const gear = useMemo(() => mergeMaterials(list.flatMap((l) => lessonMaterialTexts(l))), [list]);
  const classById = new Map(classes.map((k) => [k.id, k]));

  return (
    <>
      <PageHeader title={day === today ? "Aujourd'hui" : 'Prochain jour de cours'} subtitle={day ? <span className="cap-first">{formatDay(day)}</span> : 'Aucun cours à venir'} />

      <div className="stack">
        {list.map((l) => {
          const k = l.classId ? classById.get(l.classId) : undefined;
          const live = current?.id === l.id;
          const past = day === today && timeToMin(l.end) <= minute;
          const startsIn = day === today ? timeToMin(l.start) - minute : null;
          const endsIn = live ? timeToMin(l.end) - minute : null;
          const cycle = l.cycleId ? data.cycles[l.cycleId] : undefined;
          const act = activityOf(data, l.activityId ?? cycle?.activityId ?? null);
          const venue = venueOf(settings, l, k);
          return (
            <Card key={l.id} className={cls('today-card', live && 'today-live', past && 'today-past')} style={{ ['--class' as string]: k?.color }}>
              <Link to={`/lessons/${l.id}`} className="today-main">
                <div className="today-time">
                  <strong>{l.start}</strong>
                  <span className="muted small">{l.end}</span>
                </div>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    {k && <ClassDot color={k.color} size={12} />}
                    <strong>{k?.name}</strong>
                    {act && <span>{act.emoji}</span>}
                  </div>
                  <div>{l.title || 'Séance sans titre'}</div>
                  <div className="muted small">
                    {live && endsIn !== null ? `En cours · fin dans ${endsIn} min` : startsIn !== null && startsIn > 0 ? `Dans ${startsIn >= 60 ? `${Math.floor(startsIn / 60)} h ${String(startsIn % 60).padStart(2, '0')}` : `${startsIn} min`}` : past ? 'Terminée' : ''}
                    {venue ? `${live || startsIn ? ' · ' : ''}${venue.name}` : ''}
                  </div>
                </div>
              </Link>
              {!past && (
                <Button size={live ? 'md' : 'sm'} variant={live ? 'primary' : 'secondary'} icon={<Play size={16} />} onClick={() => navigate(`/lessons/${l.id}/run`)} disabled={!l.blocks.length}>
                  Mode cours
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {gear.length > 0 && (
        <Section title="🧰 Matériel de la journée">
          <Card className="mat-list">
            {gear.map((m) => (
              <label key={m.name} className={cls('check', 'mat-item', checked.has(m.name) && 'mat-done')}>
                <input
                  type="checkbox"
                  checked={checked.has(m.name)}
                  onChange={() =>
                    setChecked((cur) => {
                      const next = new Set(cur);
                      if (next.has(m.name)) next.delete(m.name);
                      else next.add(m.name);
                      return next;
                    })
                  }
                />
                <span>
                  {m.qty !== null && <strong>{m.qty} × </strong>}
                  {m.name}
                </span>
              </label>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}
