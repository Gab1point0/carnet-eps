import { describe, expect, it } from 'vitest';
import { risksFor, type Hour } from './weather';

const hour = (h: number, over: Partial<Hour> = {}): Hour => ({ time: `2026-11-05T${String(h).padStart(2, '0')}:00`, temp: 10, prob: 0, mm: 0, gust: 10, code: 1, ...over });

describe('alertes météo pendant une séance', () => {
  it('rien à signaler par beau temps', () => {
    const hours = [8, 9, 10, 11].map((h) => hour(h));
    expect(risksFor(hours, '2026-11-05', '08:30', '10:20')).toEqual([]);
  });

  it('annonce la pluie prévue pendant la séance seulement', () => {
    const hours = [hour(7, { prob: 90, mm: 3, code: 61 }), hour(8), hour(9), hour(10), hour(11, { prob: 90, mm: 3, code: 61 })];
    expect(risksFor(hours, '2026-11-05', '08:30', '10:20')).toEqual([]); // la pluie est avant et après
    const wet = [hour(8), hour(9, { prob: 80, mm: 1.2, code: 61 }), hour(10, { prob: 80, mm: 0.8, code: 63 })];
    const r = risksFor(wet, '2026-11-05', '08:30', '10:20');
    expect(r[0].kind).toBe('rain');
    expect(r[0].text).toMatch(/80 %/);
  });

  it('une séance qui finit à l\'heure pile n\'inclut pas l\'heure suivante', () => {
    const hours = [hour(8), hour(9), hour(10, { prob: 90, mm: 4, code: 63 })];
    expect(risksFor(hours, '2026-11-05', '08:00', '10:00')).toEqual([]);
  });

  it('orage, vent, chaleur et gel', () => {
    expect(risksFor([hour(9, { code: 95, prob: 70, mm: 3 })], '2026-11-05', '09:00', '10:00')[0].kind).toBe('storm');
    expect(risksFor([hour(9, { gust: 70 })], '2026-11-05', '09:00', '10:00').map((x) => x.kind)).toEqual(['wind']);
    expect(risksFor([hour(14, { temp: 34 })], '2026-11-05', '14:00', '15:00').map((x) => x.kind)).toEqual(['heat']);
    expect(risksFor([hour(9, { temp: -2 })], '2026-11-05', '09:00', '10:00').map((x) => x.kind)).toEqual(['cold']);
  });

  it('pas de prévision pour le créneau : aucune alerte', () => {
    expect(risksFor([hour(9)], '2026-11-06', '09:00', '10:00')).toEqual([]);
  });
});
