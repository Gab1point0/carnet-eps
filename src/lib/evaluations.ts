import type { ISODate, Lesson } from '../types';

/** Marque posée dans `Lesson.tasksDone` quand les notes de l'évaluation sont rendues. */
export const GRADED = 'graded';

/** Séance d'évaluation à noter : formative ou sommative, ou avec un bloc « Évaluation » (une diagnostique ne se note pas). */
export function isGradedEvaluation(l: Lesson): boolean {
  if (l.evalKind === 'diagnostic') return false;
  if (l.evalKind === 'formative' || l.evalKind === 'summative' || l.blocks.some((b) => b.kind === 'evaluation')) return true;
  // Séance pas encore réglée mais dont le titre le dit : « Eval BAC », « Évaluation finale », « CCF ».
  return !l.evalKind && /\b(é|e)val|\bbac\b|\bccf\b/i.test(l.title) && !/diagnos/i.test(l.title);
}

/** La séance a eu lieu : bilan fait, ou date (et heure de fin) passées. */
function happened(l: Lesson, today: ISODate, nowHM: string): boolean {
  if (l.status === 'cancelled') return false;
  if (l.status === 'done') return true;
  return !!l.date && (l.date < today || (l.date === today && !!l.end && l.end <= nowHM));
}

/**
 * Évaluations passées dont les notes restent à rendre, les plus anciennes d'abord.
 * Cocher « Saisir l'évaluation sur École Directe » dans les tâches compte aussi comme rendu.
 */
export function evaluationsToGrade(lessons: Lesson[], today: ISODate, nowHM: string): Lesson[] {
  const enteredElsewhere = new Set(lessons.flatMap((l) => l.tasksDone.filter((t) => t.startsWith('auto:ed:')).map((t) => t.slice('auto:ed:'.length))));
  return lessons
    .filter((l) => isGradedEvaluation(l) && happened(l, today, nowHM) && !l.tasksDone.includes(GRADED) && !enteredElsewhere.has(l.id))
    .sort((a, b) => `${a.date ?? ''}${a.start}`.localeCompare(`${b.date ?? ''}${b.start}`));
}
