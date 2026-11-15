import type { Workbook, Worksheet } from 'exceljs';

// Fiche d'évaluation à remplir sur tablette (Excel ou Google Sheets), d'après les règles validées par l'enseignant :
// une ligne par élève, des cases à cocher uniquement ; un critère à niveaux = 4 cases (Débutant → Avancé),
// coloriées selon la case la plus à droite cochée ; notes calculées depuis l'onglet « Barème ».

export interface EvalCriterion {
  label: string;
  /** `levels` : 4 cases (Débutant, En cours, Acquis, Avancé) ; `single` : une case (réussi / non). */
  kind: 'levels' | 'single';
  /** Ce que l'on observe pour chaque degré (4 phrases) ou pour valider la case unique (1 phrase). */
  observe: string[];
}

export interface EvalBlock {
  name: string;
  points: number;
  criteria: EvalCriterion[];
}

export interface EvalSheetSpec {
  title: string;
  /** Attendus visés : AFC (collège) ou AFL (lycée), formulés comme dans les programmes. */
  expectations: string[];
  blocks: EvalBlock[];
  bonus: Array<{ label: string; points: number }>;
  sources: string[];
  /** Choix faits (répartition des points, adaptations au niveau), en une ou deux phrases. */
  notes: string;
}

export const LEVEL_NAMES = ['Débutant', 'En cours', 'Acquis', 'Avancé'];
const LEVEL_FILL = ['FFF4B6B6', 'FFFBD38D', 'FFFDF29B', 'FFB6E3B6'];
const GREEN = 'FFB6E3B6';

/** Vérifie et complète une fiche venue de Claude : barème sur 20, au moins un critère par bloc, textes nettoyés. */
export function tidyEvalSheet(raw: EvalSheetSpec): EvalSheetSpec {
  const blocks = (raw.blocks ?? [])
    .map((b) => ({
      name: (b.name ?? '').trim() || 'Bloc',
      points: Math.max(0, Number(b.points) || 0),
      criteria: (b.criteria ?? [])
        .filter((c) => c.label?.trim())
        .map((c) => ({
          label: c.label.trim(),
          kind: c.kind === 'single' ? ('single' as const) : ('levels' as const),
          observe: (c.observe ?? []).map((o) => o.trim()).filter(Boolean),
        })),
    }))
    .filter((b) => b.criteria.length);
  // Barème ramené à 20 si Claude s'est trompé dans l'addition.
  const total = blocks.reduce((s, b) => s + b.points, 0);
  if (blocks.length && Math.abs(total - 20) > 0.01) {
    const scaled = blocks.map((b) => Math.round(((total ? b.points / total : 1 / blocks.length) * 20) * 2) / 2);
    scaled[scaled.length - 1] += 20 - scaled.reduce((a, b) => a + b, 0);
    blocks.forEach((b, i) => (b.points = scaled[i]));
  }
  return {
    title: raw.title?.trim() || 'Évaluation',
    expectations: (raw.expectations ?? []).map((e) => e.trim()).filter(Boolean),
    blocks,
    bonus: (raw.bonus ?? []).filter((b) => b.label?.trim()).map((b) => ({ label: b.label.trim(), points: Math.max(0, Number(b.points) || 0) })),
    sources: (raw.sources ?? []).map((s) => s.trim()).filter(Boolean),
    notes: raw.notes?.trim() ?? '',
  };
}

const col = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const thin = { style: 'thin' as const, color: { argb: 'FFBFC5CE' } };
const thick = { style: 'medium' as const, color: { argb: 'FF000000' } };

export interface SheetLayout {
  /** Groupes de 4 cases, en numéros de colonne (1 = A) : pour le script de cases cumulatives. */
  groups: Array<[number, number]>;
  rows: { first: number; last: number };
}

/** Construit le classeur : onglet « Évaluation » (une ligne par élève) et onglet « Barème ». */
export async function buildEvalWorkbook(
  spec: EvalSheetSpec,
  opts: {
    students: number;
    className: string;
    activity: string;
    date?: string;
    /** Fiche remplie dans l'application : noms et résultats (niveau 0 à 4, ou 0/1) par clé de critère. */
    rows?: Array<{ name: string; marks: Record<string, number>; group?: string }>;
    keyOf?: (block: string, label: string) => string;
  },
): Promise<{ workbook: Workbook; layout: SheetLayout }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carnet EPS';
  // Fiche rangée par groupes : une colonne « Groupe » après le nom.
  const withGroups = !!opts.rows?.some((r) => r.group);
  const ws = wb.addWorksheet('Évaluation', { views: [{ state: 'frozen', xSplit: withGroups ? 2 : 1, ySplit: 2 }] });
  const bareme = wb.addWorksheet('Barème');

  const FIRST = 3;
  const LAST = FIRST + Math.max(1, opts.rows?.length ?? opts.students) - 1;
  const markOf = (row: number, key: string) => opts.rows?.[row - FIRST]?.marks[key] ?? 0;
  const groups: Array<[number, number]> = [];

  // ── Barème (écrit d'abord : les notes y renvoient) ──
  bareme.columns = [{ width: 46 }, { width: 14 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 30 }];
  bareme.getCell('A1').value = `${spec.title} — ${opts.className}${opts.date ? ` — ${opts.date}` : ''}`;
  bareme.getCell('A1').font = { bold: true, size: 14 };
  bareme.getCell('A3').value = 'Bloc';
  bareme.getCell('B3').value = 'Points';
  ['A3', 'B3'].forEach((a) => (bareme.getCell(a).font = { bold: true }));
  const pointRow: number[] = [];
  spec.blocks.forEach((b, i) => {
    const r = 4 + i;
    bareme.getCell(`A${r}`).value = b.name;
    bareme.getCell(`B${r}`).value = b.points;
    pointRow.push(r);
  });
  const totalRow = 4 + spec.blocks.length;
  bareme.getCell(`A${totalRow}`).value = 'TOTAL (doit faire 20)';
  bareme.getCell(`A${totalRow}`).font = { bold: true };
  bareme.getCell(`B${totalRow}`).value = { formula: `SUM(B4:B${totalRow - 1})` };
  bareme.getCell(`C${totalRow}`).value = { formula: `IF(B${totalRow}=20,"OK","Attention : le total ne fait pas 20")` };
  let r = totalRow + 1;
  const bonusRow: number[] = [];
  spec.bonus.forEach((b) => {
    bareme.getCell(`A${r}`).value = `Bonus : ${b.label}`;
    bareme.getCell(`B${r}`).value = b.points;
    bonusRow.push(r);
    r++;
  });
  r += 1;
  const line = (text: string, bold = false) => {
    bareme.getCell(`A${r}`).value = text;
    bareme.getCell(`A${r}`).font = { bold };
    bareme.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' };
    r++;
  };
  line('Comment cocher', true);
  line("Critère à 4 cases : cochez la case du niveau atteint (Débutant → Avancé). La couleur suit le niveau : rouge, orange, jaune, vert. Seule la case la plus à droite compte.");
  line('Critère à 1 case : cochée = réussi (vert), vide = pas encore.');
  line("Les points d'un bloc = moyenne de ses critères × points du bloc (4 cases cochées = tous les points). Les bonus s'ajoutent au total.");
  r++;
  line('Avant la première utilisation', true);
  line('Excel 365 ou Google Sheets : sélectionnez les cases grises (FAUX / FALSE) de l\'onglet « Évaluation », puis Insertion > Case à cocher. Elles deviennent des cases à cocher, les notes et les couleurs fonctionnent aussitôt.');
  line('Google Sheets : ouvrez drive.google.com > Nouveau > Importer un fichier, puis Ouvrir avec Google Sheets.');
  r++;
  line("Ce qu'on observe", true);
  bareme.getCell(`A${r}`).value = 'Critère';
  LEVEL_NAMES.forEach((n, i) => (bareme.getCell(r, 3 + i).value = n));
  bareme.getRow(r).font = { bold: true };
  r++;
  for (const b of spec.blocks) {
    for (const c of b.criteria) {
      bareme.getCell(`A${r}`).value = `${b.name} — ${c.label}`;
      if (c.kind === 'levels') c.observe.slice(0, 4).forEach((o, i) => (bareme.getCell(r, 3 + i).value = o));
      else bareme.getCell(r, 3).value = `Réussi si : ${c.observe[0] ?? ''}`;
      bareme.getRow(r).alignment = { wrapText: true, vertical: 'top' };
      r++;
    }
  }
  if (spec.expectations.length) {
    r++;
    line('Attendus visés', true);
    spec.expectations.forEach((e) => line(`• ${e}`));
  }
  if (spec.notes) {
    r++;
    line('Choix faits pour cette fiche', true);
    line(spec.notes);
  }
  if (spec.sources.length) {
    r++;
    line('Sources', true);
    spec.sources.forEach((s) => line(s));
  }

  // ── Évaluation : une ligne par élève ──
  ws.getColumn(1).width = 26;
  ws.getCell('A1').value = opts.className;
  ws.getCell('A2').value = 'Élève (nom à saisir)';
  ws.getCell('A1').font = { bold: true, size: 12 };
  opts.rows?.forEach((r, i) => (ws.getCell(FIRST + i, 1).value = r.name));
  if (withGroups) {
    ws.getColumn(2).width = 11;
    ws.getCell('B2').value = 'Groupe';
    ws.getCell('B2').font = { bold: true };
    opts.rows?.forEach((r, i) => {
      const cell = ws.getCell(FIRST + i, 2);
      cell.value = r.group ?? '';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thin, bottom: thin, right: thin };
    });
  }
  ws.getCell('A2').font = { bold: true };
  let c = withGroups ? 3 : 2;
  const noteCols: string[] = [];
  const style = (cell: ReturnType<Worksheet['getCell']>, left: boolean) => {
    cell.border = { left: left ? thick : thin, right: thin, top: thin, bottom: thin };
  };
  const checkbox = (colN: number, left: boolean, value: (row: number) => boolean = () => false) => {
    ws.getColumn(colN).width = 5.5;
    for (let row = FIRST; row <= LAST; row++) {
      const cell = ws.getCell(row, colN);
      cell.value = value(row);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { color: { argb: 'FF9AA3AE' }, size: 8 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      style(cell, left);
    }
  };

  spec.blocks.forEach((b, bi) => {
    const start = c;
    const parts: Array<(row: number) => string> = [];
    b.criteria.forEach((crit, ci) => {
      const first = ci === 0;
      if (crit.kind === 'levels') {
        const a = col(c);
        const z = col(c + 3);
        groups.push([c, c + 3]);
        ws.mergeCells(2, c, 2, c + 3);
        ws.getCell(2, c).value = crit.label;
        ws.getCell(2, c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const key = opts.keyOf?.(b.name, crit.label) ?? '';
        for (let k = 0; k < 4; k++) checkbox(c + k, first && k === 0, (row) => markOf(row, key) > k);
        // Niveau = rang de la case cochée la plus à droite (0 à 4). Forme simple, sans tableau : Excel, Sheets et tablettes la calculent pareil.
        const cols4 = [0, 1, 2, 3].map((k) => col(c + k));
        const level = (row: number, abs = '') => `MAX(${cols4.map((x, k) => `${abs}${x}${row}*${k + 1}`).join(',')})`;
        parts.push((row) => `${level(row)}/4`);
        ws.addConditionalFormatting({
          ref: `${a}${FIRST}:${z}${LAST}`,
          rules: [1, 2, 3, 4].map((lv, i) => ({
            type: 'expression' as const,
            priority: i + 1,
            formulae: [`${level(FIRST, '$')}=${lv}`],
            style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: LEVEL_FILL[i] } } },
          })),
        });
        c += 4;
      } else {
        const a = col(c);
        ws.getCell(2, c).value = crit.label;
        ws.getCell(2, c).alignment = { textRotation: 90, horizontal: 'center', vertical: 'bottom', wrapText: true };
        const key1 = opts.keyOf?.(b.name, crit.label) ?? '';
        checkbox(c, first, (row) => markOf(row, key1) > 0);
        parts.push((row) => `(${a}${row}*1)`);
        ws.addConditionalFormatting({
          ref: `${a}${FIRST}:${a}${LAST}`,
          rules: [{ type: 'expression', priority: 1, formulae: [`$${a}${FIRST}=TRUE`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } }],
        });
        c += 1;
      }
    });
    // Colonne de note du bloc
    const nc = c;
    noteCols.push(col(nc));
    ws.getColumn(nc).width = 8;
    ws.getCell(2, nc).value = `/${b.points}`;
    ws.getCell(2, nc).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let row = FIRST; row <= LAST; row++) {
      const sum = parts.map((p) => p(row)).join('+');
      const cell = ws.getCell(row, nc);
      cell.value = { formula: `ROUND((${sum})/${b.criteria.length}*'Barème'!$B$${pointRow[bi]},1)` };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      style(cell, false);
    }
    ws.mergeCells(1, start, 1, nc);
    ws.getCell(1, start).value = `${b.name} (${b.points} pts)`;
    ws.getCell(1, start).font = { bold: true };
    ws.getCell(1, start).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let k = start; k <= nc; k++) {
      ws.getCell(1, k).border = { left: k === start ? thick : undefined, top: thick, bottom: thin };
      ws.getCell(2, k).border = { left: k === start ? thick : thin, bottom: thick, right: thin };
    }
    c = nc + 1;
  });

  // Bonus (cases uniques) puis total
  const bonusCols: string[] = [];
  spec.bonus.forEach((b, i) => {
    const a = col(c);
    bonusCols.push(a);
    ws.getCell(1, c).value = i === 0 ? 'Bonus' : null;
    ws.getCell(2, c).value = `${b.label} (+${b.points})`;
    ws.getCell(2, c).alignment = { textRotation: 90, horizontal: 'center', vertical: 'bottom', wrapText: true };
    checkbox(c, i === 0, (row) => markOf(row, bonusKey(b.label)) > 0);
    ws.addConditionalFormatting({
      ref: `${a}${FIRST}:${a}${LAST}`,
      rules: [{ type: 'expression', priority: 1, formulae: [`$${a}${FIRST}=TRUE`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } }],
    });
    c++;
  });
  ws.getColumn(c).width = 9;
  ws.getCell(1, c).value = 'TOTAL';
  ws.getCell(2, c).value = '/20';
  [1, 2].forEach((row) => {
    ws.getCell(row, c).font = { bold: true };
    ws.getCell(row, c).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(row, c).border = { left: thick, top: row === 1 ? thick : undefined, bottom: row === 2 ? thick : undefined, right: thick };
  });
  for (let row = FIRST; row <= LAST; row++) {
    const bonus = bonusCols.map((a, i) => `+(${a}${row}*1)*'Barème'!$B$${bonusRow[i]}`).join('');
    const cell = ws.getCell(row, c);
    cell.value = { formula: `ROUND(${noteCols.map((a) => `${a}${row}`).join('+')}${bonus},1)` };
    cell.font = { bold: true, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { left: thick, right: thick, top: thin, bottom: thin };
    ws.getCell(row, 1).border = { right: thick, top: thin, bottom: thin };
  }
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 70;
  for (let row = FIRST; row <= LAST; row++) ws.getRow(row).height = 24;

  return { workbook: wb, layout: { groups, rows: { first: FIRST, last: LAST } } };
}

/** Script Apps Script (Google Sheets) : cocher une case coche celles d'avant dans son groupe, décocher décoche celles d'après. */
export function cumulativeScript(layout: SheetLayout): string {
  return `function onEdit(e) {
  var s = e.range.getSheet();
  if (s.getName() !== 'Évaluation' || e.range.getRow() < ${layout.rows.first}) return;
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;
  var v = e.range.getValue();
  if (v !== true && v !== false) return;
  var r = e.range.getRow(), c = e.range.getColumn();
  var groups = ${JSON.stringify(layout.groups)};
  groups.forEach(function (g) {
    if (c < g[0] || c > g[1]) return;
    if (v === true && c > g[0]) s.getRange(r, g[0], 1, c - g[0]).setValue(true);
    if (v === false && c < g[1]) s.getRange(r, c + 1, 1, g[1] - c).setValue(false);
  });
}`;
}

/** Clé d'un bonus dans les résultats d'un élève. */
export const bonusKey = (label: string) => `bonus::${label}`;

/** Notes d'un élève, comme dans le tableur : moyenne des critères × points du bloc, plus les bonus. */
export function scoreOf(spec: EvalSheetSpec, marks: Record<string, number>, keyOf: (block: string, label: string) => string) {
  const blocks = spec.blocks.map((b) => {
    const parts = b.criteria.map((c) => {
      const v = marks[keyOf(b.name, c.label)] ?? 0;
      return c.kind === 'levels' ? Math.min(4, v) / 4 : v ? 1 : 0;
    });
    return Math.round((parts.reduce((a, x) => a + x, 0) / Math.max(1, parts.length)) * b.points * 10) / 10;
  });
  const bonus = spec.bonus.reduce((s, b) => s + (marks[bonusKey(b.label)] ? b.points : 0), 0);
  return { blocks, total: Math.round((blocks.reduce((a, x) => a + x, 0) + bonus) * 10) / 10 };
}
