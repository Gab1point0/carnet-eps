import { Link } from 'react-router-dom';
import type { Klass, Lesson } from '../types';
import { useData } from '../store/data';
import { toastUndo } from '../store/ui';
import { evaluationsToGrade, GRADED } from '../lib/evaluations';
import { EVAL_KINDS } from '../lib/levels';
import { formatShort } from '../lib/dates';
import { Card, Section } from './ui';
import { ClassDot } from './cards';

/** Accueil : évaluations passées qui restent à noter. Cocher une évaluation la retire de la liste. */
export function EvaluationsToGrade({ lessons, classById, today, nowHM }: { lessons: Lesson[]; classById: Map<string, Klass>; today: string; nowHM: string }) {
  const list = evaluationsToGrade(lessons, today, nowHM);
  if (!list.length) return null;

  const markGraded = (l: Lesson) => {
    const patch = useData.getState().patch;
    patch('lessons', l.id, { tasksDone: [...l.tasksDone, GRADED] });
    toastUndo(`« ${l.title || 'Évaluation'} » notée`, () => {
      const cur = useData.getState().data.lessons[l.id];
      if (cur) patch('lessons', l.id, { tasksDone: cur.tasksDone.filter((t) => t !== GRADED) });
    });
  };

  return (
    <Section title={`Évaluations à rendre (${list.length})`} actions={<span className="muted small">cochez quand les notes sont rendues</span>}>
      <Card style={{ padding: 6 }} className="lesson-list">
        {list.map((l) => {
          const k = l.classId ? classById.get(l.classId) : undefined;
          const kind = l.evalKind ? EVAL_KINDS[l.evalKind] : null;
          return (
            <div key={l.id} className="lesson-row">
              <label className="grade-check" title="Notes rendues">
                <input type="checkbox" checked={false} onChange={() => markGraded(l)} aria-label={`Notes rendues pour ${k?.name ?? ''} ${l.title}`} />
              </label>
              <Link to={`/lessons/${l.id}`} className="lesson-row-main">
                {k && <ClassDot color={k.color} size={12} />}
                <div className="lesson-row-text">
                  <div className="lesson-row-title">
                    <strong>{k?.name}</strong> <span>{l.title || 'Séance sans titre'}</span>
                  </div>
                  <div className="lesson-row-meta muted small">
                    {kind ? `${kind.emoji} ${kind.label}` : '📝 Évaluation'}
                    {l.date && ` · ${formatShort(l.date)}`}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </Card>
    </Section>
  );
}
