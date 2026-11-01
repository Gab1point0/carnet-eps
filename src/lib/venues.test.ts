import { describe, expect, it } from 'vitest';
import { availableMinutes, venueOf, venueTime } from './venues';
import { defaultSettings } from './defaults';
import { normalizeData } from '../store/model';

const settings = defaultSettings();
const venue = (id: string) => venueOf(settings, { venueId: id });

describe('lieux de séance', () => {
  it('propose les lieux de l\'enseignant', () => {
    expect(venueTime(venue('picherettes'))).toEqual({ oneWay: 25, travel: 50, locker: 5, total: 55 });
    expect(venueTime(venue('stade-burcq')).total).toBe(25);
    expect(venueTime(venue('jardin-ile')).total).toBe(15);
    expect(venueTime(venue('college')).total).toBe(5);
    expect(venueTime(venue('piscine')).total).toBe(0);
  });

  it('retire le trajet et le vestiaire du créneau', () => {
    const lesson = { start: '10:00', end: '12:00' };
    expect(availableMinutes(lesson, undefined)).toBe(120);
    expect(availableMinutes(lesson, venue('picherettes'))).toBe(65);
    expect(availableMinutes({ start: '10:00', end: '10:30' }, venue('picherettes'))).toBe(0);
  });

  it('ignore un lieu supprimé et complète les anciennes données', () => {
    expect(venueOf(settings, { venueId: 'disparu' })).toBeUndefined();
    const data = normalizeData({ settings: { teacher: 'x', updatedAt: 5 }, lessons: { a: { title: 'S' } } });
    expect(data.settings.venues.map((v) => v.id)).toContain('picherettes');
    expect(data.lessons.a.venueId).toBeNull();
  });
});
