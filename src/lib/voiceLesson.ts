import type { Block, BlockKind, Lesson } from '../types';
import { parseNumber } from './levels';
import { uid } from './util';

// Dictée d'une séance : transforme des phrases parlées en changements proposés (blocs à ajouter, modifier, retirer),
// mis en forme, que l'enseignant valide un par un. Tout se passe dans le navigateur, avec des règles et des mots-clés.

export type FieldKey = 'objective' | 'materials' | 'safety' | 'title';

export interface Change {
  id: string;
  op: 'add' | 'update' | 'remove' | 'field';
  /** Bloc existant de la séance visé par `update` ou `remove`. */
  blockId?: string;
  kind: BlockKind;
  title: string;
  minutes: number;
  /** Durée estimée par l'application (l'enseignant ne l'a pas donnée). */
  estimated: boolean;
  text: string;
  materials: string;
  /** Ce qui a été dit, pour remettre en forme après une correction. Absent : on modifie un bloc sans le réécrire. */
  spoken?: string;
  field?: FieldKey;
  value?: string;
}

export interface Draft {
  changes: Change[];
  /** Dernier changement concerné : une phrase sans mot-clé (« 20 minutes ») s'y applique. */
  lastId: string | null;
}

export interface VoiceCtx {
  students: number | null;
  /** Nom de l'activité de la séance. */
  activity: string;
  /** Durée du créneau en minutes (0 si inconnue). */
  planned: number;
  /** Noms des activités connues, pour repérer « en tennis de table ». */
  activities: string[];
}

export const emptyDraft = (): Draft => ({ changes: [], lastId: null });

/** Minuscules sans accents, en conservant la longueur : les positions restent valables dans le texte d'origine. */
function fold(s: string): string {
  return s
    .split('')
    .map((c) => {
      const f = c.normalize('NFD')[0].toLowerCase();
      return f.length === 1 ? f : c;
    })
    .join('');
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const dot = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

// ── Durées ──────────────────────────────────────────────────────────────────

const DUR_RE = /(?<!toutes les |tous les |fois |x |× )(?:\b(?:pendant|durant|sur|environ|de)\s+)?(\d+|[a-z-]+(?: et une?)?)\s*(?:minutes?|mins?|mn)\b/g;

interface Found {
  minutes: number;
  start: number;
  end: number;
}

/** Toutes les durées d'un texte (« 15 minutes », « quinze min », « un quart d'heure », « une demi-heure », « 1 h »). */
export function findDurations(text: string): Found[] {
  const t = fold(text);
  const out: Found[] = [];
  for (const m of t.matchAll(DUR_RE)) {
    const words = m[1].split(' ');
    const n = parseNumber(m[1]) ?? parseNumber(words[words.length - 1]);
    if (n === null || n <= 0) continue;
    out.push({ minutes: n, start: m.index, end: m.index + m[0].length });
  }
  for (const [re, minutes] of [
    [/(?:\bpendant\s+|\bsur\s+)?\bun quart d'?\s?heure\b/g, 15],
    [/(?:\bpendant\s+|\bsur\s+)?\bune? demi[- ]heure\b/g, 30],
    [/(?:\bpendant\s+|\bsur\s+)?\b(?:une|1) ?(?:heure|h)\b/g, 60],
  ] as Array<[RegExp, number]>) {
    for (const m of t.matchAll(re)) out.push({ minutes, start: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ── Nettoyage ───────────────────────────────────────────────────────────────

const FILLER = /^(?:je veux|je voudrais|j'aimerais|j aimerais|on va faire|on fait|on va|je fais|je mets|il faut|il y a|il y aura|faire|alors|donc|euh|bon|ensuite|puis|apres|et|avec|aussi|en plus|de la|de l'|de|du|des|d'|une|un|le|la|les|l'|mon|ma|mes|finalement|en fait|plutot|non|fera|dure|durera|sera|est|ca|c'est|:|,|-)(?:\s+|(?<=')|$)/;

/** Retire les mots de liaison du début et de la fin d'un morceau de phrase. */
function clean(s: string): string {
  let out = s.trim();
  for (;;) {
    const m = FILLER.exec(fold(out));
    if (!m || !m[0]) break;
    out = out.slice(m[0].length).trimStart();
  }
  return out.replace(/[\s,;:.-]+$/, '').replace(/\s+(?:et|puis|ensuite|avec|de|du)$/i, '').trim();
}

// ── Vocabulaire : mots dits → formulation claire ───────────────────────────

const VOCAB: Array<[RegExp, string]> = [
  [/educati/, 'Éducatifs de course : talons-fesses, montées de genoux, pas chassés, pas croisés'],
  [/footing|trottin|course lente|courir/, 'Footing progressif, à une allure où l\'on peut parler'],
  [/mobilit|articulaire/, 'Mobilité articulaire de bas en haut : chevilles, genoux, hanches, épaules'],
  [/etirement/, 'Étirements doux, 20 secondes par groupe musculaire'],
  [/gainage/, 'Gainage : planche ventrale et planches latérales'],
  [/acceleration/, 'Accélérations progressives sur 2 à 3 lignes droites'],
  [/squat/, 'Squats : dos droit, talons au sol, genoux dans l\'axe'],
  [/pompe/, 'Pompes, sur les genoux ou sur les pieds selon le niveau'],
  [/jumping/, 'Jumping jacks, à rythme régulier'],
  [/gamme/, 'Gammes athlétiques : talons-fesses, montées de genoux, foulées bondissantes'],
  [/passe/, 'Passes en mouvement par deux'],
  [/dribble/, 'Dribbles main droite puis main gauche, regard levé'],
  [/jonglage/, 'Jonglages avec la raquette ou le ballon'],
  [/respiration|respirer/, 'Respiration lente et retour au calme'],
  [/marche/, 'Marche lente pour faire redescendre le cœur'],
  [/rangement|ranger/, 'Rangement collectif du matériel'],
  [/bilan/, 'Bilan collectif : ce qui a marché, ce qu\'il reste à travailler'],
];

const stepLabel = (s: string) => {
  const hit = VOCAB.find(([re]) => re.test(fold(s)));
  return hit ? hit[1] : cap(s);
};

/** « éducatifs puis footing » → les étapes, dans l'ordre. */
function splitSteps(spoken: string): string[] {
  return spoken
    .split(/\s*(?:,|;|\.|\bpuis\b|\bensuite\b|\bet après\b|\bet apres\b|\bsuivie? de\b|\bet enfin\b|\bet\s+(?=(?:du|des|de la|les?|la|un|une)\s))\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ESTIME: Record<BlockKind, [number, number]> = {
  warmup: [10, 15],
  situation: [12, 20],
  skill: [12, 20],
  game: [12, 20],
  evaluation: [20, 30],
  theory: [3, 5],
  cooldown: [5, 8],
  free: [10, 15],
};
const estimate = (kind: BlockKind, planned: number) => ESTIME[kind][planned > 0 && planned <= 60 ? 0 : 1];

// ── Organisation selon l'activité et l'effectif ────────────────────────────

interface Org {
  org: string;
  rot: string;
  match?: string;
}

function orgFor(activity: string, n: number | null, m: number): Org {
  const a = fold(activity);
  const per = (k: number, what: string) => (n ? `${Math.max(1, Math.ceil(n / k))} ${what}` : what);
  if (/tennis de table|ping/.test(a)) {
    const sets = Math.max(2, Math.floor(m / 4));
    return {
      org: n ? `${Math.min(10, Math.ceil(n / 3))} tables, 3 élèves par table environ : 2 jouent, 1 arbitre et compte les points.` : 'Par table : 2 élèves jouent, 1 arbitre et compte les points.',
      rot: 'À la fin de chaque set, le perdant devient arbitre et l\'arbitre prend sa place.',
      match: `${sets} sets de 3 min, 1 min de changement entre chaque.`,
    };
  }
  if (/badminton/.test(a)) {
    const k = Math.max(2, Math.floor(m / 6));
    return {
      org: n ? `${Math.ceil(n / 5)} terrains, 4 à 5 élèves par terrain : 2 jouent en simple, 1 arbitre, les autres observent.` : 'Par terrain : 2 élèves jouent en simple, 1 arbitre, les autres observent.',
      rot: 'À chaque match : joueur → arbitre → observateur. Le vainqueur monte d\'un terrain, le perdant descend.',
      match: `${k} matchs de 5 min, 1 min de changement entre chaque.`,
    };
  }
  if (/basket/.test(a)) {
    const k = Math.max(2, Math.floor(m / 6));
    return {
      org: n ? `${Math.round(n / 4)} équipes de 3 à 4 sur 4 demi-terrains (1 panier chacun), en 3 contre 3. Le joueur en plus arbitre.` : 'Équipes de 3 à 4 sur 4 demi-terrains, en 3 contre 3. Le joueur en plus arbitre.',
      rot: 'À chaque match, le 4e joueur échange son rôle avec un joueur de son équipe ; les vainqueurs montent d\'un demi-terrain.',
      match: `${k} matchs de 5 min, 1 min de changement entre chaque.`,
    };
  }
  if (/baseball/.test(a)) {
    const k = Math.max(2, Math.floor(m / 7));
    return {
      org: '4 équipes sur 2 diamants : une équipe attaque, l\'autre défend ; un élève arbitre les bases et un autre tient le score.',
      rot: 'À chaque manche, on échange attaque et défense, puis les équipes changent de diamant.',
      match: `${k} manches de 6 min, 1 min de changement entre chaque.`,
    };
  }
  if (/volley|hand|foot|rugby|ultimate/.test(a)) {
    const k = Math.max(2, Math.floor(m / 6));
    return {
      org: n ? `${Math.round(n / 5)} équipes de 5 environ : 2 équipes jouent par terrain, les autres arbitrent et observent.` : 'Équipes de 5 environ : 2 équipes jouent par terrain, les autres arbitrent et observent.',
      rot: 'À chaque match, les équipes qui arbitrent entrent sur le terrain.',
      match: `${k} matchs de 5 min, 1 min de changement entre chaque.`,
    };
  }
  return {
    org: n ? `${per(2, 'binômes')} : un élève pratique, son partenaire observe et donne un conseil.` : 'En binômes : un élève pratique, son partenaire observe et donne un conseil.',
    rot: 'Le pratiquant et l\'observateur échangent leurs rôles à chaque série.',
  };
}

// ── Mise en forme d'un bloc ─────────────────────────────────────────────────

/** Mode conditionnel ou parlé → présent écrit. */
function polish(s: string): string {
  return s
    .replace(/\bseraient\b/gi, 'sont')
    .replace(/\bserait\b/gi, 'est')
    .replace(/\bpourraient\b/gi, 'peuvent')
    .replace(/\bpourrait\b/gi, 'peut')
    .replace(/\bfaudrait\b/gi, 'faut')
    .replace(/\bl'on tape\b/gi, 'l\'on frappe')
    .replace(/\bon tape\b/gi, 'on frappe')
    .replace(/\s+/g, ' ')
    .trim();
}

function findActivity(spoken: string, ctx: VoiceCtx): { activity: string; rest: string } {
  const low = fold(spoken);
  for (const name of [...ctx.activities].sort((a, b) => b.length - a.length)) {
    const i = low.indexOf(fold(name));
    if (i >= 0) {
      const before = spoken.slice(0, i).replace(/\s*(?:en|de|du|au|d')\s*$/i, '');
      return { activity: name, rest: `${before} ${spoken.slice(i + name.length)}`.replace(/\s+/g, ' ').trim() };
    }
  }
  return { activity: ctx.activity, rest: spoken };
}

const GEAR = /(\d+|[a-z-]+)\s+(plots?|ballons?|raquettes?|volants?|tapis|cerceaux|chasubles?|balles?|battes?|steps?|haies?|tables?|cordes?|chronos?|chronometres?)\b/g;

function gearOf(spoken: string): string {
  const t = fold(spoken);
  const out: string[] = [];
  for (const m of t.matchAll(GEAR)) {
    const n = parseNumber(m[1]);
    if (n !== null && n > 0) out.push(`- ${spoken.slice(m.index, m.index + m[0].length)}`);
  }
  return out.join('\n');
}

interface Built {
  title: string;
  text: string;
  minutes: number;
  estimated: boolean;
  materials: string;
}

function buildSteps(kind: BlockKind, spoken: string, minutes: number | null, ctx: VoiceCtx): Built {
  const parts = splitSteps(spoken).map(clean).filter(Boolean);
  const steps = (parts.length ? parts : kind === 'warmup' ? ['footing', 'mobilité', 'éducatifs'] : ['étirements', 'bilan']).map((p) => {
    const d = findDurations(p);
    return { label: stepLabel(clean(d.length ? `${p.slice(0, d[0].start)} ${p.slice(d[0].end)}` : p)), minutes: d[0]?.minutes ?? null };
  });
  const given = steps.reduce((s, x) => s + (x.minutes ?? 0), 0);
  const total = minutes ?? (given || estimate(kind, ctx.planned));
  const missing = steps.filter((x) => x.minutes === null).length;
  const share = missing ? Math.max(1, Math.round(Math.max(total - given, missing) / missing)) : 0;
  return {
    title: kind === 'warmup' ? 'Échauffement' : 'Retour au calme',
    text: steps.map((x, i) => `${i + 1}. **${x.label}** (${x.minutes ?? share} min)`).join('\n'),
    minutes: total,
    estimated: minutes === null && given === 0,
    materials: '',
  };
}

function buildSituation(kind: BlockKind, spoken: string, minutes: number | null, ctx: VoiceCtx): Built {
  const m = minutes ?? estimate(kind, ctx.planned);
  const { activity, rest } = findActivity(spoken, ctx);
  // « … où les points seraient bonifiés lorsque l'on tape en revers » : la règle du jeu.
  const cut = /(?:^|\s)(?:où|dans laquelle|dans lequel|sachant que|avec comme règle|avec la règle)\s+/i.exec(rest);
  const head = clean(polish(cut ? rest.slice(0, cut.index) : rest).replace(/^(?:de |en )?(?:situation|exercice|atelier)s?\b/i, '').replace(/^(?:de |en )?(?:matchs?|tournoi)\b/i, ''));
  const rule = cut ? polish(rest.slice(cut.index + cut[0].length)).replace(/[\s.,]+$/, '') : '';

  const target = /(?:frappe|joue|marque|tire|lance)\s+(.{2,40})$/i.exec(rule)?.[1];
  const bonus = /bonifi|bonus|doubl/i.test(fold(rule));
  const short = rule ? (bonus && target ? `points bonifiés ${target}` : rule.split(' ').slice(0, 7).join(' ')) : '';

  const base = kind === 'game' ? (/tournoi/i.test(spoken) ? 'Tournoi' : 'Match à thème') : kind === 'skill' ? 'Atelier' : kind === 'evaluation' ? 'Évaluation' : 'Situation';
  const detail = short || head;
  const title = detail ? (kind === 'situation' && !short ? cap(detail) : `${base} : ${detail}`) : kind === 'game' ? 'Match' : base;

  const o = orgFor(activity, ctx.students, m);
  const what = kind === 'game' ? `Match${activity ? ` de ${activity.toLowerCase()}` : ''}` : kind === 'evaluation' ? `Évaluation${activity ? ` en ${activity.toLowerCase()}` : ''}` : cap(head || 'Situation');
  const asked = /(?:\bpar (?:deux|trois|quatre|\d+)\b|\bgroupes? de \S+|\b\d+ ?(?:c|contre) ?\d+\b|\ben (?:binomes?|trinomes?)\b)/.exec(fold(rest));
  const lines = [
    `**But :** ${what}${rule ? `, avec cette règle : ${rule.charAt(0).toLowerCase()}${rule.slice(1)}` : ''}.`,
    `**Organisation :** ${asked ? `${cap(rest.slice(asked.index, asked.index + asked[0].length))}. ` : ''}${o.org}`,
    '**Déroulé :**',
    `1. Présenter la consigne${rule ? ' et la règle' : ''}, avec une démonstration (1 min).`,
    kind === 'game' ? '2. Jouer en comptant les points à voix haute ; l\'arbitre applique la règle.' : '2. Réaliser la situation, l\'observateur repère les réussites.',
    '3. Terminer par un retour rapide : ce qui a marché, ce qui reste à travailler.',
    `**Rotations et rôles :** ${o.rot}`,
    `**Séries et durée :** ${kind === 'game' && o.match ? o.match : `${m} min en tout.`}`,
    `**Critères de réussite :** ${rule ? 'La règle est appliquée et les élèves cherchent à en profiter ; ' : 'La consigne est respectée sur plusieurs essais de suite ; '}chacun tient son rôle.`,
  ];
  return { title: cap(title), text: lines.join('\n'), minutes: m, estimated: minutes === null, materials: gearOf(spoken) };
}

function buildBlock(kind: BlockKind, spoken: string, minutes: number | null, ctx: VoiceCtx): Built {
  if (kind === 'warmup' || kind === 'cooldown') return buildSteps(kind, spoken, minutes, ctx);
  if (kind === 'theory') {
    return { title: 'Consignes et rappel', text: dot(cap(polish(spoken) || 'Rappel des consignes et des critères de réussite')), minutes: minutes ?? estimate(kind, ctx.planned), estimated: minutes === null, materials: '' };
  }
  return buildSituation(kind, spoken, minutes, ctx);
}

// ── Compréhension des phrases ──────────────────────────────────────────────

const KW = "echauffement|situations?|exercices?|ateliers?|matchs?|tournois?|jeu(?! de jambes)|retour au calme|etirements?|evaluations?|rappel|consignes?|objectif|materiel|securite|titre";
const ORD = 'premiere?|deuxieme|seconde?|troisieme|quatrieme|derniere?';
const DET = "(?:la |le |les |l'|mon |ma |un |une |des |du |de la )?";

function kindOf(kw: string, segment: string): BlockKind {
  const k = fold(kw);
  if (k.startsWith('echauffement')) return 'warmup';
  if (k.startsWith('retour') || k.startsWith('etirement')) return 'cooldown';
  if (k.startsWith('match') || k.startsWith('tournoi') || k.startsWith('jeu')) return 'game';
  if (k.startsWith('atelier')) return 'skill';
  if (k.startsWith('evaluation')) return 'evaluation';
  if (k.startsWith('rappel') || k.startsWith('consigne')) return 'theory';
  // « situation de match », « exercice en match » : c'est un jeu.
  if (/^\S+\s+(?:de |en |d')?(?:match|jeu\b|tournoi)/.test(fold(segment))) return 'game';
  return 'situation';
}

const FIELD_OF: Record<string, FieldKey> = { objectif: 'objective', materiel: 'materials', securite: 'safety', titre: 'title' };

function ordinalOf(s: string): number | 'last' | null {
  const o = /\b(premiere?|deuxieme|seconde?|troisieme|quatrieme|derniere?)\b/.exec(fold(s))?.[1];
  if (!o) return null;
  if (o.startsWith('prem')) return 0;
  if (o.startsWith('deux') || o.startsWith('sec')) return 1;
  if (o.startsWith('trois')) return 2;
  if (o.startsWith('quatr')) return 3;
  return 'last';
}

const REVISE = /\b(finalement|en fait|plutot|non|change|changer|modifie|modifier|corrige|corriger|remets?)\b/;

class Session {
  changes: Change[];
  lastId: string | null;
  understood: string[] = [];
  unclear: string[] = [];

  constructor(draft: Draft, private lesson: Lesson, private ctx: VoiceCtx) {
    this.changes = draft.changes.map((c) => ({ ...c }));
    this.lastId = draft.lastId;
  }

  /** Blocs tels qu'ils seront après les changements en attente, dans l'ordre. */
  private view(): Array<{ kind: BlockKind; change?: Change; block?: Block }> {
    const out: Array<{ kind: BlockKind; change?: Change; block?: Block }> = [];
    for (const b of this.lesson.blocks) {
      const c = this.changes.find((x) => x.blockId === b.id);
      if (c?.op === 'remove') continue;
      out.push({ kind: c?.kind ?? b.kind, change: c, block: b });
    }
    for (const c of this.changes) if (c.op === 'add') out.push({ kind: c.kind, change: c });
    return out;
  }

  private target(kind: BlockKind, ord: number | 'last' | null) {
    const same = this.view().filter((x) => x.kind === kind || (kind === 'situation' && x.kind === 'skill'));
    if (!same.length) return undefined;
    if (ord === null || ord === 'last') return same[same.length - 1];
    return same[ord];
  }

  /** Le changement correspondant à une cible : celui en attente, ou un nouveau sur le bloc existant. */
  private changeFor(t: { change?: Change; block?: Block }): Change {
    if (t.change) return t.change;
    const b = t.block!;
    const c: Change = { id: uid(), op: 'update', blockId: b.id, kind: b.kind, title: b.title, minutes: b.minutes, estimated: false, text: b.text, materials: b.materials };
    this.changes.push(c);
    return c;
  }

  private rebuild(c: Change, fixed: number | null) {
    if (c.spoken === undefined) return;
    const b = buildBlock(c.kind, c.spoken, fixed ?? (c.estimated ? null : c.minutes), this.ctx);
    Object.assign(c, { title: b.title, text: b.text, minutes: b.minutes, estimated: b.estimated, materials: b.materials || c.materials });
  }

  private add(kind: BlockKind, spoken: string, minutes: number | null) {
    const b = buildBlock(kind, spoken, minutes, this.ctx);
    const c: Change = { id: uid(), op: 'add', kind, spoken, ...b };
    this.changes.push(c);
    this.lastId = c.id;
    this.understood.push(`Ajout : ${c.title}`);
  }

  private remove(t: { change?: Change; block?: Block }) {
    const ch = t.change;
    const label = ch?.title ?? t.block?.title ?? 'bloc';
    if (ch?.op === 'add') this.changes = this.changes.filter((x) => x !== ch);
    else {
      const c = this.changeFor(t);
      c.op = 'remove';
    }
    if (this.lastId === ch?.id) this.lastId = null;
    this.understood.push(`Retrait : ${label}`);
  }

  private setMinutes(c: Change, minutes: number) {
    c.minutes = minutes;
    c.estimated = false;
    this.rebuild(c, minutes);
    this.understood.push(`${c.title} : ${minutes} min`);
  }

  /** « pas en revers mais en coup droit » : remplace un mot dans le dernier bloc. */
  private substitute(from: string, to: string): boolean {
    const c = this.changes.find((x) => x.id === this.lastId) ?? [...this.changes].reverse().find((x) => x.op !== 'remove' && x.op !== 'field');
    if (!c) return false;
    const swap = (s: string) => {
      const i = fold(s).indexOf(fold(from));
      return i < 0 ? null : s.slice(0, i) + to + s.slice(i + from.length);
    };
    if (c.spoken !== undefined) {
      const next = swap(c.spoken);
      if (next === null) return false;
      c.spoken = next;
      this.rebuild(c, null);
    } else {
      const t = swap(c.text);
      const ti = swap(c.title);
      if (t === null && ti === null) return false;
      c.text = t ?? c.text;
      c.title = ti ?? c.title;
    }
    this.lastId = c.id;
    this.understood.push(`${c.title} : « ${from} » remplacé par « ${to} »`);
    return true;
  }

  private appendTo(c: Change, content: string) {
    if (c.spoken !== undefined) {
      c.spoken = c.spoken ? `${c.spoken} puis ${content}` : content;
      this.rebuild(c, null);
    } else {
      c.text = `${c.text.trim()}\n- ${stepLabel(content)}`;
    }
    this.lastId = c.id;
    this.understood.push(`${c.title} : ajout de « ${content} »`);
  }

  private setField(field: FieldKey, raw: string) {
    const value = clean(raw.replace(/^\s*(?:de la seance|de la séance)\b/i, '').replace(/^\s*(?:c'est|est de|est|sera|:)\s*/i, ''));
    if (!value) return;
    const pretty = field === 'title' ? cap(value) : field === 'objective' ? dot(cap(polish(value))) : cap(value);
    const had = this.changes.find((c) => c.op === 'field' && c.field === field);
    const c: Change = had ?? { id: uid(), op: 'field', field, kind: 'free', title: '', minutes: 0, estimated: false, text: '', materials: '' };
    c.value = pretty;
    if (!had) this.changes.push(c);
    this.understood.push(`${FIELD_LABEL[field]} : ${pretty}`);
  }

  /** Une phrase complète. */
  run(utterance: string) {
    let t = utterance.trim();
    if (!t) return;

    // Retirer : « enlève le match », « pas de retour au calme ».
    const rm = new RegExp(`\\b(?:enleve|enlever|supprime|supprimer|retire|retirer|annule|annuler|oublie|pas de)\\s+${DET}(?:(${ORD})\\s+)?(${KW})\\b`, 'g');
    for (const m of [...fold(t).matchAll(rm)].reverse()) {
      const target = this.target(kindOf(m[2], m[2]), ordinalOf(m[1] ?? ''));
      if (target) this.remove(target);
      else this.unclear.push(`Rien à retirer : ${m[2]}`);
      t = t.slice(0, m.index) + t.slice(m.index + m[0].length);
    }
    if (!t.trim()) return;

    // Remplacer un bloc : « remplace le match par un atelier de service ».
    const rep = new RegExp(`\\b(?:remplace|change)\\s+${DET}(?:(${ORD})\\s+)?(${KW})\\s+par\\s+`).exec(fold(t));
    if (rep) {
      const target = this.target(kindOf(rep[2], rep[2]), ordinalOf(rep[1] ?? ''));
      if (target) this.remove(target);
      t = t.slice(0, rep.index) + t.slice(rep.index + rep[0].length);
    }

    // Remplacer un mot : « pas en revers mais en coup droit », « remplace revers par coup droit ».
    const low = fold(t);
    const sub = /\b(?:pas|non)\s+(.+?)\s+mais\s+(.+)$/.exec(low);
    const sub2 = /\b(?:remplace|change)\s+(.+?)\s+par\s+(.+)$/.exec(low);
    const sw = sub ?? sub2;
    if (sw) {
      const from = t.slice(sw.index + sw[0].indexOf(sw[1]), sw.index + sw[0].indexOf(sw[1]) + sw[1].length);
      const to = t.slice(sw.index + sw[0].lastIndexOf(sw[2]), sw.index + sw[0].lastIndexOf(sw[2]) + sw[2].length);
      if (this.substitute(from.trim(), to.trim())) {
        t = t.slice(0, sw.index);
        if (!t.trim()) return;
      }
    }

    // Compléter : « ajoute du gainage à l'échauffement », « dans l'échauffement du gainage ».
    const add1 = new RegExp(`\\b(?:ajoute|ajouter|rajoute|rajouter|mets?)\\s+(?:aussi\\s+)?(.+?)\\s+(?:a|au|dans|pour)\\s+${DET}(?:(${ORD})\\s+)?(${KW})\\b`).exec(fold(t));
    if (add1) {
      const target = this.target(kindOf(add1[3], add1[3]), ordinalOf(add1[2] ?? ''));
      const start = add1.index + add1[0].indexOf(add1[1]);
      const content = clean(t.slice(start, start + add1[1].length));
      if (target && content) {
        this.appendTo(this.changeFor(target), content);
        t = t.slice(0, add1.index) + t.slice(add1.index + add1[0].length);
        if (!t.trim()) return;
      }
    }

    this.segments(t);
  }

  private segments(t: string) {
    const low = fold(t);
    const re = new RegExp(`\\b(${KW})\\b`, 'g');
    const starts: Array<{ at: number; kw: string }> = [];
    let current: BlockKind | null = null;
    for (const m of low.matchAll(re)) {
      const before = low.slice(0, m.index);
      // « situation de match », « à l'échauffement », « du matériel » : pas le début d'un nouveau bloc.
      if (/(?:^|\s)(?:de|du|d'|en|au|aux|a|dans|sur|par|avec)\s+(?:la |le |l'|les )?$|\bd'$/.test(before)) continue;
      const kw = m[1];
      if (/^etirement/.test(kw) && current === 'warmup') continue;
      if (/^objectif/.test(kw) && current && !/^objectif de la seance/.test(low.slice(m.index))) continue;
      starts.push({ at: m.index, kw });
      if (!FIELD_OF[kw]) current = kindOf(kw, low.slice(m.index));
    }

    if (!starts.length) {
      this.loose(t);
      return;
    }
    if (starts[0].at > 0) {
      const lead = t.slice(0, starts[0].at);
      // Ce qui précède le premier mot-clé : simple liaison, correction, ou vraie information pour le bloc précédent.
      if (clean(lead) && !REVISE.test(fold(lead))) this.loose(lead);
    }
    const lead = fold(t.slice(0, starts[0].at));
    starts.forEach((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].at : t.length;
      const prefix = i === 0 ? lead : fold(t.slice(starts[i - 1].at, s.at)).slice(-25);
      this.segment(t.slice(s.at, end), s.kw, prefix);
    });
  }

  /** Un morceau qui commence par un mot-clé de bloc. */
  private segment(seg: string, kw: string, prefix: string) {
    const after = seg.slice(kw.length);
    const field = FIELD_OF[kw];
    if (field) {
      this.setField(field, after);
      return;
    }
    const kind = kindOf(kw, seg);
    const low = fold(after);
    const durations = findDurations(after);
    const stepwise = (kind === 'warmup' || kind === 'cooldown') && durations.length > 1;

    let content = after;
    if (!stepwise) for (const d of [...durations].reverse()) content = content.slice(0, d.start) + ' ' + content.slice(d.end);
    // « situation de match … » : le mot « match » est déjà pris en compte par le type de bloc.
    content = clean(content.replace(/^\s*(?:de |en |d')?(?:match|tournoi)s?\b/i, ''));
    const minutes = stepwise ? null : durations[0]?.minutes ?? null;

    const revise = REVISE.test(prefix) || REVISE.test(low);
    const ord = ordinalOf(prefix);
    const definite = /(?:^|\s)(?:le|la|l'|les)\s*$/.test(prefix) || /l'$/.test(prefix);
    const target = this.target(kind, ord);
    const single = kind === 'warmup' || kind === 'cooldown';

    if (target && (revise || ord !== null || single || (definite && !content) || (!content && minutes !== null))) {
      const c = this.changeFor(target);
      if (content) {
        const extra = revise ? content.replace(/^(?:finalement|en fait|plutot)\s+/i, '') : content;
        if (c.spoken === undefined || revise) {
          // Bloc existant ou correction : la nouvelle version remplace l'ancienne.
          c.spoken = clean(extra);
          this.rebuild(c, minutes);
          this.understood.push(`${c.title} : modifié`);
        } else {
          this.appendTo(c, extra);
          if (minutes !== null) this.setMinutes(c, minutes);
        }
      } else if (minutes !== null) this.setMinutes(c, minutes);
      this.lastId = c.id;
      return;
    }
    this.add(kind, content, stepwise ? null : minutes);
    if (stepwise) {
      const c = this.changes[this.changes.length - 1];
      c.spoken = clean(after);
      this.rebuild(c, null);
    }
  }

  /** Une phrase sans mot-clé de bloc : elle complète ou corrige le dernier bloc. */
  private loose(t: string) {
    const durations = findDurations(t);
    let content = t;
    for (const d of [...durations].reverse()) content = content.slice(0, d.start) + ' ' + content.slice(d.end);
    content = clean(content);
    const last = this.changes.find((c) => c.id === this.lastId && c.op !== 'remove' && c.op !== 'field');
    if (!last) {
      if (content) this.add('situation', content, durations[0]?.minutes ?? null);
      else if (durations.length) this.unclear.push(`« ${t.trim()} » : à quel bloc cette durée s'applique-t-elle ?`);
      return;
    }
    if (content) this.appendTo(last, content);
    if (durations.length) this.setMinutes(last, durations[0].minutes);
  }
}

const FIELD_LABEL: Record<FieldKey, string> = { objective: 'Objectif', materials: 'Matériel', safety: 'Sécurité', title: 'Titre' };
export const fieldLabel = (f: FieldKey) => FIELD_LABEL[f];

/** Ajoute une phrase dictée au brouillon. Le brouillon reçu n'est pas modifié. */
export function ingest(draft: Draft, lesson: Lesson, utterance: string, ctx: VoiceCtx): { draft: Draft; understood: string[]; unclear: string[] } {
  const s = new Session(draft, lesson, ctx);
  s.run(utterance);
  return { draft: { changes: s.changes, lastId: s.lastId }, understood: s.understood, unclear: s.unclear };
}

/** Applique les changements choisis à une séance et renvoie le correctif à enregistrer. */
export function applyChanges(lesson: Lesson, changes: Change[]): Partial<Lesson> {
  let blocks = lesson.blocks.map((b) => ({ ...b }));
  const patch: Partial<Lesson> = {};
  for (const c of changes) {
    if (c.op === 'remove') blocks = blocks.filter((b) => b.id !== c.blockId);
    else if (c.op === 'update') blocks = blocks.map((b) => (b.id === c.blockId ? { ...b, title: c.title, minutes: c.minutes, text: c.text, materials: c.materials || b.materials } : b));
    else if (c.op === 'field' && c.field) {
      if (c.field === 'materials') patch.materials = [lesson.materials.trim(), c.value ?? ''].filter(Boolean).join('\n');
      else patch[c.field] = c.value ?? '';
    } else if (c.op === 'add') {
      const b: Block = { id: uid(), kind: c.kind, title: c.title, minutes: c.minutes, text: c.text, materials: c.materials, animation: null, sheets: [] };
      if (c.kind === 'warmup') {
        const last = blocks.map((x) => x.kind).lastIndexOf('warmup');
        blocks.splice(last + 1, 0, b);
      } else if (c.kind === 'cooldown') blocks.push(b);
      else {
        const cool = blocks.findIndex((x) => x.kind === 'cooldown');
        blocks.splice(cool < 0 ? blocks.length : cool, 0, b);
      }
    }
  }
  return { ...patch, blocks };
}
