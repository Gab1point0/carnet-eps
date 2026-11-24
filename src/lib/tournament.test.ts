import { describe, expect, it } from 'vitest';
import { rotationsForAll, schedule } from './tournament';

const seeded = () => {
  let x = 7;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
};
const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);
const pairKey = (a: string, b: string) => [a, b].sort().join('-');

describe('roulement de matchs', () => {
  for (const [n, courts] of [
    [4, 2],
    [5, 2],
    [6, 3],
    [7, 2],
    [8, 2],
    [12, 3],
  ] as const) {
    it(`${n} participants, ${courts} terrains : jamais deux fois le même match, tout le monde se rencontre`, () => {
      const rot = schedule(ids(n), { courts, rand: seeded() });
      const seen = new Set<string>();
      for (const r of rot) {
        expect(r.matches.length).toBeLessThanOrEqual(courts);
        const inRot = r.matches.flatMap((m) => [m.a, m.b]);
        expect(new Set(inRot).size).toBe(inRot.length); // personne ne joue deux fois dans la rotation
        for (const m of r.matches) {
          const k = pairKey(m.a, m.b);
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    });
  }

  it('limite le nombre de rotations et équilibre le nombre de matchs', () => {
    const rot = schedule(ids(10), { courts: 2, rotations: 5, rand: seeded() });
    expect(rot).toHaveLength(5);
    const played: Record<string, number> = {};
    for (const r of rot) for (const m of r.matches) (played[m.a] = (played[m.a] ?? 0) + 1), (played[m.b] = (played[m.b] ?? 0) + 1);
    const counts = ids(10).map((id) => played[id] ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('donne un arbitre qui ne joue pas', () => {
    const rot = schedule(ids(6), { courts: 2, referees: true, rand: seeded() });
    for (const r of rot)
      for (const m of r.matches) {
        expect(m.referee).toBeDefined();
        expect([m.a, m.b]).not.toContain(m.referee);
        expect(r.resting).toContain(m.referee);
      }
  });

  it('classe entière en individuel : rapide et équilibré', () => {
    const t = Date.now();
    const rot = schedule(ids(30), { courts: 8, rotations: 10, referees: true, rand: seeded() });
    expect(Date.now() - t).toBeLessThan(2000);
    expect(rot).toHaveLength(10);
    const played: Record<string, number> = {};
    for (const r of rot) for (const m of r.matches) (played[m.a] = (played[m.a] ?? 0) + 1), (played[m.b] = (played[m.b] ?? 0) + 1);
    const counts = ids(30).map((id) => played[id] ?? 0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('compte les rotations nécessaires', () => {
    expect(rotationsForAll(4, 2)).toBe(3);
    expect(rotationsForAll(6, 3)).toBe(5);
  });
});
