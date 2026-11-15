import { describe, expect, it } from 'vitest';
import { buildEvalWorkbook, tidyEvalSheet, type EvalSheetSpec } from './evalSheet';

const spec: EvalSheetSpec = {
  title: 'Test',
  expectations: [],
  blocks: [
    { name: 'Jouer', points: 10, criteria: [{ label: 'Efficacité', kind: 'levels', observe: ['a', 'b', 'c', 'd'] }, { label: 'Placement', kind: 'levels', observe: [] }] },
    { name: 'Arbitrer', points: 5, criteria: [{ label: 'Score', kind: 'single', observe: ['ok'] }, { label: ' ', kind: 'single', observe: [] }] },
    { name: 'Vide', points: 3, criteria: [] },
  ],
  bonus: [],
  sources: [],
  notes: '',
};

describe("fiche d'évaluation (tableur)", () => {
  it('ramène le barème à 20 et écarte les blocs ou critères vides', () => {
    const t = tidyEvalSheet(spec);
    expect(t.blocks.map((b) => b.name)).toEqual(['Jouer', 'Arbitrer']);
    expect(t.blocks.reduce((s, b) => s + b.points, 0)).toBe(20);
    expect(t.blocks[1].criteria).toHaveLength(1);
  });

  it('place une ligne par élève, 4 cases par critère à niveaux et des formules de note', async () => {
    const { workbook, layout } = await buildEvalWorkbook(tidyEvalSheet(spec), { students: 28, className: '5e A', activity: 'Badminton' });
    expect(layout.groups).toEqual([
      [2, 5],
      [6, 9],
    ]);
    expect(layout.rows).toEqual({ first: 3, last: 30 });
    const ws = workbook.getWorksheet('Évaluation')!;
    expect(ws.getCell('B3').value).toBe(false);
    expect(String((ws.getCell('J3').value as { formula: string }).formula)).toContain('MAX(B3*1,C3*2,D3*3,E3*4)');
  });
});

describe('export rangé par groupes', () => {
  it('ajoute une colonne Groupe et décale les cases', async () => {
    const { workbook, layout } = await buildEvalWorkbook(tidyEvalSheet(spec), {
      students: 2,
      className: '5e A',
      activity: 'Badminton',
      rows: [
        { name: 'Léa', marks: {}, group: 'Groupe 1' },
        { name: 'Tom', marks: {}, group: 'Groupe 2' },
      ],
      keyOf: (b, l) => `${b}::${l}`,
    });
    const ws = workbook.getWorksheet('Évaluation')!;
    expect(ws.getCell('B2').value).toBe('Groupe');
    expect(ws.getCell('B4').value).toBe('Groupe 2');
    expect(layout.groups[0]).toEqual([3, 6]);
  });
});
