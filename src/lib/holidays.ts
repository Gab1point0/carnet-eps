import type { Holiday, ISODate } from '../types';
import { addDays, toISO } from './dates';
import { uid } from './util';

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(new Date(year, month - 1, day, 12));
}

/** Jours fériés français (métropole) pour une année civile. */
export function publicHolidays(year: number): Array<{ date: ISODate; label: string }> {
  const easter = easterSunday(year);
  const fixed = (m: number, d: number) => toISO(new Date(year, m - 1, d, 12));
  return [
    { date: fixed(1, 1), label: "Jour de l'an" },
    { date: addDays(easter, 1), label: 'Lundi de Pâques' },
    { date: fixed(5, 1), label: 'Fête du travail' },
    { date: fixed(5, 8), label: 'Victoire 1945' },
    { date: addDays(easter, 39), label: 'Ascension' },
    { date: addDays(easter, 50), label: 'Lundi de Pentecôte' },
    { date: fixed(7, 14), label: 'Fête nationale' },
    { date: fixed(8, 15), label: 'Assomption' },
    { date: fixed(11, 1), label: 'Toussaint' },
    { date: fixed(11, 11), label: 'Armistice 1918' },
    { date: fixed(12, 25), label: 'Noël' },
  ].sort((x, y) => x.date.localeCompare(y.date));
}

/** Jours fériés couvrant une année scolaire (sept. → août), prêts à être ajoutés au calendrier. */
export function publicHolidaysForSchoolYear(start: ISODate, end: ISODate): Holiday[] {
  const y1 = Number(start.slice(0, 4));
  const y2 = Number(end.slice(0, 4));
  const out: Holiday[] = [];
  for (let y = y1; y <= y2; y++) {
    for (const h of publicHolidays(y)) {
      if (h.date >= start && h.date <= end) {
        out.push({ id: uid(), label: h.label, start: h.date, end: h.date, kind: 'ferie' });
      }
    }
  }
  return out;
}

/** Trouve la période de vacances / férié qui contient la date, s'il y en a une. */
export function holidayOn(holidays: Holiday[], date: ISODate): Holiday | undefined {
  return holidays.find((h) => date >= h.start && date <= h.end);
}

// ── Calendrier officiel (data.education.gouv.fr) ───────────────────────────

interface OfficialRecord {
  description: string;
  start_date: string;
  end_date: string;
  zones: string;
  annee_scolaire: string;
}

const parisDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parisISO(ts: string): ISODate {
  return parisDay.format(new Date(ts));
}

export interface OfficialCalendar {
  holidays: Holiday[];
  /** Date de rentrée des élèves, si présente dans les données. */
  rentree: ISODate | null;
  /** Dernier jour de cours de l'année, si connu. */
  fin: ISODate | null;
}

/**
 * Récupère les vacances scolaires officielles d'une zone (A, B ou C) pour une
 * année scolaire « 2026-2027 ». Lève une erreur si le réseau est indisponible.
 */
export async function fetchOfficialCalendar(label: string, zone: 'A' | 'B' | 'C'): Promise<OfficialCalendar> {
  const where = encodeURIComponent(`annee_scolaire="${label}" and zones="Zone ${zone}"`);
  const url =
    'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records' +
    `?limit=100&where=${where}&select=description,start_date,end_date,zones,annee_scolaire`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendrier officiel indisponible (${res.status})`);
  const json = (await res.json()) as { results: OfficialRecord[] };
  const seen = new Set<string>();
  const holidays: Holiday[] = [];
  let rentree: ISODate | null = null;
  let fin: ISODate | null = null;
  for (const r of json.results) {
    const start = parisISO(r.start_date);
    // `end_date` = jour de reprise des cours : la veille est le dernier jour de vacances.
    let end = addDays(parisISO(r.end_date), -1);
    if (end < start) end = start; // « pont » d'une seule journée
    const desc = r.description.trim();
    if (/rentr[ée]e scolaire des [ée]l[èe]ves/i.test(desc)) {
      rentree = parisISO(r.start_date);
      continue;
    }
    if (/d[ée]but des vacances d.?[ée]t[ée]|vacances d.?[ée]t[ée]/i.test(desc)) {
      fin = addDays(start, -1);
      continue;
    }
    if (!/^(vacances|pont)/i.test(desc)) continue;
    const key = `${desc}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holidays.push({ id: uid(), label: desc, start, end, kind: /^pont/i.test(desc) ? 'autre' : 'vacances' });
  }
  holidays.sort((x, y) => x.start.localeCompare(y.start));
  return { holidays, rentree, fin };
}
