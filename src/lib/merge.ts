import type { AppData, Collection, ID } from '../types';
import { COLLECTIONS } from '../types';

interface Stamped {
  updatedAt: number;
}

/**
 * Fusionne deux versions du carnet sans rien perdre :
 * - une entité présente des deux côtés → la plus récemment modifiée gagne ;
 * - une suppression (pierre tombale) l'emporte si elle est plus récente que la dernière modification.
 * Fonction pure et symétrique : merge(a, b) ≡ merge(b, a).
 */
export function mergeData(a: AppData, b: AppData): AppData {
  const deleted: Record<ID, number> = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted ?? {})) {
    deleted[id] = Math.max(deleted[id] ?? 0, t);
  }

  const out: AppData = {
    schemaVersion: 1,
    settings: (a.settings?.updatedAt ?? 0) >= (b.settings?.updatedAt ?? 0) ? a.settings : b.settings,
    years: {},
    classes: {},
    cycles: {},
    lessons: {},
    exercises: {},
    deleted,
  };

  for (const c of COLLECTIONS) {
    const left = (a[c] ?? {}) as Record<ID, Stamped>;
    const right = (b[c] ?? {}) as Record<ID, Stamped>;
    const target = out[c] as Record<ID, Stamped>;
    const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const id of ids) {
      const l = left[id];
      const r = right[id];
      const winner = !l ? r : !r ? l : l.updatedAt >= r.updatedAt ? l : r;
      const tomb = deleted[id];
      if (tomb !== undefined && tomb >= winner.updatedAt) continue;
      target[id] = winner;
    }
  }
  return out;
}

/** Deux documents sont-ils équivalents ? (sert à éviter des synchronisations inutiles) */
export function sameData(a: AppData, b: AppData): boolean {
  if (a.settings.updatedAt !== b.settings.updatedAt) return false;
  for (const c of COLLECTIONS as Collection[]) {
    const l = a[c] as Record<ID, Stamped>;
    const r = b[c] as Record<ID, Stamped>;
    const lk = Object.keys(l);
    if (lk.length !== Object.keys(r).length) return false;
    for (const id of lk) if (!r[id] || r[id].updatedAt !== l[id].updatedAt) return false;
  }
  return Object.keys(a.deleted).length === Object.keys(b.deleted).length;
}
