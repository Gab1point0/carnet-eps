import { Link } from 'react-router-dom';
import type { EvalKind, Lesson } from '../types';
import { Card, Section } from './ui';
import { EVAL_KINDS, LEVELS, highShare, total } from '../lib/levels';
import { formatDM } from '../lib/dates';

const ORDER: EvalKind[] = ['diagnostic', 'formative', 'summative'];

export function LevelBar({ levels }: { levels: [number, number, number, number] }) {
  const t = total(levels) || 1;
  return (
    <div className="level-bar" role="img" aria-label={LEVELS.map((lv, i) => `${levels[i]} ${lv.short.toLowerCase()}`).join(', ')}>
      {LEVELS.map((lv, i) => (
        <i key={lv.label} style={{ width: `${(levels[i] / t) * 100}%`, background: lv.color }} />
      ))}
    </div>
  );
}

/** Parcours d'évaluation d'un cycle : diagnostique → formative → sommative, avec le niveau relevé et la progression. */
export function EvalPath({ lessons }: { lessons: Lesson[] }) {
  const steps = ORDER.map((k) => ({ kind: k, lesson: lessons.find((l) => l.evalKind === k) }));
  if (steps.every((s) => !s.lesson)) return null;
  const first = steps.find((s) => s.lesson?.levels)?.lesson?.levels ?? null;
  const last = [...steps].reverse().find((s) => s.lesson?.levels)?.lesson;
  const delta = first && last?.levels && last.levels !== first ? Math.round((highShare(last.levels) - highShare(first)) * 100) : null;

  return (
    <Section title="Parcours d'évaluation">
      <Card>
        <div className="eval-path">
          {steps.map(({ kind, lesson }) => (
            <div key={kind} className={lesson?.levels ? 'eval-step' : 'eval-step eval-todo'}>
              <strong>
                {EVAL_KINDS[kind].emoji} {EVAL_KINDS[kind].label}
              </strong>
              {lesson ? (
                <>
                  <Link to={`/lessons/${lesson.id}`} className="small">
                    {lesson.title || 'Séance'}
                    {lesson.date ? ` · ${formatDM(lesson.date)}` : ''}
                  </Link>
                  {lesson.levels ? (
                    <>
                      <LevelBar levels={lesson.levels} />
                      <span className="muted small">{lesson.levels.map((n, i) => `${n} ${LEVELS[i].short.toLowerCase()}`).join(' · ')}</span>
                    </>
                  ) : (
                    <span className="muted small">{lesson.status === 'done' ? 'Niveau non relevé : faites le bilan (dictée possible).' : 'Pas encore réalisée.'}</span>
                  )}
                </>
              ) : (
                <span className="muted small">Pas de séance associée.</span>
              )}
            </div>
          ))}
        </div>
        {delta !== null && (
          <p className="small" style={{ marginTop: 10 }}>
            Élèves qui maîtrisent (acquis + avancés) depuis le diagnostic : <strong>{delta >= 0 ? '+' : ''}{delta} points</strong>
          </p>
        )}
      </Card>
    </Section>
  );
}
