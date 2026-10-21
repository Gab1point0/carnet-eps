import type {
  AppData,
  Block,
  BlockKind,
  Cycle,
  Exercise,
  ID,
  Klass,
  Lesson,
  SchoolYear,
  Slot,
  Todo,
} from '../types';
import { COLLECTIONS } from '../types';
import { defaultSettings, CLASS_COLORS } from '../lib/defaults';
import { uid } from '../lib/util';

// ── Fabriques d'entités ─────────────────────────────────────────────────────

export function emptyData(): AppData {
  return {
    schemaVersion: 1,
    settings: defaultSettings(),
    years: {},
    classes: {},
    cycles: {},
    lessons: {},
    exercises: {},
    deleted: {},
  };
}

const stamp = () => {
  const t = Date.now();
  return { id: uid(), createdAt: t, updatedAt: t };
};

export function newYear(label: string, start: string, end: string, zone: SchoolYear['zone'] = null): SchoolYear {
  return { ...stamp(), label, start, end, zone, holidays: [] };
}

export function newSlot(weekday = 1, start = '08:00', end = '10:00', place = ''): Slot {
  return { id: uid(), weekday, start, end, place };
}

export function newKlass(yearId: ID, order: number, name = '', level = ''): Klass {
  return {
    ...stamp(),
    yearId,
    name,
    level,
    students: null,
    color: CLASS_COLORS[order % CLASS_COLORS.length],
    slots: [],
    sharedWith: '',
    notes: '',
    order,
  };
}

export function newCycle(classId: ID | null, order: number, title = ''): Cycle {
  return {
    ...stamp(),
    classId,
    title,
    activityId: null,
    slotIds: [],
    startDate: null,
    endDate: null,
    objectives: '',
    competences: '',
    evaluation: '',
    notes: '',
    order,
  };
}

export function newBlock(kind: BlockKind = 'situation', title = '', minutes = 15): Block {
  return { id: uid(), kind, title, minutes, text: '', materials: '', animation: null };
}

export function newLesson(classId: ID | null, cycleId: ID | null, order: number, title = ''): Lesson {
  return {
    ...stamp(),
    classId,
    cycleId,
    activityId: null,
    title,
    order,
    date: null,
    start: '08:00',
    end: '10:00',
    status: 'planned',
    objective: '',
    materials: '',
    safety: '',
    blocks: [],
    bilan: '',
    rating: null,
    adjust: false,
    evalKind: null,
    levels: null,
    proposalsDone: [],
    todos: [],
    tasksDone: [],
tags: [],
  };
}

export function newExercise(title = ''): Exercise {
  return {
    ...stamp(),
    title,
    activityId: null,
    kind: 'situation',
    minutes: 15,
    tags: [],
    text: '',
    materials: '',
    animation: null,
  };
}

// ── Normalisation (import, synchronisation, édition manuelle du JSON) ─────

/**
 * Complète les champs manquants de chaque entité avec des valeurs par défaut.
 * Ainsi un JSON écrit à la main (ou par Claude) peut rester minimal.
 */
export function normalizeData(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  const now = Date.now();

  const settings = { ...base.settings, ...(r.settings ?? {}) };
  if (!settings.updatedAt) settings.updatedAt = 0;
  if (!Array.isArray(settings.fields) || !settings.fields.length) settings.fields = base.settings.fields;
  if (!Array.isArray(settings.activities)) settings.activities = base.settings.activities;
  if (!Array.isArray(settings.levels)) settings.levels = base.settings.levels;
  if (!Array.isArray(settings.places)) settings.places = base.settings.places;

  const out: AppData = {
    schemaVersion: 1,
    settings,
    years: {},
    classes: {},
    cycles: {},
    lessons: {},
    exercises: {},
    deleted: { ...(r.deleted ?? {}) },
  };

  const fill = <T extends { id: ID; createdAt: number; updatedAt: number }>(
    src: Record<ID, Partial<T>> | undefined,
    make: () => T,
    fix?: (e: T) => void,
  ): Record<ID, T> => {
    const dest: Record<ID, T> = {};
    for (const [id, e] of Object.entries(src ?? {})) {
      if (!e || typeof e !== 'object') continue;
      const merged = { ...make(), ...e, id } as T;
      if (!e.createdAt) merged.createdAt = now;
      if (!e.updatedAt) merged.updatedAt = now;
      fix?.(merged);
      dest[id] = merged;
    }
    return dest;
  };

  const withIds = <T extends { id?: ID }>(list: T[] | undefined): T[] =>
    (Array.isArray(list) ? list : []).map((x) => (x.id ? x : { ...x, id: uid() }));

  out.years = fill<SchoolYear>(r.years, () => newYear('', '', ''), (y) => {
    y.holidays = withIds(y.holidays);
  });
  out.classes = fill<Klass>(r.classes, () => newKlass('', 0), (k) => {
    k.slots = withIds(k.slots).map((s) => ({ ...newSlot(), ...s }));
  });
  out.cycles = fill<Cycle>(r.cycles, () => newCycle(null, 0), (c) => {
    c.slotIds = Array.isArray(c.slotIds) ? c.slotIds : [];
  });
  out.lessons = fill<Lesson>(r.lessons, () => newLesson(null, null, 0), (l) => {
    l.blocks = withIds(l.blocks).map((b) => ({ ...newBlock(), ...b }));
    l.tags = Array.isArray(l.tags) ? l.tags : [];
    l.proposalsDone = Array.isArray(l.proposalsDone) ? l.proposalsDone : [];
    l.tasksDone = Array.isArray(l.tasksDone) ? l.tasksDone : [];
    l.todos = withIds<Partial<Todo>>(l.todos).map((t) => ({ id: t.id as ID, text: t.text ?? '', done: !!t.done }));
    l.evalKind = l.evalKind === 'diagnostic' || l.evalKind === 'formative' || l.evalKind === 'summative' ? l.evalKind : null;
    l.levels = Array.isArray(l.levels) && l.levels.length === 4 ? (l.levels.map((n) => Math.max(0, Number(n) || 0)) as [number, number, number, number]) : null;
  });
  out.exercises = fill<Exercise>(r.exercises, () => newExercise(), (e) => {
    e.tags = Array.isArray(e.tags) ? e.tags : [];
  });

  // Une pierre tombale n'a de sens que si elle est plus récente que l'entité.
  for (const c of COLLECTIONS) {
    for (const [id, e] of Object.entries(out[c])) {
      const t = out.deleted[id];
      if (t !== undefined && t >= e.updatedAt) delete out[c][id];
    }
  }
  return out;
}

export function serialize(data: AppData): string {
  return JSON.stringify(data, null, 1);
}
