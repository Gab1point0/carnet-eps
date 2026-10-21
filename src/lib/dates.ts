import type { HHMM, ISODate } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale → `YYYY-MM-DD`. */
export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` → Date locale à midi (évite les décalages d'heure d'été). */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

/** 1 = lundi … 7 = dimanche. */
export function weekdayOf(s: ISODate): number {
  const g = fromISO(s).getDay();
  return g === 0 ? 7 : g;
}

export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -(weekdayOf(s) - 1));
}

export function startOfMonth(s: ISODate): ISODate {
  const d = fromISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1, 12));
}

export function isBetween(s: ISODate, start: ISODate, end: ISODate): boolean {
  return s >= start && s <= end;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('fr-FR', opts);
    fmtCache.set(key, f);
  }
  return f;
}

export const formatLong = (s: ISODate) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromISO(s));
export const formatDay = (s: ISODate) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(fromISO(s));
export const formatShort = (s: ISODate) =>
  fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(fromISO(s));
export const formatDM = (s: ISODate) => fmt({ day: 'numeric', month: 'short' }).format(fromISO(s));
export const formatMonthYear = (s: ISODate) => fmt({ month: 'long', year: 'numeric' }).format(fromISO(s));
export const formatMonth = (s: ISODate) => fmt({ month: 'short' }).format(fromISO(s));

export const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const weekdayName = (n: number) => WEEKDAYS_LONG[(n - 1 + 7) % 7];

// ── Heures ──────────────────────────────────────────────────────────────────

export function timeToMin(t: HHMM): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToTime(m: number): HHMM {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(mm / 60))}:${pad(mm % 60)}`;
}

export function durationOf(start: HHMM, end: HHMM): number {
  return Math.max(0, timeToMin(end) - timeToMin(start));
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

/** Année scolaire courante : de septembre à août. */
export function currentSchoolYearLabel(today: ISODate = todayISO()): string {
  const d = fromISO(today);
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export function shiftYear(iso: ISODate, years: number): ISODate {
  const d = fromISO(iso);
  d.setFullYear(d.getFullYear() + years);
  return toISO(d);
}
