import { useMemo } from 'react';
import type { Activity, AppData, Cycle, Exercise, Field, ID, Klass, Lesson, SchoolYear } from '../types';
import { useData } from './data';
import { useUi } from './ui';
import { timeToMin } from '../lib/dates';

// ── Fonctions pures ─────────────────────────────────────────────────────────

export const sortYears = (years: SchoolYear[]) => [...years].sort((a, b) => b.start.localeCompare(a.start));

export const sortClasses = (list: Klass[]) =>
  [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr', { numeric: true }));

export const sortCycles = (list: Cycle[]) =>
  [...list].sort(
    (a, b) =>
      (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.order - b.order || a.createdAt - b.createdAt,
  );

export const sortLessons = (list: Lesson[]) => [...list].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

export const lessonTotalMinutes = (l: Lesson) => l.blocks.reduce((s, b) => s + (b.minutes || 0), 0);

export function compareByDate(a: Lesson, b: Lesson): number {
  return (
    (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
    timeToMin(a.start) - timeToMin(b.start) ||
    a.order - b.order
  );
}

export function activityOf(data: AppData, id: ID | null): Activity | undefined {
  return id ? data.settings.activities.find((a) => a.id === id) : undefined;
}

export function fieldOf(data: AppData, id: ID | null | undefined): Field | undefined {
  return id ? data.settings.fields.find((f) => f.id === id) : undefined;
}

export function fieldOfActivity(data: AppData, activityId: ID | null): Field | undefined {
  return fieldOf(data, activityOf(data, activityId)?.fieldId);
}

/** Les séances d'une classe, triées par date. */
export function classLessons(data: AppData, classId: ID): Lesson[] {
  return Object.values(data.lessons)
    .filter((l) => l.classId === classId)
    .sort(compareByDate);
}

export function cycleLessons(data: AppData, cycleId: ID): Lesson[] {
  return sortLessons(Object.values(data.lessons).filter((l) => l.cycleId === cycleId));
}

export function classCycles(data: AppData, classId: ID): Cycle[] {
  return sortCycles(Object.values(data.cycles).filter((c) => c.classId === classId));
}

/** Séance de la bibliothèque (modèle) ? */
export const isTemplateLesson = (l: Lesson) => l.classId === null;
export const isTemplateCycle = (c: Cycle) => c.classId === null;

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useYears(): SchoolYear[] {
  const years = useData((s) => s.data.years);
  return useMemo(() => sortYears(Object.values(years)), [years]);
}

/** Année affichée : celle choisie, sinon l'année en cours / la plus récente. */
export function useCurrentYear(): SchoolYear | null {
  const years = useYears();
  const yearId = useUi((s) => s.yearId);
  return useMemo(() => {
    if (!years.length) return null;
    const chosen = years.find((y) => y.id === yearId);
    if (chosen) return chosen;
    const today = new Date().toISOString().slice(0, 10);
    return years.find((y) => y.start <= today && today <= y.end) ?? years[0];
  }, [years, yearId]);
}

export function useYearClasses(): Klass[] {
  const year = useCurrentYear();
  const classes = useData((s) => s.data.classes);
  return useMemo(
    () => sortClasses(Object.values(classes).filter((k) => k.yearId === year?.id)),
    [classes, year?.id],
  );
}

/** Toutes les séances rattachées à l'année courante (classes de l'année). */
export function useYearLessons(): Lesson[] {
  const classes = useYearClasses();
  const lessons = useData((s) => s.data.lessons);
  return useMemo(() => {
    const ids = new Set(classes.map((c) => c.id));
    return Object.values(lessons)
      .filter((l) => l.classId && ids.has(l.classId))
      .sort(compareByDate);
  }, [classes, lessons]);
}

export function useYearCycles(): Cycle[] {
  const classes = useYearClasses();
  const cycles = useData((s) => s.data.cycles);
  return useMemo(() => {
    const ids = new Set(classes.map((c) => c.id));
    return sortCycles(Object.values(cycles).filter((c) => c.classId && ids.has(c.classId)));
  }, [classes, cycles]);
}

export function useSettings() {
  return useData((s) => s.data.settings);
}

export function useActivity(id: ID | null): Activity | undefined {
  const acts = useData((s) => s.data.settings.activities);
  return useMemo(() => (id ? acts.find((a) => a.id === id) : undefined), [acts, id]);
}

export function useExercises(): Exercise[] {
  const ex = useData((s) => s.data.exercises);
  return useMemo(() => Object.values(ex).sort((a, b) => a.title.localeCompare(b.title, 'fr')), [ex]);
}
