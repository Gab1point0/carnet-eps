import type { ID } from '../types';

// Données personnelles des élèves, gardées à part du carnet : elles ne vont jamais dans le fichier synchronisé
// en clair, ni à Claude. Voir store/vault.ts (stockage chiffré) et lib/crypto.ts.

export interface Student {
  id: ID;
  /** Prénom et initiale suffisent (minimisation). */
  name: string;
  /** Pour les barèmes différenciés : « F » fille, « G » garçon (vide = pas renseigné). */
  sex?: 'F' | 'G';
}

/** Résultats d'un élève sur une fiche : niveau 0 à 4 par critère (0/1 pour une case unique), date de modification. */
export interface StudentMarks {
  v: Record<string, number>;
  /** Observations écrites (critères « texte »). */
  txt?: Record<string, string>;
  absent?: boolean;
  t: number;
  /** Date de chaque case (« v:clé », « txt:clé », « absent ») : deux appareils se fusionnent case par case. */
  at?: Record<string, number>;
}

/** Répartition en groupes : élève → numéro de groupe (1, 2…). `count` = nombre de groupes affichés. */
export interface Grouping {
  assign: Record<ID, number>;
  count: number;
  t: number;
  /** Date du dernier changement de groupe de chaque élève : deux appareils se fusionnent élève par élève. */
  at?: Record<ID, number>;
  /** Date du dernier changement du nombre de groupes. */
  ct?: number;
}

/** Groupes enregistrés d'une classe (« Équipes du tournoi »…), réutilisables dans toutes ses fiches. */
export interface SavedGrouping extends Grouping {
  classId: ID;
  name: string;
  /** Supprimé : gardé vide pour que la suppression passe aux autres appareils. */
  deleted?: boolean;
}

/**
 * Tournoi enregistré (rondes, résultats, places) pour être repris plus tard. `state` dépend de la formule
 * (`src/components/TournamentModal.tsx`) et contient les identifiants et les noms des participants.
 */
export interface SavedTournament {
  classId: ID;
  lessonId?: ID | null;
  name: string;
  formula: string;
  state: unknown;
  t: number;
  /** Supprimé : gardé vide pour que la suppression passe aux autres appareils. */
  deleted?: boolean;
}

export interface PrivateDoc {
  version: 1;
  /** Élèves de chaque classe. */
  rosters: Record<ID, { students: Student[]; updatedAt: number }>;
  /** Fiches remplies : séance → élève → résultats. */
  sheets: Record<ID, Record<ID, StudentMarks>>;
  /** Groupes de chaque fiche (séance → groupes). */
  groups: Record<ID, Grouping>;
  /** Groupes enregistrés, par identifiant. */
  savedGroups: Record<ID, SavedGrouping>;
  /** Tournois enregistrés, par identifiant. */
  tournaments: Record<ID, SavedTournament>;
}

export const emptyPrivate = (): PrivateDoc => ({ version: 1, rosters: {}, sheets: {}, groups: {}, savedGroups: {}, tournaments: {} });

/** Coffre d'une version précédente (sans groupes) : on complète. */
export const normalizePrivate = (d: Partial<PrivateDoc>): PrivateDoc => ({ ...emptyPrivate(), ...d, groups: d.groups ?? {}, savedGroups: d.savedGroups ?? {}, tournaments: d.tournaments ?? {} });

const newest = <T extends { t: number }>(x: T | undefined, y: T | undefined) => (!x ? y! : !y ? x : y.t > x.t ? y : x);

/** Fusion de deux appareils : la liste d'élèves la plus récente l'emporte ; pour les fiches, élève par élève. */
export function mergePrivate(a0: PrivateDoc, b0: PrivateDoc): PrivateDoc {
  const a = normalizePrivate(a0);
  const b = normalizePrivate(b0);
  // Ce que cette version ne connaît pas (ajouté par une version plus récente) est gardé tel quel, jamais effacé.
  const out = { ...b, ...a, ...emptyPrivate() } as PrivateDoc;
  for (const id of new Set([...Object.keys(a.groups), ...Object.keys(b.groups)])) out.groups[id] = mergeGrouping(a.groups[id], b.groups[id]);
  for (const id of new Set([...Object.keys(a.savedGroups), ...Object.keys(b.savedGroups)])) out.savedGroups[id] = newest(a.savedGroups[id], b.savedGroups[id]);
  for (const id of new Set([...Object.keys(a.tournaments), ...Object.keys(b.tournaments)])) out.tournaments[id] = newest(a.tournaments[id], b.tournaments[id]);
  for (const id of new Set([...Object.keys(a.rosters), ...Object.keys(b.rosters)])) {
    const x = a.rosters[id];
    const y = b.rosters[id];
    out.rosters[id] = !x ? y : !y ? x : y.updatedAt > x.updatedAt ? y : x;
  }
  for (const lesson of new Set([...Object.keys(a.sheets), ...Object.keys(b.sheets)])) {
    const x = a.sheets[lesson] ?? {};
    const y = b.sheets[lesson] ?? {};
    const rows: Record<ID, StudentMarks> = {};
    for (const s of new Set([...Object.keys(x), ...Object.keys(y)])) rows[s] = mergeMarks(x[s], y[s]);
    out.sheets[lesson] = rows;
  }
  return out;
}

/** Même contenu, quel que soit l'ordre des clés (deux appareils rangent les mêmes données dans un ordre différent). */
const sortedJson = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(sortedJson).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${sortedJson((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null';
export const samePrivate = (a: PrivateDoc, b: PrivateDoc) => sortedJson(a) === sortedJson(b);

/** Groupes datés élève par élève : un élève jamais touché compte pour 0. Groupes d'avant : la date de la fiche. */
const cellKeys = (r: StudentMarks) => [...Object.keys(r.v).map((k) => `v:${k}`), ...Object.keys(r.txt ?? {}).map((k) => `txt:${k}`), ...(r.absent ? ['absent'] : [])];
const cellStamp = (r: StudentMarks, key: string) => (r.at ? (r.at[key] ?? 0) : r.t);
const cellOf = (r: StudentMarks, key: string): unknown => (key === 'absent' ? !!r.absent : key.startsWith('v:') ? r.v[key.slice(2)] : r.txt?.[key.slice(4)]);

/** Résultats d'un élève venus de deux appareils : case par case, la plus récente l'emporte. */
export function mergeMarks(a: StudentMarks | undefined, b: StudentMarks | undefined): StudentMarks {
  if (!a) return b!;
  if (!b) return a;
  if (!a.at && !b.at) return b.t > a.t ? b : a;
  const out: StudentMarks = { v: {}, t: Math.max(a.t, b.t), at: {} };
  const txt: Record<string, string> = {};
  for (const key of new Set([...cellKeys(a), ...cellKeys(b), ...Object.keys(a.at ?? {}), ...Object.keys(b.at ?? {})])) {
    const from = cellStamp(b, key) > cellStamp(a, key) ? b : a;
    out.at![key] = cellStamp(from, key);
    const val = cellOf(from, key);
    if (val === undefined || val === false) continue;
    if (key === 'absent') out.absent = true;
    else if (key.startsWith('v:')) out.v[key.slice(2)] = val as number;
    else txt[key.slice(4)] = val as string;
  }
  if (Object.keys(txt).length) out.txt = txt;
  return out;
}

/** Nouveaux résultats d'un élève : seules les cases qui changent sont datées de maintenant. */
export function stampMarks(prev: StudentMarks | undefined, next: Omit<StudentMarks, 't' | 'at'>, now: number): StudentMarks {
  const at: Record<string, number> = {};
  if (prev) for (const key of new Set([...cellKeys(prev), ...Object.keys(prev.at ?? {})])) at[key] = cellStamp(prev, key);
  const n = next as StudentMarks;
  for (const key of new Set([...(prev ? cellKeys(prev) : []), ...cellKeys(n)])) {
    if ((prev ? cellOf(prev, key) : undefined) !== cellOf(n, key)) at[key] = now;
  }
  if (!!prev?.absent !== !!next.absent) at.absent = now;
  return { ...next, t: now, at };
}

const stampOf = (g: Grouping, sid: ID) => (g.at ? (g.at[sid] ?? 0) : g.t);

/**
 * Fusion des groupes d'une fiche élève par élève : un appareil en retard (qui n'a pas encore reçu les groupes)
 * ne peut plus effacer ceux faits ailleurs, il ne change que les élèves qu'il a vraiment déplacés.
 */
export function mergeGrouping(a: Grouping | undefined, b: Grouping | undefined): Grouping {
  if (!a) return b!;
  if (!b) return a;
  const assign: Record<ID, number> = {};
  const at: Record<ID, number> = {};
  for (const sid of new Set([...Object.keys(a.assign), ...Object.keys(b.assign), ...Object.keys(a.at ?? {}), ...Object.keys(b.at ?? {})])) {
    const from = stampOf(b, sid) > stampOf(a, sid) ? b : a;
    assign[sid] = from.assign[sid] ?? 0;
    at[sid] = stampOf(from, sid);
  }
  const ca = a.ct ?? a.t;
  const cb = b.ct ?? b.t;
  const highest = Math.max(0, ...Object.values(assign));
  return { assign, at, count: Math.max(cb > ca ? b.count : a.count, highest), t: Math.max(a.t, b.t), ct: Math.max(ca, cb) };
}

/** Nouveaux groupes d'une fiche : seuls les élèves qui changent de groupe sont datés de maintenant. */
export function stampGrouping(prev: Grouping | undefined, next: Omit<Grouping, 't'>, now: number): Grouping {
  const at: Record<ID, number> = {};
  if (prev) for (const sid of new Set([...Object.keys(prev.assign), ...Object.keys(prev.at ?? {})])) at[sid] = stampOf(prev, sid);
  for (const sid of new Set([...Object.keys(prev?.assign ?? {}), ...Object.keys(next.assign)])) {
    if ((prev?.assign[sid] ?? 0) !== (next.assign[sid] ?? 0)) at[sid] = now;
  }
  const ct = prev && prev.count === next.count ? (prev.ct ?? prev.t) : now;
  return { assign: { ...next.assign }, count: next.count, at, ct, t: now };
}

/** Résumé d'un coffre, pour choisir une ancienne version (sans afficher de nom). */
export function summarizePrivate(d: PrivateDoc) {
  return {
    students: Object.values(d.rosters).reduce((n, r) => n + r.students.length, 0),
    filled: Object.values(d.sheets).filter((rows) => Object.values(rows).some((r) => Object.keys(r.v).length || Object.keys(r.txt ?? {}).length)).length,
    grouped: Object.values(d.groups).filter((g) => g.count > 0 && Object.values(g.assign).some((x) => x > 0)).length,
    saved: Object.values(d.savedGroups).filter((g) => !g.deleted).length,
    tournaments: Object.values(d.tournaments ?? {}).filter((x) => !x.deleted).length,
  };
}

const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Renomme les identifiants d'élèves de `doc` pour qu'ils correspondent, par le nom, aux listes de `target`
 * (une même classe saisie deux fois a des identifiants différents).
 */
export function remapStudents(doc: PrivateDoc, target: PrivateDoc): PrivateDoc {
  const map: Record<ID, ID> = {};
  for (const [classId, roster] of Object.entries(doc.rosters)) {
    const cur = target.rosters[classId]?.students ?? [];
    const byName = new Map(cur.map((s) => [nameKey(s.name), s.id]));
    for (const s of roster.students) {
      const id = byName.get(nameKey(s.name));
      if (id && id !== s.id) map[s.id] = id;
    }
  }
  if (!Object.keys(map).length) return doc;
  const re = <T,>(rec: Record<ID, T>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [map[k] ?? k, v]));
  const reG = <G extends Grouping>(g: G): G => ({ ...g, assign: re(g.assign), ...(g.at ? { at: re(g.at) } : {}) });
  // Tournois : toute chaîne (ou clé) égale à un ancien identifiant d'élève, à n'importe quelle profondeur.
  const deep = (v: unknown): unknown =>
    typeof v === 'string' ? (map[v] ?? v) : Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [map[k] ?? k, deep(x)])) : v;
  return {
    ...doc,
    rosters: Object.fromEntries(Object.entries(doc.rosters).map(([c, r]) => [c, { ...r, students: r.students.map((s) => ({ ...s, id: map[s.id] ?? s.id })) }])),
    sheets: Object.fromEntries(Object.entries(doc.sheets).map(([l, rows]) => [l, re(rows)])),
    groups: Object.fromEntries(Object.entries(doc.groups).map(([l, g]) => [l, reG(g)])),
    savedGroups: Object.fromEntries(Object.entries(doc.savedGroups).map(([id, g]) => [id, reG(g)])),
    tournaments: Object.fromEntries(Object.entries(doc.tournaments ?? {}).map(([id, x]) => [id, { ...x, state: deep(x.state) }])),
  };
}

const hasMarks = (r: StudentMarks | undefined) => !!r && (Object.keys(r.v).length > 0 || Object.keys(r.txt ?? {}).length > 0);
const hasGroups = (g: Grouping | undefined) => !!g && g.count > 0 && Object.values(g.assign).some((x) => x > 0);

/**
 * Remet dans le coffre actuel ce qu'une ancienne version contenait et qui a disparu : groupes des fiches,
 * groupes enregistrés, tournois, résultats d'élèves, listes d'élèves vidées. Tout est daté de `now` pour passer
 * aux autres appareils. Ce qui a été fait depuis et n'existait pas avant est gardé.
 */
export function restorePrivate(current0: PrivateDoc, old0: PrivateDoc, now: number) {
  const current = normalizePrivate(current0);
  const old = remapStudents(normalizePrivate(old0), current);
  const doc: PrivateDoc = {
    ...current,
    rosters: { ...current.rosters },
    sheets: { ...current.sheets },
    groups: { ...current.groups },
    savedGroups: { ...current.savedGroups },
    tournaments: { ...current.tournaments },
  };
  const n = { groups: 0, saved: 0, rows: 0, rosters: 0, tournaments: 0 };
  for (const [classId, r] of Object.entries(old.rosters)) {
    if (r.students.length && !doc.rosters[classId]?.students.length) {
      doc.rosters[classId] = { students: r.students, updatedAt: now };
      n.rosters++;
    }
  }
  for (const [lessonId, g] of Object.entries(old.groups)) {
    const cur = doc.groups[lessonId];
    if (!hasGroups(g)) continue;
    if (cur && JSON.stringify([cur.count, Object.entries(cur.assign).filter(([, x]) => x > 0).sort()]) === JSON.stringify([g.count, Object.entries(g.assign).filter(([, x]) => x > 0).sort()])) continue;
    const at = Object.fromEntries([...new Set([...Object.keys(g.assign), ...Object.keys(cur?.assign ?? {})])].map((sid) => [sid, now]));
    doc.groups[lessonId] = { assign: Object.fromEntries(Object.keys(at).map((sid) => [sid, g.assign[sid] ?? 0])), count: g.count, at, ct: now, t: now };
    n.groups++;
  }
  for (const [id, g] of Object.entries(old.savedGroups)) {
    const cur = doc.savedGroups[id];
    if (g.deleted || (cur && !cur.deleted)) continue;
    doc.savedGroups[id] = { ...g, deleted: false, t: now };
    n.saved++;
  }
  for (const [id, x] of Object.entries(old.tournaments)) {
    const cur = doc.tournaments[id];
    if (x.deleted || !x.state || (cur && !cur.deleted)) continue;
    doc.tournaments[id] = { ...x, deleted: false, t: now };
    n.tournaments++;
  }
  for (const [lessonId, rows] of Object.entries(old.sheets)) {
    const cur = doc.sheets[lessonId] ?? {};
    let next: Record<ID, StudentMarks> | null = null;
    for (const [sid, r] of Object.entries(rows)) {
      if (!hasMarks(r) || hasMarks(cur[sid])) continue;
      next ??= { ...cur };
      next[sid] = { v: r.v, ...(r.txt ? { txt: r.txt } : {}), ...(r.absent ? { absent: true } : {}), t: now };
      n.rows++;
    }
    if (next) doc.sheets[lessonId] = next;
  }
  return { doc, ...n };
}

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
