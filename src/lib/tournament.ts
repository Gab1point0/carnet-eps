// Roulement de matchs (tournoi) : chacun rencontre des adversaires différents, sans revanche, sur un nombre de terrains
// limité. Tout se calcule sur l'appareil : rien n'est envoyé à Claude.

export interface Match {
  a: string;
  b: string;
  /** Terrain (1, 2…). */
  court: number;
  /** Arbitre pris parmi ceux qui ne jouent pas à cette rotation (facultatif). */
  referee?: string;
}

export interface Rotation {
  matches: Match[];
  /** Participants qui ne jouent pas à cette rotation. */
  resting: string[];
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Toutes les rencontres possibles, dans l'ordre de la méthode du « tourniquet » (chacun joue une fois par tour). */
function allPairs(ids: string[]): Array<[string, string]> {
  const list: Array<string | null> = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const out: Array<[string, string]> = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const x = list[i];
      const y = list[n - 1 - i];
      if (x && y) out.push([x, y]);
    }
    // Le premier reste en place, les autres tournent d'un cran.
    list.splice(1, 0, list.pop() as string | null);
  }
  return out;
}

/** Nombre de rotations pour que tout le monde se rencontre une fois, avec `courts` terrains. */
export function rotationsForAll(count: number, courts: number): number {
  return schedule(Array.from({ length: count }, (_, i) => String(i)), { courts, rand: () => 0 }).length;
}

/**
 * Roulement : à chaque rotation, au plus `courts` matchs, personne ne joue deux fois, et deux participants ne se
 * rencontrent jamais deux fois. On fait jouer d'abord ceux qui ont le moins joué, pour que tout le monde ait à peu près
 * le même nombre de matchs. `rotations` limite le nombre de rotations (sinon : jusqu'à ce que tout le monde se soit
 * rencontré). Avec `referees`, chaque match reçoit un arbitre parmi ceux qui se reposent (celui qui a le moins arbitré).
 */
export function schedule(
  ids: string[],
  { courts, rotations, referees = false, rand = Math.random }: { courts: number; rotations?: number; referees?: boolean; rand?: () => number },
): Rotation[] {
  const pending = allPairs(shuffle(ids, rand));
  const played: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const refereed: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const lastPlayed: Record<string, number> = Object.fromEntries(ids.map((id) => [id, -1]));
  const maxCourts = Math.max(1, Math.min(courts, Math.floor(ids.length / 2)));
  const out: Rotation[] = [];
  while (pending.length && (rotations === undefined || out.length < rotations)) {
    const r = out.length;
    // Priorité : ceux qui ont le moins joué, puis ceux qui attendent depuis le plus longtemps. Chacun reçoit l'adversaire
    // (pas encore rencontré, libre) qui a lui aussi le moins joué ; à égalité, l'ordre du tourniquet.
    const pairIndex = new Map(pending.map((p, i) => [pairKey(p[0], p[1]), i]));
    const byNeed = (x: string, y: string) => played[x] - played[y] || lastPlayed[x] - lastPlayed[y];
    const players = [...ids].sort((x, y) => byNeed(x, y) || ids.indexOf(x) - ids.indexOf(y));
    // Recherche courte (avec un plafond) de la meilleure rotation : le plus de matchs possible, puis ceux qui ont le moins
    // joué. Une simple prise « au plus pressé » peut laisser ensemble deux équipes qui se sont déjà rencontrées.
    const ideal = players
      .map((p) => played[p])
      .slice(0, maxCourts * 2)
      .reduce((s, v) => s + v, 0);
    let best: Array<[string, string]> = [];
    let bestCost = Infinity;
    let nodes = 0;
    const search = (start: number, chosen: Array<[string, string]>, used: Set<string>, cost: number) => {
      if (++nodes > 20000) return;
      if (chosen.length > best.length || (chosen.length === best.length && cost < bestCost)) {
        best = [...chosen];
        bestCost = cost;
      }
      if (chosen.length >= maxCourts || (best.length === maxCourts && bestCost <= ideal)) return;
      for (let i = start; i < players.length; i++) {
        const p = players[i];
        if (used.has(p)) continue;
        const opponents = players.filter((q) => q !== p && !used.has(q) && pairIndex.has(pairKey(p, q)));
        opponents.sort((x, y) => byNeed(x, y) || (pairIndex.get(pairKey(p, x)) as number) - (pairIndex.get(pairKey(p, y)) as number));
        for (const q of opponents) {
          used.add(p);
          used.add(q);
          chosen.push([p, q]);
          search(i + 1, chosen, used, cost + played[p] + played[q]);
          chosen.pop();
          used.delete(p);
          used.delete(q);
          if (best.length === maxCourts && bestCost <= ideal) return;
        }
      }
    };
    search(0, [], new Set(), 0);
    const busy = new Set(best.flat());
    const matches: Match[] = best.map(([a, b], i) => ({ a, b, court: i + 1 }));
    if (!matches.length) break;
    for (const m of matches) {
      pending.splice(
        pending.findIndex((p) => (p[0] === m.a && p[1] === m.b) || (p[0] === m.b && p[1] === m.a)),
        1,
      );
      played[m.a]++;
      played[m.b]++;
      lastPlayed[m.a] = r;
      lastPlayed[m.b] = r;
    }
    const resting = ids.filter((id) => !busy.has(id));
    if (referees) {
      const free = [...resting];
      for (const m of matches) {
        if (!free.length) break;
        free.sort((x, y) => refereed[x] - refereed[y]);
        const ref = free.shift() as string;
        m.referee = ref;
        refereed[ref]++;
      }
    }
    out.push({ matches, resting });
  }
  return out;
}

// ————— Rondes suisses —————
// À chaque ronde, on fait se rencontrer ceux qui ont le même nombre de points (victoire 1, nul ½, exempt 1), sans
// revanche tant que c'est possible. Les résultats sont donnés à la fin de chaque ronde.

export type SwissResult = 'a' | 'b' | 'draw';
export interface SwissMatch {
  a: string;
  b: string;
  result?: SwissResult;
}
export interface SwissRound {
  matches: SwissMatch[];
  /** Participant sans adversaire (nombre impair) : il gagne d'office. */
  bye?: string;
  /** Nombre de revanches qu'on n'a pas pu éviter (fin de tournoi, peu de participants). */
  rematches?: number;
}
export interface Standing {
  id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  /** Départage : somme des points des adversaires rencontrés. */
  buchholz: number;
}

/** Classement après les rondes données (points, puis force des adversaires, puis victoires, puis ordre de départ). */
export function swissStandings(ids: string[], rounds: SwissRound[]): Standing[] {
  const s: Record<string, Standing> = Object.fromEntries(ids.map((id) => [id, { id, points: 0, wins: 0, draws: 0, losses: 0, byes: 0, buchholz: 0 }]));
  const opponents: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (const r of rounds) {
    if (r.bye && s[r.bye]) {
      s[r.bye].points += 1;
      s[r.bye].byes++;
    }
    for (const m of r.matches) {
      if (!s[m.a] || !s[m.b] || !m.result) continue;
      opponents[m.a].push(m.b);
      opponents[m.b].push(m.a);
      if (m.result === 'draw') {
        for (const x of [m.a, m.b]) {
          s[x].points += 0.5;
          s[x].draws++;
        }
      } else {
        const [w, l] = m.result === 'a' ? [m.a, m.b] : [m.b, m.a];
        s[w].points += 1;
        s[w].wins++;
        s[l].losses++;
      }
    }
  }
  for (const id of ids) s[id].buchholz = opponents[id].reduce((t, o) => t + s[o].points, 0);
  return ids.map((id) => s[id]).sort((x, y) => y.points - x.points || y.buchholz - x.buchholz || y.wins - x.wins || ids.indexOf(x.id) - ids.indexOf(y.id));
}

/**
 * Ronde suivante : du premier au dernier du classement, chacun reçoit l'adversaire libre le plus proche en points
 * qu'il n'a pas encore rencontré (recherche avec retour en arrière). Si c'est impossible sans revanche, on en accepte.
 * Nombre impair : le moins bien classé qui n'a pas encore été exempt ne joue pas et gagne d'office.
 * `ids` donne l'ordre de départ (tiré au hasard une fois pour toutes par l'appelant).
 */
export function swissPairing(ids: string[], rounds: SwissRound[]): SwissRound {
  const table = swissStandings(ids, rounds);
  const pts = Object.fromEntries(table.map((t) => [t.id, t.points]));
  const met = new Set<string>();
  for (const r of rounds) for (const m of r.matches) met.add(pairKey(m.a, m.b));
  const order = table.map((t) => t.id);

  const pairUp = (list: string[], allowRematch: boolean): Array<[string, string]> | null => {
    let nodes = 0;
    const dfs = (rest: string[]): Array<[string, string]> | null => {
      if (!rest.length) return [];
      const [p, ...others] = rest;
      const cands = [...others].sort((x, y) => Math.abs(pts[p] - pts[x]) - Math.abs(pts[p] - pts[y]));
      for (const q of cands) {
        if (!allowRematch && met.has(pairKey(p, q))) continue;
        if (++nodes > 50000) return null;
        const sub = dfs(others.filter((o) => o !== q));
        if (sub) return [[p, q], ...sub];
      }
      return null;
    };
    return dfs(list);
  };

  const finish = (pairs: Array<[string, string]>, bye?: string): SwissRound => {
    const rematches = pairs.filter(([a, b]) => met.has(pairKey(a, b))).length;
    return { matches: pairs.map(([a, b]) => ({ a, b })), ...(bye ? { bye } : {}), ...(rematches ? { rematches } : {}) };
  };

  if (order.length % 2 === 0) return finish(pairUp(order, false) ?? (pairUp(order, true) as Array<[string, string]>));
  const byes = Object.fromEntries(table.map((t) => [t.id, t.byes]));
  const minBye = Math.min(...order.map((id) => byes[id]));
  const candidates = [...order].reverse().filter((id) => byes[id] === minBye);
  for (const bye of candidates) {
    const pairs = pairUp(
      order.filter((id) => id !== bye),
      false,
    );
    if (pairs) return finish(pairs, bye);
  }
  const bye = candidates[0];
  return finish(
    pairUp(
      order.filter((id) => id !== bye),
      true,
    ) as Array<[string, string]>,
    bye,
  );
}

// ————— Montante-descendante —————
// Les participants sont répartis sur les terrains (terrain 1 = en haut). À la fin de chaque match, le gagnant monte
// d'un terrain, le perdant descend d'un terrain ; le gagnant du terrain 1 et le perdant du dernier terrain restent.

/** Répartition au hasard, aussi égale que possible, sur `courts` terrains (2 participants au moins par terrain). */
export function ladderStart(ids: string[], courts: number, rand: () => number = Math.random): string[][] {
  const n = Math.max(1, Math.min(courts, Math.floor(ids.length / 2)));
  const tables: string[][] = Array.from({ length: n }, () => []);
  shuffle(ids, rand).forEach((id, i) => tables[i % n].push(id));
  return tables;
}

/**
 * Tour suivant. `winners[i]` et `losers[i]` : gagnant et perdant du terrain i (le perdant se déduit quand ils sont
 * deux). Les autres participants d'un terrain (à 3 ou plus) restent. Le nombre de participants par terrain ne change pas.
 */
export function ladderNext(tables: string[][], winners: Array<string | undefined>, losers: Array<string | undefined>): string[][] {
  const last = tables.length - 1;
  const res = tables.map((t, i) => {
    const w = winners[i];
    const l = losers[i] ?? (t.length === 2 && w ? t.find((x) => x !== w) : undefined);
    return { w, l, stay: t.filter((x) => x !== w && x !== l) };
  });
  return tables.map((_, i) => {
    const out: string[] = [];
    if (i === 0 && res[0].w) out.push(res[0].w);
    const up = res[i + 1]?.w; // gagnant du terrain du dessous
    if (up) out.push(up);
    out.push(...res[i].stay);
    const down = i > 0 ? res[i - 1].l : undefined; // perdant du terrain du dessus
    if (down) out.push(down);
    if (i === last && res[last].l) out.push(res[last].l as string);
    return out;
  });
}
