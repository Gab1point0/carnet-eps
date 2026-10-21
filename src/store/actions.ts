import type { Block, Cycle, Exercise, ID, ISODate, Klass, Lesson, SchoolYear } from '../types';
import { useData, Tx } from './data';
import { newBlock, newCycle, newExercise, newKlass, newLesson, newYear } from './model';
import { cycleLessons, sortLessons } from './selectors';
import { addDays, shiftYear } from '../lib/dates';
import { publicHolidaysForSchoolYear } from '../lib/holidays';
import { nextOccurrences } from '../lib/schedule';
import { deepClone, uid } from '../lib/util';

const st = () => useData.getState();

/** Copie des blocs avec de nouveaux identifiants. */
export function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => ({ ...deepClone(b), id: uid() }));
}

function yearOfClass(tx: Tx, klass: Klass): SchoolYear | undefined {
  return tx.get('years', klass.yearId);
}

// ── Années ──────────────────────────────────────────────────────────────────

export function createYear(label: string, start: ISODate, end: ISODate, zone: SchoolYear['zone'] = null): ID {
  const y = newYear(label, start, end, zone);
  y.holidays = publicHolidaysForSchoolYear(start, end);
  st().put('years', y);
  return y.id;
}

export interface DuplicateYearOptions {
  label: string;
  start: ISODate;
  end: ISODate;
  zone: SchoolYear['zone'];
  /** Décale les dates de cycles et séances (364 j = mêmes jours de semaine) ; sinon les dates sont effacées. */
  keepDates: boolean;
  /** Copie aussi le contenu des séances (sinon : classes et cycles seulement). */
  withLessons: boolean;
}

/** « Reporter » une année : copie classes, cycles et séances pour préparer l'année suivante. */
export function duplicateYear(fromId: ID, o: DuplicateYearOptions): ID {
  const newId = uid();
  st().transact((tx) => {
    const from = tx.get('years', fromId);
    if (!from) return;
    const year = newYear(o.label, o.start, o.end, o.zone);
    year.id = newId;
    year.holidays = publicHolidaysForSchoolYear(o.start, o.end);
    tx.put('years', year);

    const shift = o.keepDates ? 364 * Math.max(1, Math.round((Date.parse(o.start) - Date.parse(from.start)) / (364 * 86400000))) : 0;
    const moveDate = (d: ISODate | null) => (d && o.keepDates ? addDays(d, shift) : null);

    for (const k of tx.all('classes').filter((c) => c.yearId === fromId)) {
      const nk: Klass = { ...deepClone(k), id: uid(), yearId: newId, slots: k.slots.map((s) => ({ ...s, id: uid() })) };
      tx.put('classes', nk);
      for (const cy of tx.all('cycles').filter((c) => c.classId === k.id)) {
        const ncy: Cycle = {
          ...deepClone(cy),
          id: uid(),
          classId: nk.id,
          startDate: moveDate(cy.startDate),
          endDate: moveDate(cy.endDate),
        };
        tx.put('cycles', ncy);
        if (!o.withLessons) continue;
        for (const l of tx.all('lessons').filter((x) => x.cycleId === cy.id)) {
          const nl: Lesson = {
            ...deepClone(l),
            id: uid(),
            classId: nk.id,
            cycleId: ncy.id,
            date: moveDate(l.date),
            status: 'planned',
            bilan: '',
            blocks: cloneBlocks(l.blocks),
          };
          tx.put('lessons', nl);
        }
      }
    }
  });
  return newId;
}

// ── Cycles & séances ────────────────────────────────────────────────────────

export interface NewCycleOptions {
  title: string;
  activityId: ID | null;
  startDate: ISODate | null;
  count: number;
}

/** Crée un cycle et ses séances, datées automatiquement selon l'emploi du temps de la classe. */
export function createCycleWithLessons(classId: ID, o: NewCycleOptions): ID {
  const cycleId = uid();
  st().transact((tx) => {
    const klass = tx.get('classes', classId);
    if (!klass) return;
    const year = yearOfClass(tx, klass);
    const order = tx.all('cycles').filter((c) => c.classId === classId).length;
    const occ =
      o.startDate && klass.slots.length
        ? nextOccurrences(klass.slots, o.startDate, year?.holidays ?? [], { count: o.count })
        : [];

    const cycle: Cycle = {
      ...newCycle(classId, order, o.title),
      id: cycleId,
      activityId: o.activityId,
      startDate: occ[0]?.date ?? o.startDate,
      endDate: occ.length ? occ[occ.length - 1].date : null,
    };
    tx.put('cycles', cycle);

    for (let i = 0; i < o.count; i++) {
      const l = newLesson(classId, cycleId, i, `Séance ${i + 1}`);
      l.activityId = o.activityId;
      const slotInfo = occ[i];
      if (slotInfo) {
        l.date = slotInfo.date;
        l.start = slotInfo.slot.start;
        l.end = slotInfo.slot.end;
      }
      tx.put('lessons', l);
    }
  });
  return cycleId;
}

/** Réaffecte les dates des séances d'un cycle (dans l'ordre) à partir d'une date, selon l'emploi du temps. */
export function regenerateDates(cycleId: ID, startDate: ISODate): number {
  let assigned = 0;
  st().transact((tx) => {
    const cycle = tx.get('cycles', cycleId);
    const klass = cycle?.classId ? tx.get('classes', cycle.classId) : undefined;
    if (!cycle || !klass) return;
    const year = yearOfClass(tx, klass);
    const lessons = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycleId));
    const occ = nextOccurrences(klass.slots, startDate, year?.holidays ?? [], { count: lessons.length });
    lessons.forEach((l, i) => {
      const o = occ[i];
      tx.patch('lessons', l.id, o ? { date: o.date, start: o.slot.start, end: o.slot.end } : { date: null });
    });
    assigned = occ.length;
    tx.patch('cycles', cycleId, {
      startDate: occ[0]?.date ?? null,
      endDate: occ.length ? occ[occ.length - 1].date : null,
    });
  });
  return assigned;
}

/** Ajoute une séance en fin de cycle, à la prochaine occurrence de l'emploi du temps. */
export function addLessonToCycle(cycleId: ID): ID {
  const id = uid();
  st().transact((tx) => {
    const cycle = tx.get('cycles', cycleId);
    if (!cycle) return;
    const klass = cycle.classId ? tx.get('classes', cycle.classId) : undefined;
    const existing = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycleId));
    const l = newLesson(cycle.classId, cycleId, existing.length, `Séance ${existing.length + 1}`);
    l.id = id;
    l.activityId = cycle.activityId;
    if (klass) {
      const year = yearOfClass(tx, klass);
      const lastDate = [...existing].reverse().find((x) => x.date)?.date ?? cycle.startDate;
      if (lastDate && klass.slots.length) {
        const from = existing.some((x) => x.date) ? addDays(lastDate, 1) : lastDate;
        const o = nextOccurrences(klass.slots, from, year?.holidays ?? [], { count: 1 })[0];
        if (o) {
          l.date = o.date;
          l.start = o.slot.start;
          l.end = o.slot.end;
          tx.patch('cycles', cycleId, { endDate: o.date });
        }
      }
    }
    tx.put('lessons', l);
  });
  return id;
}

/** Remonte / descend une séance dans son cycle (renumérote toutes les séances). */
export function moveLesson(cycleId: ID, lessonId: ID, dir: -1 | 1): void {
  st().transact((tx) => {
    const list = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycleId));
    const i = list.findIndex((l) => l.id === lessonId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((l, idx) => {
      if (l.order !== idx) tx.patch('lessons', l.id, { order: idx });
    });
  });
}

export interface DuplicateLessonOptions {
  classId?: ID | null;
  cycleId?: ID | null;
  date?: ISODate | null;
  title?: string;
}

export function duplicateLesson(lessonId: ID, o: DuplicateLessonOptions = {}): ID {
  const id = uid();
  st().transact((tx) => {
    const src = tx.get('lessons', lessonId);
    if (!src) return;
    const cycleId = o.cycleId === undefined ? src.cycleId : o.cycleId;
    const order = cycleId ? tx.all('lessons').filter((l) => l.cycleId === cycleId).length : 0;
    const copy: Lesson = {
      ...deepClone(src),
      id,
      classId: o.classId === undefined ? src.classId : o.classId,
      cycleId,
      date: o.date === undefined ? null : o.date,
      title: o.title ?? src.title,
      order,
      status: 'planned',
      bilan: '',
      blocks: cloneBlocks(src.blocks),
    };
    tx.put('lessons', copy);
  });
  return id;
}

export function saveLessonAsTemplate(lessonId: ID): ID {
  return duplicateLesson(lessonId, { classId: null, cycleId: null, date: null });
}

/** Copie un cycle (avec ses séances) dans une autre classe ou dans la bibliothèque (`classId = null`). */
export function copyCycle(cycleId: ID, classId: ID | null, startDate: ISODate | null = null): ID {
  const newId = uid();
  st().transact((tx) => {
    const src = tx.get('cycles', cycleId);
    if (!src) return;
    const klass = classId ? tx.get('classes', classId) : undefined;
    const year = klass ? yearOfClass(tx, klass) : undefined;
    const lessons = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycleId));
    const order = classId ? tx.all('cycles').filter((c) => c.classId === classId).length : 0;
    const occ =
      klass && startDate && klass.slots.length
        ? nextOccurrences(klass.slots, startDate, year?.holidays ?? [], { count: lessons.length })
        : [];
    tx.put('cycles', {
      ...deepClone(src),
      id: newId,
      classId,
      order,
      startDate: occ[0]?.date ?? null,
      endDate: occ.length ? occ[occ.length - 1].date : null,
    });
    lessons.forEach((l, i) => {
      tx.put('lessons', {
        ...deepClone(l),
        id: uid(),
        classId,
        cycleId: newId,
        order: i,
        date: occ[i]?.date ?? null,
        start: occ[i]?.slot.start ?? l.start,
        end: occ[i]?.slot.end ?? l.end,
        status: 'planned',
        bilan: '',
        blocks: cloneBlocks(l.blocks),
      });
    });
  });
  return newId;
}

// ── Bibliothèque ────────────────────────────────────────────────────────────

export function saveBlockAsExercise(block: Block, activityId: ID | null): ID {
  const ex: Exercise = {
    ...newExercise(block.title || 'Sans titre'),
    activityId,
    kind: block.kind,
    minutes: block.minutes,
    text: block.text,
    materials: block.materials,
    animation: block.animation ? deepClone(block.animation) : null,
  };
  st().put('exercises', ex);
  return ex.id;
}

export function blockFromExercise(ex: Exercise): Block {
  return {
    ...newBlock(ex.kind, ex.title, ex.minutes),
    text: ex.text,
    materials: ex.materials,
    animation: ex.animation ? deepClone(ex.animation) : null,
  };
}

export function insertExerciseInLesson(lessonId: ID, exerciseId: ID): void {
  st().transact((tx) => {
    const l = tx.get('lessons', lessonId);
    const ex = tx.get('exercises', exerciseId);
    if (!l || !ex) return;
    tx.patch('lessons', lessonId, { blocks: [...l.blocks, blockFromExercise(ex)] });
  });
}

/** Crée une séance isolée (hors cycle) sur un créneau de la classe. */
export function createLessonAt(klass: Klass, date: ISODate, start: string, end: string): ID {
  const l = newLesson(klass.id, null, 0, 'Nouvelle séance');
  l.date = date;
  l.start = start;
  l.end = end;
  st().put('lessons', l);
  return l.id;
}

/** Les séances d'un cycle, utilitaire exposé pour les pages. */
export { cycleLessons };
