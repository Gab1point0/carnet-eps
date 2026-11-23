import { describe, expect, it } from 'vitest';
import { autoGroups, byGroup } from './grouping';
import { mergePrivate, emptyPrivate } from './privateData';

const students = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Élève ${i}` }));
// s0 a 20, s1 19… s7 13 ; s8 et s9 sans note
const scores = Object.fromEntries(students.slice(0, 8).map((s, i) => [s.id, 20 - i]));
const seeded = () => {
  let x = 42;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
};
const sizes = (a: Record<string, number>, n: number) => Array.from({ length: n }, (_, g) => Object.values(a).filter((v) => v === g + 1).length);

describe('groupes', () => {
  it('au hasard : tout le monde placé, effectifs équilibrés', () => {
    const a = autoGroups(students, 3, 'random', {}, seeded());
    expect(Object.keys(a)).toHaveLength(10);
    expect(sizes(a, 3).sort()).toEqual([3, 3, 4]);
  });

  it('homogènes : les meilleurs ensemble', () => {
    const a = autoGroups(students, 2, 'homogeneous', scores, seeded());
    expect([a.s0, a.s1, a.s2, a.s3, a.s4]).toEqual([1, 1, 1, 1, 1]);
    expect([a.s5, a.s6, a.s7]).toEqual([2, 2, 2]);
    expect(sizes(a, 2)).toEqual([5, 5]);
  });

  it('hétérogènes : forts et moins forts répartis', () => {
    const a = autoGroups(students, 2, 'heterogeneous', scores, seeded());
    expect(a.s0).not.toBe(a.s1); // les deux meilleurs séparés
    expect(sizes(a, 2)).toEqual([5, 5]);
  });

  it('parité filles-garçons : autant de filles et de garçons par groupe', () => {
    // 7 filles, 5 garçons, 1 élève sans sexe renseigné.
    const mixed = Array.from({ length: 13 }, (_, i) => ({ id: `m${i}`, name: '', sex: i < 7 ? ('F' as const) : i < 12 ? ('G' as const) : undefined }));
    for (const mode of ['random', 'heterogeneous'] as const) {
      const a = autoGroups(mixed, 3, mode, {}, seeded(), true);
      expect(Object.keys(a)).toHaveLength(13);
      const per = (sex: 'F' | 'G') => [1, 2, 3].map((g) => mixed.filter((s) => s.sex === sex && a[s.id] === g).length);
      expect(Math.max(...per('F')) - Math.min(...per('F'))).toBeLessThanOrEqual(1);
      expect(Math.max(...per('G')) - Math.min(...per('G'))).toBeLessThanOrEqual(1);
      const sz = sizes(a, 3);
      expect(Math.max(...sz) - Math.min(...sz)).toBeLessThanOrEqual(1);
    }
  });

  it('parité et niveaux : les deux meilleures filles sont séparées', () => {
    const mixed = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: '', sex: i < 4 ? ('F' as const) : ('G' as const) }));
    const sc = Object.fromEntries(mixed.map((s, i) => [s.id, 20 - i]));
    const a = autoGroups(mixed, 2, 'heterogeneous', sc, seeded(), true);
    expect(a.m0).not.toBe(a.m1);
    expect(a.m4).not.toBe(a.m5);
  });

  it('range par groupe, puis les élèves à placer', () => {
    const r = byGroup(students.slice(0, 4), { s0: 2, s1: 1, s2: 2 }, 2);
    expect(r.map((g) => [g.group, g.students.map((s) => s.id)])).toEqual([
      [1, ['s1']],
      [2, ['s0', 's2']],
      [null, ['s3']],
    ]);
  });

  it('fusionne les groupes de deux appareils (le plus récent gagne)', () => {
    const a = emptyPrivate();
    const b = emptyPrivate();
    a.groups.l = { assign: { s0: 1 }, count: 2, t: 1 };
    b.groups.l = { assign: { s0: 2 }, count: 2, t: 5 };
    expect(mergePrivate(a, b).groups.l.assign.s0).toBe(2);
    expect(mergePrivate({ version: 1, rosters: {}, sheets: {} } as never, b).groups.l.count).toBe(2);
  });
});
