import { describe, expect, it } from 'vitest';
import { filledKeys, keepFilledNames, type EvalSheetSpec } from './evalSheet';

const sheet = (blocks: Array<[string, string[]]>, bonus: string[] = []) =>
  ({
    title: 'T',
    expectations: [],
    blocks: blocks.map(([name, labels]) => ({ name, points: 10, criteria: labels.map((label) => ({ label, kind: 'check', observe: [] })) })),
    bonus: bonus.map((label) => ({ label, points: 1 })),
    sources: [],
    notes: '',
  }) as unknown as EvalSheetSpec;

describe('noms gardés quand Claude refait une fiche remplie', () => {
  const prev = sheet([['Attaque', ['Smash', 'Passe']], ['Défense', ['Placement']]], ['Arbitrage']);
  const filled = filledKeys({ a: { v: { 'Attaque::Smash': 1, 'Défense::Placement': 2, 'bonus::Arbitrage': 1 } } });

  it('remet les anciens noms des éléments remplis renommés à la même place', () => {
    const next = sheet([['Attaquer', ['Attaque smashée', 'Passe', 'Service']], ['Défense', ['Se placer']]], ['Arbitre']);
    const { spec, restored } = keepFilledNames(prev, next, filled);
    expect(spec.blocks.map((b) => b.name)).toEqual(['Attaque', 'Défense']);
    expect(spec.blocks[0].criteria.map((c) => c.label)).toEqual(['Smash', 'Passe', 'Service']);
    expect(spec.blocks[1].criteria[0].label).toBe('Placement');
    expect(spec.bonus[0].label).toBe('Arbitrage');
    expect(restored).toHaveLength(4);
  });

  it('laisse les éléments non remplis et les retraits voulus', () => {
    const next = sheet([['Attaque', ['Smash', 'Passe décisive']], ['Défense', []]]);
    const { spec, restored } = keepFilledNames(prev, next, filled);
    expect(spec.blocks[0].criteria.map((c) => c.label)).toEqual(['Smash', 'Passe décisive']);
    expect(spec.blocks[1].criteria).toEqual([]);
    expect(restored).toEqual([]);
  });
});
