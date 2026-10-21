import { normalize } from './util';

export interface MaterialItem {
  /** Libellé affiché (première occurrence rencontrée). */
  name: string;
  /** Quantité cumulée si les textes indiquaient des nombres ; `null` sinon. */
  qty: number | null;
  /** Installation (gymnase, bassin, piste…) plutôt que matériel à sortir. */
  venue: boolean;
}

const VENUE = /^(gymnase|bassin|piste|salle|plateau|terrain|sae\b|studio|praticable|anneau|stade|salle de)/i;

/** Découpe un texte de matériel en éléments, sans couper à l'intérieur des parenthèses. */
export function splitMaterials(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text.replace(/\r/g, '')) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n')) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts
    .map((p) => p.replace(/^[\s\-•*]+/, '').replace(/\.$/, '').trim())
    .filter((p) => p.length > 0);
}

const key = (s: string) => normalize(s).replace(/s\b/g, '').replace(/\s+/g, ' ').trim();

/** Fusionne les éléments de plusieurs textes : « 12 plots » + « 6 plots » → « 18 plots ». */
export function mergeMaterials(texts: string[]): MaterialItem[] {
  const map = new Map<string, MaterialItem>();
  for (const t of texts) {
    for (const raw of splitMaterials(t)) {
      // « 12 plots » → quantité 12 ; mais pas « 8 à 10 tables », « 200 m », « 2 kg ».
      const m = /^(\d+)\s*(?:x|×)?\s+(?!à\s|-|m\b|km\b|min\b|s\b|kg\b|cm\b|%)(.+)$/i.exec(raw);
      const qty = m ? Number(m[1]) : null;
      const name = (m ? m[2] : raw).trim();
      const k = key(name);
      if (!k) continue;
      const cur = map.get(k);
      if (cur) cur.qty = qty === null ? cur.qty : (cur.qty ?? 0) + qty;
      else map.set(k, { name, qty, venue: VENUE.test(name) });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Texte de matériel d'une séance : matériel général + celui de chaque bloc. */
export function lessonMaterialTexts(l: { materials: string; blocks: Array<{ materials: string }> }): string[] {
  // Matériel structuré : une ligne « - 15 ballons — bloc 2 (passes) » par objet, déjà totalisé pour la séance
  // (un même objet resservi dans plusieurs blocs n'est compté qu'une fois).
  if (l.materials.split('\n').some((x) => /^- /.test(x))) {
    return l.materials
      .split('\n')
      .map((x) => x.replace(/^🏟 Installation : /, '').replace(/^- /, '').replace(/\s+—\s+.*$/, '').trim())
      .filter(Boolean);
  }
  return [l.materials, ...l.blocks.map((b) => b.materials)].filter(Boolean);
}

/** Critères d'évaluation d'un cycle, extraits de la phrase « Critères proposés : a · b · c ». */
export function criteriaOf(evaluation: string): string[] {
  const m = /crit[èe]res?\s+(?:propos[ée]s?\s*)?:\s*([^\n]+)/i.exec(evaluation);
  if (!m) return [];
  return m[1]
    .split(/\s·\s|·/)
    .map((c) => c.replace(/\s*Barème.*$/i, '').replace(/\.\s*$/, '').trim())
    .filter((c) => c.length > 2)
    .map((c) => c[0].toUpperCase() + c.slice(1));
}
