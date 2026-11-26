import { describe, expect, it } from 'vitest';
import { deriveKey, newSalt, open, seal } from './crypto';
import { emptyPrivate, mergePrivate, parseRoster, remapStudents, restorePrivate, stampGrouping, stampMarks } from './privateData';

describe('données des élèves', () => {
  it('chiffre et ne déchiffre qu\'avec le bon mot de passe', async () => {
    const salt = newSalt();
    const key = await deriveKey('mot de passe', salt);
    const env = await seal(key, salt, { rosters: { k: { students: [{ id: 's', name: 'Léa D.' }] } } });
    expect(env.data).not.toContain('Léa');
    expect(await open(key, env)).toMatchObject({ rosters: { k: { students: [{ name: 'Léa D.' }] } } });
    await expect(open(await deriveKey('autre', salt), env)).rejects.toBeTruthy();
  }, 20000);

  it('fusionne deux appareils élève par élève', () => {
    const a = emptyPrivate();
    const b = emptyPrivate();
    a.rosters.k = { students: [{ id: '1', name: 'A' }], updatedAt: 1 };
    b.rosters.k = { students: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }], updatedAt: 2 };
    a.sheets.l = { '1': { v: { x: 3 }, t: 5 }, '2': { v: { x: 1 }, t: 1 } };
    b.sheets.l = { '1': { v: { x: 2 }, t: 4 }, '2': { v: { x: 4 }, t: 9 } };
    const m = mergePrivate(a, b);
    expect(m.rosters.k.students).toHaveLength(2);
    expect(m.sheets.l['1'].v.x).toBe(3);
    expect(m.sheets.l['2'].v.x).toBe(4);
  });

  it('lit une liste collée et garde les élèves connus', () => {
    let n = 0;
    const list = parseRoster('DURAND Léa\n\n  Martin   Tom \nDurand léa\nZoé\tB.', [{ id: 'x', name: 'Martin Tom' }], () => `n${++n}`);
    expect(list).toEqual([
      { id: 'n1', name: 'DURAND Léa' },
      { id: 'x', name: 'Martin Tom' },
      { id: 'n2', name: 'Zoé B.' },
    ]);
  });

  it("un appareil en retard ne peut plus effacer les groupes faits ailleurs", () => {
    // Ordinateur : 3 groupes faits à 10 h.
    const pc = emptyPrivate();
    pc.groups.yoga = stampGrouping(undefined, { assign: { a: 1, b: 2, c: 3 }, count: 3 }, 10);
    // Tablette pas encore synchronisée : « Former des groupes » (2 groupes vides) puis place un élève, à 11 h.
    const tab = emptyPrivate();
    let g = stampGrouping(undefined, { assign: {}, count: 2 }, 11);
    g = stampGrouping(g, { assign: { d: 1 }, count: 2 }, 11);
    tab.groups.yoga = g;
    const m = mergePrivate(pc, tab);
    expect(m.groups.yoga.assign).toMatchObject({ a: 1, b: 2, c: 3, d: 1 });
    expect(m.groups.yoga.count).toBe(3);
    // Dans l'autre sens aussi.
    expect(mergePrivate(tab, pc).groups.yoga.assign).toMatchObject({ a: 1, b: 2, c: 3, d: 1 });
  });

  it("un vrai changement de groupe l'emporte, et retirer les groupes se propage", () => {
    const base = stampGrouping(undefined, { assign: { a: 1, b: 2 }, count: 2 }, 10);
    const pc = { ...emptyPrivate(), groups: { l: base } };
    const tab = { ...emptyPrivate(), groups: { l: stampGrouping(base, { assign: { a: 2, b: 2 }, count: 2 }, 12) } };
    expect(mergePrivate(pc, tab).groups.l.assign).toEqual({ a: 2, b: 2 });
    const cleared = { ...emptyPrivate(), groups: { l: stampGrouping(base, { assign: {}, count: 0 }, 13) } };
    const m = mergePrivate(pc, cleared).groups.l;
    expect(Object.values(m.assign).filter((x) => x > 0)).toHaveLength(0);
    expect(m.count).toBe(0);
  });

  it("garde la compatibilité avec les groupes d'avant (sans dates par élève)", () => {
    const a = { ...emptyPrivate(), groups: { l: { assign: { x: 1 }, count: 1, t: 5 } } };
    const b = { ...emptyPrivate(), groups: { l: { assign: { x: 2 }, count: 2, t: 6 } } };
    expect(mergePrivate(a, b).groups.l).toMatchObject({ assign: { x: 2 }, count: 2 });
  });

  it("récupère d'une ancienne version les groupes et résultats disparus, sans toucher au reste", () => {
    const old = emptyPrivate();
    old.rosters.k = { students: [{ id: 'o1', name: 'Léa D.' }, { id: 'o2', name: 'Tom M.' }], updatedAt: 1 };
    old.groups.yoga = { assign: { o1: 1, o2: 2 }, count: 2, t: 1 };
    old.groups.foot = { assign: { o1: 1 }, count: 1, t: 1 };
    old.savedGroups.s = { classId: 'k', name: 'Équipes', assign: { o1: 1 }, count: 1, t: 1 };
    old.sheets.eval = { o1: { v: { x: 3 }, t: 1 }, o2: { v: { x: 1 }, t: 1 } };
    // Aujourd'hui : la classe a été ressaisie (autres identifiants), les groupes de yoga sont vides.
    const cur = emptyPrivate();
    cur.rosters.k = { students: [{ id: 'n1', name: 'léa d.' }, { id: 'n2', name: 'Tom M.' }, { id: 'n3', name: 'Zoé B.' }], updatedAt: 5 };
    cur.groups.yoga = { assign: {}, count: 2, t: 5 };
    cur.groups.foot = { assign: { n1: 1 }, count: 1, t: 5 };
    cur.sheets.eval = { n2: { v: { x: 4 }, t: 5 } };
    const r = restorePrivate(cur, old, 100);
    expect(r.doc.groups.yoga.assign).toMatchObject({ n1: 1, n2: 2 });
    expect(r.doc.groups.foot).toBe(cur.groups.foot); // déjà identique
    expect(r.doc.savedGroups.s.assign).toEqual({ n1: 1 });
    expect(r.doc.sheets.eval.n1.v.x).toBe(3);
    expect(r.doc.sheets.eval.n2.v.x).toBe(4); // le résultat d'aujourd'hui est gardé
    expect(r.doc.rosters.k.students).toHaveLength(3);
    expect(r).toMatchObject({ groups: 1, saved: 1, rows: 1, rosters: 0 });
    // La version récupérée passe aux autres appareils : elle est plus récente que leurs groupes vides.
    const other = { ...emptyPrivate(), groups: { yoga: { assign: {}, count: 2, t: 50 } } };
    expect(mergePrivate(other, r.doc).groups.yoga.assign).toMatchObject({ n1: 1, n2: 2 });
  });

  it('fusionne les résultats case par case', () => {
    const base = stampMarks(undefined, { v: { vma: 13 } }, 10);
    // Ordinateur : la course 1. Tablette (en retard) : la course 2.
    const pc = { ...emptyPrivate(), sheets: { l: { s: stampMarks(base, { v: { vma: 13, c1: 40 } }, 20) } } };
    const tab = { ...emptyPrivate(), sheets: { l: { s: stampMarks(base, { v: { vma: 13, c2: 60 }, txt: { obs: 'bien' } }, 30) } } };
    const m = mergePrivate(pc, tab).sheets.l.s;
    expect(m.v).toEqual({ vma: 13, c1: 40, c2: 60 });
    expect(m.txt).toEqual({ obs: 'bien' });
    // Effacer une case se propage.
    const cleared = { ...emptyPrivate(), sheets: { l: { s: stampMarks(m, { v: { vma: 13, c2: 60 }, txt: { obs: 'bien' } }, 40) } } };
    expect(mergePrivate(pc, cleared).sheets.l.s.v).toEqual({ vma: 13, c2: 60 });
    // Absent.
    const abs = { ...emptyPrivate(), sheets: { l: { s: stampMarks(m, { ...m, absent: true }, 50) } } };
    expect(mergePrivate(pc, abs).sheets.l.s.absent).toBe(true);
  });

  it("garde ce qu'une version plus récente a ajouté (une ancienne version n'efface plus rien)", () => {
    const a = { ...emptyPrivate(), futur: { x: 1 } } as ReturnType<typeof emptyPrivate>;
    const m = mergePrivate(emptyPrivate(), a) as unknown as { futur: unknown };
    expect(m.futur).toEqual({ x: 1 });
  });
});

describe('tournois enregistrés', () => {
  const tour = (t: number, state: unknown, deleted = false) => ({ classId: 'c', name: 'Rondes', formula: 'swiss', state, t, ...(deleted ? { deleted } : {}) });

  it('fusion : la version la plus récente de chaque tournoi l’emporte, une suppression passe', () => {
    const a = { ...emptyPrivate(), tournaments: { x: tour(10, { r: 1 }), y: tour(5, { r: 1 }) } };
    const b = { ...emptyPrivate(), tournaments: { x: tour(12, { r: 2 }), y: tour(9, null, true), z: tour(3, { r: 0 }) } };
    const m = mergePrivate(a, b);
    expect(m.tournaments.x.state).toEqual({ r: 2 });
    expect(m.tournaments.y.deleted).toBe(true);
    expect(Object.keys(m.tournaments).sort()).toEqual(['x', 'y', 'z']);
    // Coffre d'une version qui ne connaissait pas les tournois.
    expect(mergePrivate({ version: 1, rosters: {}, sheets: {}, groups: {}, savedGroups: {} } as never, a).tournaments.x.t).toBe(10);
  });

  it('les identifiants d’élèves du tournoi suivent le changement d’identifiant (même nom)', () => {
    const doc = { ...emptyPrivate(), rosters: { c: { students: [{ id: 'old', name: 'Léa' }], updatedAt: 1 } }, tournaments: { x: tour(1, { order: ['old', 'autre'], wins: { old: 'old' } }) } };
    const target = { ...emptyPrivate(), rosters: { c: { students: [{ id: 'new', name: 'Léa' }], updatedAt: 2 } } };
    expect(remapStudents(doc, target).tournaments.x.state).toEqual({ order: ['new', 'autre'], wins: { new: 'new' } });
  });

  it('restaure un tournoi supprimé depuis', () => {
    const old = { ...emptyPrivate(), tournaments: { x: tour(1, { r: 3 }) } };
    const cur = { ...emptyPrivate(), tournaments: { x: tour(5, null, true) } };
    const r = restorePrivate(cur, old, 100);
    expect(r.tournaments).toBe(1);
    expect(r.doc.tournaments.x).toMatchObject({ state: { r: 3 }, deleted: false, t: 100 });
  });
});

describe('notes d’investissement', () => {
  it('fusion élève par élève : la note la plus récente l’emporte', () => {
    const a = { ...emptyPrivate(), investment: { c: { e1: { v: 18, t: 10 }, e2: { v: 19, t: 3 } } } };
    const b = { ...emptyPrivate(), investment: { c: { e1: { v: 17, t: 5 }, e2: { v: 20, t: 8 }, e3: { v: 16, t: 1 } } } };
    const m = mergePrivate(a, b);
    expect(m.investment.c).toEqual({ e1: { v: 18, t: 10 }, e2: { v: 20, t: 8 }, e3: { v: 16, t: 1 } });
    // Coffre d'une version qui ne connaissait pas les notes d'investissement.
    expect(mergePrivate({ version: 1, rosters: {}, sheets: {}, groups: {}, savedGroups: {}, tournaments: {} } as never, a).investment.c.e1.v).toBe(18);
  });

  it('suit le changement d’identifiant d’un élève, et se restaure si elle a été remise à 20', () => {
    const doc = { ...emptyPrivate(), rosters: { c: { students: [{ id: 'old', name: 'Léa' }], updatedAt: 1 } }, investment: { c: { old: { v: 15, t: 1 } } } };
    const target = { ...emptyPrivate(), rosters: { c: { students: [{ id: 'new', name: 'Léa' }], updatedAt: 2 } }, investment: { c: { new: { v: 20, t: 9 } } } };
    expect(remapStudents(doc, target).investment.c).toEqual({ new: { v: 15, t: 1 } });
    const r = restorePrivate(target, doc, 100);
    expect(r.investment).toBe(1);
    expect(r.doc.investment.c.new).toEqual({ v: 15, t: 100 });
    // Une note modifiée depuis n'est pas écrasée.
    const later = { ...target, investment: { c: { new: { v: 12, t: 50 } } } };
    expect(restorePrivate(later, doc, 100).doc.investment.c.new.v).toBe(12);
  });
});
