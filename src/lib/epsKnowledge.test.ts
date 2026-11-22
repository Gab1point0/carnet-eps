import { describe, expect, it } from 'vitest';
import { epsKnowledgeFor, stageOf } from './epsKnowledge';

describe('connaissances EPS données à Claude', () => {
  it('reconnaît le niveau de la classe', () => {
    expect(stageOf('6e')).toBe('cycle3');
    expect(stageOf('4e')).toBe('cycle4');
    expect(stageOf('3e')).toBe('cycle4');
    expect(stageOf('1re')).toBe('lycee');
    expect(stageOf('Terminale')).toBe('lycee');
    expect(stageOf('Bac Pro')).toBe('lycee');
    expect(stageOf('UNSS')).toBeNull();
  });

  it('envoie le programme du niveau et les repères du champ', () => {
    const lycee = epsKnowledgeFor('1re', 'ca4');
    expect(lycee).toContain('AFL1 s\'engager pour gagner une rencontre');
    expect(lycee).toContain('CA4, affrontement');
    expect(lycee).not.toContain('Attendus de fin de cycle 4');
    const college = epsKnowledgeFor('5e', 'ca2');
    expect(college).toContain('Attendus de fin de cycle 4');
    expect(college).toContain('CA2, environnements');
    expect(college).not.toContain('AFL1');
  });
});
