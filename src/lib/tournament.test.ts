import { describe, expect, it } from 'vitest';
import { ladderNext, ladderStart, rotationsForAll, schedule, swissPairing, swissStandings, type SwissRound } from './tournament';

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

describe('rondes suisses', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
  const play = (r: SwissRound) => r.matches.forEach((m) => (m.result = m.a < m.b ? 'a' : 'b'));

  it('fait se rencontrer ceux qui ont le même nombre de points, sans revanche', () => {
    const rounds: SwissRound[] = [];
    for (let k = 0; k < 3; k++) {
      const r = swissPairing(ids, rounds);
      const pts = Object.fromEntries(swissStandings(ids, rounds).map((s) => [s.id, s.points]));
      for (const m of r.matches) expect(pts[m.a]).toBe(pts[m.b]);
      expect(r.rematches).toBeUndefined();
      play(r);
      rounds.push(r);
    }
    const pairs = rounds.flatMap((r) => r.matches.map((m) => [m.a, m.b].sort().join()));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(swissStandings(ids, rounds)[0].wins).toBe(3);
  });

  it('nombre impair : un exempt différent à chaque ronde, qui marque un point', () => {
    const odd = ids.slice(0, 7);
    const rounds: SwissRound[] = [];
    for (let k = 0; k < 5; k++) {
      const r = swissPairing(odd, rounds);
      expect(r.bye).toBeDefined();
      expect(r.matches.length).toBe(3);
      play(r);
      rounds.push(r);
    }
    expect(new Set(rounds.map((r) => r.bye)).size).toBe(5);
    expect(swissStandings(odd, rounds).reduce((t, s) => t + s.points, 0)).toBe(5 * 4);
  });

  it("accepte une revanche seulement quand il n'y a plus le choix", () => {
    const four = ids.slice(0, 4);
    const rounds: SwissRound[] = [];
    for (let k = 0; k < 4; k++) {
      const r = swissPairing(four, rounds);
      if (k < 3) expect(r.rematches).toBeUndefined();
      else expect(r.rematches).toBe(2);
      r.matches.forEach((m) => (m.result = 'draw'));
      rounds.push(r);
    }
  });
});

describe('montante-descendante', () => {
  it('répartit tout le monde sur les terrains, 2 au moins par terrain', () => {
    const ids = Array.from({ length: 19 }, (_, i) => `e${i}`);
    const t = ladderStart(ids, 8);
    expect(t.length).toBe(8);
    expect(t.flat().sort()).toEqual([...ids].sort());
    expect(Math.min(...t.map((x) => x.length))).toBe(2);
    expect(ladderStart(ids.slice(0, 5), 8).length).toBe(2);
  });

  it('le gagnant monte, le perdant descend, les effectifs ne changent pas', () => {
    const tables = [
      ['a', 'b'],
      ['c', 'd', 'x'],
      ['e', 'f'],
    ];
    const next = ladderNext(tables, ['a', 'c', 'e'], [undefined, 'd', undefined]);
    expect(next).toEqual([
      ['a', 'c'],
      ['e', 'x', 'b'],
      ['d', 'f'],
    ]);
  });
});
