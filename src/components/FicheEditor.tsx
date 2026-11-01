import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { CustomSheet } from '../types';
import type { FicheSection } from '../lib/fiches';
import { Button, Field, IconButton, TextArea, TextInput } from './ui';

const LABELS: Record<FicheSection['type'], string> = {
  table: 'Tableau à remplir',
  levels: 'Critères par degré',
  checks: 'Cases à cocher',
  lines: 'Lignes d\'écriture',
  fields: 'Champs courts',
  text: 'Consigne',
};

const BLANK: Record<FicheSection['type'], FicheSection> = {
  table: { type: 'table', cols: [''], rows: [''] },
  levels: { type: 'levels', items: [''] },
  checks: { type: 'checks', items: [''] },
  lines: { type: 'lines', n: 2 },
  fields: { type: 'fields', fields: [''] },
  text: { type: 'text', text: '' },
};

/** Une liste à raison d'un élément par ligne. Les lignes vides restent le temps de la saisie. */
function ListField({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <Field label={`${label} (une par ligne)`}>
      <TextArea value={value.join('\n')} onChange={(v) => onChange(v.split('\n'))} minRows={2} />
    </Field>
  );
}

function SectionFields({ s, onChange }: { s: FicheSection; onChange: (s: FicheSection) => void }) {
  const titleField = (
    <Field label="Titre (facultatif)">
      <TextInput value={('title' in s && s.title) || ''} onChange={(title) => onChange({ ...s, title } as FicheSection)} />
    </Field>
  );
  switch (s.type) {
    case 'table':
      return (
        <>
          <Field label="En-tête de la première colonne (facultatif)">
            <TextInput value={s.head ?? ''} onChange={(head) => onChange({ ...s, head })} />
          </Field>
          <ListField label="Colonnes" value={s.cols} onChange={(cols) => onChange({ ...s, cols })} />
          <ListField label="Lignes" value={Array.isArray(s.rows) ? s.rows : Array.from({ length: s.rows }, () => '')} onChange={(rows) => onChange({ ...s, rows })} />
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={!!s.tall} onChange={(e) => onChange({ ...s, tall: e.target.checked })} /> Cases hautes
          </label>
        </>
      );
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
      return (
        <>
          {titleField}
          <Field label="Nombre de lignes">
            <input className="input" type="number" min={1} max={8} value={s.n ?? 2} onChange={(e) => onChange({ ...s, n: Number(e.target.value) })} />
          </Field>
        </>
      );
    case 'fields':
      return <ListField label="Champs" value={s.fields} onChange={(fields) => onChange({ ...s, fields })} />;
    case 'text':
      return (
        <Field label="Texte">
          <TextArea value={s.text} onChange={(text) => onChange({ ...s, text })} minRows={2} />
        </Field>
      );
  }
}

/** Modifier une fiche à la main : tout son contenu, sans passer par Claude. */
export function FicheEditor({ sheet, onChange }: { sheet: CustomSheet; onChange: (s: CustomSheet) => void }) {
  const setSections = (sections: FicheSection[]) => onChange({ ...sheet, sections });
  const move = (i: number, by: number) => {
    const next = [...sheet.sections];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    setSections(next);
  };
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
      {sheet.sections.map((s, i) => (
        <div key={i} className="card stack">
          <div className="row-between">
            <strong>{LABELS[s.type]}</strong>
            <div className="row" style={{ gap: 2 }}>
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
          <SectionFields s={s} onChange={(next) => setSections(sheet.sections.map((x, j) => (j === i ? next : x)))} />
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
