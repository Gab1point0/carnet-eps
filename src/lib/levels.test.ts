import { describe, expect, it } from 'vitest';
import { parseLevels, parseNumber } from './levels';
import { applyChanges, levelProposals } from './suggestions';
import { newBlock, newLesson } from '../store/model';
import type { Lesson } from '../types';

function mk(order: number, over: Partial<Lesson> = {}, minutes: number[] = []): Lesson {
  const l = newLesson('k', 'c', order);
  l.id = `l${order}`;
  l.blocks = minutes.map((m, i) => ({ ...newBlock(i === 0 ? 'warmup' : 'situation', `B${i}`, m), id: `l${order}b${i}` }));
  return Object.assign(l, over);
}

describe('niveaux dictés', () => {
  it('lit les nombres en lettres et en chiffres', () => {
    expect(parseNumber('vingt-deux')).toBe(22);
    expect(parseNumber('vingt et un')).toBe(21);
    expect(parseNumber('dix-sept')).toBe(17);
    expect(parseNumber('8')).toBe(8);
    expect(parseNumber('beaucoup')).toBeNull();
  });
  it('extrait les effectifs par degré', () => {
    expect(parseLevels('Alors six débutants, dix en cours, huit acquis et deux avancés.')).toEqual([6, 10, 8, 2]);
    expect(parseLevels('12 élèves sont débutants, 5 élèves maîtrisent, 3 très à l\'aise')).toEqual([12, 0, 5, 3]);
    expect(parseLevels('Séance sympa, classe très hétérogène')).toBeNull();
  });
});

describe('propositions selon le niveau', () => {
  const diag = (levels: [number, number, number, number]) => mk(0, { evalKind: 'diagnostic', levels, title: 'Diagnostic' }, [10, 40]);

  it('classe hétérogène : groupes de niveau avec effectifs', () => {
    const [p] = levelProposals([diag([6, 6, 6, 6]), mk(1, {}, [10, 40])], mk(1, {}, [10, 40]));
    expect(p.title).toMatch(/groupes de niveau/i);
    const patch = applyChanges(mk(1, {}, [10, 40]), p.changes, () => 'x');
    expect(patch.safety).toMatch(/≈ 12 élèves/);
  });

  it('classe débutante : reprise des fondamentaux sans changer la durée', () => {
    const next = mk(1, {}, [10, 40, 10]);
    const [p] = levelProposals([diag([10, 8, 2, 0]), next], next);
    expect(p.title).toMatch(/fondamentaux/i);
    const patch = applyChanges(next, p.changes, () => 'new');
    expect(patch.blocks!.reduce((a, b) => a + b.minutes, 0)).toBe(60);
    expect(patch.blocks!.some((b) => b.id === 'new')).toBe(true);
  });

  it('classe à l\'aise : monter le niveau', () => {
    const next = mk(2, {}, [10, 40]);
    const out = levelProposals([diag([0, 3, 10, 7]), next], next);
    expect(out[0].title).toMatch(/exigence/i);
  });

  it('progression faible après l\'évaluation formative', () => {
    const lessons = [diag([8, 6, 4, 2]), mk(1, {}, [10, 40]), mk(2, { evalKind: 'formative', levels: [7, 6, 5, 2], title: 'Formative' }, [10, 40]), mk(3, {}, [10, 40])];
    const out = levelProposals(lessons, lessons[3]);
    expect(out.some((p) => /Remédiation ciblée/.test(p.title))).toBe(true);
  });

  it('séance avant la sommative : essai en conditions réelles', () => {
    const lessons = [diag([4, 4, 4, 4]), mk(1, {}, [10, 40]), mk(2, {}, [10, 40]), mk(3, { evalKind: 'summative' }, [10, 40])];
    const out = levelProposals(lessons, lessons[2]);
    expect(out.some((p) => /conditions/.test(p.title))).toBe(true);
    expect(levelProposals(lessons, lessons[3])).toEqual([]);
  });

  it('rien sans niveau relevé', () => {
    const next = mk(1, {}, [10, 40]);
    expect(levelProposals([mk(0, { evalKind: 'diagnostic' }), next], next)).toEqual([]);
  });
});
