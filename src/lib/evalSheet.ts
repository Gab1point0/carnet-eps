import type { Workbook, Worksheet } from 'exceljs';
import {
  evalExpr,
  exprRefs,
  exprToExcel,
  ExprError,
  FUNCTION_NAMES,
  parseExpr,
  rankFraction,
  rankToExcel,
  rankBySexToExcel,
  type SexCells,
  scaleFraction,
  scaleToExcel,
  slugRef,
  type Expr,
  type ScalePoint,
  type ValueFormat,
} from './evalCalc';

// Fiche d'évaluation à remplir sur tablette (dans l'application, ou dans Excel / Google Sheets).
// Une ligne par élève. Chaque critère est :
// - `levels` : 4 cases (Débutant → Avancé), coloriées selon la case la plus à droite cochée ;
// - `single` : une case (réussi / non) ;
// - `number` : une valeur à saisir (VMA, chrono, score, nombre de réussites…) ;
// - `computed` : une valeur calculée par une formule, comme dans un tableur (écart en %, meilleur essai, SI…) ;
// - `choice` : une liste déroulante (chaque choix rapporte une part des points) ;
// - `text` : une observation libre (pas de points).
// Une valeur saisie ou calculée rapporte des points par un barème (tableau de valeurs, linéaire ou par paliers) ou
// selon le rang dans la classe. Points d'un bloc = moyenne pondérée de ses critères notés × points du bloc.

export type CriterionKind = 'levels' | 'single' | 'number' | 'computed' | 'choice' | 'text';

export interface EvalScoring {
  /** `none` : pas de points (valeur d'appui pour un calcul) ; `table` : barème ; `rank` : rang dans la classe. */
  type: 'none' | 'table' | 'rank';
  points?: ScalePoint[];
  /** Barème par paliers plutôt que linéaire. */
  steps?: boolean;
  /** Rang : la meilleure valeur est la plus grande (`high`, ex. VMA) ou la plus petite (`low`, ex. chrono). */
  best?: 'high' | 'low';
  /** Rang : filles et garçons classés séparément (d'après le sexe renseigné dans la liste d'élèves). */
  bySex?: boolean;
}

export interface EvalCriterion {
  label: string;
  kind: CriterionKind;
  /** Ce que l'on observe : 4 phrases (levels), 1 phrase (single), ou ce que la valeur mesure (autres). */
  observe: string[];
  /** Nom court utilisé dans les formules (« vma », « score1 »). */
  ref?: string;
  /** Unité affichée (« km/h », « pts », « % »). */
  unit?: string;
  /** Saisie : nombre décimal, chrono (min:s, gardé en secondes) ou compteur (boutons − et +). */
  format?: ValueFormat;
  /** Chiffres après la virgule à l'affichage. */
  decimals?: number;
  /** `computed` : formule (« ABS(score1 - projet1) / projet1 * 100 »). */
  expr?: string;
  scoring?: EvalScoring;
  /** `choice` : choix proposés et part des points de chacun (0 à 100). */
  options?: Array<{ label: string; pct: number }>;
  /** `computed` : l'enseignant peut remplacer le calcul pour un élève (projet ajusté à la main…). */
  editable?: boolean;
  /** Poids dans le bloc (1 par défaut ; 0 = observé sans compter). */
  weight?: number;
}

export interface EvalBlock {
  name: string;
  points: number;
  criteria: EvalCriterion[];
}

export interface EvalSheetSpec {
  title: string;
  /** Attendus visés : AFC (collège) ou AFL (lycée), formulés comme dans les programmes. */
  expectations: string[];
  blocks: EvalBlock[];
  bonus: Array<{ label: string; points: number }>;
  sources: string[];
  /** Choix faits (répartition des points, adaptations au niveau), en une ou deux phrases. */
  notes: string;
  /** Arrondi de la note finale : 0,1 (par défaut), 0,25, 0,5 ou 1 point. */
  rounding?: number;
  /** Note finale plafonnée à 20 (bonus compris). */
  cap?: boolean;
}

export const LEVEL_NAMES = ['Débutant', 'En cours', 'Acquis', 'Avancé'];
const LEVEL_FILL = ['FFF4B6B6', 'FFFBD38D', 'FFFDF29B', 'FFB6E3B6'];
const GREEN = 'FFB6E3B6';
export const KIND_NAMES: Record<CriterionKind, string> = {
  levels: '4 cases',
  single: '1 case',
  number: 'Valeur à saisir',
  computed: 'Calcul',
  choice: 'Liste de choix',
  text: 'Observation (texte)',
};

/** Valeurs toujours disponibles dans les formules : 1 si l'élève est une fille (ou un garçon), 0 sinon, vide si pas renseigné. */
export const SEX_REFS = ['fille', 'garcon'] as const;
const isSexRef = (r: string) => (SEX_REFS as readonly string[]).includes(r);
const RESERVED = new Set<string>([...FUNCTION_NAMES, ...SEX_REFS]);

/** Le critère rapporte-t-il des points ? */
export function isScored(c: EvalCriterion): boolean {
  if ((c.weight ?? 1) <= 0) return false;
  if (c.kind === 'levels' || c.kind === 'single') return true;
  if (c.kind === 'choice') return !!c.options?.length;
  if (c.kind === 'number' || c.kind === 'computed') return c.scoring?.type === 'rank' || (c.scoring?.type === 'table' && !!c.scoring.points?.length);
  return false;
}
export const weightOf = (c: EvalCriterion) => (isScored(c) ? (c.weight ?? 1) : 0);
/** Critères qui ont une valeur utilisable dans une formule. */
export const hasValue = (c: EvalCriterion) => c.kind !== 'text';

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Number(v.replace(',', '.'))) && v.trim() ? Number(v.replace(',', '.')) : d);

/** Complète un critère : type connu, nom court unique, barème propre. */
function tidyCriterion(c: EvalCriterion, used: Set<string>): EvalCriterion {
  const kind: CriterionKind = (['levels', 'single', 'number', 'computed', 'choice', 'text'] as const).includes(c.kind) ? c.kind : 'levels';
  const out: EvalCriterion = { label: c.label.trim(), kind, observe: (c.observe ?? []).map((o) => o.trim()).filter(Boolean) };
  if (c.weight !== undefined && c.weight !== null && num(c.weight, 1) !== 1) out.weight = Math.max(0, num(c.weight, 1));
  if (kind !== 'text') {
    let ref = slugRef((c.ref ?? '').trim() || c.label);
    if (RESERVED.has(ref)) ref = `v_${ref}`;
    const base = ref;
    for (let i = 2; used.has(ref); i++) ref = `${base}_${i}`;
    used.add(ref);
    out.ref = ref;
  }
  if (kind === 'number' || kind === 'computed') {
    if (c.unit?.trim()) out.unit = c.unit.trim();
    out.format = c.format === 'time' || c.format === 'count' ? c.format : 'decimal';
    if (c.decimals !== undefined && c.decimals !== null) out.decimals = Math.max(0, Math.min(4, Math.round(num(c.decimals, 2))));
    if (kind === 'computed') {
      out.expr = (c.expr ?? '').trim();
      if (c.editable) out.editable = true;
    }
    const t = c.scoring?.type;
    if (t === 'table') {
      const points = (c.scoring?.points ?? []).map((p) => ({ at: num(p.at, NaN), pct: Math.max(0, Math.min(100, num(p.pct, NaN))) })).filter((p) => Number.isFinite(p.at) && Number.isFinite(p.pct));
      out.scoring = points.length ? { type: 'table', points: points.sort((a, b) => a.at - b.at), ...(c.scoring?.steps ? { steps: true } : {}) } : { type: 'none' };
    } else if (t === 'rank') out.scoring = { type: 'rank', best: c.scoring?.best === 'low' ? 'low' : 'high', ...(c.scoring?.bySex ? { bySex: true } : {}) };
    else out.scoring = { type: 'none' };
  }
  if (kind === 'choice') out.options = (c.options ?? []).filter((o) => o.label?.trim()).map((o) => ({ label: o.label.trim().replace(/,/g, ' '), pct: Math.max(0, Math.min(100, num(o.pct, 0))) }));
  return out;
}

/** Vérifie et complète une fiche venue de Claude ou de l'éditeur : barème sur 20, au moins un critère par bloc, textes nettoyés. */
export function tidyEvalSheet(raw: EvalSheetSpec): EvalSheetSpec {
  const used = new Set<string>();
  const blocks = (raw.blocks ?? [])
    .map((b) => ({
      name: (b.name ?? '').trim() || 'Bloc',
      points: Math.max(0, Number(b.points) || 0),
      criteria: (b.criteria ?? []).filter((c) => c.label?.trim()).map((c) => tidyCriterion(c, used)),
    }))
    .filter((b) => b.criteria.length);
  // Barème ramené à 20 si Claude s'est trompé dans l'addition (les blocs sans critère noté peuvent valoir 0).
  const total = blocks.reduce((s, b) => s + b.points, 0);
  if (blocks.length && Math.abs(total - 20) > 0.01) {
    const scaled = blocks.map((b) => Math.round(((total ? b.points / total : 1 / blocks.length) * 20) * 2) / 2);
    scaled[scaled.length - 1] += 20 - scaled.reduce((a, b) => a + b, 0);
    blocks.forEach((b, i) => (b.points = scaled[i]));
  }
  const rounding = [0.1, 0.25, 0.5, 1].includes(Number(raw.rounding)) ? Number(raw.rounding) : undefined;
  return {
    title: raw.title?.trim() || 'Évaluation',
    expectations: (raw.expectations ?? []).map((e) => e.trim()).filter(Boolean),
    blocks,
    bonus: (raw.bonus ?? []).filter((b) => b.label?.trim()).map((b) => ({ label: b.label.trim(), points: Math.max(0, Number(b.points) || 0) })),
    sources: (raw.sources ?? []).map((s) => s.trim()).filter(Boolean),
    notes: raw.notes?.trim() ?? '',
    ...(rounding && rounding !== 0.1 ? { rounding } : {}),
    ...(raw.cap ? { cap: true } : {}),
  };
}

/** Problèmes d'une fiche (formules illisibles, noms inconnus, calcul qui tourne en rond) : affichés dans l'éditeur. */
export function sheetProblems(spec: EvalSheetSpec): string[] {
  const refs = new Map<string, EvalCriterion>();
  for (const b of spec.blocks) for (const c of b.criteria) if (c.ref) refs.set(c.ref, c);
  const out: string[] = [];
  const deps = new Map<string, Set<string>>();
  for (const b of spec.blocks)
    for (const c of b.criteria) {
      if (c.kind !== 'computed') continue;
      if (!c.expr) {
        out.push(`« ${c.label} » : formule vide.`);
        continue;
      }
      try {
        const e = parseExpr(c.expr);
        const all = refsOf(e);
        const unknown = [...all].filter((r) => !refs.has(r) && !isSexRef(r));
        if (unknown.length) out.push(`« ${c.label} » : ${unknown.map((u) => `« ${u} »`).join(', ')} n'existe pas (noms disponibles : ${[...refs.keys()].join(', ')}).`);
        if (c.ref) deps.set(c.ref, all);
      } catch (err) {
        out.push(`« ${c.label} » : ${err instanceof ExprError ? err.message : 'formule illisible'}.`);
      }
    }
  // Boucle : a dépend de b qui dépend de a.
  const visiting = new Set<string>();
  const loops = new Set<string>();
  const visit = (r: string, path: string[]) => {
    if (visiting.has(r)) {
      loops.add(path.slice(path.indexOf(r)).join(' → '));
      return;
    }
    visiting.add(r);
    for (const d of deps.get(r) ?? []) visit(d, [...path, d]);
    visiting.delete(r);
  };
  for (const r of deps.keys()) visit(r, [r]);
  for (const l of loops) out.push(`Calcul en boucle : ${l}.`);
  return out;
}

const refsOf = (e: Expr) => exprRefs(e).all;

/** La formule appelle-t-elle cette fonction ? */
function usesFn(e: Expr, name: string): boolean {
  if (e.t === 'fn') return e.name === name || e.args.some((a) => usesFn(a, name));
  if (e.t === 'bin') return usesFn(e.a, name) || usesFn(e.b, name);
  if (e.t === 'neg') return usesFn(e.a, name);
  return false;
}

const withRefsCache = new WeakMap<EvalSheetSpec, EvalSheetSpec>();
/** Fiches anciennes (sans noms courts) : on les complète, sans rien changer d'autre. */
export function withRefs(spec: EvalSheetSpec): EvalSheetSpec {
  if (spec.blocks.every((b) => b.criteria.every((c) => c.ref || c.kind === 'text'))) return spec;
  const hit = withRefsCache.get(spec);
  if (hit) return hit;
  const used = new Set(spec.blocks.flatMap((b) => b.criteria.map((c) => c.ref).filter((r): r is string => !!r)));
  const out = {
    ...spec,
    blocks: spec.blocks.map((b) => ({
      ...b,
      criteria: b.criteria.map((c) => {
        if (c.ref || c.kind === 'text') return c;
        let ref = slugRef(c.label);
        if (RESERVED.has(ref)) ref = `v_${ref}`;
        const base = ref;
        for (let i = 2; used.has(ref); i++) ref = `${base}_${i}`;
        used.add(ref);
        return { ...c, ref };
      }),
    })),
  };
  withRefsCache.set(spec, out);
  return out;
}

const parsedCache = new Map<string, Expr | null>();
function parsed(src: string | undefined): Expr | null {
  if (!src) return null;
  if (!parsedCache.has(src)) {
    try {
      parsedCache.set(src, parseExpr(src));
    } catch {
      parsedCache.set(src, null);
    }
  }
  return parsedCache.get(src)!;
}

// ── Calcul des notes (application) ─────────────────────────────────────────

export interface SheetRow {
  marks: Record<string, number>;
  absent?: boolean;
  /** Sexe de l'élève, pour les formules « fille » / « garcon ». */
  sex?: 'F' | 'G';
}

export interface RowResult {
  /** Valeur de chaque critère (clé de critère) : niveau 0-4, 0/1, valeur saisie ou calculée ; null = vide. */
  values: Record<string, number | null>;
  /** Part des points obtenue par critère noté (0 à 1). */
  fracs: Record<string, number>;
  blocks: number[];
  total: number;
}

const roundTo = (x: number, step: number) => Math.round(Math.round(x / step) * step * 1000) / 1000;

/** Notes de toute la classe : les rangs et les statistiques de classe dépendent des autres élèves (les absents ne comptent pas). */
export function evaluateSheet(spec0: EvalSheetSpec, rows: SheetRow[], keyOf: (block: string, label: string) => string): RowResult[] {
  const spec = withRefs(spec0);
  const crits = spec.blocks.flatMap((b) => b.criteria.map((c) => ({ c, key: keyOf(b.name, c.label) })));
  const byRef = new Map(crits.filter((x) => x.c.ref).map((x) => [x.c.ref!, x]));
  const memo = rows.map(() => new Map<string, number | null>());
  const classMemo = new Map<string, number[]>();

  const valueOf = (ri: number, ref: string, stack: Set<string>): number | null => {
    const m = memo[ri];
    if (m.has(ref)) return m.get(ref)!;
    const x = byRef.get(ref);
    let v: number | null = null;
    if (!x && isSexRef(ref)) {
      const sex = rows[ri].sex;
      v = sex ? Number(sex === (ref === 'fille' ? 'F' : 'G')) : null;
    } else if (x && !stack.has(ref)) {
      const marks = rows[ri].marks;
      const raw = marks[x.key];
      switch (x.c.kind) {
        case 'levels':
          v = Math.max(0, Math.min(4, raw ?? 0));
          break;
        case 'single':
          v = raw ? 1 : 0;
          break;
        case 'choice': {
          const o = raw ? x.c.options?.[raw - 1] : undefined;
          v = o ? o.pct : null;
          break;
        }
        case 'number':
          v = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
          break;
        case 'computed': {
          const e = parsed(x.c.expr);
          // Valeur imposée à la main pour cet élève : elle remplace le calcul.
          if (x.c.editable && typeof raw === 'number' && Number.isFinite(raw)) v = raw;
          else if (e) {
            const inner = new Set(stack).add(ref);
            v = evalExpr(e, { get: (n) => valueOf(ri, n, inner), classValues: (n) => classOf(n, inner), sexValues: (n) => sexClassOf(n, rows[ri].sex, inner) });
          }
          break;
        }
      }
    }
    m.set(ref, v);
    return v;
  };
  const classOf = (ref: string, stack: Set<string>): number[] => {
    if (classMemo.has(ref)) return classMemo.get(ref)!;
    if (stack.has(`classe:${ref}`)) return [];
    const inner = new Set(stack).add(`classe:${ref}`);
    const out = rows.flatMap((r, i) => (r.absent ? [] : [valueOf(i, ref, inner)])).filter((v): v is number => v !== null);
    classMemo.set(ref, out);
    return out;
  };
  /** Valeurs des élèves présents du même sexe (filles et garçons classés séparément) ; null si le sexe n'est pas renseigné. */
  const sexClassOf = (ref: string, sex: 'F' | 'G' | undefined, stack: Set<string>): number[] | null => {
    if (!sex) return null;
    const id = `${sex}:${ref}`;
    if (classMemo.has(id)) return classMemo.get(id)!;
    if (stack.has(`classe:${id}`)) return [];
    const inner = new Set(stack).add(`classe:${id}`);
    const out = rows.flatMap((r, i) => (r.absent || r.sex !== sex ? [] : [valueOf(i, ref, inner)])).filter((v): v is number => v !== null);
    classMemo.set(id, out);
    return out;
  };

  const rounding = spec.rounding ?? 0.1;
  return rows.map((row, ri) => {
    const values: Record<string, number | null> = {};
    const fracs: Record<string, number> = {};
    for (const { c, key } of crits) {
      const v = c.ref ? valueOf(ri, c.ref, new Set()) : null;
      values[key] = v;
      if (!isScored(c)) continue;
      let f = 0;
      if (c.kind === 'levels') f = (v ?? 0) / 4;
      else if (c.kind === 'single') f = v ?? 0;
      else if (c.kind === 'choice') f = (v ?? 0) / 100;
      else if (v !== null && c.scoring?.type === 'table') f = scaleFraction(v, c.scoring.points ?? [], c.scoring.steps);
      else if (v !== null && c.scoring?.type === 'rank') {
        const pool = c.scoring.bySex ? sexClassOf(c.ref!, row.sex, new Set()) : classOf(c.ref!, new Set());
        f = pool ? rankFraction(v, pool, c.scoring.best ?? 'high') : 0;
      }
      fracs[key] = f;
    }
    const blocks = spec.blocks.map((b) => {
      let w = 0;
      let s = 0;
      for (const c of b.criteria) {
        const wc = weightOf(c);
        w += wc;
        s += wc * (fracs[keyOf(b.name, c.label)] ?? 0);
      }
      return w ? Math.round((s / w) * b.points * 10) / 10 : 0;
    });
    const bonus = spec.bonus.reduce((acc, b) => acc + (row.marks[bonusKey(b.label)] ? b.points : 0), 0);
    let total = roundTo(blocks.reduce((a, x) => a + x, 0) + bonus, rounding);
    if (spec.cap) total = Math.min(20, total);
    return { values, fracs, blocks, total };
  });
}

/** Notes d'un élève seul (sans classement : pour les critères au rang, compter les autres élèves avec `evaluateSheet`). */
export function scoreOf(spec: EvalSheetSpec, marks: Record<string, number>, keyOf: (block: string, label: string) => string) {
  const r = evaluateSheet(spec, [{ marks }], keyOf)[0];
  return { blocks: r.blocks, total: r.total };
}

// ── Classeur Excel / Google Sheets ─────────────────────────────────────────

const col = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const thin = { style: 'thin' as const, color: { argb: 'FFBFC5CE' } };
const thick = { style: 'medium' as const, color: { argb: 'FF000000' } };

export interface SheetLayout {
  /** Groupes de 4 cases, en numéros de colonne (1 = A) : pour le script de cases cumulatives. */
  groups: Array<[number, number]>;
  rows: { first: number; last: number };
}

const widthOf = (c: EvalCriterion) => (c.kind === 'levels' ? 4 : 1);

/** Barème lisible : « 5 → 100 % ; 20 → 0 % (linéaire) ». */
export function scoringText(c: EvalCriterion, pointsOfCrit?: number): string {
  const pts = (pct: number) => {
    if (pointsOfCrit === undefined) return `${pct} %`;
    const v = Math.round((pct / 100) * pointsOfCrit * 100) / 100;
    return `${String(v).replace('.', ',')} pt${v > 1 ? 's' : ''}`;
  };
  const unit = c.unit ? ` ${c.unit}` : '';
  if (c.kind === 'choice') return (c.options ?? []).map((o) => `${o.label} → ${pts(o.pct)}`).join(' ; ');
  if (c.scoring?.type === 'rank')
    return `Rang ${c.scoring.bySex ? 'parmi les élèves du même sexe (filles et garçons classés séparément)' : 'dans la classe'} : ${c.scoring.best === 'low' ? 'la plus petite valeur' : 'la plus grande valeur'} a tous les points, la dernière aucun, régulièrement entre les deux.`;
  if (c.scoring?.type === 'table') {
    const fmt = (v: number) => (c.format === 'time' ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : String(v).replace('.', ','));
    return `${(c.scoring.points ?? []).map((p) => `${fmt(p.at)}${unit} → ${pts(p.pct)}`).join(' ; ')} (${c.scoring.steps ? 'par paliers' : 'régulièrement entre deux lignes'})`;
  }
  return '';
}

/** Points maximum de chaque critère noté dans son bloc. */
export const critPoints = (b: EvalBlock, c: EvalCriterion) => {
  const w = b.criteria.reduce((s, x) => s + weightOf(x), 0);
  return w ? (weightOf(c) / w) * b.points : 0;
};

/** Construit le classeur : onglet « Évaluation » (une ligne par élève) et onglet « Barème ». */
export async function buildEvalWorkbook(
  spec0: EvalSheetSpec,
  opts: {
    students: number;
    className: string;
    activity: string;
    date?: string;
    /** Fiche remplie dans l'application : noms et résultats par clé de critère. */
    rows?: Array<{ name: string; marks: Record<string, number>; texts?: Record<string, string>; group?: string; absent?: boolean; sex?: 'F' | 'G' }>;
    keyOf?: (block: string, label: string) => string;
  },
): Promise<{ workbook: Workbook; layout: SheetLayout }> {
  const spec = withRefs(spec0);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carnet EPS';
  // Fiche rangée par groupes : une colonne « Groupe » après le nom.
  const withGroups = !!opts.rows?.some((r) => r.group);
  // Barème filles / garçons (formule avec « fille » ou « garcon ») : une colonne « F / G », à remplir dans le tableur si la fiche est vierge.
  const withSex = spec.blocks.some((b) =>
    b.criteria.some((c) => {
      if (c.scoring?.type === 'rank' && c.scoring.bySex) return true;
      const e = c.kind === 'computed' ? parsed(c.expr) : null;
      return !!e && ([...refsOf(e)].some(isSexRef) || usesFn(e, 'RANG_SEXE'));
    }),
  );
  const groupCol = 2;
  const sexCol = withGroups ? 3 : 2;
  const ws = wb.addWorksheet('Évaluation', { views: [{ state: 'frozen', xSplit: 1 + (withGroups ? 1 : 0) + (withSex ? 1 : 0), ySplit: 2 }] });
  const bareme = wb.addWorksheet('Barème');
  const keyOf = opts.keyOf ?? ((b: string, l: string) => `${b}::${l}`);

  const FIRST = 3;
  const LAST = FIRST + Math.max(1, opts.rows?.length ?? opts.students) - 1;
  const STATS = LAST + 2;
  const markOf = (row: number, key: string) => opts.rows?.[row - FIRST]?.marks[key];
  const groups: Array<[number, number]> = [];

  // ── Colonnes : placées d'abord, car une formule peut citer une valeur d'un bloc suivant ──
  const startCol = 2 + (withGroups ? 1 : 0) + (withSex ? 1 : 0);
  const place = new Map<string, number>();
  {
    let c = startCol;
    for (const b of spec.blocks) {
      for (const crit of b.criteria) {
        place.set(keyOf(b.name, crit.label), c);
        c += widthOf(crit);
      }
      c += 1; // note du bloc
    }
  }
  const byRef = new Map<string, { c: EvalCriterion; key: string }>();
  spec.blocks.forEach((b) => b.criteria.forEach((c) => c.ref && byRef.set(c.ref, { c, key: keyOf(b.name, c.label) })));
  /** Expression Excel de la valeur d'un critère sur une ligne (`abs` : colonne figée, pour la mise en forme conditionnelle). */
  const cellOf = (ref: string, row: number | string, abs = ''): string => {
    const x = byRef.get(ref);
    if (!x && withSex && isSexRef(ref)) {
      const s = `${abs}${col(sexCol)}${row}`;
      return `IF(${s}="${ref === 'fille' ? 'F' : 'G'}",1,IF(${s}="${ref === 'fille' ? 'G' : 'F'}",0,""))`;
    }
    if (!x) return '""';
    const c0 = place.get(x.key)!;
    const a = `${abs}${col(c0)}${row}`;
    switch (x.c.kind) {
      case 'levels':
        return `MAX(${[0, 1, 2, 3].map((k) => `${abs}${col(c0 + k)}${row}*${k + 1}`).join(',')})`;
      case 'single':
        return `(${a}*1)`;
      case 'choice': {
        const opts2 = x.c.options ?? [];
        return opts2.reduceRight((acc, o) => `IF(${a}="${o.label.replace(/"/g, "'")}",${o.pct},${acc})`, `""`);
      }
      default:
        return a;
    }
  };
  /** Sexe de l'élève sur une ligne et colonne de toute la classe (pour classer filles et garçons séparément). */
  const sexCells = (row: number | string): SexCells => ({ cell: `$${col(sexCol)}${row}`, range: `$${col(sexCol)}$${FIRST}:$${col(sexCol)}$${LAST}` });
  const rangeOf = (ref: string) => {
    const x = byRef.get(ref);
    if (!x) return '""';
    const a = col(place.get(x.key)!);
    return `$${a}$${FIRST}:$${a}$${LAST}`;
  };
  /** Part des points (0 à 1) d'un critère noté, sur une ligne. */
  const fracOf = (c: EvalCriterion, key: string, row: number | string, abs = ''): string => {
    const v = cellOf(c.ref!, row, abs);
    if (c.kind === 'levels') return `${v}/4`;
    if (c.kind === 'single') return v;
    if (c.kind === 'choice') return `IFERROR(${v}/100,0)`;
    const cell = `${abs}${col(place.get(key)!)}${row}`;
    if (c.scoring?.type === 'rank')
      return `IF(${cell}="",0,${c.scoring.bySex ? rankBySexToExcel(cell, rangeOf(c.ref!), c.scoring.best ?? 'high', sexCells(row)) : rankToExcel(cell, rangeOf(c.ref!), c.scoring.best ?? 'high')})`;
    return `IF(${cell}="",0,${scaleToExcel(cell, c.scoring?.points ?? [], c.scoring?.steps)})`;
  };

  // ── Barème (écrit d'abord : les notes y renvoient) ──
  bareme.columns = [{ width: 46 }, { width: 14 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 30 }];
  bareme.getCell('A1').value = `${spec.title} — ${opts.className}${opts.date ? ` — ${opts.date}` : ''}`;
  bareme.getCell('A1').font = { bold: true, size: 14 };
  bareme.getCell('A3').value = 'Bloc';
  bareme.getCell('B3').value = 'Points';
  ['A3', 'B3'].forEach((a) => (bareme.getCell(a).font = { bold: true }));
  const pointRow: number[] = [];
  spec.blocks.forEach((b, i) => {
    const r = 4 + i;
    bareme.getCell(`A${r}`).value = b.name;
    bareme.getCell(`B${r}`).value = b.points;
    pointRow.push(r);
  });
  const totalRow = 4 + spec.blocks.length;
  bareme.getCell(`A${totalRow}`).value = 'TOTAL (doit faire 20)';
  bareme.getCell(`A${totalRow}`).font = { bold: true };
  bareme.getCell(`B${totalRow}`).value = { formula: `SUM(B4:B${totalRow - 1})` };
  bareme.getCell(`C${totalRow}`).value = { formula: `IF(B${totalRow}=20,"OK","Attention : le total ne fait pas 20")` };
  let r = totalRow + 1;
  const bonusRow: number[] = [];
  spec.bonus.forEach((b) => {
    bareme.getCell(`A${r}`).value = `Bonus : ${b.label}`;
    bareme.getCell(`B${r}`).value = b.points;
    bonusRow.push(r);
    r++;
  });
  r += 1;
  const line = (text: string, bold = false) => {
    bareme.getCell(`A${r}`).value = text;
    bareme.getCell(`A${r}`).font = { bold };
    bareme.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' };
    r++;
  };
  const kinds = new Set(spec.blocks.flatMap((b) => b.criteria.map((c) => c.kind)));
  line('Comment remplir', true);
  if (kinds.has('levels')) line("Critère à 4 cases : cochez la case du niveau atteint (Débutant → Avancé). La couleur suit le niveau : rouge, orange, jaune, vert. Seule la case la plus à droite compte.");
  if (kinds.has('single')) line('Critère à 1 case : cochée = réussi (vert), vide = pas encore.');
  if (kinds.has('number')) line('Valeur à saisir (cases blanches) : tapez le nombre (chrono en secondes). Les calculs et les points suivent aussitôt.');
  if (kinds.has('computed'))
    line(
      spec.blocks.some((b) => b.criteria.some((c) => c.kind === 'computed' && c.editable))
        ? "Colonnes en italique : calculées. Celles marquées « modifiable » peuvent être remplacées à la main pour un élève (tapez la valeur par-dessus la formule)."
        : 'Colonnes en italique : calculées, ne pas les remplir.',
    );
  if (kinds.has('choice')) line('Liste de choix : touchez la case puis choisissez dans la liste.');
  line(
    `Les points d'un bloc = moyenne de ses critères notés × points du bloc. Les bonus s'ajoutent au total.${spec.rounding && spec.rounding !== 0.1 ? ` Note finale arrondie au ${String(spec.rounding).replace('.', ',')} point.` : ''}${spec.cap ? ' Note finale plafonnée à 20.' : ''}`,
  );
  r++;
  if (kinds.has('levels') || kinds.has('single') || spec.bonus.length) {
    line('Avant la première utilisation', true);
    line("Excel 365 ou Google Sheets : sélectionnez les cases grises (FAUX / FALSE) de l'onglet « Évaluation », puis Insertion > Case à cocher. Elles deviennent des cases à cocher, les notes et les couleurs fonctionnent aussitôt.");
    line('Google Sheets : ouvrez drive.google.com > Nouveau > Importer un fichier, puis Ouvrir avec Google Sheets.');
    r++;
  }
  line("Ce qu'on observe", true);
  bareme.getCell(`A${r}`).value = 'Critère';
  LEVEL_NAMES.forEach((n, i) => (bareme.getCell(r, 3 + i).value = n));
  bareme.getRow(r).font = { bold: true };
  r++;
  for (const b of spec.blocks) {
    for (const c of b.criteria) {
      bareme.getCell(`A${r}`).value = `${b.name} — ${c.label}`;
      if (c.kind === 'levels') c.observe.slice(0, 4).forEach((o, i) => (bareme.getCell(r, 3 + i).value = o));
      else if (c.kind === 'single') bareme.getCell(r, 3).value = `Réussi si : ${c.observe[0] ?? ''}`;
      else {
        const parts = [
          c.observe.join(' '),
          c.kind === 'computed' && c.expr ? `Calcul : ${c.expr}` : '',
          isScored(c) ? `Points : ${scoringText(c, critPoints(b, c))}` : c.kind !== 'text' ? 'Sans points (sert aux calculs ou à titre indicatif).' : '',
        ].filter(Boolean);
        bareme.getCell(r, 3).value = parts.join('\n');
        bareme.mergeCells(r, 3, r, 6);
      }
      bareme.getRow(r).alignment = { wrapText: true, vertical: 'top' };
      r++;
    }
  }
  if (byRef.size && kinds.has('computed')) {
    r++;
    line('Noms utilisés dans les calculs', true);
    for (const [ref, x] of byRef) line(`${ref} = ${x.c.label}${x.c.unit ? ` (${x.c.unit})` : ''}`);
  }
  if (spec.expectations.length) {
    r++;
    line('Attendus visés', true);
    spec.expectations.forEach((e) => line(`• ${e}`));
  }
  if (spec.notes) {
    r++;
    line('Choix faits pour cette fiche', true);
    line(spec.notes);
  }
  if (spec.sources.length) {
    r++;
    line('Sources', true);
    spec.sources.forEach((s) => line(s));
  }

  // ── Évaluation : une ligne par élève ──
  ws.getColumn(1).width = 26;
  ws.getCell('A1').value = opts.className;
  ws.getCell('A2').value = 'Élève (nom à saisir)';
  ws.getCell('A1').font = { bold: true, size: 12 };
  opts.rows?.forEach((row, i) => (ws.getCell(FIRST + i, 1).value = row.name));
  if (withGroups) {
    ws.getColumn(groupCol).width = 11;
    ws.getCell(2, groupCol).value = 'Groupe';
    ws.getCell(2, groupCol).font = { bold: true };
    opts.rows?.forEach((row, i) => {
      const cell = ws.getCell(FIRST + i, groupCol);
      cell.value = row.group ?? '';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thin, bottom: thin, right: thin };
    });
  }
  if (withSex) {
    ws.getColumn(sexCol).width = 7;
    ws.getCell(2, sexCol).value = 'F / G';
    ws.getCell(2, sexCol).font = { bold: true };
    for (let rr = FIRST; rr <= LAST; rr++) {
      const cell = ws.getCell(rr, sexCol);
      cell.value = opts.rows?.[rr - FIRST]?.sex ?? '';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thin, bottom: thin, right: thin };
      cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"F,G"'] };
    }
  }
  ws.getCell('A2').font = { bold: true };
  const noteCols: string[] = [];
  const statCols: string[] = [];
  const style = (cell: ReturnType<Worksheet['getCell']>, left: boolean) => {
    cell.border = { left: left ? thick : thin, right: thin, top: thin, bottom: thin };
  };
  const checkbox = (colN: number, left: boolean, value: (row: number) => boolean = () => false) => {
    ws.getColumn(colN).width = 5.5;
    for (let row = FIRST; row <= LAST; row++) {
      const cell = ws.getCell(row, colN);
      cell.value = value(row);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { color: { argb: 'FF9AA3AE' }, size: 8 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      style(cell, left);
    }
  };
  const header = (c: number, text: string, rotate: boolean) => {
    ws.getCell(2, c).value = text;
    ws.getCell(2, c).alignment = rotate ? { textRotation: 90, horizontal: 'center', vertical: 'bottom', wrapText: true } : { horizontal: 'center', vertical: 'middle', wrapText: true };
  };
  const numFmt = (crit: EvalCriterion) => (crit.decimals === 0 || crit.format === 'count' ? '0' : `0.${'#'.repeat(crit.decimals ?? 2)}`);
  /** Couleur selon la part des points (rouge → vert), comme les critères à 4 cases. */
  const colorByFrac = (ref: string, frac: string, valueCell: string) =>
    ws.addConditionalFormatting({
      ref,
      rules: [0.25, 0.5, 0.75, 1.01].map((lim, i) => ({
        type: 'expression' as const,
        priority: i + 1,
        formulae: [`AND(${valueCell}<>"",${frac}<${lim})`],
        style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: LEVEL_FILL[i] } } },
      })),
    });

  let c = startCol;
  spec.blocks.forEach((b, bi) => {
    const start = c;
    const parts: string[] = []; // formules de part des points, avec {row}
    const weights: number[] = [];
    b.criteria.forEach((crit, ci) => {
      const first = ci === 0;
      const key = keyOf(b.name, crit.label);
      const a = col(c);
      if (crit.kind === 'levels') {
        const z = col(c + 3);
        groups.push([c, c + 3]);
        ws.mergeCells(2, c, 2, c + 3);
        header(c, crit.label, false);
        for (let k = 0; k < 4; k++) checkbox(c + k, first && k === 0, (row) => (markOf(row, key) ?? 0) > k);
        const cols4 = [0, 1, 2, 3].map((k) => col(c + k));
        const level = (row: number, abs = '') => `MAX(${cols4.map((x, k) => `${abs}${x}${row}*${k + 1}`).join(',')})`;
        ws.addConditionalFormatting({
          ref: `${a}${FIRST}:${z}${LAST}`,
          rules: [1, 2, 3, 4].map((lv, i) => ({
            type: 'expression' as const,
            priority: i + 1,
            formulae: [`${level(FIRST, '$')}=${lv}`],
            style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: LEVEL_FILL[i] } } },
          })),
        });
      } else if (crit.kind === 'single') {
        header(c, crit.label, true);
        checkbox(c, first, (row) => (markOf(row, key) ?? 0) > 0);
        ws.addConditionalFormatting({
          ref: `${a}${FIRST}:${a}${LAST}`,
          rules: [{ type: 'expression', priority: 1, formulae: [`$${a}${FIRST}=TRUE`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } }],
        });
      } else {
        // Valeur saisie, calculée, liste de choix ou texte : une colonne.
        const unit = crit.format === 'time' ? 's' : crit.unit;
        header(c, `${crit.label}${unit ? ` (${unit})` : ''}`, false);
        ws.getColumn(c).width = crit.kind === 'text' ? 28 : crit.kind === 'choice' ? 14 : 10;
        for (let row = FIRST; row <= LAST; row++) {
          const cell = ws.getCell(row, c);
          const src = opts.rows?.[row - FIRST];
          if (crit.kind === 'number') {
            const v = src?.marks[key];
            cell.value = typeof v === 'number' && Number.isFinite(v) ? v : null;
            cell.numFmt = numFmt(crit);
          } else if (crit.kind === 'computed') {
            const e = parsed(crit.expr);
            const forced = crit.editable ? src?.marks[key] : undefined;
            cell.value = typeof forced === 'number' && Number.isFinite(forced) ? forced : e ? { formula: exprToExcel(e, (n) => cellOf(n, row), rangeOf, withSex ? sexCells(row) : undefined) } : '';
            cell.numFmt = numFmt(crit);
            cell.font = { italic: true, color: { argb: 'FF475467' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
          } else if (crit.kind === 'choice') {
            const idx = src?.marks[key];
            cell.value = idx ? (crit.options?.[idx - 1]?.label ?? null) : null;
            if (crit.options?.length) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${crit.options.map((o) => o.label.replace(/"/g, "'")).join(',')}"`] };
          } else cell.value = src?.texts?.[key] ?? null;
          cell.alignment = { horizontal: crit.kind === 'text' ? 'left' : 'center', vertical: 'middle', wrapText: crit.kind === 'text' };
          style(cell, first);
        }
        if (crit.kind === 'number' || crit.kind === 'computed') {
          statCols.push(a);
          if (isScored(crit)) colorByFrac(`${a}${FIRST}:${a}${LAST}`, fracOf(crit, key, FIRST, '$'), `$${a}${FIRST}`);
        }
        if (crit.kind === 'choice' && isScored(crit)) colorByFrac(`${a}${FIRST}:${a}${LAST}`, fracOf(crit, key, FIRST, '$'), `$${a}${FIRST}`);
      }
      if (isScored(crit)) {
        parts.push(fracOf(crit, key, '{row}'));
        weights.push(weightOf(crit));
      }
      c += widthOf(crit);
    });
    // Colonne de note du bloc
    const nc = c;
    noteCols.push(col(nc));
    statCols.push(col(nc));
    ws.getColumn(nc).width = 8;
    ws.getCell(2, nc).value = `/${b.points}`;
    ws.getCell(2, nc).alignment = { horizontal: 'center', vertical: 'middle' };
    const W = weights.reduce((s, w) => s + w, 0);
    for (let row = FIRST; row <= LAST; row++) {
      const sum = parts.map((p, i) => `${weights[i] === 1 ? '' : `${weights[i]}*`}(${p.split('{row}').join(String(row))})`).join('+');
      const cell = ws.getCell(row, nc);
      cell.value = W ? { formula: `ROUND((${sum})/${W}*'Barème'!$B$${pointRow[bi]},1)` } : 0;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      style(cell, false);
    }
    ws.mergeCells(1, start, 1, nc);
    ws.getCell(1, start).value = `${b.name} (${b.points} pts)`;
    ws.getCell(1, start).font = { bold: true };
    ws.getCell(1, start).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let k = start; k <= nc; k++) {
      ws.getCell(1, k).border = { left: k === start ? thick : undefined, top: thick, bottom: thin };
      ws.getCell(2, k).border = { left: k === start ? thick : thin, bottom: thick, right: thin };
    }
    c = nc + 1;
  });

  // Bonus (cases uniques) puis total
  const bonusCols: string[] = [];
  spec.bonus.forEach((b, i) => {
    const a = col(c);
    bonusCols.push(a);
    ws.getCell(1, c).value = i === 0 ? 'Bonus' : null;
    header(c, `${b.label} (+${b.points})`, true);
    checkbox(c, i === 0, (row) => (markOf(row, bonusKey(b.label)) ?? 0) > 0);
    ws.addConditionalFormatting({
      ref: `${a}${FIRST}:${a}${LAST}`,
      rules: [{ type: 'expression', priority: 1, formulae: [`$${a}${FIRST}=TRUE`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } }],
    });
    c++;
  });
  ws.getColumn(c).width = 9;
  ws.getCell(1, c).value = 'TOTAL';
  ws.getCell(2, c).value = '/20';
  statCols.push(col(c));
  [1, 2].forEach((row) => {
    ws.getCell(row, c).font = { bold: true };
    ws.getCell(row, c).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, c).border = { left: thick, top: row === 1 ? thick : undefined, bottom: row === 2 ? thick : undefined, right: thick };
  });
  const step = spec.rounding ?? 0.1;
  for (let row = FIRST; row <= LAST; row++) {
    const bonus = bonusCols.map((a, i) => `+(${a}${row}*1)*'Barème'!$B$${bonusRow[i]}`).join('');
    const raw = `${noteCols.map((a) => `${a}${row}`).join('+') || '0'}${bonus}`;
    let f = step === 0.1 ? `ROUND(${raw},1)` : `ROUND((${raw})/${step},0)*${step}`;
    if (spec.cap) f = `MIN(20,${f})`;
    const cell = ws.getCell(row, c);
    cell.value = { formula: f };
    cell.font = { bold: true, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { left: thick, right: thick, top: thin, bottom: thin };
    ws.getCell(row, 1).border = { right: thick, top: thin, bottom: thin };
  }
  // Moyenne de la classe (valeurs, notes des blocs, total)
  ws.getCell(STATS, 1).value = 'Moyenne de la classe';
  ws.getCell(STATS, 1).font = { bold: true, italic: true };
  for (const a of statCols) {
    const cell = ws.getCell(`${a}${STATS}`);
    cell.value = { formula: `IFERROR(ROUND(AVERAGE(${a}${FIRST}:${a}${LAST}),1),"")` };
    cell.font = { bold: true, italic: true };
    cell.alignment = { horizontal: 'center' };
    cell.border = { top: thick };
  }
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 70;
  for (let row = FIRST; row <= LAST; row++) ws.getRow(row).height = 24;

  return { workbook: wb, layout: { groups, rows: { first: FIRST, last: LAST } } };
}

/** Script Apps Script (Google Sheets) : cocher une case coche celles d'avant dans son groupe, décocher décoche celles d'après. */
export function cumulativeScript(layout: SheetLayout): string {
  return `function onEdit(e) {
  var s = e.range.getSheet();
  if (s.getName() !== 'Évaluation' || e.range.getRow() < ${layout.rows.first}) return;
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;
  var v = e.range.getValue();
  if (v !== true && v !== false) return;
  var r = e.range.getRow(), c = e.range.getColumn();
  var groups = ${JSON.stringify(layout.groups)};
  groups.forEach(function (g) {
    if (c < g[0] || c > g[1]) return;
    if (v === true && c > g[0]) s.getRange(r, g[0], 1, c - g[0]).setValue(true);
    if (v === false && c < g[1]) s.getRange(r, c + 1, 1, g[1] - c).setValue(false);
  });
}`;
}

/** Clé d'un bonus dans les résultats d'un élève. */
export const bonusKey = (label: string) => `bonus::${label}`;
