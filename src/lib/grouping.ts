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
export function autoGroups(
  students: Student[],
  count: number,
  mode: GroupMode,
  scores: Record<ID, number> = {},
  rand: () => number = Math.random,
  /** Parité filles-garçons : autant de filles et de garçons que possible dans chaque groupe (hasard et hétérogènes). */
  mixSex = false,
): Record<ID, number> {
  const n = Math.max(1, Math.min(count, students.length || 1));
  if (mixSex && mode !== 'homogeneous') return mixedGroups(students, n, mode === 'heterogeneous' ? scores : {}, rand);
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

/**
 * Groupes mixtes : les filles, puis les garçons, puis les élèves dont le sexe n'est pas renseigné sont distribués
 * à la suite, en serpentin (1, 2, 3, 3, 2, 1…). Chaque groupe reçoit ainsi autant de filles (à une près) et autant
 * de garçons (à un près), et les effectifs restent équilibrés. Avec des notes, chaque sexe est rangé du meilleur au
 * moins bon avant la distribution (groupes hétérogènes) ; sinon, l'ordre est tiré au hasard.
 */
function mixedGroups(students: Student[], n: number, scores: Record<ID, number>, rand: () => number): Record<ID, number> {
  const order = (list: Student[]) => {
    const scored = list.filter((s) => scores[s.id] !== undefined).sort((a, b) => scores[b.id] - scores[a.id]);
    return [...scored, ...shuffle(list.filter((s) => scores[s.id] === undefined), rand)];
  };
  const queue = [...order(students.filter((s) => s.sex === 'F')), ...order(students.filter((s) => s.sex === 'G')), ...shuffle(students.filter((s) => s.sex !== 'F' && s.sex !== 'G'), rand)];
  // Point de départ tiré au hasard : ce n'est pas toujours le groupe 1 qui prend la fille ou le garçon en plus.
  const shift = Math.floor(rand() * n);
  const assign: Record<ID, number> = {};
  queue.forEach((s, i) => {
    const round = Math.floor(i / n);
    const g = round % 2 === 0 ? i % n : n - 1 - (i % n);
    assign[s.id] = ((g + shift) % n) + 1;
  });
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
