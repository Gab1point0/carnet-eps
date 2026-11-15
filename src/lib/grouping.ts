import type { ID } from '../types';
import type { Student } from './privateData';

// Groupes d'élèves pour les fiches d'évaluation. Tout se calcule sur l'appareil : rien n'est envoyé à Claude.

export type GroupMode = 'random' | 'homogeneous' | 'heterogeneous';

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Répartit les élèves en `count` groupes :
 * - au hasard ;
 * - homogènes : niveaux proches ensemble (les meilleurs dans le groupe 1) ;
 * - hétérogènes : niveaux mélangés, distribués en serpentin pour équilibrer les groupes.
 * Les élèves sans note (`scores` absent) sont répartis au hasard à la fin, sans déséquilibrer les effectifs.
 */
export function autoGroups(students: Student[], count: number, mode: GroupMode, scores: Record<ID, number> = {}, rand: () => number = Math.random): Record<ID, number> {
  const n = Math.max(1, Math.min(count, students.length || 1));
  const withScore = students.filter((s) => scores[s.id] !== undefined);
  const without = shuffle(
    students.filter((s) => scores[s.id] === undefined),
    rand,
  );
  const assign: Record<ID, number> = {};
  const sizes = Array.from({ length: n }, () => 0);
  // Taille visée de chaque groupe : les premiers groupes prennent l'élève en plus s'il y a un reste.
  const target = Array.from({ length: n }, (_, i) => Math.floor(students.length / n) + (i < students.length % n ? 1 : 0));

  if (mode === 'random' || !withScore.length) {
    shuffle(students, rand).forEach((s, i) => (assign[s.id] = (i % n) + 1));
    return assign;
  }
  const ranked = [...withScore].sort((a, b) => scores[b.id] - scores[a.id]);
  if (mode === 'homogeneous') {
    let g = 0;
    for (const s of ranked) {
      while (g < n - 1 && sizes[g] >= target[g]) g++;
      assign[s.id] = g + 1;
      sizes[g]++;
    }
  } else {
    // Serpentin : 1, 2, 3, 3, 2, 1, 1, 2… pour que chaque groupe ait des forts et des moins forts.
    ranked.forEach((s, i) => {
      const round = Math.floor(i / n);
      const g = round % 2 === 0 ? i % n : n - 1 - (i % n);
      assign[s.id] = g + 1;
      sizes[g]++;
    });
  }
  // Élèves sans note : dans les groupes les moins remplis.
  for (const s of without) {
    const g = sizes.indexOf(Math.min(...sizes));
    assign[s.id] = g + 1;
    sizes[g]++;
  }
  return assign;
}

/** Élèves rangés par groupe (1, 2… puis « à placer »), dans l'ordre de la liste au sein d'un groupe. */
export function byGroup(students: Student[], assign: Record<ID, number>, count: number): Array<{ group: number | null; students: Student[] }> {
  const out: Array<{ group: number | null; students: Student[] }> = [];
  for (let g = 1; g <= count; g++) out.push({ group: g, students: students.filter((s) => assign[s.id] === g) });
  const rest = students.filter((s) => !assign[s.id] || assign[s.id] > count);
  if (rest.length) out.push({ group: null, students: rest });
  return out;
}
