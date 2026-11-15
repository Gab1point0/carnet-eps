import type { Animation, Arrow, ArrowStyle, Block, BlockKind, CourtId, CustomSheet, Lesson, Token, TokenKind, TokenPos } from '../types';
import { tableHasLabels, type FicheSection, type SectionSpan } from './fiches';
import { callClaude, callClaudeResearch, type Attachment } from './ai';
import { tidyEvalSheet, type EvalSheetSpec } from './evalSheet';
import type { Change, Draft, FieldKey, VoiceCtx } from './voiceLesson';
import { sanitizeAnimation } from '../animation/engine';
import { uid } from './util';

// Ce que l'on demande à Claude, et la conversion de ses réponses vers le modèle de l'application.
// Les conversions sont pures et tolérantes : rien de ce que renvoie le modèle n'entre tel quel dans les données.

const KINDS: BlockKind[] = ['warmup', 'situation', 'skill', 'game', 'evaluation', 'theory', 'cooldown', 'free'];

const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const nullable = (type: string) => ({ type: [type, 'null'] });
// L'API refuse un `enum` combiné à un type multiple : la valeur nulle passe par `anyOf`.
const nullableEnum = (values: string[]) => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }] });
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

// ── Séance construite à partir d'un objectif ────────────────────────────────

const OBJECTIVE_SYSTEM = `${LESSON_SYSTEM}

Cette fois, l'enseignant ne dicte pas le déroulé : il donne l'objectif de la séance et te laisse la construire en entier.
- Construis une séance complète au service de cet objectif : un échauffement en lien avec l'activité et l'objectif, des situations d'apprentissage progressives (de la plus simple à la plus complexe), un temps de jeu ou de mise en application quand c'est pertinent, un retour au calme avec un court bilan.
- Renseigne aussi les champs objective (l'objectif reformulé de façon claire et observable), title (titre court) et, si l'activité le demande, safety. Ne renseigne pas le champ materials de la séance : le matériel va dans chaque bloc.
- Les durées remplissent le créneau disponible (creneau_minutes) sans le dépasser ; estimated = false pour les durées que tu fixes. Sans créneau connu, vise 55 minutes.
- Tiens compte de la place de la séance dans le cycle et des séances précédentes (progression), sans les répéter.
- Si la séance contient déjà des blocs : garde ceux qui servent l'objectif (update si besoin) et retire les autres (remove).
- Respecte les précisions données avec l'objectif (situation imposée, matériel disponible, organisation, durée).`;

/** Ce que l'on sait du cycle autour de la séance : objectifs, évaluation, séances précédentes. */
export interface CycleCtx {
  objectives: string;
  evaluation: string;
  /** Numéro de la séance dans le cycle (1, 2…) et nombre de séances. */
  position: number | null;
  count: number | null;
  previous: Array<{ title: string; objective: string; bilan: string }>;
}

export async function aiFromObjective(draft: Draft, lesson: Lesson, objective: string, ctx: TeachingCtx, cycle: CycleCtx | null) {
  const state = {
    ...describe(ctx),
    cycle_objectifs: cycle?.objectives || null,
    cycle_evaluation: cycle?.evaluation || null,
    seance_numero: cycle?.position ?? null,
    nombre_de_seances: cycle?.count ?? null,
    seances_precedentes: cycle?.previous ?? [],
    blocs_de_la_seance: lesson.blocks.map((b) => ({ id: b.id, kind: b.kind, title: b.title, minutes: b.minutes, text: b.text })),
    changements_en_attente: draft.changes.map((c) => ({ id: c.id, action: c.op, kind: c.kind, title: c.title, minutes: c.minutes, text: c.text, field: c.field ?? null, value: c.value ?? null })),
  };
  const user = `Contexte :\n${JSON.stringify(state)}\n\nObjectif de la séance, dicté par l'enseignant :\n<objectif>${objective}</objectif>`;
  const r = await callClaude<{ operations: LessonOp[] }>({ task: 'lesson', system: OBJECTIVE_SYSTEM, user, schema: LESSON_SCHEMA });
  return applyOps(draft, lesson, r.operations, objective);
}

// ── Fiche adaptée ───────────────────────────────────────────────────────────

const SECTION_TYPES = ['table', 'levels', 'checks', 'lines', 'fields', 'text', 'heading', 'box'] as const;
const SPANS: SectionSpan[] = ['full', 'half', 'third', 'two-thirds'];

interface RawSection {
  type: FicheSection['type'];
  span: SectionSpan | null;
  title: string | null;
  head: string | null;
  cols: string[] | null;
  rows: string[] | null;
  cells: string[][] | null;
  widths: number[] | null;
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
      type: { type: 'string', enum: [...SECTION_TYPES] },
      span: nullableEnum(SPANS),
      title: nullable('string'),
      head: nullable('string'),
      cols: nullableStrings,
      rows: nullableStrings,
      cells: { type: ['array', 'null'], items: strings },
      widths: { type: ['array', 'null'], items: { type: 'number' } },
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

Quand l'enseignant demande une mise en page précise (tailles, alignement, disposition côte à côte, cases pré-remplies…), respecte-la exactement : tu disposes des réglages ci-dessous pour le faire.

Champs :
- title : titre court. who : à qui elle sert. size : half pour une fiche courte (2 par page A4), full pour une page entière. ident : champs d'identification à remplir à la main (ex. Observateur, Joueur observé, Classe, Date).
- sections, dans l'ordre de lecture. Selon type :
  - table : tableau. head = en-tête de la première colonne (celle des libellés), cols = en-têtes des autres colonnes, rows = libellés des lignes ("" pour une ligne vierge à remplir ; plusieurs "" pour plusieurs lignes vierges). Sans head et avec des libellés tous vides, la première colonne n'existe pas. cells = cases pré-remplies, une liste par ligne, une chaîne par colonne de cols ("" = case vide). widths = largeur en % de chaque colonne affichée (première colonne comprise si elle existe ; total 100). tall = true pour des cases hautes.
  - levels : critères à cocher par degré. items = critères, levels = degrés.
  - checks : cases à cocher. title, items.
  - lines : lignes d'écriture. title, n = nombre de lignes (1 à 12).
  - fields : champs courts sur une ligne. fields = libellés.
  - text : consigne ; accepte **gras**, *italique* et les listes "- ".
  - heading : intertitre. text.
  - box : cadre vide pour dessiner (schéma, terrain, parcours). title, n = hauteur en lignes (2 à 30).
- Mise en page :
  - span (toutes les sections) : full (toute la largeur, par défaut), half, third, two-thirds. Des sections successives dont les largeurs font une ligne complète (half + half, third ×3, two-thirds + third) se placent côte à côte.
  - Pour que deux tableaux aient la même taille et des colonnes alignées : même span, même nombre de colonnes affichées, même widths.
Mets null dans les champs qui ne servent pas. Une fiche half tient en 2 à 3 sections courtes.`;

const list = (v?: string[] | null) => (v ?? []).map((x) => x.trim()).filter(Boolean);
const opt = (v?: string | null) => v?.trim() || undefined;

/**
 * Vérifie une partie de fiche (venue de Claude ou de l'éditeur) : textes nettoyés, dimensions bornées,
 * cases et largeurs ajustées au tableau. Renvoie `null` pour une partie vide.
 */
export function tidySection(s: FicheSection): FicheSection | null {
  const span = s.span && s.span !== 'full' && SPANS.includes(s.span) ? { span: s.span } : {};
  switch (s.type) {
    case 'table': {
      const cols = s.cols.map((c) => c.trim());
      const head = opt(s.head);
      let rows = (Array.isArray(s.rows) ? s.rows : Array.from({ length: s.rows }, () => '')).map((r) => r.trim());
      if (!rows.length) rows = Array.from({ length: Math.max(4, s.cells?.length ?? 0) }, () => '');
      const cells = rows.map((_, i) => cols.map((_, j) => (s.cells?.[i]?.[j] ?? '').trim()));
      const hasCells = cells.some((r) => r.some(Boolean));
      if (!cols.length || (!cols.some(Boolean) && !hasCells)) return null;
      const title = opt(s.title);
      const shown = cols.length + (tableHasLabels({ head, rows }) || title ? 1 : 0);
      const w = s.widths?.map(Number);
      const okWidths = w?.length === shown && w.every((x) => Number.isFinite(x) && x > 0);
      const sum = okWidths ? w.reduce((a, b) => a + b, 0) : 0;
      return {
        ...span,
        type: 'table',
        title,
        head,
        cols,
        rows,
        ...(hasCells ? { cells } : {}),
        ...(okWidths ? { widths: w.map((x) => Math.round((x / sum) * 1000) / 10) } : {}),
        ...(s.tall ? { tall: true } : {}),
      };
    }
    case 'levels': {
      const items = list(s.items);
      const levels = list(s.levels);
      return items.length ? { ...span, type: 'levels', title: opt(s.title), items, levels: levels.length ? levels : undefined } : null;
    }
    case 'checks': {
      const items = list(s.items);
      return items.length ? { ...span, type: 'checks', title: opt(s.title), items } : null;
    }
    case 'lines':
      return { ...span, type: 'lines', title: opt(s.title), n: Math.max(1, Math.min(12, Math.round(s.n ?? 2))) };
    case 'fields': {
      const fields = list(s.fields);
      return fields.length ? { ...span, type: 'fields', fields } : null;
    }
    case 'text':
    case 'heading': {
      const text = s.text.trim();
      return text ? { ...span, type: s.type, text } : null;
    }
    case 'box':
      return { ...span, type: 'box', title: opt(s.title), n: Math.max(2, Math.min(30, Math.round(s.n ?? 6))) };
  }
  return null;
}

/** Section brute de Claude → section de fiche (avant vérification). */
function fromRaw(s: RawSection): FicheSection | null {
  const span = s.span ?? undefined;
  switch (s.type) {
    case 'table':
      return { span, type: 'table', title: s.title ?? undefined, head: s.head ?? undefined, cols: s.cols ?? [], rows: s.rows ?? [], cells: s.cells ?? undefined, widths: s.widths ?? undefined, tall: !!s.tall };
    case 'levels':
      return { span, type: 'levels', title: s.title ?? undefined, items: s.items ?? [], levels: s.levels ?? undefined };
    case 'checks':
      return { span, type: 'checks', title: s.title ?? undefined, items: s.items ?? [] };
    case 'lines':
    case 'box':
      return { span, type: s.type, title: s.title ?? undefined, n: s.n ?? undefined };
    case 'fields':
      return { span, type: 'fields', fields: s.fields ?? [] };
    case 'text':
    case 'heading':
      return { span, type: s.type, text: s.text ?? '' };
  }
  return null;
}

function tidySheet(raw: Omit<CustomSheet, 'id' | 'sections'>, sections: FicheSection[]): Omit<CustomSheet, 'id'> {
  const ident = list(raw.ident);
  return {
    title: raw.title.trim() || 'Fiche sur mesure',
    who: ['élève', 'observateur', 'groupe', 'enseignant'].includes(raw.who) ? raw.who : 'observateur',
    size: raw.size === 'full' ? 'full' : 'half',
    ident: ident.length ? ident : ['Nom', 'Classe', 'Date'],
    sections: sections.map(tidySection).filter((s): s is FicheSection => !!s),
  };
}

/** Réponse de Claude → fiche enregistrable. Les sections incomplètes sont écartées. */
export function toCustomSheet(raw: RawSheet): CustomSheet {
  const sections = (raw.sections ?? []).map(fromRaw).filter((s): s is FicheSection => !!s);
  return { id: uid(), ...tidySheet({ title: raw.title ?? '', who: raw.who, size: raw.size, ident: raw.ident ?? [] }, sections) };
}

/** Fiche modifiée à la main → fiche enregistrable : mêmes règles qu'à la création, sans les lignes laissées vides. */
export function cleanSheet(sheet: CustomSheet): CustomSheet {
  return { id: sheet.id, ...tidySheet(sheet, sheet.sections) };
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

// ── Titres de séances ───────────────────────────────────────────────────────

/** Titre qui ne dit rien du contenu : « Séance 3 », « Nouvelle séance », « Séance 2 : ». */
export const isGenericTitle = (t: string) => /^\s*(nouvelle\s+)?s[ée]ance(\s*n?°?\s*\d+)?\s*[:—-]?\s*$/i.test(t);

const TITLES_SYSTEM = `${STYLE}

Tu proposes un titre court (6 mots au plus) pour chaque séance d'un cycle, d'après son objectif et ses blocs : ce qu'on y apprend, pas sa forme. Commence par « Séance N — » (N = numéro donné). Pas de point final.`;

export async function aiLessonTitles(cycleTitle: string, lessons: Array<{ id: string; number: number; objective: string; blocks: string[] }>) {
  const r = await callClaude<{ titles: Array<{ id: string; title: string }> }>({
    task: 'lesson',
    system: TITLES_SYSTEM,
    user: `Cycle : ${cycleTitle}\n\nSéances :\n${JSON.stringify(lessons)}`,
    schema: obj({ titles: { type: 'array', items: obj({ id: { type: 'string' }, title: { type: 'string' } }) } }),
  });
  const ids = new Set(lessons.map((l) => l.id));
  return (r.titles ?? []).filter((t) => ids.has(t.id) && t.title.trim()).map((t) => ({ id: t.id, title: t.title.trim().replace(/\.$/, '') }));
}

// ── Bilan de fin de cycle ───────────────────────────────────────────────────

const CYCLE_REVIEW_SYSTEM = `${STYLE}

Tu rédiges le bilan de fin de cycle de l'enseignant, pour lui-même, à partir de ses bilans de séance, de ses ressentis et des niveaux relevés. En mini-Markdown, court (15 lignes au plus), avec ces parties :
**Ce qui a marché :** …
**Ce qui a coincé :** …
**Niveau de la classe :** … (progression entre le diagnostic et l'évaluation finale si les chiffres existent)
**Pour la prochaine fois :** liste de 2 à 4 ajustements concrets.
N'invente rien : appuie-toi seulement sur ce qui est fourni, et dis-le quand une information manque.`;

export async function aiCycleReview(input: unknown) {
  const r = await callClaude<{ review: string }>({
    task: 'lesson',
    system: CYCLE_REVIEW_SYSTEM,
    user: `Cycle et séances :\n${JSON.stringify(input)}`,
    schema: obj({ review: { type: 'string' } }),
  });
  return r.review.trim();
}

// ── Fiche d'évaluation (tableur) ────────────────────────────────────────────

export const isLyceeLevel = (level: string) => /2nde|seconde|1re|1ère|premi[eè]re|terminale|tle|bac|cap/i.test(level);

export const EVAL_SHEET_SCHEMA = obj({
  title: { type: 'string' },
  expectations: strings,
  blocks: {
    type: 'array',
    items: obj({
      name: { type: 'string' },
      points: { type: 'number' },
      criteria: {
        type: 'array',
        items: obj({
          label: { type: 'string' },
          kind: { type: 'string', enum: ['levels', 'single', 'number', 'computed', 'choice', 'text'] },
          observe: strings,
          ref: nullable('string'),
          unit: nullable('string'),
          format: nullableEnum(['decimal', 'time', 'count']),
          decimals: nullable('integer'),
          expr: nullable('string'),
          scoring: {
            anyOf: [
              obj({
                type: { type: 'string', enum: ['none', 'table', 'rank'] },
                points: { type: ['array', 'null'], items: obj({ at: { type: 'number' }, pct: { type: 'number' } }) },
                steps: nullable('boolean'),
                best: nullableEnum(['high', 'low']),
              }),
              { type: 'null' },
            ],
          },
          options: { type: ['array', 'null'], items: obj({ label: { type: 'string' }, pct: { type: 'number' } }) },
          weight: nullable('number'),
        }),
      },
    }),
  },
  bonus: { type: 'array', items: obj({ label: { type: 'string' }, points: { type: 'number' } }) },
  sources: strings,
  notes: { type: 'string' },
  rounding: { type: 'number' },
  cap: { type: 'boolean' },
});

const EVAL_SHEET_SYSTEM = `${STYLE}

Tu prépares la fiche d'évaluation que l'enseignant remplira sur tablette pendant la séance d'évaluation décrite : une ligne par élève. La fiche fonctionne comme un tableur : cases à cocher, valeurs saisies, formules, barèmes, rangs.

Contenu :
- Appuie-toi d'abord sur la séance d'évaluation et sur le cycle (objectifs, critères d'évaluation) : la fiche évalue ce que la séance fait faire.
- expectations : les attendus visés, formulés comme dans les textes officiels. Collège : attendus de fin de cycle (AFC) du champ d'apprentissage concerné, cycle 3 pour la 6e, cycle 4 de la 5e à la 3e. Lycée : attendus de fin de lycée (AFL1, AFL2, AFL3) du champ d'apprentissage ; pour le baccalauréat, ceux du référentiel fourni.
- Adapte les degrés au niveau dans le cycle : en 5e on débute le cycle 4, en 3e on en vise la fin ; « Acquis » = ce qu'on attend à ce niveau, « Avancé » = au-delà. N'exige pas d'un élève de 6e ce qu'on attend en 3e.
- Baccalauréat (CCF) : suis le référentiel fourni (éléments à évaluer, repères par degré, répartition des points). Par défaut au lycée général et technologique : AFL1 sur 12 points, AFL2 et AFL3 sur 8 points ensemble (choix de l'élève entre 2/6, 4/4 ou 6/2 : dis-le dans notes et propose 4/4 par défaut). N'invente pas de référentiel : si une information manque, dis-le dans notes.

Forme (règles de l'enseignant) :
- blocks : 2 à 4 blocs (ex. « Jouer pour gagner », « Arbitrer », « Attitude »), points entiers ou demi-points, total 20.
- criteria, selon ce qui s'évalue le mieux :
  - levels : critère à 4 degrés (observe = 4 phrases courtes et observables : Débutant, En cours, Acquis, Avancé) ;
  - single : réussi ou non (observe = 1 phrase) ;
  - number : valeur mesurée à saisir (VMA, chrono, score, distance, nombre de réussites…). unit (« km/h », « pts », « m »), format = decimal, time (chrono : l'enseignant tape 3:25, la valeur est en secondes) ou count (compteur avec boutons − et +) ;
  - computed : valeur calculée par expr à partir des autres valeurs (par leur ref) : opérations + - * / ^ et parenthèses ; comparaisons < > <= >= = <> (1 ou 0) ; SI(condition; si vrai; si faux), ET(…), OU(…), NON(…) ; ABS, MIN, MAX, MOYENNE, SOMME (ces quatre ignorent les cases vides : MAX(essai1; essai2; essai3) = meilleur essai), ARRONDI(x; n), ARRONDI_INF, ARRONDI_SUP, RACINE ; statistiques de la classe : CLASSE_MOY(ref), CLASSE_MIN(ref), CLASSE_MAX(ref), RANG(ref). Les niveaux à 4 cases valent 0 à 4, une case 0 ou 1. Exemple d'écart au projet en % : ABS(score1 - projet1) / projet1 * 100 ;
  - choice : liste déroulante, options = [{label, pct}] (part des points de chaque choix, 0 à 100) : pour un rôle, une tenue, un choix d'élève… ;
  - text : observation écrite libre, sans points (seulement si l'enseignant la demande).
- ref (number et computed) : nom court en minuscules sans accent ni espace (« vma », « projet1 », « score1 »), unique ; null pour les autres types.
- scoring (number et computed) : comment la valeur rapporte des points.
  - none : aucun point (valeur d'appui pour un calcul, ex. le projet annoncé) ;
  - table : barème, points = [{at: valeur, pct: part des points du critère de 0 à 100}], linéaire entre deux lignes (steps = false), ou par paliers (steps = true) ; avant la première et après la dernière ligne, la valeur du bout. Ex. « tous les points jusqu'à 5 % d'écart, puis on perd des points pour chaque % jusqu'à 0 à 20 % » = [{at:5,pct:100},{at:20,pct:0}] ; une table de performances = une ligne par palier ;
  - rank : selon le rang dans la classe, la meilleure valeur a tous les points, la moins bonne aucun ; best = high (plus grande valeur = meilleure, ex. VMA) ou low (chrono).
  scoring = null pour levels, single, choice, text.
- Quand le barème de l'enseignant se calcule (pourcentages, écarts, performances, classement), utilise number, computed et scoring : ne le remplace jamais par 4 cases à cocher qui demanderaient à l'enseignant de faire le calcul.
- weight : poids du critère dans son bloc (null = 1). Points d'un bloc = moyenne pondérée de ses critères notés × points du bloc. Pour qu'un critère vaille un nombre de points précis, joue sur les blocs et les poids.
- rounding : arrondi de la note finale (0.1 par défaut, ou 0.25, 0.5, 1 si l'enseignant le demande) ; cap : true pour plafonner à 20 avec les bonus, false sinon.
- Pas de surcharge : 2 à 6 colonnes par bloc, 12 au plus en tout ; regroupe les critères secondaires (attitude et règles = une seule case). Les valeurs d'appui (projet, essais) comptent comme des colonnes utiles.
- label : 6 mots au plus (en-tête de colonne).
- bonus : seulement si l'enseignant le demande (sinon liste vide).
- sources : textes officiels utilisés (titre et année, ou adresse web du référentiel), puis « Cycle … du Carnet EPS ».
- notes : 1 ou 2 phrases sur les choix faits (répartition des points, adaptation au niveau, ce qui manquait).`;

export interface EvalSheetInput {
  className: string;
  level: string;
  students: number | null;
  activity: string;
  cycle: { title: string; objectives: string; competences: string; evaluation: string } | null;
  lesson: { title: string; objective: string; evalKind: string | null; blocks: Array<{ kind: string; title: string; minutes: number; text: string }> };
  /** Référentiel collé par l'enseignant (bac) ; vide = recherche en ligne au lycée. */
  referential: string;
  /** Référentiel en photos ou en PDF : Claude le lit directement (pas de recherche en ligne). */
  attachments?: Attachment[];
  instruction: string;
}

/** Fiche d'évaluation : au lycée sans référentiel fourni (texte ou documents), Claude le cherche d'abord en ligne. */
export async function aiEvalSheet(input: EvalSheetInput, onStep?: (step: string) => void): Promise<EvalSheetSpec> {
  let referential = input.referential.trim();
  const docs = input.attachments ?? [];
  if (!referential && !docs.length && isLyceeLevel(input.level)) {
    onStep?.('Recherche du référentiel officiel en ligne…');
    referential = await callClaudeResearch({
      system: `${STYLE}\nTu cherches en ligne les textes officiels d'évaluation en EPS (eduscol.education.fr, sites académiques) et tu en fais une synthèse fidèle, sans rien inventer.`,
      user: `Trouve le référentiel d'évaluation officiel pour : ${input.activity}, classe de ${input.level}${/terminale|tle|bac/i.test(input.level) ? ' (baccalauréat, contrôle en cours de formation)' : ''}.
Donne : le champ d'apprentissage, les AFL visés (AFL1, AFL2, AFL3) avec leur formulation, la situation d'évaluation, les éléments évalués et les repères pour chaque degré, la répartition des points, et l'adresse de chaque source.`,
    });
  }
  onStep?.(docs.length ? `Claude lit le référentiel (${docs.length} document${docs.length > 1 ? 's' : ''}) et construit la fiche…` : 'Construction de la fiche…');
  const raw = await callClaude<EvalSheetSpec>({
    task: 'fiche',
    system: EVAL_SHEET_SYSTEM,
    user: [
      `Classe : ${input.className} (${input.level || 'niveau non précisé'}), ${input.students ?? 'effectif inconnu'} élèves. Activité : ${input.activity || 'non précisée'}.`,
      input.cycle ? `Cycle :\n${JSON.stringify(input.cycle)}` : '',
      `Séance d'évaluation :\n<seance>${JSON.stringify(input.lesson)}</seance>`,
      docs.length
        ? `Le référentiel officiel est dans les documents joints (${docs.map((d) => d.name).join(', ')}) : lis toutes les pages et appuie-toi dessus en priorité (AFL, éléments évalués, repères par degré, barème). Cite-le dans sources.`
        : '',
      referential ? `Référentiel :\n<referentiel>${referential}</referentiel>` : '',
      input.instruction.trim() ? `Demande de l'enseignant :\n<demande>${input.instruction.trim()}</demande>` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    schema: EVAL_SHEET_SCHEMA,
    attachments: docs,
  });
  return tidyEvalSheet(raw);
}

// ── Cycle complété par Claude ───────────────────────────────────────────────

export interface CycleFields {
  objectives: string;
  competences: string;
  evaluation: string;
  notes: string;
}

const CYCLE_FIELDS_SYSTEM = `${STYLE}

Tu complètes la fiche d'un cycle (séquence) d'EPS : objectifs, attendus visés, évaluation, notes. L'enseignant a pu dicter ce qu'il veut, avec des hésitations et des erreurs de reconnaissance vocale : suis son intention.

- objectives : ce que les élèves vont apprendre, 2 à 4 lignes concrètes, au niveau de la classe et pour le nombre de séances donné.
- competences : les attendus visés, formulés comme dans les programmes. Collège : champ d'apprentissage et attendus de fin de cycle (AFC), cycle 3 pour la 6e, cycle 4 de la 5e à la 3e. Lycée : champ d'apprentissage et AFL1, AFL2, AFL3. Pas d'« épreuve officielle » au collège.
- evaluation : situation d'évaluation, moments (diagnostique, formative, sommative), critères (une ligne « Critères : a · b · c »), barème indicatif /20. Baccalauréat : AFL1 sur 12 points, AFL2 et AFL3 sur 8 points ensemble.
- notes : organisation utile (installations, matériel à réserver, groupes) ; vide si rien d'utile.
Règles : garde tel quel un champ déjà rempli, sauf si l'enseignant demande de le changer ou de le compléter. Mini-Markdown accepté (**gras**, listes « - »). Renvoie les 4 champs en entier.`;

export async function aiCycleFields(input: {
  className: string;
  level: string;
  students: number | null;
  activity: string;
  title: string;
  dates: string;
  lessons: string[];
  current: CycleFields;
  spoken: string;
}): Promise<CycleFields> {
  const r = await callClaude<CycleFields>({
    task: 'lesson',
    system: CYCLE_FIELDS_SYSTEM,
    user: `Cycle :\n${JSON.stringify({ classe: input.className, niveau: input.level, effectif: input.students, activite: input.activity, titre: input.title, dates: input.dates, seances: input.lessons, champs_actuels: input.current })}${input.spoken.trim() ? `\n\nDemande de l'enseignant :\n<demande>${input.spoken.trim()}</demande>` : ''}`,
    schema: obj({ objectives: { type: 'string' }, competences: { type: 'string' }, evaluation: { type: 'string' }, notes: { type: 'string' } }),
  });
  const keep = (k: keyof CycleFields) => (typeof r[k] === 'string' ? r[k].trim() : input.current[k]);
  return { objectives: keep('objectives'), competences: keep('competences'), evaluation: keep('evaluation'), notes: keep('notes') };
}

// ── Plan de séquence (toutes les séances d'un cycle) ────────────────────────

export interface PlannedLesson {
  title: string;
  objective: string;
  evalKind: 'diagnostic' | 'formative' | 'summative' | null;
}

const CYCLE_PLAN_SYSTEM = `${STYLE}

Tu proposes le plan d'une séquence (cycle) d'EPS : une ligne par séance, dans l'ordre, exactement le nombre de séances demandé.
- title : « Séance N — » suivi de ce qu'on y apprend (6 mots au plus après le tiret).
- objective : ce que les élèves doivent savoir faire à la fin de la séance, en une phrase observable.
- evalKind : diagnostic (début de cycle), formative (vers le milieu), summative (fin de cycle, conforme à l'évaluation du cycle) ; null pour les autres séances.
- Progression : du plus simple au plus complexe, au service des objectifs et des attendus du cycle, au niveau de la classe ; prévois les séances d'appropriation, de régulation (avant l'évaluation) et l'évaluation finale annoncée.
- Tiens compte des séances déjà préparées (titres et objectifs fournis) : garde leur place dans la progression.`;

export async function aiCyclePlan(input: {
  className: string;
  level: string;
  students: number | null;
  activity: string;
  cycle: { title: string; objectives: string; competences: string; evaluation: string; notes: string };
  lessons: Array<{ number: number; date: string | null; minutes: number; title: string; objective: string; prepared: boolean }>;
  instruction: string;
}): Promise<PlannedLesson[]> {
  const r = await callClaude<{ lessons: PlannedLesson[] }>({
    task: 'lesson',
    system: CYCLE_PLAN_SYSTEM,
    user: `Classe : ${input.className} (${input.level || 'niveau ?'}), ${input.students ?? '?'} élèves. Activité : ${input.activity || '?'}.\n\nCycle :\n${JSON.stringify(input.cycle)}\n\nSéances (${input.lessons.length}) :\n${JSON.stringify(input.lessons)}${input.instruction.trim() ? `\n\nDemande de l'enseignant :\n<demande>${input.instruction.trim()}</demande>` : ''}`,
    schema: obj({
      lessons: { type: 'array', items: obj({ title: { type: 'string' }, objective: { type: 'string' }, evalKind: nullableEnum(['diagnostic', 'formative', 'summative']) }) },
    }),
  });
  // Exactement une ligne par séance : on complète ou on coupe si Claude s'est trompé de nombre.
  const out = (r.lessons ?? []).slice(0, input.lessons.length).map((l) => ({
    title: (l.title ?? '').trim(),
    objective: (l.objective ?? '').trim(),
    evalKind: l.evalKind === 'diagnostic' || l.evalKind === 'formative' || l.evalKind === 'summative' ? l.evalKind : null,
  }));
  while (out.length < input.lessons.length) out.push({ title: '', objective: '', evalKind: null });
  return out;
}
