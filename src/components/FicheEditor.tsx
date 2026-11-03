import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { CustomSheet } from '../types';
import { tableHasLabels, type FicheSection, type SectionSpan } from '../lib/fiches';
import { Button, Field, IconButton, TextArea, TextInput } from './ui';

const LABELS: Record<FicheSection['type'], string> = {
  table: 'Tableau',
  levels: 'Critères par degré',
  checks: 'Cases à cocher',
  lines: 'Lignes d\'écriture',
  fields: 'Champs courts',
  text: 'Consigne',
  heading: 'Intertitre',
  box: 'Cadre pour dessiner',
};

const BLANK: Record<FicheSection['type'], FicheSection> = {
  table: { type: 'table', head: '', cols: ['', ''], rows: ['', '', ''] },
  levels: { type: 'levels', items: [''] },
  checks: { type: 'checks', items: [''] },
  lines: { type: 'lines', n: 2 },
  fields: { type: 'fields', fields: [''] },
  text: { type: 'text', text: '' },
  heading: { type: 'heading', text: '' },
  box: { type: 'box', n: 6 },
};

const SPAN_LABELS: Record<SectionSpan, string> = {
  full: 'Toute la largeur',
  half: 'Moitié',
  third: 'Un tiers',
  'two-thirds': 'Deux tiers',
};

/** Une liste à raison d'un élément par ligne. Les lignes vides restent le temps de la saisie. */
function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field label={`${label} (une par ligne)`}>
      <TextArea value={value.join('\n')} onChange={(v) => onChange(v.split('\n'))} minRows={2} />
    </Field>
  );
}

type Table = Extract<FicheSection, { type: 'table' }>;

const rowsOf = (t: Table) => (Array.isArray(t.rows) ? t.rows : Array.from({ length: t.rows }, () => ''));
const shownCols = (t: Table) => t.cols.length + (tableHasLabels(t) || t.title?.trim() ? 1 : 0);
const evenWidths = (n: number) => Array.from({ length: n }, () => Math.round((100 / n) * 10) / 10);

/** Tableau modifiable case par case : en-têtes, libellés de lignes, cases pré-remplies et largeurs des colonnes. */
function TableFields({ t, previous, onChange }: { t: Table; previous?: Table; onChange: (t: Table) => void }) {
  const rows = rowsOf(t);
  const labels = tableHasLabels(t) || !!t.title?.trim();
  const shown = shownCols(t);
  const widths = t.widths?.length === shown ? t.widths : null;
  const cell = (i: number, j: number) => t.cells?.[i]?.[j] ?? '';
  const matrix = () => rows.map((_, i) => t.cols.map((_, j) => cell(i, j)));

  const setCell = (i: number, j: number, v: string) => {
    const cells = matrix();
    cells[i][j] = v;
    onChange({ ...t, rows, cells });
  };
  const setCol = (j: number, v: string) => onChange({ ...t, cols: t.cols.map((c, k) => (k === j ? v : c)) });
  const setRow = (i: number, v: string) => onChange({ ...t, rows: rows.map((r, k) => (k === i ? v : r)) });
  // Ajouter ou retirer une colonne change leur nombre : les largeurs repartent en automatique.
  const addCol = () => onChange({ ...t, rows, cols: [...t.cols, ''], cells: matrix().map((r) => [...r, '']), widths: undefined });
  const removeCol = (j: number) => onChange({ ...t, rows, cols: t.cols.filter((_, k) => k !== j), cells: matrix().map((r) => r.filter((_, k) => k !== j)), widths: undefined });
  const addRow = () => onChange({ ...t, rows: [...rows, ''], cells: [...matrix(), t.cols.map(() => '')] });
  const removeRow = (i: number) => onChange({ ...t, rows: rows.filter((_, k) => k !== i), cells: matrix().filter((_, k) => k !== i) });
  const setWidth = (k: number, v: number | null) => {
    const next = [...(widths ?? evenWidths(shown))];
    next[k] = Math.max(1, v ?? 1);
    onChange({ ...t, widths: next });
  };
  const canCopy = !!previous && shownCols(previous) === shown;

  return (
    <>
      <Field label="Titre (facultatif)">
        <TextInput value={t.title ?? ''} onChange={(title) => onChange({ ...t, title })} />
      </Field>
      <div className="grid-edit-wrap">
        <table className="grid-edit">
          <thead>
            <tr>
              <th>
                <input className="input" value={t.head ?? ''} placeholder="1re colonne" onChange={(e) => onChange({ ...t, head: e.target.value })} />
              </th>
              {t.cols.map((c, j) => (
                <th key={j}>
                  <div className="grid-edit-cell">
                    <input className="input" value={c} placeholder={`Colonne ${j + 1}`} onChange={(e) => setCol(j, e.target.value)} />
                    <IconButton label="Retirer la colonne" disabled={t.cols.length < 2} onClick={() => removeCol(j)}>
                      <X size={14} />
                    </IconButton>
                  </div>
                </th>
              ))}
              <th>
                <IconButton label="Ajouter une colonne" onClick={addCol}>
                  <Plus size={16} />
                </IconButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input className="input" value={r} placeholder="Ligne" onChange={(e) => setRow(i, e.target.value)} />
                </td>
                {t.cols.map((_, j) => (
                  <td key={j}>
                    <input className="input" value={cell(i, j)} placeholder="" onChange={(e) => setCell(i, j, e.target.value)} />
                  </td>
                ))}
                <td>
                  <IconButton label="Retirer la ligne" disabled={rows.length < 2} onClick={() => removeRow(i)}>
                    <X size={14} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={t.cols.length + 2}>
                <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={addRow}>
                  Ligne
                </Button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">
        Laissez la 1re colonne et les libellés de lignes vides pour un tableau sans colonne de libellés. Les cases laissées vides sont à remplir sur papier.
      </p>

      <div className="stack" style={{ gap: 6 }}>
        <strong className="small">Largeur des colonnes {widths ? '(en %)' : ': automatique'}</strong>
        {widths && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {widths.map((w, k) => (
              <label key={k} className="small grid-edit-width">
                {labels && k === 0 ? '1re col.' : `Col. ${labels ? k : k + 1}`}
                <input className="input" type="number" min={1} max={100} value={w} onChange={(e) => setWidth(k, e.target.value === '' ? null : Number(e.target.value))} />
              </label>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {!widths && (
            <Button size="sm" onClick={() => onChange({ ...t, widths: evenWidths(shown) })}>
              Fixer les largeurs
            </Button>
          )}
          {canCopy && (
            <Button size="sm" onClick={() => onChange({ ...t, widths: previous.widths?.length === shown ? [...previous.widths] : evenWidths(shown), span: previous.span })}>
              Aligner sur le tableau précédent
            </Button>
          )}
          {widths && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ ...t, widths: undefined })}>
              Revenir en automatique
            </Button>
          )}
        </div>
        {!canCopy && previous && <p className="muted small">Pour aligner ce tableau sur le précédent, donnez-lui le même nombre de colonnes.</p>}
      </div>

      <label className="row small" style={{ gap: 8 }}>
        <input type="checkbox" checked={!!t.tall} onChange={(e) => onChange({ ...t, tall: e.target.checked })} /> Cases hautes
      </label>
    </>
  );
}

function SectionFields({ s, previousTable, onChange }: { s: FicheSection; previousTable?: Table; onChange: (s: FicheSection) => void }) {
  const titleField = (
    <Field label="Titre (facultatif)">
      <TextInput value={('title' in s && s.title) || ''} onChange={(title) => onChange({ ...s, title } as FicheSection)} />
    </Field>
  );
  switch (s.type) {
    case 'table':
      return <TableFields t={s} previous={previousTable} onChange={onChange} />;
    case 'levels':
      return (
        <>
          {titleField}
          <ListField label="Critères" value={s.items} onChange={(items) => onChange({ ...s, items })} />
          <ListField label="Degrés" value={s.levels ?? []} onChange={(levels) => onChange({ ...s, levels })} />
        </>
      );
    case 'checks':
      return (
        <>
          {titleField}
          <ListField label="Cases" value={s.items} onChange={(items) => onChange({ ...s, items })} />
        </>
      );
    case 'lines':
    case 'box':
      return (
        <>
          {titleField}
          <Field label={s.type === 'box' ? 'Hauteur (en lignes)' : 'Nombre de lignes'}>
            <input className="input" type="number" min={1} max={s.type === 'box' ? 30 : 12} value={s.n ?? (s.type === 'box' ? 6 : 2)} onChange={(e) => onChange({ ...s, n: Number(e.target.value) })} />
          </Field>
        </>
      );
    case 'fields':
      return <ListField label="Champs" value={s.fields} onChange={(fields) => onChange({ ...s, fields })} />;
    case 'text':
      return (
        <Field label="Texte (**gras**, *italique*, « - » pour une liste)">
          <TextArea value={s.text} onChange={(text) => onChange({ ...s, text })} minRows={2} />
        </Field>
      );
    case 'heading':
      return (
        <Field label="Intertitre">
          <TextInput value={s.text} onChange={(text) => onChange({ ...s, text })} />
        </Field>
      );
  }
}

/** Modifier une fiche à la main : tout son contenu et sa mise en page, sans passer par Claude. */
export function FicheEditor({ sheet, onChange }: { sheet: CustomSheet; onChange: (s: CustomSheet) => void }) {
  const setSections = (sections: FicheSection[]) => onChange({ ...sheet, sections });
  const move = (i: number, by: number) => {
    const next = [...sheet.sections];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    setSections(next);
  };
  const previousTable = (i: number) => sheet.sections.slice(0, i).reverse().find((x): x is Table => x.type === 'table');
  return (
    <div className="stack">
      <Field label="Titre">
        <TextInput value={sheet.title} onChange={(title) => onChange({ ...sheet, title })} />
      </Field>
      <Field label="Format">
        <select className="input" value={sheet.size} onChange={(e) => onChange({ ...sheet, size: e.target.value as CustomSheet['size'] })}>
          <option value="half">Demi-page (2 fiches par A4)</option>
          <option value="full">Page entière</option>
        </select>
      </Field>
      <ListField label="Champs d'identification" value={sheet.ident} onChange={(ident) => onChange({ ...sheet, ident })} />
      <p className="muted small">Deux parties successives en « Moitié » (ou trois en « Un tiers ») se placent côte à côte.</p>
      {sheet.sections.map((s, i) => (
        <div key={i} className="card stack">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
            <strong>{LABELS[s.type]}</strong>
            <div className="row" style={{ gap: 2 }}>
              <select
                className="input input-sm"
                aria-label="Largeur de la partie"
                value={s.span ?? 'full'}
                onChange={(e) => setSections(sheet.sections.map((x, j) => (j === i ? { ...x, span: e.target.value as SectionSpan } : x)))}
              >
                {(Object.keys(SPAN_LABELS) as SectionSpan[]).map((k) => (
                  <option key={k} value={k}>
                    {SPAN_LABELS[k]}
                  </option>
                ))}
              </select>
              <IconButton label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={16} />
              </IconButton>
              <IconButton label="Descendre" disabled={i === sheet.sections.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={16} />
              </IconButton>
              <IconButton label="Retirer cette partie" onClick={() => setSections(sheet.sections.filter((_, j) => j !== i))}>
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
          <SectionFields s={s} previousTable={previousTable(i)} onChange={(next) => setSections(sheet.sections.map((x, j) => (j === i ? next : x)))} />
        </div>
      ))}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(LABELS) as FicheSection['type'][]).map((t) => (
          <Button key={t} size="sm" variant="ghost" onClick={() => setSections([...sheet.sections, structuredClone(BLANK[t])])}>
            + {LABELS[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}
