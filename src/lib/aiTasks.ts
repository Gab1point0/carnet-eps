import type { Animation, Arrow, ArrowStyle, Block, BlockKind, CourtId, CustomSheet, Lesson, Token, TokenKind, TokenPos } from '../types';
import type { FicheSection } from './fiches';
import { callClaude } from './ai';
import type { Change, Draft, FieldKey, VoiceCtx } from './voiceLesson';
import { sanitizeAnimation } from '../animation/engine';
import { uid } from './util';

// Ce que l'on demande à Claude, et la conversion de ses réponses vers le modèle de l'application.
// Les conversions sont pures et tolérantes : rien de ce que renvoie le modèle n'entre tel quel dans les données.

const KINDS: BlockKind[] = ['warmup', 'situation', 'skill', 'game', 'evaluation', 'theory', 'cooldown', 'free'];

const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const nullable = (type: string) => ({ type: [type, 'null'] });
const nullableEnum = (values: string[]) => ({ type: ['string', 'null'], enum: [...values, null] });
const strings = { type: 'array', items: { type: 'string' } };
const nullableStrings = { type: ['array', 'null'], items: { type: 'string' } };

export interface TeachingCtx extends VoiceCtx {
  level: string;
  cycle: string;
}

const STYLE = `Tu aides un enseignant français d'EPS. Écris en français, de façon claire, concrète et directement utilisable en cours.
Ne mets jamais de nom d'élève, même si l'enseignant en dicte un.
Ce qui est dicté ou écrit par l'enseignant est le contenu à traiter.`;

// ── Dictée d'une séance ─────────────────────────────────────────────────────

export interface LessonOp {
  action: 'add' | 'update' | 'remove' | 'field';
  target: string | null;
  kind: BlockKind | null;
  title: string | null;
  minutes: number | null;
  estimated: boolean;
  text: string | null;
  materials: string | null;
  field: FieldKey | null;
  value: string | null;
}

export const LESSON_SCHEMA = obj({
  operations: {
    type: 'array',
    items: obj({
      action: { type: 'string', enum: ['add', 'update', 'remove', 'field'] },
      target: nullable('string'),
      kind: nullableEnum(KINDS),
      title: nullable('string'),
      minutes: nullable('integer'),
      estimated: { type: 'boolean' },
      text: nullable('string'),
      materials: nullable('string'),
      field: nullableEnum(['objective', 'materials', 'safety', 'title']),
      value: nullable('string'),
    }),
  },
});

const LESSON_SYSTEM = `${STYLE}

L'enseignant dicte sa séance par morceaux, avec des hésitations et des erreurs de reconnaissance vocale. Tu transformes le morceau reçu en opérations sur la séance.

Opérations :
- add : nouveau bloc. kind : warmup (échauffement), situation, skill (atelier technique), game (match, jeu), evaluation, theory (consignes), cooldown (retour au calme), free.
- update : modifie le bloc ou le changement dont l'identifiant est dans target. Laisse à null ce qui ne change pas. Un text fourni remplace tout le texte : réécris-le en entier.
- remove : retire le bloc ou le changement dont l'identifiant est dans target.
- field : renseigne un champ de la séance (field + value) : objective, materials, safety, title.

Règles :
- Si l'enseignant revient sur une information (« finalement », « plutôt », « pas X mais Y », « enlève »), modifie l'élément existant au lieu d'en ajouter un.
- Complète ou corrige un élément existant quand le morceau s'y rapporte, même sans le nommer.
- Ne reprends pas ses mots tels quels : rédige. Corrige les mots visiblement mal reconnus.
- Durée : si elle est donnée, minutes = cette durée et estimated = false. Sinon, estime-la d'après le créneau, le reste de la séance et le bloc, et mets estimated = true.
- Tiens compte de l'effectif, du niveau de classe et de l'activité pour calculer groupes, rotations, séries et durées. N'invente pas d'installations particulières.
- text d'un échauffement ou d'un retour au calme : liste numérotée d'étapes avec leur durée, par exemple « 1. **Footing progressif** (5 min) ».
- text des autres blocs, en mini-Markdown, une section par ligne :
**But :** …
**Organisation :** … (groupes, espace, qui fait quoi)
**Déroulé :** suivi d'une liste numérotée
**Rotations et rôles :** … (quand l'observateur devient pratiquant, comment les groupes tournent)
**Séries et durée :** …
**Critères de réussite :** …
**Pour adapter :** … (simplifier, complexifier)
- materials : une ligne par objet, « - 12 plots (usage) », avec des quantités calculées d'après l'effectif ; null si rien à préciser.
- Reste fidèle à ce qui est dit : tu complètes l'organisation, tu ne changes pas l'intention.
Tous les champs sont obligatoires : utilise null quand ils ne s'appliquent pas.`;

function describe(ctx: TeachingCtx) {
  return {
    classe: ctx.level || 'non précisée',
    effectif: ctx.students,
    activite: ctx.activity || 'non précisée',
    cycle: ctx.cycle || null,
    creneau_minutes: ctx.planned || null,
  };
}

function lessonPrompt(draft: Draft, lesson: Lesson, ctx: TeachingCtx, spoken: string) {
  const state = {
    ...describe(ctx),
    blocs_de_la_seance: lesson.blocks.map((b) => ({ id: b.id, kind: b.kind, title: b.title, minutes: b.minutes, text: b.text })),
    changements_en_attente: draft.changes.map((c) => ({ id: c.id, action: c.op, kind: c.kind, title: c.title, minutes: c.minutes, text: c.text, field: c.field ?? null, value: c.value ?? null })),
  };
  return `Contexte :\n${JSON.stringify(state)}\n\nMorceau dicté :\n<dictee>${spoken}</dictee>`;
}

/** Applique les opérations de Claude au brouillon. */
export function applyOps(draft: Draft, lesson: Lesson, ops: LessonOp[], heard: string): { draft: Draft; understood: string[]; unclear: string[] } {
  let changes = draft.changes.map((c) => ({ ...c }));
  let lastId = draft.lastId;
  const understood: string[] = [];
  const unclear: string[] = [];
  const fill = (c: Change, op: LessonOp) => {
    if (op.title) c.title = op.title;
    if (op.kind && KINDS.includes(op.kind)) c.kind = op.kind;
    if (typeof op.minutes === 'number' && op.minutes > 0) {
      c.minutes = Math.round(op.minutes);
      c.estimated = !!op.estimated;
    }
    if (op.text) c.text = op.text;
    if (op.materials) c.materials = op.materials;
    c.heard = heard;
    c.spoken = undefined;
  };
  for (const op of ops ?? []) {
    if (op.action === 'field') {
      if (!op.field || !op.value) continue;
      const had = changes.find((c) => c.op === 'field' && c.field === op.field);
      const c: Change = had ?? { id: uid(), op: 'field', field: op.field, kind: 'free', title: '', minutes: 0, estimated: false, text: '', materials: '' };
      c.value = op.value;
      c.heard = heard;
      if (!had) changes.push(c);
      understood.push(`Champ renseigné : ${op.value}`);
      continue;
    }
    if (op.action === 'add') {
      const kind = op.kind && KINDS.includes(op.kind) ? op.kind : 'situation';
      const c: Change = { id: uid(), op: 'add', kind, title: kind, minutes: 15, estimated: true, text: '', materials: '' };
      fill(c, op);
      changes.push(c);
      lastId = c.id;
      understood.push(`Ajout : ${c.title}`);
      continue;
    }
    const pending = changes.find((c) => c.id === op.target || (c.blockId && c.blockId === op.target));
    const block: Block | undefined = lesson.blocks.find((b) => b.id === op.target);
    if (!pending && !block) {
      unclear.push('Un élément à modifier n\'a pas été retrouvé : redites-le si besoin.');
      continue;
    }
    if (op.action === 'remove') {
      if (pending?.op === 'add') changes = changes.filter((c) => c !== pending);
      else if (pending) pending.op = 'remove';
      else if (block) changes.push({ id: uid(), op: 'remove', blockId: block.id, kind: block.kind, title: block.title, minutes: block.minutes, estimated: false, text: block.text, materials: block.materials, heard });
      if (pending && lastId === pending.id) lastId = null;
      understood.push(`Retrait : ${pending?.title ?? block?.title}`);
      continue;
    }
    if (op.action === 'update') {
      const c: Change = pending ?? { id: uid(), op: 'update', blockId: block!.id, kind: block!.kind, title: block!.title, minutes: block!.minutes, estimated: false, text: block!.text, materials: block!.materials };
      fill(c, op);
      if (!pending) changes.push(c);
      lastId = c.id;
      understood.push(`Modification : ${c.title}`);
    }
  }
  return { draft: { changes, lastId }, understood, unclear };
}

export async function aiIngest(draft: Draft, lesson: Lesson, spoken: string, ctx: TeachingCtx) {
  const r = await callClaude<{ operations: LessonOp[] }>({ task: 'lesson', system: LESSON_SYSTEM, user: lessonPrompt(draft, lesson, ctx, spoken), schema: LESSON_SCHEMA });
  return applyOps(draft, lesson, r.operations, spoken);
}

// ── Fiche adaptée ───────────────────────────────────────────────────────────

interface RawSection {
  type: FicheSection['type'];
  title: string | null;
  head: string | null;
  cols: string[] | null;
  rows: string[] | null;
  tall: boolean | null;
  items: string[] | null;
  levels: string[] | null;
  n: number | null;
  fields: string[] | null;
  text: string | null;
}
export interface RawSheet {
  title: string;
  who: CustomSheet['who'];
  size: CustomSheet['size'];
  ident: string[];
  sections: RawSection[];
}

export const FICHE_SCHEMA = obj({
  title: { type: 'string' },
  who: { type: 'string', enum: ['élève', 'observateur', 'groupe', 'enseignant'] },
  size: { type: 'string', enum: ['full', 'half'] },
  ident: strings,
  sections: {
    type: 'array',
    items: obj({
      type: { type: 'string', enum: ['table', 'levels', 'checks', 'lines', 'fields', 'text'] },
      title: nullable('string'),
      head: nullable('string'),
      cols: nullableStrings,
      rows: nullableStrings,
      tall: nullable('boolean'),
      items: nullableStrings,
      levels: nullableStrings,
      n: nullable('integer'),
      fields: nullableStrings,
      text: nullable('string'),
    }),
  },
});

const FICHE_SYSTEM = `${STYLE}

Tu crées une fiche à imprimer, propre à la situation décrite : ce que l'élève, l'observateur ou le groupe doit vraiment noter pendant CETTE situation.

Adapte la fiche à la classe : très guidée et courte en 6e et 5e (peu de critères, mots simples), plus d'analyse et de justification en 3e et au lycée. N'écris pas les attendus officiels (AFC, AFL, socle) sur la fiche.

Champs :
- title : titre court. who : à qui elle sert. size : half pour une fiche courte (2 par page A4), full pour une page entière. ident : champs d'identification à remplir à la main (ex. Observateur, Joueur observé, Classe, Date).
- sections, dans l'ordre d'utilisation. Selon type :
  - table : tableau à remplir. head = en-tête de la première colonne, cols = autres colonnes, rows = lignes, tall = true si les cases doivent être hautes.
  - levels : critères à cocher par degré. items = critères, levels = degrés.
  - checks : cases à cocher. title, items.
  - lines : lignes d'écriture. title, n = nombre de lignes.
  - fields : champs courts. fields = libellés.
  - text : phrase de consigne. text.
Mets null dans les champs qui ne servent pas à ce type. Une fiche half tient en 2 à 3 sections courtes.`;

/** Réponse de Claude → fiche enregistrable. Les sections incomplètes sont écartées. */
export function toCustomSheet(raw: RawSheet): CustomSheet {
  const sections: FicheSection[] = [];
  for (const s of raw.sections ?? []) {
    if (s.type === 'table' && s.cols?.length && s.rows?.length) sections.push({ type: 'table', title: s.title ?? undefined, head: s.head ?? undefined, cols: s.cols, rows: s.rows, tall: !!s.tall });
    else if (s.type === 'levels' && s.items?.length) sections.push({ type: 'levels', title: s.title ?? undefined, items: s.items, levels: s.levels?.length ? s.levels : undefined });
    else if (s.type === 'checks' && s.items?.length) sections.push({ type: 'checks', title: s.title ?? undefined, items: s.items });
    else if (s.type === 'lines') sections.push({ type: 'lines', title: s.title ?? undefined, n: Math.max(1, Math.min(8, s.n ?? 2)) });
    else if (s.type === 'fields' && s.fields?.length) sections.push({ type: 'fields', fields: s.fields });
    else if (s.type === 'text' && s.text) sections.push({ type: 'text', text: s.text });
  }
  return {
    id: uid(),
    title: raw.title || 'Fiche sur mesure',
    who: ['élève', 'observateur', 'groupe', 'enseignant'].includes(raw.who) ? raw.who : 'observateur',
    size: raw.size === 'full' ? 'full' : 'half',
    ident: raw.ident?.length ? raw.ident : ['Nom', 'Classe', 'Date'],
    sections,
  };
}

function blockPrompt(block: Pick<Block, 'kind' | 'title' | 'minutes' | 'text'>, ctx: TeachingCtx, previous: unknown, instruction: string) {
  const parts = [`Contexte :\n${JSON.stringify(describe(ctx))}`, `Situation :\n<situation>\nTitre : ${block.title}\nDurée : ${block.minutes} min\n${block.text}\n</situation>`];
  if (previous) parts.push(`Version précédente :\n${JSON.stringify(previous)}`);
  if (instruction.trim()) parts.push(`Demande de l'enseignant :\n<demande>${instruction.trim()}</demande>`);
  return parts.join('\n\n');
}

export async function aiFiche(block: Pick<Block, 'kind' | 'title' | 'minutes' | 'text'>, ctx: TeachingCtx, previous: CustomSheet | null, instruction: string): Promise<CustomSheet> {
  const raw = await callClaude<RawSheet>({ task: 'fiche', system: FICHE_SYSTEM, user: blockPrompt(block, ctx, previous, instruction), schema: FICHE_SCHEMA });
  return toCustomSheet(raw);
}

// ── Animation ───────────────────────────────────────────────────────────────

const COURTS: CourtId[] = ['blank', 'basket', 'basket-half', 'volley', 'badminton', 'hand', 'foot', 'rugby', 'ultimate', 'tennis', 'tt', 'track'];
const TOKENS: TokenKind[] = ['player', 'coach', 'ball', 'cone', 'hoop', 'goal', 'mat', 'bench', 'text'];
const ARROWS: ArrowStyle[] = ['move', 'pass', 'dribble', 'shoot', 'line'];

interface RawAnimation {
  court: CourtId;
  tokens: Array<{ id: string; kind: TokenKind; label: string; color: string }>;
  frames: Array<{
    caption: string;
    positions: Array<{ token: string; x: number; y: number; hidden: boolean; carried_by: string | null }>;
    arrows: Array<{ x1: number; y1: number; x2: number; y2: number; style: ArrowStyle }>;
  }>;
}

export const ANIMATION_SCHEMA = obj({
  court: { type: 'string', enum: COURTS },
  tokens: { type: 'array', items: obj({ id: { type: 'string' }, kind: { type: 'string', enum: TOKENS }, label: { type: 'string' }, color: { type: 'string' } }) },
  frames: {
    type: 'array',
    items: obj({
      caption: { type: 'string' },
      positions: { type: 'array', items: obj({ token: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, hidden: { type: 'boolean' }, carried_by: nullable('string') }) },
      arrows: { type: 'array', items: obj({ x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' }, style: { type: 'string', enum: ARROWS } }) },
    }),
  },
});

const ANIMATION_SYSTEM = `${STYLE}

Tu dessines le schéma animé d'une situation, sur un terrain vu de dessus.

- court : blank (espace libre), basket, basket-half, volley, badminton, hand, foot, rugby, ultimate, tennis, tt (table de tennis de table), track (piste). Prends celui de l'activité.
- Coordonnées x et y en pourcentage du terrain : 0 à 100. x = 0 à gauche, y = 0 en haut. Respecte les lignes et les zones du terrain.
- Représente UN groupe ou UN atelier type, pas toute la classe : 12 éléments au plus.
- tokens : player, coach, ball, cone, hoop, goal, mat, bench, text. label très court (A, B, D1…). Une couleur hexadécimale par équipe ou par rôle : #2563eb, #dc2626, #16a34a, #f59e0b ; #f97316 pour le ballon ; #6b7280 pour le matériel.
- frames : 2 à 5 étapes qui racontent la situation dans l'ordre. caption : une phrase courte sur ce qui se passe à cette étape.
- Chaque étape donne une position pour CHAQUE élément, même immobile. hidden = true pour un élément absent de l'étape.
- carried_by : identifiant du joueur qui porte le ballon à cette étape, sinon null. Le ballon se déplace alors avec lui.
- arrows : ce qui va se passer : move (déplacement), pass (passe), dribble, shoot (tir), line (repère). Leurs points partent de l'élément concerné.
Ne fais se croiser ni se superposer les éléments que si la situation le demande.`;

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 50));

/** Réponse de Claude → animation valide : coordonnées bornées, positions complètes, références vérifiées. */
export function toAnimation(raw: RawAnimation): Animation {
  const tokens: Token[] = [];
  const seen = new Set<string>();
  for (const t of (raw.tokens ?? []).slice(0, 20)) {
    if (!t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    tokens.push({ id: t.id, kind: TOKENS.includes(t.kind) ? t.kind : 'player', label: t.label ?? '', color: /^#[0-9a-f]{3,8}$/i.test(t.color ?? '') ? t.color : '#2563eb', size: 1 });
  }
  const frames = (raw.frames ?? []).slice(0, 8).map((f) => {
    const pos: Record<string, TokenPos> = {};
    for (const p of f.positions ?? []) {
      if (!seen.has(p.token)) continue;
      const entry: TokenPos = { x: clamp(p.x), y: clamp(p.y) };
      if (p.hidden) entry.hidden = true;
      if (p.carried_by && seen.has(p.carried_by) && p.carried_by !== p.token) {
        entry.carry = p.carried_by;
        entry.dx = 2;
        entry.dy = 2;
      }
      pos[p.token] = entry;
    }
    const arrows: Arrow[] = (f.arrows ?? []).map((a) => ({ id: uid(), x1: clamp(a.x1), y1: clamp(a.y1), x2: clamp(a.x2), y2: clamp(a.y2), style: ARROWS.includes(a.style) ? a.style : 'move', color: '#111827' }));
    return { id: uid(), caption: f.caption ?? '', holdMs: 1500, moveMs: 1500, pos, arrows };
  });
  // Un élément sans position à une étape reste où il était à l'étape précédente.
  for (let i = 1; i < frames.length; i++) {
    for (const t of tokens) if (!frames[i].pos[t.id] && frames[i - 1].pos[t.id]) frames[i].pos[t.id] = { ...frames[i - 1].pos[t.id] };
  }
  return sanitizeAnimation({ court: COURTS.includes(raw.court) ? raw.court : 'blank', tokens, frames });
}

export async function aiAnimation(block: Pick<Block, 'kind' | 'title' | 'minutes' | 'text'>, ctx: TeachingCtx, previous: Animation | null, instruction: string): Promise<Animation> {
  const raw = await callClaude<RawAnimation>({ task: 'animation', system: ANIMATION_SYSTEM, user: blockPrompt(block, ctx, previous, instruction), schema: ANIMATION_SCHEMA });
  return toAnimation(raw);
}

// ── Vérification depuis les réglages ───────────────────────────────────────

/** Fait un essai réel de chacune des trois fonctions. Coûte moins d'un centime à quelques centimes. */
export async function testAi(onStep: (task: 'lesson' | 'fiche' | 'animation', result: string | null) => void) {
  const ctx: TeachingCtx = { students: 24, activity: 'Basket-ball', planned: 55, activities: [], level: '5e', cycle: '' };
  const lesson: Pick<Lesson, 'blocks'> = { blocks: [] };
  const block = { kind: 'situation' as BlockKind, title: 'Passe et va', minutes: 10, text: 'Par trois sur un demi-terrain : passe, coupe vers le panier, tir.' };
  const steps: Array<['lesson' | 'fiche' | 'animation', () => Promise<unknown>]> = [
    ['lesson', () => aiIngest({ changes: [], lastId: null }, lesson as Lesson, 'échauffement 5 minutes footing', ctx)],
    ['fiche', () => aiFiche(block, ctx, null, '')],
    ['animation', () => aiAnimation(block, ctx, null, '')],
  ];
  for (const [task, run] of steps) {
    try {
      await run();
      onStep(task, null);
    } catch (e) {
      onStep(task, e instanceof Error ? e.message : 'Erreur inconnue');
    }
  }
}
