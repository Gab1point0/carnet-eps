import { describe, expect, it } from 'vitest';
import { easterSunday, publicHolidays } from './holidays';
import { nextOccurrences } from './schedule';
import { mergeData, sameData } from './merge';
import { emptyData, newKlass, normalizeData } from '../store/model';
import { addDays, startOfWeek, weekdayOf } from './dates';

describe('dates', () => {
  it('calcule le lundi de la semaine', () => {
    expect(startOfWeek('2026-10-21')).toBe('2026-10-19'); // mercredi → lundi
    expect(weekdayOf('2026-10-25')).toBe(7);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('jours fériés', () => {
  it('trouve Pâques', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
  it('liste les fériés mobiles', () => {
    const h = publicHolidays(2027).map((x) => x.date);
    expect(h).toContain('2027-03-29'); // lundi de Pâques
    expect(h).toContain('2027-05-06'); // Ascension
    expect(h).toContain('2027-05-17'); // lundi de Pentecôte
  });
});

describe('emploi du temps', () => {
  const slots = [{ id: 's1', weekday: 2, start: '10:00', end: '12:00', place: '' }];
  it('saute les vacances', () => {
    const holidays = [{ id: 'h', label: 'Toussaint', start: '2026-10-19', end: '2026-11-01', kind: 'vacances' as const }];
    const occ = nextOccurrences(slots, '2026-10-12', holidays, { count: 3 });
    expect(occ.map((o) => o.date)).toEqual(['2026-10-13', '2026-11-03', '2026-11-10']);
  });
});

describe('fusion', () => {
  it('garde la version la plus récente et propage les suppressions', () => {
    const a = emptyData();
    const b = emptyData();
    const k = newKlass('y', 0, '6e A');
    a.classes[k.id] = { ...k, updatedAt: 100 };
    b.classes[k.id] = { ...k, name: '6e B', updatedAt: 200 };
    expect(mergeData(a, b).classes[k.id].name).toBe('6e B');
    expect(mergeData(b, a).classes[k.id].name).toBe('6e B');

    const c = emptyData();
    c.deleted[k.id] = 300;
    expect(mergeData(a, c).classes[k.id]).toBeUndefined();
    // Une modification postérieure à la suppression ressuscite l'entité.
    const d = emptyData();
    d.classes[k.id] = { ...k, updatedAt: 400 };
    expect(mergeData(c, d).classes[k.id]).toBeDefined();
  });
  it('est symétrique', () => {
    const a = emptyData();
    const b = emptyData();
    const k1 = newKlass('y', 0, 'A');
    const k2 = newKlass('y', 1, 'B');
    a.classes[k1.id] = k1;
    b.classes[k2.id] = k2;
    expect(sameData(mergeData(a, b), mergeData(b, a))).toBe(true);
  });
});

describe('normalisation', () => {
  it('complète un JSON minimal écrit à la main', () => {
    const d = normalizeData({
      years: { y1: { label: '2026-2027', start: '2026-09-01', end: '2027-07-03' } },
      lessons: { l1: { title: 'Passes', classId: 'k1' } },
    });
    expect(d.years.y1.holidays).toEqual([]);
    expect(d.lessons.l1.blocks).toEqual([]);
    expect(d.lessons.l1.status).toBe('planned');
    expect(d.lessons.l1.id).toBe('l1');
  });
});
