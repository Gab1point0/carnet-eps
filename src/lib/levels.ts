import type { EvalKind, Lesson } from '../types';
import { normalize } from './util';

export const LEVELS = [
  { label: 'Débutant', short: 'Débutants', hint: 'ne réussit pas encore', color: '#e5484d' },
  { label: 'En cours', short: 'En cours', hint: 'réussit parfois, fragile', color: '#f5a524' },
  { label: 'Acquis', short: 'Acquis', hint: 'réussit de façon stable', color: '#30a46c' },
  { label: 'Avancé', short: 'Avancés', hint: 'maîtrise, peut aider les autres', color: '#3e63dd' },
] as const;

export const EVAL_KINDS: Record<EvalKind, { label: string; emoji: string }> = {
  diagnostic: { label: 'Diagnostique', emoji: '🩺' },
  formative: { label: 'Formative', emoji: '🧭' },
  summative: { label: 'Sommative', emoji: '🏁' },
};

export type Levels = [number, number, number, number];

const UNITS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};

/** « douze », « vingt-deux », « vingt et un », « 7 » → nombre ; `null` si ce n'est pas un nombre. */
export function parseNumber(w: string): number | null {
  const s = normalize(w).replace(/\s+et\s+/g, '-').replace(/\s+/g, '-');
  if (/^\d+$/.test(s)) return Number(s);
  if (s in UNITS) return UNITS[s];
  const m = /^(vingt|trente|quarante|cinquante)-(.+)$/.exec(s);
  if (m && m[2] in UNITS && UNITS[m[2]] < 10) return UNITS[m[1]] + UNITS[m[2]];
  return null;
}

// Vocabulaire dit pour chaque degré (sans accents).
const LABELS: Array<[number, string]> = [
  [0, "debutants?|en grande difficulte|en difficulte|n'y arrivent pas|ne reussissent pas|tres faibles?|faibles?"],
  [1, 'en cours|fragiles?|moyens?|a moitie|hesitants?|en progres|presque'],
  [2, "acquis|maitrisent|reussissent|a l'aise|bons?|solides?"],
  [3, 'avances?|experts?|tres a l\'aise|tres bons?|excellents?|au-dessus'],
];

/**
 * Lit « six débutants, dix en cours, huit acquis, deux avancés » (ou chiffres) et renvoie
 * le nombre d'élèves par degré. `null` si aucun effectif n'est reconnu.
 */
export function parseLevels(text: string): Levels | null {
  const t = normalize(text).replace(/[,;.]/g, ' , ');
  const out: Levels = [0, 0, 0, 0];
  let found = false;
  // Les degrés les plus spécifiques d'abord, pour que « très à l'aise » ne soit pas lu « à l'aise ».
  const order = [3, 0, 1, 2];
  const used: Array<[number, number]> = [];
  for (const lvl of order) {
    const alts = LABELS.find(([i]) => i === lvl)![1];
    const re = new RegExp(`(\\d+|[a-z-]+(?:\\s+et\\s+(?:un|une))?)\\s+(?:eleves?\\s+)?(?:sont\\s+|etaient\\s+)?(?:${alts})`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const n = parseNumber(m[1].trim().split(/\s+/).slice(-3).join(' ')) ?? parseNumber(m[1].trim().split(/\s+/).slice(-1)[0]);
      if (n === null) continue;
      const start = m.index;
      const end = m.index + m[0].length;
      if (used.some(([a, b]) => start < b && end > a)) continue;
      used.push([start, end]);
      out[lvl] += n;
      found = true;
    }
  }
  return found ? out : null;
}

export const total = (l: Levels) => l[0] + l[1] + l[2] + l[3];
/** Part d'élèves qui n'ont pas encore les bases (débutants + en cours), 0–1. */
export const lowShare = (l: Levels) => (total(l) ? (l[0] + l[1]) / total(l) : 0);
/** Part d'élèves qui maîtrisent (acquis + avancés), 0–1. */
export const highShare = (l: Levels) => (total(l) ? (l[2] + l[3]) / total(l) : 0);

/** Dernière évaluation d'un cycle (avant `before`) pour laquelle un niveau a été relevé. */
export function latestMeasured(lessons: Lesson[], before: number): Lesson | undefined {
  return lessons
    .filter((l) => l.order < before && l.levels && total(l.levels) > 0)
    .sort((a, b) => b.order - a.order)[0];
}
