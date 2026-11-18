// Calculs des fiches d'évaluation, comme dans un tableur : valeurs saisies (VMA, chrono, score…), formules entre
// ces valeurs (écart en %, meilleur essai, SI…), statistiques de la classe, et conversion en points (barème par
// tableau, rang dans la classe). Le même calcul existe deux fois : ici pour l'application, et traduit en formules
// pour Excel / Google Sheets (exprToExcel, scaleToExcel, rankToExcel).

export type Expr =
  | { t: 'num'; v: number }
  | { t: 'ref'; name: string }
  | { t: 'neg'; a: Expr }
  | { t: 'bin'; op: BinOp; a: Expr; b: Expr }
  | { t: 'fn'; name: Fn; args: Expr[] };

type BinOp = '+' | '-' | '*' | '/' | '^' | '<' | '>' | '<=' | '>=' | '=' | '<>';
type Fn = 'ABS' | 'MIN' | 'MAX' | 'MOY' | 'SOMME' | 'ROUND' | 'PLANCHER' | 'PLAFOND' | 'RACINE' | 'SI' | 'ET' | 'OU' | 'NON' | 'CLASSE_MOY' | 'CLASSE_MIN' | 'CLASSE_MAX' | 'RANG' | 'RANG_SEXE' | 'BAREME' | 'PALIERS';

/** Noms acceptés (français comme dans Excel ou Sheets en français, et anglais). */
const FN_ALIASES: Record<string, Fn> = {
  ABS: 'ABS',
  MIN: 'MIN',
  MAX: 'MAX',
  MOY: 'MOY',
  MOYENNE: 'MOY',
  AVERAGE: 'MOY',
  SOMME: 'SOMME',
  SUM: 'SOMME',
  ARRONDI: 'ROUND',
  ROUND: 'ROUND',
  ARRONDI_INF: 'PLANCHER',
  PLANCHER: 'PLANCHER',
  FLOOR: 'PLANCHER',
  ARRONDI_SUP: 'PLAFOND',
  PLAFOND: 'PLAFOND',
  CEILING: 'PLAFOND',
  RACINE: 'RACINE',
  SQRT: 'RACINE',
  SI: 'SI',
  IF: 'SI',
  ET: 'ET',
  AND: 'ET',
  OU: 'OU',
  OR: 'OU',
  NON: 'NON',
  NOT: 'NON',
  CLASSE_MOY: 'CLASSE_MOY',
  CLASSE_MIN: 'CLASSE_MIN',
  CLASSE_MAX: 'CLASSE_MAX',
  RANG: 'RANG',
  RANG_SEXE: 'RANG_SEXE',
  BAREME: 'BAREME',
  TABLE: 'BAREME',
  PALIERS: 'PALIERS',
};

/** Aide affichée dans l'éditeur. */
export const FUNCTION_HELP: Array<[string, string]> = [
  ['+ − * / ^ ( )', 'opérations'],
  ['< > <= >= = <>', 'comparaisons (1 si vrai, 0 sinon)'],
  ['SI(condition; si vrai; si faux)', 'ex. SI(vma >= 12; 2; 0)'],
  ['ET(…) · OU(…) · NON(…)', 'combiner des conditions'],
  ['ABS(x)', "valeur absolue (écart sans le signe)"],
  ['MIN(…) · MAX(…) · MOYENNE(…) · SOMME(…)', 'ignorent les cases vides : MAX(essai1; essai2; essai3) = meilleur essai'],
  ['ARRONDI(x; n) · ARRONDI_INF(x) · ARRONDI_SUP(x)', 'arrondis'],
  ['RACINE(x)', 'racine carrée'],
  ['CLASSE_MOY(v) · CLASSE_MIN(v) · CLASSE_MAX(v)', 'moyenne, plus petite, plus grande valeur de la classe'],
  ['RANG(v)', 'rang dans la classe (1 = la plus grande valeur)'],
  ['RANG_SEXE(v)', 'rang parmi les élèves du même sexe (filles et garçons classés séparément ; vide si le sexe n’est pas renseigné)'],
  ['BAREME(x; 8; 27; 9; 31; …)', "table de correspondance : x = 8 → 27, x = 9 → 31… (régulièrement entre deux lignes) ; ex. score cible d'après la VMA"],
  ['PALIERS(x; 8; 27; 9; 31; …)', 'même table, par paliers : on garde la ligne atteinte'],
];

/** Fonctions qui ignorent les valeurs vides (comme dans un tableur). */
const AGGREGATES = new Set<Fn>(['MIN', 'MAX', 'MOY', 'SOMME']);
/** Fonctions qui portent sur toute la classe : leur argument est un nom de valeur. */
const CLASS_FNS = new Set<Fn>(['CLASSE_MOY', 'CLASSE_MIN', 'CLASSE_MAX', 'RANG', 'RANG_SEXE']);
export const FUNCTION_NAMES = Object.keys(FN_ALIASES).map((n) => n.toLowerCase());

export class ExprError extends Error {}

/**
 * « ABS(score1 - projet1) / projet1 * 100 » → arbre. Arguments séparés par « ; » (comme Excel en français) ou « , ».
 * Virgule décimale acceptée quand elle est collée à des chiffres (« 3,5 ») : écrire MAX(a; b) pour séparer.
 */
export function parseExpr(src: string): Expr {
  const toks: Array<{ k: 'num' | 'id' | 'op'; v: string }> = [];
  const s = src.trim().replace(/^=/, '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (num) {
      toks.push({ k: 'num', v: num[0].replace(',', '.') });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(s.slice(i));
    if (id) {
      toks.push({ k: 'id', v: id[0].replace(/\./g, '_') });
      i += id[0].length;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=') {
      toks.push({ k: 'op', v: two === '!=' ? '<>' : two });
      i += 2;
      continue;
    }
    if ('+-*/^();,<>=%'.includes(ch)) {
      toks.push({ k: 'op', v: ch === ';' ? ',' : ch });
      i++;
      continue;
    }
    if (ch === '−' || ch === '×' || ch === '÷') {
      toks.push({ k: 'op', v: ch === '−' ? '-' : ch === '×' ? '*' : '/' });
      i++;
      continue;
    }
    throw new ExprError(`Caractère inattendu : « ${ch} »`);
  }
  let p = 0;
  const peek = () => toks[p];
  const isOp = (...ops: string[]) => peek()?.k === 'op' && ops.includes(peek().v);
  const eat = (v: string) => {
    if (peek()?.v !== v) throw new ExprError(`« ${v} » attendu`);
    p++;
  };
  const compare = (): Expr => {
    let a = expr();
    while (isOp('<', '>', '<=', '>=', '=', '<>')) {
      const op = toks[p++].v as BinOp;
      a = { t: 'bin', op, a, b: expr() };
    }
    return a;
  };
  const expr = (): Expr => {
    let a = term();
    while (isOp('+', '-')) {
      const op = toks[p++].v as BinOp;
      a = { t: 'bin', op, a, b: term() };
    }
    return a;
  };
  const term = (): Expr => {
    let a = power();
    while (isOp('*', '/')) {
      const op = toks[p++].v as BinOp;
      a = { t: 'bin', op, a, b: power() };
    }
    return a;
  };
  const power = (): Expr => {
    const a = unary();
    if (isOp('^')) {
      p++;
      return { t: 'bin', op: '^', a, b: power() };
    }
    return a;
  };
  const unary = (): Expr => {
    if (isOp('-')) {
      p++;
      return { t: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    let a = primary();
    // « 5% » = 0,05, comme dans un tableur.
    while (isOp('%')) {
      p++;
      a = { t: 'bin', op: '/', a, b: { t: 'num', v: 100 } };
    }
    return a;
  };
  const primary = (): Expr => {
    const tk = toks[p++];
    if (!tk) throw new ExprError('Formule incomplète');
    if (tk.k === 'num') return { t: 'num', v: Number(tk.v) };
    if (tk.k === 'id') {
      if (peek()?.v === '(') {
        const fn = FN_ALIASES[tk.v.toUpperCase()];
        if (!fn) throw new ExprError(`Fonction inconnue : ${tk.v}`);
        p++;
        const args: Expr[] = [];
        if (peek()?.v !== ')') {
          args.push(compare());
          while (peek()?.v === ',') {
            p++;
            args.push(compare());
          }
        }
        eat(')');
        if (!args.length) throw new ExprError(`${tk.v}() sans valeur`);
        if (fn === 'SI' && (args.length < 2 || args.length > 3)) throw new ExprError('SI(condition; si vrai; si faux)');
        if ((fn === 'BAREME' || fn === 'PALIERS') && (args.length < 3 || args.length % 2 === 0 || args.slice(1).some((a) => a.t !== 'num' && !(a.t === 'neg' && a.a.t === 'num'))))
          throw new ExprError(`${tk.v}(valeur; x1; y1; x2; y2; …) avec des nombres`);
        if (CLASS_FNS.has(fn) && (args.length !== 1 || args[0].t !== 'ref')) throw new ExprError(`${tk.v}(nom d'une valeur)`);
        return { t: 'fn', name: fn, args };
      }
      return { t: 'ref', name: tk.v.toLowerCase() };
    }
    if (tk.v === '(') {
      const e = compare();
      eat(')');
      return e;
    }
    throw new ExprError(`« ${tk.v} » inattendu`);
  };
  const out = compare();
  if (p < toks.length) throw new ExprError(`« ${toks[p].v} » inattendu`);
  return out;
}

/** Noms de valeurs utilisés par une formule (`strict` : ceux sans lesquels le calcul est vide). */
export function exprRefs(e: Expr): { all: Set<string>; strict: Set<string>; loose: Set<string> } {
  const all = new Set<string>();
  const strict = new Set<string>();
  const loose = new Set<string>();
  const walk = (x: Expr, inAgg: boolean) => {
    if (x.t === 'ref') {
      all.add(x.name);
      (inAgg ? loose : strict).add(x.name);
    } else if (x.t === 'neg') walk(x.a, inAgg);
    else if (x.t === 'bin') {
      walk(x.a, inAgg);
      walk(x.b, inAgg);
    } else if (x.t === 'fn') {
      if (CLASS_FNS.has(x.name)) {
        const r = x.args[0] as { name: string };
        all.add(r.name);
        if (x.name === 'RANG' || x.name === 'RANG_SEXE') strict.add(r.name);
        return;
      }
      x.args.forEach((a) => walk(a, inAgg || AGGREGATES.has(x.name)));
    }
  };
  walk(e, false);
  return { all, strict, loose };
}

export interface ExprEnv {
  /** Valeur de l'élève (null = vide). */
  get: (name: string) => number | null;
  /** Valeurs de toute la classe (élèves présents, cases remplies). */
  classValues: (name: string) => number[];
  /** Valeurs des élèves du même sexe que cet élève (`null` : sexe pas renseigné). */
  sexValues?: (name: string) => number[] | null;
}

/**
 * Calcule une formule. Vide (`null`) si une valeur nécessaire est vide (hors MIN, MAX, MOYENNE, SOMME),
 * ou si le calcul est impossible (division par 0) : exactement comme la formule Excel produite.
 */
export function evalExpr(e: Expr, env: ExprEnv): number | null {
  const { strict, loose } = exprRefs(e);
  for (const r of strict) if (env.get(r) === null) return null;
  if (!strict.size && loose.size && [...loose].every((r) => env.get(r) === null)) return null;
  const ev = (x: Expr): number => {
    switch (x.t) {
      case 'num':
        return x.v;
      case 'ref':
        return env.get(x.name) ?? NaN;
      case 'neg':
        return -ev(x.a);
      case 'bin': {
        const a = ev(x.a);
        const b = ev(x.b);
        switch (x.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            return b === 0 ? NaN : a / b;
          case '^':
            return a ** b;
          case '<':
            return a < b ? 1 : 0;
          case '>':
            return a > b ? 1 : 0;
          case '<=':
            return a <= b ? 1 : 0;
          case '>=':
            return a >= b ? 1 : 0;
          case '=':
            return Math.abs(a - b) < 1e-9 ? 1 : 0;
          case '<>':
            return Math.abs(a - b) < 1e-9 ? 0 : 1;
        }
        return NaN;
      }
      case 'fn': {
        if (CLASS_FNS.has(x.name)) {
          const name = (x.args[0] as { name: string }).name;
          if (x.name === 'RANG_SEXE') {
            const same = env.sexValues?.(name);
            const v = env.get(name);
            return !same || v === null ? NaN : 1 + same.filter((o) => o > v).length;
          }
          const all = env.classValues(name);
          if (!all.length) return NaN;
          if (x.name === 'CLASSE_MOY') return all.reduce((a, b) => a + b, 0) / all.length;
          if (x.name === 'CLASSE_MIN') return Math.min(...all);
          if (x.name === 'CLASSE_MAX') return Math.max(...all);
          const v = env.get(name);
          return v === null ? NaN : 1 + all.filter((o) => o > v).length;
        }
        if (x.name === 'BAREME' || x.name === 'PALIERS') {
          const v = ev(x.args[0]);
          return Number.isFinite(v) ? lookup(v, tablePairs(x.args), x.name === 'PALIERS') : NaN;
        }
        if (x.name === 'SI') {
          const c = ev(x.args[0]);
          return c ? ev(x.args[1]) : x.args[2] ? ev(x.args[2]) : 0;
        }
        if (AGGREGATES.has(x.name)) {
          // Une valeur vide est ignorée ; un calcul impossible aussi.
          const ok = x.args.map(ev).filter((v) => Number.isFinite(v));
          if (!ok.length) return x.name === 'SOMME' ? 0 : NaN;
          if (x.name === 'MIN') return Math.min(...ok);
          if (x.name === 'MAX') return Math.max(...ok);
          const sum = ok.reduce((a, b) => a + b, 0);
          return x.name === 'SOMME' ? sum : sum / ok.length;
        }
        const vals = x.args.map(ev);
        const [a, b] = vals;
        switch (x.name) {
          case 'ABS':
            return Math.abs(a);
          case 'RACINE':
            return a < 0 ? NaN : Math.sqrt(a);
          case 'ROUND': {
            const f = 10 ** Math.round(b ?? 0);
            return Math.round(a * f) / f;
          }
          case 'PLANCHER': {
            const f = b ? b : 1;
            return Math.floor(a / f) * f;
          }
          case 'PLAFOND': {
            const f = b ? b : 1;
            return Math.ceil(a / f) * f;
          }
          case 'ET':
            return vals.every(Boolean) ? 1 : 0;
          case 'OU':
            return vals.some(Boolean) ? 1 : 0;
          case 'NON':
            return a ? 0 : 1;
        }
        return NaN;
      }
    }
  };
  const r = ev(e);
  return Number.isFinite(r) ? r : null;
}

/**
 * Formule Excel / Google Sheets équivalente. `cell(name)` : adresse de la valeur sur la ligne de l'élève ;
 * `range(name)` : la colonne entière de la classe (adresses absolues).
 */
export function exprToExcel(e: Expr, cell: (name: string) => string, range: (name: string) => string, sex?: SexCells): string {
  const { strict, loose } = exprRefs(e);
  const num = (v: number) => (v < 0 ? `(${v})` : String(v));
  const xl = (x: Expr): string => {
    switch (x.t) {
      case 'num':
        return num(x.v);
      case 'ref':
        return cell(x.name);
      case 'neg':
        return `-(${xl(x.a)})`;
      case 'bin': {
        const a = xl(x.a);
        const b = xl(x.b);
        // Comparaison → 1 ou 0 (Excel donne VRAI/FAUX).
        if (['<', '>', '<=', '>=', '=', '<>'].includes(x.op)) return `IF(${a}${x.op}${b},1,0)`;
        return `(${a}${x.op}${b})`;
      }
      case 'fn': {
        const args = x.args.map(xl);
        switch (x.name) {
          case 'CLASSE_MOY':
            return `AVERAGE(${range((x.args[0] as { name: string }).name)})`;
          case 'CLASSE_MIN':
            return `MIN(${range((x.args[0] as { name: string }).name)})`;
          case 'CLASSE_MAX':
            return `MAX(${range((x.args[0] as { name: string }).name)})`;
          case 'RANG': {
            const n = (x.args[0] as { name: string }).name;
            return `RANK(${cell(n)},${range(n)},0)`;
          }
          case 'RANG_SEXE': {
            const n = (x.args[0] as { name: string }).name;
            if (!sex) return '""';
            return `IF(${sex.cell}="","",COUNTIFS(${range(n)},">"&${cell(n)},${sex.range},${sex.cell})+1)`;
          }
          case 'BAREME':
          case 'PALIERS':
            return lookupToExcel(args[0], tablePairs(x.args), x.name === 'PALIERS');
          case 'SI':
            return `IF((${args[0]})<>0,${args[1]},${args[2] ?? '0'})`;
          case 'ET':
            return `IF(AND(${args.map((a) => `(${a})<>0`).join(',')}),1,0)`;
          case 'OU':
            return `IF(OR(${args.map((a) => `(${a})<>0`).join(',')}),1,0)`;
          case 'NON':
            return `IF((${args[0]})<>0,0,1)`;
          case 'MOY':
            return `AVERAGE(${args.join(',')})`;
          case 'SOMME':
            return `SUM(${args.join(',')})`;
          case 'RACINE':
            return `SQRT(${args[0]})`;
          case 'ROUND':
            return `ROUND(${args[0]},${args[1] ?? '0'})`;
          case 'PLANCHER':
            return `FLOOR(${args[0]},${args[1] ?? '1'})`;
          case 'PLAFOND':
            return `CEILING(${args[0]},${args[1] ?? '1'})`;
          default:
            return `${x.name}(${args.join(',')})`;
        }
      }
    }
  };
  const guards = [...strict].map((r) => `${cell(r)}=""`);
  if (!strict.size && loose.size) guards.push(`COUNT(${[...loose].map(cell).join(',')})=0`);
  const body = `IFERROR(${xl(e)},"")`;
  return guards.length ? `IF(OR(${guards.join(',')}),"",${body})` : body;
}

// ── Barème : valeur → part des points du critère ────────────────────────────

export interface ScalePoint {
  /** Valeur mesurée ou calculée. */
  at: number;
  /** Part des points du critère obtenue à cette valeur, en % (0 à 100). */
  pct: number;
}

const sorted = (pts: ScalePoint[]) => [...pts].filter((p) => Number.isFinite(p.at) && Number.isFinite(p.pct)).sort((a, b) => a.at - b.at);

/**
 * Barème par tableau. Linéaire : entre deux lignes, les points évoluent régulièrement (« on perd des points pour chaque % d'écart ») ;
 * par paliers : on garde la ligne atteinte (« à partir de 12 km/h : 60 % »). Avant la première ligne et après la dernière, on garde la valeur du bout.
 */
export function scaleFraction(v: number, points: ScalePoint[], steps = false): number {
  const pts = sorted(points);
  if (!pts.length) return 0;
  let out = pts[0].pct;
  if (v >= pts[pts.length - 1].at) out = pts[pts.length - 1].pct;
  else
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (v < a.at) break;
      if (v < b.at) {
        out = steps || b.at === a.at ? a.pct : a.pct + ((v - a.at) * (b.pct - a.pct)) / (b.at - a.at);
        break;
      }
    }
  return Math.max(0, Math.min(1, out / 100));
}

export function scaleToExcel(v: string, points: ScalePoint[], steps = false): string {
  const pts = sorted(points);
  if (!pts.length) return '0';
  const n = (x: number) => (x < 0 ? `(${x})` : String(x));
  const f = (x: number) => String(Math.max(0, Math.min(1, x / 100)));
  let out = f(pts[pts.length - 1].pct);
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const between = steps || b.at === a.at ? f(a.pct) : `MAX(0,MIN(1,(${n(a.pct)}+(${v}-${n(a.at)})*${n(b.pct - a.pct)}/${n(b.at - a.at)})/100))`;
    out = `IF(${v}<${n(b.at)},${between},${out})`;
  }
  return `IF(${v}<${n(pts[0].at)},${f(pts[0].pct)},${out})`;
}

/** Rang dans la classe : le meilleur a tous les points, le dernier aucun, régulièrement entre les deux (ex aequo = même rang). */
export function rankFraction(v: number, all: number[], best: 'high' | 'low'): number {
  const n = all.length;
  if (n < 2) return 1;
  const better = all.filter((x) => (best === 'high' ? x > v : x < v)).length;
  return (n - 1 - better) / (n - 1);
}

export const rankToExcel = (v: string, range: string, best: 'high' | 'low') =>
  `IF(COUNT(${range})<2,1,(COUNT(${range})-RANK(${v},${range},${best === 'high' ? 0 : 1}))/(COUNT(${range})-1))`;

/** Colonne du sexe dans le tableur : la case de l'élève et toute la colonne (adresses absolues). */
export interface SexCells {
  cell: string;
  range: string;
}

/** Rang parmi les élèves du même sexe (sexe vide : aucun point). */
export function rankBySexToExcel(v: string, range: string, best: 'high' | 'low', sex: SexCells) {
  const n = `COUNTIFS(${range},">-1E+300",${sex.range},${sex.cell})`;
  const better = `COUNTIFS(${range},"${best === 'high' ? '>' : '<'}"&${v},${sex.range},${sex.cell})`;
  return `IF(${sex.cell}="",0,IF(${n}<2,1,(${n}-1-${better})/(${n}-1)))`;
}

// ── Valeurs saisies ─────────────────────────────────────────────────────────

export type ValueFormat = 'decimal' | 'time' | 'count';

/** « 12,5 » → 12.5 ; chrono « 3:25 », « 3'25 », « 3'25'' », « 1:02:03 » ou « 205 » → secondes. Vide ou illisible → null. */
export function parseValue(text: string, format: ValueFormat = 'decimal'): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (format === 'time') {
    const parts = t
      .replace(/(''|"|s)$/, '')
      .trim()
      .split(/\s*[:'’h]\s*/)
      .filter(Boolean);
    if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(\.\d+)?$/.test(x))) return null;
    return parts.reduce((acc, x) => acc * 60 + Number(x), 0);
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatValue(v: number | null | undefined, format: ValueFormat = 'decimal', decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  if (format === 'time') {
    const s = Math.round(v * 10) / 10;
    const m = Math.floor(s / 60);
    const sec = Math.round((s - m * 60) * 10) / 10;
    return `${m}:${sec < 10 ? '0' : ''}${String(sec).replace('.', ',')}`;
  }
  const f = 10 ** decimals;
  return String(Math.round(v * f) / f).replace('.', ',');
}

/** « Score course 1 » → « score_course_1 » : nom court utilisable dans une formule. */
export function slugRef(label: string): string {
  const s = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return /^[a-z_]/.test(s) ? s : `v_${s || 'valeur'}`;
}

// ── Tables de correspondance (BAREME, PALIERS) ──────────────────────────────

const numOf = (e: Expr) => (e.t === 'num' ? e.v : e.t === 'neg' && e.a.t === 'num' ? -e.a.v : NaN);
function tablePairs(args: Expr[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i + 1 < args.length; i += 2) out.push([numOf(args[i]), numOf(args[i + 1])]);
  return out.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).sort((p, q) => p[0] - q[0]);
}

/** Valeur lue dans une table x → y : linéaire entre deux lignes, ou par paliers ; aux bouts, la valeur du bout. */
export function lookup(v: number, pts: Array<[number, number]>, steps: boolean): number {
  if (!pts.length) return NaN;
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, ya] = pts[i];
    const [b, yb] = pts[i + 1];
    if (v < b) return steps || b === a ? ya : ya + ((v - a) * (yb - ya)) / (b - a);
  }
  return pts[pts.length - 1][1];
}

function lookupToExcel(v: string, pts: Array<[number, number]>, steps: boolean): string {
  if (!pts.length) return '""';
  const n = (x: number) => (x < 0 ? `(${x})` : String(x));
  let out = n(pts[pts.length - 1][1]);
  for (let i = pts.length - 2; i >= 0; i--) {
    const [a, ya] = pts[i];
    const [b, yb] = pts[i + 1];
    const between = steps || b === a ? n(ya) : `(${n(ya)}+((${v})-${n(a)})*${n(yb - ya)}/${n(b - a)})`;
    out = `IF((${v})<${n(b)},${between},${out})`;
  }
  return `IF((${v})<=${n(pts[0][0])},${n(pts[0][1])},${out})`;
}
