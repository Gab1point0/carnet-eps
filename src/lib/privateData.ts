import type { ID } from '../types';

// Données personnelles des élèves, gardées à part du carnet : elles ne vont jamais dans le fichier synchronisé
// en clair, ni à Claude. Voir store/vault.ts (stockage chiffré) et lib/crypto.ts.

export interface Student {
  id: ID;
  /** Prénom et initiale suffisent (minimisation). */
  name: string;
}

/** Résultats d'un élève sur une fiche : niveau 0 à 4 par critère (0/1 pour une case unique), date de modification. */
export interface StudentMarks {
  v: Record<string, number>;
  absent?: boolean;
  t: number;
}

export interface PrivateDoc {
  version: 1;
  /** Élèves de chaque classe. */
  rosters: Record<ID, { students: Student[]; updatedAt: number }>;
  /** Fiches remplies : séance → élève → résultats. */
  sheets: Record<ID, Record<ID, StudentMarks>>;
}

export const emptyPrivate = (): PrivateDoc => ({ version: 1, rosters: {}, sheets: {} });

/** Fusion de deux appareils : la liste d'élèves la plus récente l'emporte ; pour les fiches, élève par élève. */
export function mergePrivate(a: PrivateDoc, b: PrivateDoc): PrivateDoc {
  const out = emptyPrivate();
  for (const id of new Set([...Object.keys(a.rosters), ...Object.keys(b.rosters)])) {
    const x = a.rosters[id];
    const y = b.rosters[id];
    out.rosters[id] = !x ? y : !y ? x : y.updatedAt > x.updatedAt ? y : x;
  }
  for (const lesson of new Set([...Object.keys(a.sheets), ...Object.keys(b.sheets)])) {
    const x = a.sheets[lesson] ?? {};
    const y = b.sheets[lesson] ?? {};
    const rows: Record<ID, StudentMarks> = {};
    for (const s of new Set([...Object.keys(x), ...Object.keys(y)])) rows[s] = !x[s] ? y[s] : !y[s] ? x[s] : y[s].t > x[s].t ? y[s] : x[s];
    out.sheets[lesson] = rows;
  }
  return out;
}

export const samePrivate = (a: PrivateDoc, b: PrivateDoc) => JSON.stringify(a) === JSON.stringify(b);

/** « Durand Léa\nMARTIN Tom » → noms nettoyés, sans doublon, en gardant l'identifiant des élèves déjà connus. */
export function parseRoster(text: string, existing: Student[], makeId: () => ID): Student[] {
  const seen = new Set<string>();
  const out: Student[] = [];
  for (const line of text.split(/\r?\n|;/)) {
    const name = line.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(existing.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? { id: makeId(), name });
  }
  return out;
}

/** Clé d'un critère sur une fiche : bloc et intitulé, pour retrouver les résultats si la fiche est retouchée. */
export const criterionKey = (block: string, label: string) => `${block}::${label}`;
