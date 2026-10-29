import type { Block, Cycle, Exercise, ID, ISODate, Klass, Lesson, SchoolYear } from '../types';
import { useData, Tx } from './data';
import { newBlock, newCycle, newExercise, newKlass, newLesson, newYear } from './model';
import { cycleLessons, sortLessons } from './selectors';
import { addDays, shiftYear } from '../lib/dates';
import { publicHolidaysForSchoolYear } from '../lib/holidays';
import { nextOccurrences, slotsForCycle } from '../lib/schedule';
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
      // Les créneaux reçoivent de nouveaux identifiants : les cycles qui s'y réfèrent doivent suivre.
      const slotMap = new Map(k.slots.map((s) => [s.id, uid()]));
      const nk: Klass = { ...deepClone(k), id: uid(), yearId: newId, slots: k.slots.map((s) => ({ ...s, id: slotMap.get(s.id)! })) };
      tx.put('classes', nk);
      for (const cy of tx.all('cycles').filter((c) => c.classId === k.id)) {
        const ncy: Cycle = {
          ...deepClone(cy),
          id: uid(),
          classId: nk.id,
          slotIds: (cy.slotIds ?? []).map((id) => slotMap.get(id)).filter((id): id is string => !!id),
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
            rating: null,
            adjust: false,
            levels: null,
            proposalsDone: [],
            todos: [],
            tasksDone: [],
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
  /** Créneaux de la classe à utiliser (vide / absent = tous). */
  slotIds?: ID[];
}

/** Crée un cycle et ses séances, datées automatiquement selon l'emploi du temps de la classe. */
export function createCycleWithLessons(classId: ID, o: NewCycleOptions): ID {
  const cycleId = uid();
  st().transact((tx) => {
    const klass = tx.get('classes', classId);
    if (!klass) return;
    const year = yearOfClass(tx, klass);
    const order = tx.all('cycles').filter((c) => c.classId === classId).length;
    const slotIds = o.slotIds ?? [];
    const slots = slotsForCycle(klass.slots, slotIds);
    const occ =
      o.startDate && slots.length
        ? nextOccurrences(slots, o.startDate, year?.holidays ?? [], { count: o.count })
        : [];

    const cycle: Cycle = {
      ...newCycle(classId, order, o.title),
      id: cycleId,
      slotIds,
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
    const occ = nextOccurrences(slotsForCycle(klass.slots, cycle.slotIds), startDate, year?.holidays ?? [], { count: lessons.length });
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
        const o = nextOccurrences(slotsForCycle(klass.slots, cycle.slotIds), from, year?.holidays ?? [], { count: 1 })[0];
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
    const toClassId = o.classId === undefined ? src.classId : o.classId;
    const copy: Lesson = {
      ...deepClone(src),
      id,
      // Une séance modèle garde le niveau de la classe d'où elle vient ; une séance de classe prend celui de sa classe.
      classLevels: toClassId ? [] : src.classLevels.length ? [...src.classLevels] : levelsOf(tx.get('classes', src.classId ?? '')?.level),
      classId: toClassId,
      cycleId,
      date: o.date === undefined ? null : o.date,
      title: o.title ?? src.title,
      order,
      status: 'planned',
      bilan: '',
            rating: null,
            adjust: false,
            levels: null,
            proposalsDone: [],
            todos: [],
            tasksDone: [],
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
    const lv = classId ? [] : src.classLevels.length ? [...src.classLevels] : levelsOf(tx.get('classes', src.classId ?? '')?.level);
    tx.put('cycles', {
      ...deepClone(src),
      id: newId,
      classId,
      classLevels: lv,
      slotIds: [],
      order,
      startDate: occ[0]?.date ?? null,
      endDate: occ.length ? occ[occ.length - 1].date : null,
    });
    lessons.forEach((l, i) => {
      tx.put('lessons', {
        ...deepClone(l),
        id: uid(),
        classId,
        classLevels: lv,
        cycleId: newId,
        order: i,
        date: occ[i]?.date ?? null,
        start: occ[i]?.slot.start ?? l.start,
        end: occ[i]?.slot.end ?? l.end,
        status: 'planned',
        bilan: '',
            rating: null,
            adjust: false,
            levels: null,
            proposalsDone: [],
            todos: [],
            tasksDone: [],
        blocks: cloneBlocks(l.blocks),
      });
    });
  });
  return newId;
}

// ── Bibliothèque ────────────────────────────────────────────────────────────

/** « 6e » → ['6e'] ; vide ou inconnu → []. */
function levelsOf(level: string | undefined | null): string[] {
  return level && level !== 'UNSS' ? [level] : [];
}

export function saveBlockAsExercise(block: Block, activityId: ID | null, classLevel?: string | null): ID {
  const ex: Exercise = {
    ...newExercise(block.title || 'Sans titre'),
    activityId,
    classLevels: levelsOf(classLevel),
    kind: block.kind,
    minutes: block.minutes,
    text: block.text,
    materials: block.materials,
    animation: block.animation ? deepClone(block.animation) : null,
    sheets: [...(block.sheets ?? [])],
  };
  st().put('exercises', ex);
  return ex.id;
}

/**
 * Extrait les situations (blocs) des séances données et les ajoute à la bibliothèque de situations.
 * Les échauffements et retours au calme sont ignorés sauf demande ; une situation identique (même titre et même texte)
 * déjà dans la bibliothèque n'est pas recréée.
 */
export function extractSituations(lessonIds: ID[], opts: { withWarmups?: boolean } = {}): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;
  st().transact((tx) => {
    const have = new Set(tx.all('exercises').map((e) => `${e.title}\u0000${e.text}`));
    for (const id of lessonIds) {
      const l = tx.get('lessons', id);
      if (!l) continue;
      const cycle = l.cycleId ? tx.get('cycles', l.cycleId) : undefined;
      const activityId = l.activityId ?? cycle?.activityId ?? null;
      for (const b of l.blocks) {
        if (!opts.withWarmups && (b.kind === 'warmup' || b.kind === 'cooldown')) continue;
        const key = `${b.title}\u0000${b.text}`;
        if (have.has(key)) {
          skipped++;
          continue;
        }
        have.add(key);
        tx.put('exercises', {
          ...newExercise(b.title || 'Sans titre'),
          activityId,
          classLevels: l.classLevels.length ? [...l.classLevels] : cycle?.classLevels ?? [],
          kind: b.kind,
          minutes: b.minutes,
          text: b.text,
          materials: b.materials,
          animation: b.animation ? deepClone(b.animation) : null,
          sheets: [...(b.sheets ?? [])],
        });
        created++;
      }
    }
  });
  return { created, skipped };
}

export function blockFromExercise(ex: Exercise): Block {
  return {
    ...newBlock(ex.kind, ex.title, ex.minutes),
    text: ex.text,
    materials: ex.materials,
    animation: ex.animation ? deepClone(ex.animation) : null,
    sheets: [...(ex.sheets ?? [])],
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

// ── Imprévus : reporter, annuler, jour sans cours ──────────────────────────

export interface RescheduleResult {
  /** Nombre de séances dont la date a changé. */
  moved: number;
  /** Annule la modification (restaure les séances et le calendrier d'origine). */
  undo: () => void;
}

const isOpen = (l: Lesson) => l.status === 'planned' && !!l.date;

/** Replace `lessons` (dans l'ordre) sur les prochains créneaux du cycle à partir de `fromDate` (inclus). */
function redate(tx: Tx, cycle: Cycle, lessons: Lesson[], fromDate: ISODate): number {
  const klass = cycle.classId ? tx.get('classes', cycle.classId) : undefined;
  if (!klass || !lessons.length) return 0;
  const year = tx.get('years', klass.yearId);
  const occ = nextOccurrences(slotsForCycle(klass.slots, cycle.slotIds), fromDate, year?.holidays ?? [], { count: lessons.length });
  let moved = 0;
  lessons.forEach((l, i) => {
    const o = occ[i];
    const patch = o ? { date: o.date, start: o.slot.start, end: o.slot.end } : { date: null };
    if (l.date !== patch.date || (o && (l.start !== o.slot.start || l.end !== o.slot.end))) moved++;
    tx.patch('lessons', l.id, patch);
  });
  return moved;
}

function refreshCycleBounds(tx: Tx, cycleId: ID): void {
  const dates = tx
    .all('lessons')
    .filter((l) => l.cycleId === cycleId && l.status !== 'cancelled' && l.date)
    .map((l) => l.date as ISODate)
    .sort();
  tx.patch('cycles', cycleId, { startDate: dates[0] ?? null, endDate: dates[dates.length - 1] ?? null });
}

/** Mémorise l'état d'origine de séances, de cycles et d'une année pour pouvoir annuler. */
function snapshot(tx: Tx, lessonIds: ID[], cycleIds: ID[], yearId?: ID): () => void {
  const lessons = lessonIds.map((id) => tx.get('lessons', id)).filter((x): x is Lesson => !!x).map((l) => deepClone(l));
  const cycles = cycleIds.map((id) => tx.get('cycles', id)).filter((x): x is Cycle => !!x).map((c) => deepClone(c));
  const year = yearId ? tx.get('years', yearId) : undefined;
  const yearCopy = year ? deepClone(year) : undefined;
  return () => {
    st().transact((t) => {
      for (const l of lessons) t.put('lessons', l);
      for (const c of cycles) t.put('cycles', c);
      if (yearCopy) t.put('years', yearCopy);
    });
  };
}

/** Reporte la séance au prochain créneau et décale toute la suite du cycle d'autant. */
export function postponeLesson(lessonId: ID): RescheduleResult | null {
  let result: RescheduleResult | null = null;
  st().transact((tx) => {
    const target = tx.get('lessons', lessonId);
    const cycle = target?.cycleId ? tx.get('cycles', target.cycleId) : undefined;
    if (!target || !cycle || !target.date) return;
    const chain = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycle.id)).filter((l) => l.order >= target.order && isOpen(l));
    const undo = snapshot(tx, chain.map((l) => l.id), [cycle.id]);
    const moved = redate(tx, cycle, chain, addDays(target.date, 1));
    refreshCycleBounds(tx, cycle.id);
    result = { moved, undo };
  });
  return result;
}

/** Annule la séance (elle reste visible, barrée) et fait remonter la suite du cycle sur son créneau. */
export function cancelAndShift(lessonId: ID): RescheduleResult | null {
  let result: RescheduleResult | null = null;
  st().transact((tx) => {
    const target = tx.get('lessons', lessonId);
    const cycle = target?.cycleId ? tx.get('cycles', target.cycleId) : undefined;
    if (!target || !cycle || !target.date) return;
    const chain = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycle.id)).filter((l) => l.order > target.order && isOpen(l));
    const undo = snapshot(tx, [target.id, ...chain.map((l) => l.id)], [cycle.id]);
    tx.patch('lessons', target.id, { status: 'cancelled' });
    const moved = redate(tx, cycle, chain, target.date);
    refreshCycleBounds(tx, cycle.id);
    result = { moved: moved + 1, undo };
  });
  return result;
}

export interface ClosurePreview {
  cycles: number;
  lessons: number;
  /** Séances isolées (hors cycle) tombant sur la période : à traiter à la main. */
  standalone: number;
}

/** Séances concernées par une période sans cours (pour l'aperçu avant validation). */
export function previewClosure(yearId: ID, start: ISODate, end: ISODate): ClosurePreview {
  const data = st().data;
  const classIds = new Set(Object.values(data.classes).filter((k) => k.yearId === yearId).map((k) => k.id));
  const inRange = Object.values(data.lessons).filter((l) => l.classId && classIds.has(l.classId) && isOpen(l) && l.date! >= start && l.date! <= end);
  const cycles = new Set(inRange.filter((l) => l.cycleId).map((l) => l.cycleId));
  return { cycles: cycles.size, lessons: inRange.length, standalone: inRange.filter((l) => !l.cycleId).length };
}

/**
 * Déclare une période sans cours (sortie, grève, intempéries…) : elle est ajoutée au calendrier
 * de l'année et les séances de chaque cycle concerné glissent sur les créneaux suivants.
 */
export function closeDays(yearId: ID, start: ISODate, end: ISODate, label: string): RescheduleResult {
  let result: RescheduleResult = { moved: 0, undo: () => {} };
  st().transact((tx) => {
    const year = tx.get('years', yearId);
    if (!year) return;
    const classIds = new Set(tx.all('classes').filter((k) => k.yearId === yearId).map((k) => k.id));
    const affected = tx.all('cycles').filter((c) => c.classId && classIds.has(c.classId));
    const plan: Array<{ cycle: Cycle; chain: Lesson[] }> = [];
    for (const cycle of affected) {
      const all = sortLessons(tx.all('lessons').filter((l) => l.cycleId === cycle.id));
      if (!all.some((l) => isOpen(l) && l.date! >= start && l.date! <= end)) continue;
      plan.push({ cycle, chain: all.filter((l) => isOpen(l) && l.date! >= start) });
    }
    const undo = snapshot(tx, plan.flatMap((p) => p.chain.map((l) => l.id)), plan.map((p) => p.cycle.id), yearId);
    tx.patch('years', yearId, { holidays: [...year.holidays, { id: uid(), label: label || 'Journée sans cours', start, end, kind: 'autre' }] });
    let moved = 0;
    for (const { cycle, chain } of plan) {
      moved += redate(tx, cycle, chain, start);
      refreshCycleBounds(tx, cycle.id);
    }
    result = { moved, undo };
  });
  return result;
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
