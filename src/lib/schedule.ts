import type { Holiday, ISODate, Slot } from '../types';
import { addDays, timeToMin, weekdayOf } from './dates';
import { holidayOn } from './holidays';

export interface Occurrence {
  date: ISODate;
  slot: Slot;
}

/**
 * Prochaines occurrences d'un emploi du temps hebdomadaire à partir d'une date,
 * en sautant vacances et jours fériés. S'arrête après `count` occurrences ou à `until`.
 */
export function nextOccurrences(
  slots: Slot[],
  from: ISODate,
  holidays: Holiday[],
  opts: { count?: number; until?: ISODate | null } = {},
): Occurrence[] {
  const { count = Infinity, until = null } = opts;
  if (!slots.length) return [];
  const byDay = new Map<number, Slot[]>();
  for (const s of slots) {
    const list = byDay.get(s.weekday) ?? [];
    list.push(s);
    byDay.set(s.weekday, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  const out: Occurrence[] = [];
  const limit = until ?? addDays(from, 366 * 2);
  let day = from;
  // garde-fou : jamais plus de ~2 ans de recherche
  for (let guard = 0; guard < 800 && day <= limit && out.length < count; guard++) {
    const list = byDay.get(weekdayOf(day));
    if (list && !holidayOn(holidays, day)) {
      for (const slot of list) {
        if (out.length >= count) break;
        out.push({ date: day, slot });
      }
    }
    day = addDays(day, 1);
  }
  return out;
}

/** Séances en conflit : plusieurs séances de classes différentes sur le même créneau. */
export function hasOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMin(aStart) < timeToMin(bEnd) && timeToMin(bStart) < timeToMin(aEnd);
}
