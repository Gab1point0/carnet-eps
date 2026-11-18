import { describe, expect, it } from 'vitest';
import { evalExpr, exprToExcel, formatValue, parseExpr, parseValue, rankFraction, scaleFraction, scaleToExcel } from './evalCalc';
import { buildEvalWorkbook, evaluateSheet, sheetProblems, tidyEvalSheet, type EvalSheetSpec } from './evalSheet';

const env = (vals: Record<string, number | null>, cls: Record<string, number[]> = {}) => ({ get: (n: string) => vals[n] ?? null, classValues: (n: string) => cls[n] ?? [] });

describe('formules', () => {
  it('calcule un écart en % et les fonctions courantes', () => {
    const e = parseExpr('ABS(score1 - projet1) / projet1 * 100');
    expect(evalExpr(e, env({ score1: 45, projet1: 50 }))).toBeCloseTo(10);
    expect(evalExpr(e, env({ score1: 45 }))).toBeNull();
    expect(evalExpr(parseExpr('MAX(e1; e2; e3)'), env({ e1: 3, e3: 5 }))).toBe(5);
    expect(evalExpr(parseExpr('SI(vma >= 12; 2; 0)'), env({ vma: 12.5 }))).toBe(2);
    expect(evalExpr(parseExpr('SI(ET(a > 1; b < 3); 1; 0)'), env({ a: 2, b: 2 }))).toBe(1);
    expect(evalExpr(parseExpr('3,5 * 2'), env({}))).toBe(7);
    expect(evalExpr(parseExpr('50%*10'), env({}))).toBe(5);
    expect(evalExpr(parseExpr('ARRONDI(x; 1)'), env({ x: 2.345 }))).toBe(2.3);
    expect(evalExpr(parseExpr('a / b'), env({ a: 1, b: 0 }))).toBeNull();
    expect(evalExpr(parseExpr('vma / CLASSE_MAX(vma) * 20'), env({ vma: 10 }, { vma: [10, 20] }))).toBe(10);
    expect(evalExpr(parseExpr('RANG(vma)'), env({ vma: 10 }, { vma: [10, 20, 15] }))).toBe(3);
    expect(evalExpr(parseExpr('BAREME(vma; 8; 27; 10; 34; 12; 41)'), env({ vma: 9 }))).toBe(30.5);
    expect(evalExpr(parseExpr('PALIERS(vma; 8; 27; 10; 34; 12; 41)'), env({ vma: 11.5 }))).toBe(34);
    expect(evalExpr(parseExpr('BAREME(vma; 8; 27; 10; 34)'), env({ vma: 25 }))).toBe(34);
    expect(exprToExcel(parseExpr('PALIERS(v; 8; 27; 10; 34)'), () => 'B3', () => '')).toBe('IF(OR(B3=""),"",IFERROR(IF((B3)<=8,27,IF((B3)<10,27,34)),""))');
    expect(() => parseExpr('BAREME(v; 8; 27; 10)')).toThrow();
    expect(() => parseExpr('ABS(')).toThrow();
    expect(() => parseExpr('FOO(1)')).toThrow();
  });

  it('traduit en formule Excel', () => {
    const xl = exprToExcel(parseExpr('ABS(s - p) / p * 100'), (n) => (n === 's' ? 'C3' : 'B3'), () => '$B$3:$B$30');
    expect(xl).toBe('IF(OR(C3="",B3=""),"",IFERROR(((ABS((C3-B3))/B3)*100),""))');
    expect(exprToExcel(parseExpr('MAX(a; b)'), (n) => (n === 'a' ? 'B3' : 'C3'), () => '')).toBe('IF(OR(COUNT(B3,C3)=0),"",IFERROR(MAX(B3,C3),""))');
  });
});

describe('barèmes', () => {
  it('linéaire, par paliers, au rang', () => {
    const pts = [
      { at: 5, pct: 100 },
      { at: 20, pct: 0 },
    ];
    expect(scaleFraction(3, pts)).toBe(1);
    expect(scaleFraction(12.5, pts)).toBeCloseTo(0.5);
    expect(scaleFraction(25, pts)).toBe(0);
    expect(scaleFraction(12.5, [{ at: 10, pct: 50 }, { at: 12, pct: 75 }, { at: 14, pct: 100 }], true)).toBe(0.75);
    expect(scaleToExcel('D3', pts)).toBe('IF(D3<5,1,IF(D3<20,MAX(0,MIN(1,(100+(D3-5)*(-100)/15)/100)),0))');
    expect(rankFraction(20, [10, 15, 20], 'high')).toBe(1);
    expect(rankFraction(10, [10, 15, 20], 'high')).toBe(0);
    expect(rankFraction(15, [10, 15, 20], 'high')).toBe(0.5);
    expect(rankFraction(10, [10, 15, 20], 'low')).toBe(1);
  });

  it('lit les valeurs saisies', () => {
    expect(parseValue('12,5')).toBe(12.5);
    expect(parseValue("3'25", 'time')).toBe(205);
    expect(parseValue('1:02:03', 'time')).toBe(3723);
    expect(parseValue('abc')).toBeNull();
    expect(formatValue(205, 'time')).toBe('3:25');
    expect(formatValue(12.345, 'decimal', 1)).toBe('12,3');
  });
});

/** La fiche demi-fond de l'enseignant : écart au projet (on perd des points à partir de 5 %, 0 à 20 %) et rang de VMA. */
const demiFond: EvalSheetSpec = tidyEvalSheet({
  title: 'Demi-fond',
  expectations: [],
  blocks: [
    {
      name: 'Tenir son projet',
      points: 15,
      criteria: [
        { label: 'Projet course 1', kind: 'number', observe: [], ref: 'projet1', unit: 'pts' },
        { label: 'Score course 1', kind: 'number', observe: [], ref: 'score1', unit: 'pts' },
        { label: 'Écart course 1', kind: 'computed', observe: [], ref: 'ecart1', unit: '%', expr: 'ABS(score1 - projet1) / projet1 * 100', decimals: 1, scoring: { type: 'table', points: [{ at: 5, pct: 100 }, { at: 20, pct: 0 }] } },
        { label: 'Projet course 2', kind: 'number', observe: [], ref: 'projet2', unit: 'pts' },
        { label: 'Score course 2', kind: 'number', observe: [], ref: 'score2', unit: 'pts' },
        { label: 'Écart course 2', kind: 'computed', observe: [], ref: 'ecart2', unit: '%', expr: 'ABS(score2 - projet2) / projet2 * 100', decimals: 1, scoring: { type: 'table', points: [{ at: 5, pct: 100 }, { at: 20, pct: 0 }] } },
      ],
    },
    { name: 'VMA', points: 5, criteria: [{ label: 'VMA', kind: 'number', observe: [], ref: 'vma', unit: 'km/h', scoring: { type: 'rank', best: 'high' } }] },
  ],
  bonus: [],
  sources: [],
  notes: '',
});
const key = (b: string, l: string) => `${b}::${l}`;

describe('fiche avec calculs', () => {
  it('calcule les points comme demandé', () => {
    expect(sheetProblems(demiFond)).toEqual([]);
    const m = (p1: number, s1: number, p2: number, s2: number, vma: number) => ({
      marks: { [key('Tenir son projet', 'Projet course 1')]: p1, [key('Tenir son projet', 'Score course 1')]: s1, [key('Tenir son projet', 'Projet course 2')]: p2, [key('Tenir son projet', 'Score course 2')]: s2, [key('VMA', 'VMA')]: vma },
    });
    const res = evaluateSheet(demiFond, [m(50, 50, 60, 63, 14), m(50, 40, 60, 48, 10), m(50, 55, 60, 60, 12)], key);
    // Élève 1 : écarts 0 % et 5 % → 15/15 ; meilleure VMA → 5/5.
    expect(res[0].blocks).toEqual([15, 5]);
    expect(res[0].total).toBe(20);
    // Élève 2 : écarts 20 % et 20 % → 0/15 ; plus faible VMA → 0/5.
    expect(res[1].blocks).toEqual([0, 0]);
    // Élève 3 : écarts 10 % (2/3 des points de la course) et 0 % → (0,667 + 1) / 2 × 15 = 12,5 ; VMA au milieu → 2,5.
    expect(res[2].blocks).toEqual([12.5, 2.5]);
    expect(res[2].values[key('Tenir son projet', 'Écart course 1')]).toBeCloseTo(10);
  });

  it('produit les formules Excel et la moyenne de classe', async () => {
    const { workbook } = await buildEvalWorkbook(demiFond, { students: 3, className: '4e Rouge', activity: 'Demi-fond' });
    const ws = workbook.getWorksheet('Évaluation')!;
    expect(ws.getCell('D2').value).toBe('Écart course 1 (%)');
    expect(String((ws.getCell('D3').value as { formula: string }).formula)).toBe('IF(OR(C3="",B3=""),"",IFERROR(((ABS((C3-B3))/B3)*100),""))');
    const note = String((ws.getCell('H3').value as { formula: string }).formula);
    expect(note).toContain('IF(D3="",0,');
    expect(String((ws.getCell('J3').value as { formula: string }).formula)).toContain('RANK(I3,$I$3:$I$5,0)');
    expect(ws.getCell('A7').value).toBe('Moyenne de la classe');
  });

  it('arrondit et plafonne la note finale', () => {
    const s = tidyEvalSheet({ ...demiFond, rounding: 0.5, cap: true, bonus: [{ label: 'Progrès', points: 2 }] });
    const marks = { [key('VMA', 'VMA')]: 12, 'bonus::Progrès': 1, [key('Tenir son projet', 'Projet course 1')]: 50, [key('Tenir son projet', 'Score course 1')]: 50, [key('Tenir son projet', 'Projet course 2')]: 50, [key('Tenir son projet', 'Score course 2')]: 50 };
    expect(evaluateSheet(s, [{ marks }], key)[0].total).toBe(20);
  });

  it('signale une formule fausse ou un nom inconnu', () => {
    const bad = tidyEvalSheet({ ...demiFond, blocks: [{ name: 'B', points: 20, criteria: [{ label: 'X', kind: 'computed', observe: [], expr: 'inconnu * 2', scoring: { type: 'none' } }, { label: 'Y', kind: 'computed', observe: [], expr: 'ABS(', scoring: { type: 'none' } }] }] });
    const p = sheetProblems(bad);
    expect(p[0]).toContain('inconnu');
    expect(p[1]).toContain('« Y »');
  });
});

describe('listes, observations, chronos', () => {
  const s = tidyEvalSheet({
    title: 'Mix',
    expectations: [],
    blocks: [
      {
        name: 'Course',
        points: 12,
        criteria: [
          { label: 'Chrono', kind: 'number', observe: [], format: 'time', scoring: { type: 'table', points: [{ at: 240, pct: 100 }, { at: 360, pct: 0 }] } },
          { label: 'Rôle', kind: 'choice', observe: [], options: [{ label: 'Juge autonome', pct: 100 }, { label: 'Juge aidé, pas sûr', pct: 50 }] },
          { label: 'Remarque', kind: 'text', observe: [] },
        ],
      },
      { name: 'Attitude', points: 8, criteria: [{ label: 'Engagement', kind: 'levels', observe: [], weight: 2 }, { label: 'Tenue', kind: 'single', observe: [] }] },
    ],
    bonus: [],
    sources: [],
    notes: '',
  });
  const marks = { [key('Course', 'Chrono')]: 300, [key('Course', 'Rôle')]: 2, [key('Attitude', 'Engagement')]: 3, [key('Attitude', 'Tenue')]: 1 };

  it('compte les choix, les poids et ignore le texte', () => {
    expect(s.blocks[0].criteria[1].options![1].label).toBe('Juge aidé  pas sûr');
    const r = evaluateSheet(s, [{ marks }], key)[0];
    // Chrono 5:00 → 50 % ; choix « aidé » → 50 % ; moyenne → 6/12.
    expect(r.blocks[0]).toBe(6);
    // Engagement 3/4 × 2 + tenue 1 → (1,5 + 1) / 3 × 8 = 6,7.
    expect(r.blocks[1]).toBe(6.7);
  });

  it('exporte la liste déroulante, le texte et les valeurs saisies', async () => {
    const { workbook } = await buildEvalWorkbook(s, { students: 1, className: 'X', activity: '', rows: [{ name: 'A', marks, texts: { [key('Course', 'Remarque')]: 'Bon départ' } }], keyOf: key });
    const ws = workbook.getWorksheet('Évaluation')!;
    expect(ws.getCell('B2').value).toBe('Chrono (s)');
    expect(ws.getCell('B3').value).toBe(300);
    expect(ws.getCell('C3').value).toBe('Juge aidé  pas sûr');
    expect(ws.getCell('C3').dataValidation.type).toBe('list');
    expect(ws.getCell('D3').value).toBe('Bon départ');
    const note = String((ws.getCell('E3').value as { formula: string }).formula);
    expect(note).toContain('IF(C3="Juge autonome",100');
    expect(String((ws.getCell('K3').value as { formula: string }).formula)).toContain('2*(MAX(F3*1,G3*2,H3*3,I3*4)/4)');
  });
});

describe('barème filles / garçons', () => {
  const spec: EvalSheetSpec = {
    title: 'Course',
    blocks: [
      {
        name: 'Performance',
        points: 20,
        criteria: [
          { label: 'Temps', kind: 'number', observe: [], ref: 'temps' },
          { label: 'Note', kind: 'computed', observe: [], ref: 'note', expr: 'SI(fille; BAREME(temps; 10; 20; 14; 0); BAREME(temps; 8; 20; 12; 0))', scoring: { type: 'table', points: [{ at: 0, pct: 0 }, { at: 20, pct: 100 }] } },
        ],
      },
    ],
    bonus: [],
    sources: [],
    expectations: [],
    notes: '',
  } as unknown as EvalSheetSpec;
  const k = (b: string, l: string) => `${b}::${l}`;

  it('calcule selon le sexe, et attend que le sexe soit renseigné', () => {
    expect(sheetProblems(spec)).toEqual([]);
    const res = evaluateSheet(spec, [{ marks: { 'Performance::Temps': 12 }, sex: 'F' }, { marks: { 'Performance::Temps': 12 }, sex: 'G' }, { marks: { 'Performance::Temps': 12 } }], k);
    expect(res[0].values['Performance::Note']).toBe(10);
    expect(res[1].values['Performance::Note']).toBe(0);
    expect(res[2].values['Performance::Note']).toBeNull();
    expect(res[0].total).toBe(10);
  });

  it('ajoute une colonne F / G dans le tableur', async () => {
    const { workbook } = await buildEvalWorkbook(spec, { students: 2, className: 'X', activity: '', rows: [{ name: 'A', marks: { 'Performance::Temps': 12 }, sex: 'F' }, { name: 'B', marks: {} }], keyOf: k });
    const ws = workbook.getWorksheet('Évaluation')!;
    expect(ws.getCell('B2').value).toBe('F / G');
    expect(ws.getCell('B3').value).toBe('F');
    expect(ws.getCell('C3').value).toBe(12);
    const f = String((ws.getCell('D3').value as { formula: string }).formula);
    expect(f).toContain('IF(B3="F",1,IF(B3="G",0,""))');
  });
});

describe('classement filles et garçons séparément', () => {
  const spec = {
    title: 'VMA',
    blocks: [
      {
        name: 'Niveau',
        points: 10,
        criteria: [
          { label: 'VMA', kind: 'number', observe: [], ref: 'vma', scoring: { type: 'rank', best: 'high', bySex: true } },
          { label: 'Rang', kind: 'computed', observe: [], ref: 'rang', expr: 'RANG_SEXE(vma)' },
        ],
      },
    ],
    bonus: [],
    sources: [],
    expectations: [],
    notes: '',
  } as unknown as EvalSheetSpec;
  const k = (b: string, l: string) => `${b}::${l}`;
  const row = (vma: number, sex?: 'F' | 'G') => ({ marks: { 'Niveau::VMA': vma }, sex });

  it('classe chaque élève parmi ceux de son sexe', () => {
    expect(sheetProblems(spec)).toEqual([]);
    // Filles : 12, 11, 10 ; garçons : 15, 13 ; un élève sans sexe renseigné.
    const res = evaluateSheet(spec, [row(12, 'F'), row(11, 'F'), row(10, 'F'), row(15, 'G'), row(13, 'G'), row(14)], k);
    expect(res.map((r) => r.values['Niveau::Rang'])).toEqual([1, 2, 3, 1, 2, null]);
    expect(res.map((r) => r.total)).toEqual([10, 5, 0, 10, 0, 0]);
  });

  it('fait le même calcul dans le tableur', async () => {
    const { workbook } = await buildEvalWorkbook(spec, { students: 2, className: 'X', activity: '', rows: [{ name: 'A', marks: { 'Niveau::VMA': 12 }, sex: 'F' }, { name: 'B', marks: { 'Niveau::VMA': 15 }, sex: 'G' }], keyOf: k });
    const ws = workbook.getWorksheet('Évaluation')!;
    expect(ws.getCell('B2').value).toBe('F / G');
    expect(ws.getCell('B4').value).toBe('G');
    const rang = String((ws.getCell('D3').value as { formula: string }).formula);
    expect(rang).toContain('COUNTIFS($C$3:$C$4,">"&C3,$B$3:$B$4,$B3)+1');
    const note = String((ws.getCell('E3').value as { formula: string }).formula);
    expect(note).toContain('COUNTIFS($C$3:$C$4,">-1E+300",$B$3:$B$4,$B3)');
  });
});
