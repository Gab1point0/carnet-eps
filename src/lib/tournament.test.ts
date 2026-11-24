import { describe, expect, it } from 'vitest';
import { challengeOrder, firstRoundLosers, knockoutRounds, knockoutSlots, ladderNext, ladderStart, meleeRound, meleeStandings, poolMatches, poolQualifiers, poolStandings, poolsStart, rotationsForAll, schedule, swissPairing, swissStandings, type MeleeRound, type SwissResult, type SwissRound } from './tournament';

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

describe('poules puis phase finale', () => {
  it('poules équilibrées, chacun contre chacun, classement avec confrontation directe', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `j${i}`);
    const pools = poolsStart(ids, 3);
    expect(pools.map((p) => p.length).sort()).toEqual([3, 3, 4]);
    const m = poolMatches(['a', 'b', 'c', 'd']);
    expect(m.length).toBe(6);
    // a bat b, b bat c, c bat a, d perd tout : a, b, c à 4 points ; d dernier.
    const res: Record<string, SwissResult> = { 'a|b': 'a', 'b|c': 'a', 'a|c': 'b', 'a|d': 'a', 'b|d': 'a', 'c|d': 'a' };
    for (const x of m) {
      const k = [x.a, x.b].sort().join('|');
      const r = res[k];
      x.result = x.a < x.b ? r : r === 'a' ? 'b' : 'a';
    }
    const st = poolStandings(['a', 'b', 'c', 'd'], m);
    expect(st.map((s) => s.points)).toEqual([4, 4, 4, 0]);
    expect(st[3].id).toBe('d');
  });

  it('qualifiés croisés : le 1er d’une poule ne rencontre pas un joueur de sa poule au 1er tour', () => {
    const seeds = poolQualifiers(
      [
        ['A1', 'A2'],
        ['B1', 'B2'],
        ['C1', 'C2'],
      ],
      2,
    );
    expect(seeds).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
    const poolOf = { A1: 0, A2: 0, B1: 1, B2: 1, C1: 2, C2: 2 };
    const slots = knockoutSlots(seeds, poolOf);
    expect(slots.length).toBe(8);
    for (let i = 0; i < 4; i++) {
      const [a, b] = [slots[2 * i], slots[2 * i + 1]];
      if (a && b) expect(poolOf[a as keyof typeof poolOf]).not.toBe(poolOf[b as keyof typeof poolOf]);
    }
  });
});

describe('élimination directe', () => {
  it('têtes de série, qualifiés d’office, vainqueur et consolante', () => {
    const slots = knockoutSlots(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(slots).toEqual(['s1', null, 's4', 's5', 's2', null, 's3', 's6']);
    let rounds = knockoutRounds(slots, {});
    expect(rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(rounds[0][0].w).toBe('s1');
    const wins: Record<string, string> = { '0-1': 's5', '0-3': 's3', '1-0': 's1', '1-1': 's3', '2-0': 's3' };
    rounds = knockoutRounds(slots, wins);
    expect(rounds[2][0].w).toBe('s3');
    expect(firstRoundLosers(rounds).sort()).toEqual(['s2', 's4', 's6']);
    // Un résultat changé plus tôt invalide la suite.
    rounds = knockoutRounds(slots, { ...wins, '0-3': 's6' });
    expect(rounds[1][1].w).toBeUndefined();
  });
});

describe('défis (échelle)', () => {
  it('le vainqueur qui défiait prend la place du défié', () => {
    expect(
      challengeOrder(
        ['a', 'b', 'c', 'd'],
        [
          { c: 'c', d: 'a', w: 'c' },
          { c: 'd', d: 'b', w: 'b' },
        ],
      ),
    ).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('double à la mêlée', () => {
  it('nouveaux partenaires à chaque tour, repos répartis, points individuels', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const rounds: MeleeRound[] = [];
    for (let k = 0; k < 4; k++) {
      const r = meleeRound(ids, rounds, 5, seeded());
      expect(r.matches.length).toBe(2);
      expect(r.resting.length).toBe(2);
      expect(new Set([...r.matches.flatMap((m) => [...m.a, ...m.b]), ...r.resting]).size).toBe(10);
      r.matches.forEach((m) => (m.result = 'a'));
      rounds.push(r);
    }
    const partners = rounds.flatMap((r) => r.matches.flatMap((m) => [m.a, m.b].map((t) => [...t].sort().join())));
    expect(new Set(partners).size).toBe(partners.length);
    expect(new Set(rounds.flatMap((r) => r.resting)).size).toBe(8);
    const st = meleeStandings(ids, rounds);
    expect(st.reduce((t, s) => t + s.points, 0)).toBe(4 * 2 * 2 * 2);
  });
});
