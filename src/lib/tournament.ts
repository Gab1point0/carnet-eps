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

// Formules suivantes : d'après « Formes de tournois », Office fédéral du sport suisse (OFSPO, Macolin, 2001, réimpr.
// 2014) : groupes puis K.-O., K.-O. avec tour de consolation, tournoi du sapin (défis), tournoi deux en un (mêlée).

// ————— Poules puis phase finale —————

export interface ScoredMatch {
  a: string;
  b: string;
  result?: SwissResult;
}
export interface PoolRow {
  id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
}

/** Points d'un match de poule ou de mêlée : victoire 2, nul 1, défaite 0 (barème de l'OFSPO). */
const pointsOf = (r: SwissResult, side: 'a' | 'b') => (r === 'draw' ? 1 : r === side ? 2 : 0);

/** Classement d'une poule : points, puis confrontation directe entre ex aequo, puis victoires, puis ordre de départ. */
export function poolStandings(ids: string[], matches: ScoredMatch[]): PoolRow[] {
  const rows: Record<string, PoolRow> = Object.fromEntries(ids.map((id) => [id, { id, points: 0, wins: 0, draws: 0, losses: 0, played: 0 }]));
  for (const m of matches) {
    if (!m.result || !rows[m.a] || !rows[m.b]) continue;
    for (const side of ['a', 'b'] as const) {
      const r = rows[m[side]];
      r.played++;
      r.points += pointsOf(m.result, side);
      if (m.result === 'draw') r.draws++;
      else if (m.result === side) r.wins++;
      else r.losses++;
    }
  }
  const direct = (x: string, group: Set<string>) =>
    matches.reduce((t, m) => (m.result && group.has(m.a) && group.has(m.b) && (m.a === x || m.b === x) ? t + pointsOf(m.result, m.a === x ? 'a' : 'b') : t), 0);
  const tied = (p: number) => new Set(ids.filter((id) => rows[id].points === p));
  return ids
    .map((id) => rows[id])
    .sort((x, y) => y.points - x.points || direct(y.id, tied(y.points)) - direct(x.id, tied(x.points)) || y.wins - x.wins || ids.indexOf(x.id) - ids.indexOf(y.id));
}

/** Poules tirées au hasard, de tailles aussi égales que possible. */
export function poolsStart(ids: string[], poolCount: number, rand: () => number = Math.random): string[][] {
  const k = Math.max(1, Math.min(poolCount, Math.floor(ids.length / 2)));
  const pools: string[][] = Array.from({ length: k }, () => []);
  shuffle(ids, rand).forEach((id, i) => pools[i % k].push(id));
  return pools;
}

/** Matchs d'une poule (chacun contre chacun), dans l'ordre du tourniquet : chacun joue à son tour. */
export const poolMatches = (pool: string[]): ScoredMatch[] => allPairs(pool).map(([a, b]) => ({ a, b }));

/**
 * Qualifiés pour la phase finale, rangés pour le tableau : les premiers de chaque poule, puis les deuxièmes… Le tableau
 * croise les poules (1er A contre 2e B) ; si deux joueurs d'une même poule se retrouvent au 1er tour, on échange.
 */
export function poolQualifiers(standings: string[][], perPool: number): string[] {
  const seeds: string[] = [];
  for (let r = 0; r < perPool; r++) for (const pool of standings) if (pool[r]) seeds.push(pool[r]);
  return seeds;
}

// ————— Élimination directe (tableau) —————

/** Ordre des têtes de série dans un tableau de `size` places (1 contre 8, 4 contre 5, 2 contre 7, 3 contre 6…). */
function seedOrder(size: number): number[] {
  let o = [0];
  while (o.length < size) {
    const n = o.length * 2;
    o = o.flatMap((s) => [s, n - 1 - s]);
  }
  return o;
}

/**
 * Places du tableau : les participants dans l'ordre des têtes de série (le premier est la tête de série 1), complétés
 * par des places vides (`null` : l'adversaire est qualifié d'office). `poolOf` évite deux joueurs d'une même poule au
 * premier tour quand c'est possible.
 */
export function knockoutSlots(seeds: string[], poolOf?: Record<string, number>): Array<string | null> {
  let size = 2;
  while (size < seeds.length) size *= 2;
  const slots = seedOrder(size).map((i) => seeds[i] ?? null);
  if (poolOf) {
    const same = (i: number) => slots[2 * i] && slots[2 * i + 1] && poolOf[slots[2 * i] as string] === poolOf[slots[2 * i + 1] as string];
    for (let i = 0; i < size / 2; i++) {
      if (!same(i)) continue;
      for (let j = 0; j < size / 2; j++) {
        if (j === i || !slots[2 * j + 1]) continue;
        [slots[2 * i + 1], slots[2 * j + 1]] = [slots[2 * j + 1], slots[2 * i + 1]];
        if (!same(i) && !same(j)) break;
        [slots[2 * i + 1], slots[2 * j + 1]] = [slots[2 * j + 1], slots[2 * i + 1]];
      }
    }
  }
  return slots;
}

/** Un match du tableau. `undefined` : pas encore connu ; `null` : personne (qualifié d'office). */
export interface KoMatch {
  key: string;
  a: string | null | undefined;
  b: string | null | undefined;
  w: string | null | undefined;
}

/** Tours du tableau, du premier à la finale, d'après les vainqueurs donnés (`wins` : clé du match → vainqueur). */
export function knockoutRounds(slots: Array<string | null>, wins: Record<string, string>): KoMatch[][] {
  const rounds: KoMatch[][] = [];
  let cur: Array<string | null | undefined> = slots;
  for (let r = 0; cur.length > 1; r++) {
    const matches: KoMatch[] = [];
    for (let i = 0; i < cur.length / 2; i++) {
      const a = cur[2 * i];
      const b = cur[2 * i + 1];
      const key = `${r}-${i}`;
      let w: string | null | undefined;
      if (a === null && b === null) w = null;
      else if (a === null) w = b;
      else if (b === null) w = a;
      else if (a && b) w = wins[key] === a || wins[key] === b ? wins[key] : undefined;
      matches.push({ key, a, b, w });
    }
    rounds.push(matches);
    cur = matches.map((m) => m.w);
  }
  return rounds;
}

/** Perdants du premier match joué de chacun (sans les qualifiés d'office), pour le tableau de consolation. */
export function firstRoundLosers(rounds: KoMatch[][]): string[] {
  const out: string[] = [];
  for (const [r, ms] of rounds.entries())
    for (const m of ms) {
      if (!m.a || !m.b || !m.w) continue;
      const loser = m.w === m.a ? m.b : m.a;
      // Premier match joué : au 1er tour, ou au 2e pour celui qui était qualifié d'office.
      const firstMatch = r === 0 || rounds[r - 1].some((p) => p.w === loser && (p.a === null || p.b === null));
      if (firstMatch) out.push(loser);
    }
  return out;
}

// ————— Défis (échelle, « tournoi du sapin ») —————

export interface Challenge {
  /** Celui qui défie (moins bien placé). */
  c: string;
  /** Celui qui est défié. */
  d: string;
  /** Vainqueur. */
  w: string;
}

/** Classement après les défis : si celui qui défie gagne, les deux échangent leur place. */
export function challengeOrder(start: string[], log: Challenge[]): string[] {
  const order = [...start];
  for (const x of log) {
    const i = order.indexOf(x.c);
    const j = order.indexOf(x.d);
    if (i < 0 || j < 0 || x.w !== x.c || i < j) continue;
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ————— Double à la mêlée (« deux en un ») —————
// À chaque tour, de nouveaux doubles sont tirés : on évite de rejouer avec le même partenaire (puis contre les mêmes
// adversaires). Les points sont individuels : victoire 2, nul 1, défaite 0.

export interface MeleeMatch {
  a: [string, string];
  b: [string, string];
  result?: SwissResult;
}
export interface MeleeRound {
  matches: MeleeMatch[];
  resting: string[];
}

export function meleeRound(ids: string[], rounds: MeleeRound[], courts: number, rand: () => number = Math.random): MeleeRound {
  const k = Math.max(0, Math.min(courts, Math.floor(ids.length / 4)));
  const rests: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const bump = (m: Map<string, number>, x: string, y: string) => m.set(pairKey(x, y), (m.get(pairKey(x, y)) ?? 0) + 1);
  for (const r of rounds) {
    for (const id of r.resting) if (id in rests) rests[id]++;
    for (const m of r.matches) {
      bump(partners, m.a[0], m.a[1]);
      bump(partners, m.b[0], m.b[1]);
      for (const x of m.a) for (const y of m.b) bump(opponents, x, y);
    }
  }
  // Repos : ceux qui se sont le moins reposés jusque-là (au hasard entre eux).
  const byRest = shuffle(ids, rand).sort((x, y) => rests[x] - rests[y]);
  const resting = byRest.slice(0, ids.length - 4 * k);
  const playing = byRest.slice(ids.length - 4 * k);
  let best: MeleeMatch[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 400 && bestCost > 0; attempt++) {
    const p = shuffle(playing, rand);
    const matches: MeleeMatch[] = [];
    let cost = 0;
    for (let i = 0; i < k; i++) {
      const [w, x, y, z] = p.slice(4 * i, 4 * i + 4);
      matches.push({ a: [w, x], b: [y, z] });
      cost += 10 * ((partners.get(pairKey(w, x)) ?? 0) + (partners.get(pairKey(y, z)) ?? 0));
      for (const s of [w, x]) for (const t of [y, z]) cost += opponents.get(pairKey(s, t)) ?? 0;
    }
    if (cost < bestCost) {
      best = matches;
      bestCost = cost;
    }
  }
  return { matches: best, resting };
}

/** Classement individuel de la mêlée : points (victoire 2, nul 1), puis victoires, puis moins de matchs joués. */
export function meleeStandings(ids: string[], rounds: MeleeRound[]): PoolRow[] {
  const rows: Record<string, PoolRow> = Object.fromEntries(ids.map((id) => [id, { id, points: 0, wins: 0, draws: 0, losses: 0, played: 0 }]));
  for (const r of rounds)
    for (const m of r.matches) {
      if (!m.result) continue;
      for (const side of ['a', 'b'] as const)
        for (const id of m[side]) {
          const row = rows[id];
          if (!row) continue;
          row.played++;
          row.points += pointsOf(m.result, side);
          if (m.result === 'draw') row.draws++;
          else if (m.result === side) row.wins++;
          else row.losses++;
        }
    }
  return ids.map((id) => rows[id]).sort((x, y) => y.points - x.points || y.wins - x.wins || x.played - y.played || ids.indexOf(x.id) - ids.indexOf(y.id));
}
