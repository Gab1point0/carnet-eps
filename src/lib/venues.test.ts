import { describe, expect, it } from 'vitest';
import { availableMinutes, venueOf, venueTime } from './venues';
import { defaultSettings } from './defaults';
import { normalizeData } from '../store/model';

const settings = defaultSettings();
const venue = (id: string) => venueOf(settings, { venueId: id });

describe('lieux de séance', () => {
  it('propose les lieux de l\'enseignant', () => {
    expect(venueTime(venue('picherettes')).total).toBe(60);
    expect(venueTime(venue('stade-burcq')).total).toBe(30);
    expect(venueTime(venue('jardin-ile')).total).toBe(20);
    expect(venueTime(venue('college')).total).toBe(10);
    expect(venueTime(venue('piscine')).total).toBe(0);
  });

  it('place le trajet et le vestiaire avant et après la séance', () => {
    const steps = (id: string) => {
      const { before, after } = venueTime(venue(id));
      return [...before, ...after].map((s) => `${s.label} ${s.minutes}`);
    };
    expect(steps('picherettes')).toEqual(['Trajet aller 25', 'Vestiaire 5', 'Vestiaire 5', 'Trajet retour 25']);
    expect(steps('college')).toEqual(['Vestiaire 5', 'Vestiaire 5']);
    expect(steps('piscine')).toEqual([]);
  });

  it('retire le trajet et le vestiaire du créneau', () => {
    const lesson = { start: '10:00', end: '12:00' };
    expect(availableMinutes(lesson, undefined)).toBe(120);
    expect(availableMinutes(lesson, venue('picherettes'))).toBe(60);
    expect(availableMinutes({ start: '10:00', end: '10:30' }, venue('picherettes'))).toBe(0);
  });

  it('ignore un lieu supprimé et complète les anciennes données', () => {
    expect(venueOf(settings, { venueId: 'disparu' })).toBeUndefined();
    const data = normalizeData({ settings: { teacher: 'x', updatedAt: 5 }, lessons: { a: { title: 'S' } } });
    expect(data.settings.venues.map((v) => v.id)).toContain('picherettes');
    expect(data.lessons.a.venueId).toBeNull();
  });
});
