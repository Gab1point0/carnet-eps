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
