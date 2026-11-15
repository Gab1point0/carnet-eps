import type { AppData, Cycle, Klass } from '../types';
import { cycleLessons, fieldOfActivity } from '../store/selectors';
import { evaluationsToGrade, GRADED, isGradedEvaluation } from '../lib/evaluations';
import { todayISO } from '../lib/dates';
import { cls } from '../lib/util';
import { Card } from './ui';

/** Lycée : CA5 pour tous, collège : CA1 à CA4 (les programmes de collège n'ont pas de CA5). */
const isLycee = (level: string) => /2nde|1re|1ère|terminale|tle|bac|cap/i.test(level);

/** Vue d'ensemble de l'année d'une classe : champs d'apprentissage couverts, évaluations rendues, bilans faits. */
export function ClassYear({ data, klass, cycles }: { data: AppData; klass: Klass; cycles: Cycle[] }) {
  const today = todayISO();
  const lessons = cycles.flatMap((c) => cycleLessons(data, c.id));
  if (!lessons.length) return null;

  const fields = data.settings.fields.filter((f) => isLycee(klass.level) || f.id !== 'ca5');
  const byField = new Map<string, Array<{ cycle: Cycle; state: 'done' | 'now' | 'next' }>>();
  for (const c of cycles) {
    const f = fieldOfActivity(data, c.activityId);
    if (!f) continue;
    const state = c.endDate && c.endDate < today ? 'done' : c.startDate && c.startDate > today ? 'next' : 'now';
    byField.set(f.id, [...(byField.get(f.id) ?? []), { cycle: c, state }]);
  }

  const past = lessons.filter((l) => l.status !== 'cancelled' && l.date && l.date < today);
  const reviewed = past.filter((l) => l.status === 'done').length;
  const evals = lessons.filter(isGradedEvaluation);
  const evalsPast = evals.filter((l) => l.date && l.date < today && l.status !== 'cancelled');
  const toGrade = evaluationsToGrade(lessons, today, '23:59').length;
  const graded = evalsPast.filter((l) => l.tasksDone.includes(GRADED)).length;

  return (
    <Card className="class-year">
      <div className="class-year-fields">
        {fields.map((f) => {
          const list = byField.get(f.id) ?? [];
          return (
            <div key={f.id} className={cls('class-year-field', !list.length && 'class-year-missing')} style={{ ['--field' as string]: f.color }} title={f.label}>
              <strong>{f.short}</strong>
              <span className="small">{list.length ? [...new Set(list.map((x) => x.cycle.title.replace(/ — .*/, '')))].join(', ') : 'Aucun cycle'}</span>
            </div>
          );
        })}
      </div>
      <div className="class-year-stats small">
        <span>
          <strong>{reviewed}</strong>/{past.length} séances passées faites
        </span>
        <span>
          <strong>{graded}</strong>/{evalsPast.length} évaluations rendues{toGrade ? ` · ${toGrade} à noter` : ''}
        </span>
        <span>
          <strong>{evals.length - evalsPast.length}</strong> évaluations à venir
        </span>
      </div>
    </Card>
  );
}
