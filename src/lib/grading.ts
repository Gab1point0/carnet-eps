import type { Grading } from '../types';

/** Note sur 20 donnée par défaut à chaque degré : Débutant, En cours, Acquis, Avancé. */
export const DEFAULT_SCALE: Grading['scale'] = [5, 10, 15, 20];

/** Moyenne de la classe sur 20 : moyenne des critères, chacun étant la moyenne des degrés pondérée par le nombre d'élèves. */
export function classAverage(g: Grading | null): number | null {
  if (!g) return null;
  const perCriterion = g.criteria
    .map((c) => {
      const n = c.counts.reduce((a, b) => a + b, 0);
      return n ? c.counts.reduce((sum, k, i) => sum + k * g.scale[i], 0) / n : null;
    })
    .filter((x): x is number => x !== null);
  if (!perCriterion.length) return null;
  return Math.round((perCriterion.reduce((a, b) => a + b, 0) / perCriterion.length) * 10) / 10;
}

/** Nouvelle grille à partir des critères du cycle (une ligne par critère). */
export function gradingFrom(criteria: string[]): Grading {
  return { criteria: (criteria.length ? criteria : ['Critère 1']).map((label) => ({ label, counts: [0, 0, 0, 0] })), scale: [...DEFAULT_SCALE] };
}
