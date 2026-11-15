import { describe, expect, it } from 'vitest';
import { deriveKey, newSalt, open, seal } from './crypto';
import { emptyPrivate, mergePrivate, parseRoster } from './privateData';

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
});
