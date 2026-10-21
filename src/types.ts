// ─────────────────────────────────────────────────────────────────────────────
// Modèle de données du Carnet EPS.
// Tout est sérialisable en JSON (export, import, synchronisation GitHub).
// Chaque entité porte `updatedAt` (ms) : c'est ce qui permet de fusionner sans
// perte les modifications faites sur le PC, le téléphone ou par Claude.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;

export interface Meta {
  id: ID;
  createdAt: number;
  updatedAt: number;
}

/** Date au format ISO local `YYYY-MM-DD`. */
export type ISODate = string;
/** Heure au format `HH:MM`. */
export type HHMM = string;

// ── Calendrier ──────────────────────────────────────────────────────────────

export interface Holiday {
  id: ID;
  label: string;
  /** Premier jour sans cours (inclus). */
  start: ISODate;
  /** Dernier jour sans cours (inclus). */
  end: ISODate;
  kind: 'vacances' | 'ferie' | 'autre';
}

export interface SchoolYear extends Meta {
  /** Ex. « 2026-2027 ». */
  label: string;
  start: ISODate;
  end: ISODate;
  zone: 'A' | 'B' | 'C' | null;
  holidays: Holiday[];
}

// ── Classes ─────────────────────────────────────────────────────────────────

export interface Slot {
  id: ID;
  /** 1 = lundi … 7 = dimanche. */
  weekday: number;
  start: HHMM;
  end: HHMM;
  place: string;
}

export interface Klass extends Meta {
  yearId: ID;
  name: string;
  level: string;
  students: number | null;
  color: string;
  slots: Slot[];
  /** Cours partagés avec un collègue (texte libre : « un collègue », « classe de M. X »…). Vide = classe non partagée. */
  sharedWith: string;
  notes: string;
  order: number;
}

// ── Cycles (séquences d'enseignement d'une APSA) ───────────────────────────

export interface Cycle extends Meta {
  /** `null` = cycle modèle de la bibliothèque. */
  classId: ID | null;
  title: string;
  activityId: ID | null;
  /**
   * Créneaux de la classe utilisés par ce cycle. Vide = tous les créneaux.
   * Permet de mener deux cycles en parallèle (ex. 2 h de badminton le jeudi, 1 h de demi-fond le lundi).
   */
  slotIds: ID[];
  startDate: ISODate | null;
  endDate: ISODate | null;
  objectives: string;
  /** Attendus de fin de cycle / compétences visées. */
  competences: string;
  evaluation: string;
  notes: string;
  order: number;
}

// ── Séances ─────────────────────────────────────────────────────────────────

export type LessonStatus = 'planned' | 'done' | 'cancelled';

export type BlockKind =
  | 'warmup'
  | 'situation'
  | 'game'
  | 'skill'
  | 'cooldown'
  | 'evaluation'
  | 'theory'
  | 'free';

export interface Block {
  id: ID;
  kind: BlockKind;
  title: string;
  minutes: number;
  /** Texte en mini-Markdown : **gras**, *italique*, listes « - », titres « ## ». */
  text: string;
  materials: string;
  animation: Animation | null;
}

export interface Lesson extends Meta {
  /** `null` = séance modèle de la bibliothèque. */
  classId: ID | null;
  cycleId: ID | null;
  activityId: ID | null;
  title: string;
  /** Position dans le cycle (0, 1, 2…). */
  order: number;
  date: ISODate | null;
  start: HHMM;
  end: HHMM;
  status: LessonStatus;
  objective: string;
  materials: string;
  safety: string;
  blocks: Block[];
  /** Bilan après la séance : ce qui a marché, à retravailler… */
  bilan: string;
  tags: string[];
}

// ── Bibliothèque d'exercices / situations ──────────────────────────────────

export interface Exercise extends Meta {
  title: string;
  activityId: ID | null;
  kind: BlockKind;
  minutes: number;
  tags: string[];
  text: string;
  materials: string;
  animation: Animation | null;
}

// ── Animations de situations ───────────────────────────────────────────────

export type CourtId =
  | 'blank'
  | 'basket'
  | 'basket-half'
  | 'volley'
  | 'badminton'
  | 'hand'
  | 'foot'
  | 'rugby'
  | 'ultimate'
  | 'tennis'
  | 'tt'
  | 'track';

export type TokenKind =
  | 'player'
  | 'coach'
  | 'ball'
  | 'cone'
  | 'hoop'
  | 'goal'
  | 'mat'
  | 'bench'
  | 'text';

export interface Token {
  id: ID;
  kind: TokenKind;
  label: string;
  color: string;
  /** Échelle d'affichage (1 = taille normale). */
  size: number;
}

export interface TokenPos {
  /** Coordonnées en % du terrain (0–100). */
  x: number;
  y: number;
  hidden?: boolean;
  /** Si défini, le jeton suit ce joueur (ballon conduit…) avec le décalage dx/dy. */
  carry?: ID;
  dx?: number;
  dy?: number;
  rot?: number;
}

export type ArrowStyle = 'move' | 'pass' | 'dribble' | 'shoot' | 'line';

export interface Arrow {
  id: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: ArrowStyle;
  color: string;
}

export interface Frame {
  id: ID;
  caption: string;
  /** Pause sur cette étape (ms). */
  holdMs: number;
  /** Durée du déplacement depuis l'étape précédente (ms). */
  moveMs: number;
  pos: Record<ID, TokenPos>;
  arrows: Arrow[];
}

export interface Animation {
  court: CourtId;
  tokens: Token[];
  frames: Frame[];
}

// ── Réglages (synchronisés) ────────────────────────────────────────────────

export interface Field {
  id: ID;
  short: string;
  label: string;
  color: string;
}

export interface Activity {
  id: ID;
  name: string;
  fieldId: ID;
  emoji: string;
  court: CourtId;
}

export interface Settings {
  updatedAt: number;
  teacher: string;
  fields: Field[];
  activities: Activity[];
  levels: string[];
  places: string[];
  defaultLessonMinutes: number;
}

// ── Document complet ───────────────────────────────────────────────────────

export interface AppData {
  schemaVersion: 1;
  settings: Settings;
  years: Record<ID, SchoolYear>;
  classes: Record<ID, Klass>;
  cycles: Record<ID, Cycle>;
  lessons: Record<ID, Lesson>;
  exercises: Record<ID, Exercise>;
  /** Pierres tombales : id supprimé → date de suppression (pour la fusion). */
  deleted: Record<ID, number>;
}

export type Collection = 'years' | 'classes' | 'cycles' | 'lessons' | 'exercises';

export interface EntityMap {
  years: SchoolYear;
  classes: Klass;
  cycles: Cycle;
  lessons: Lesson;
  exercises: Exercise;
}

export const COLLECTIONS: Collection[] = ['years', 'classes', 'cycles', 'lessons', 'exercises'];
