import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatValue, parseValue } from '../lib/evalCalc';
import { LEVEL_NAMES, type EvalCriterion } from '../lib/evalSheet';
import { cls } from '../lib/util';

// Cases de la fiche à remplir, une par type de critère.

export const LEVEL_SHORT = ['D', 'EC', 'A', 'Av'];
export const LEVEL_COLORS = ['#e5484d', '#f5a524', '#e2c200', '#30a46c'];
/** Couleur d'une part des points (0 à 1), comme les 4 niveaux. */
export const fracColor = (f: number) => LEVEL_COLORS[f < 0.25 ? 0 : f < 0.5 ? 1 : f < 0.75 ? 2 : 3];

/** 4 boutons Débutant → Avancé : toucher un niveau le choisit, toucher à nouveau le niveau choisi l'efface. */
export function LevelPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="lvl-pick" role="group" aria-label={label}>
      {LEVEL_SHORT.map((s, i) => (
        <button
          key={s}
          type="button"
          className={cls('lvl-btn', value > i && 'lvl-on')}
          style={{ ['--lvl' as string]: LEVEL_COLORS[Math.max(0, value - 1)] }}
          aria-pressed={value === i + 1}
          title={LEVEL_NAMES[i]}
          onClick={() => onChange(value === i + 1 ? 0 : i + 1)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function Check({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <button type="button" className={cls('lvl-btn', 'lvl-single', value > 0 && 'lvl-on')} style={{ ['--lvl' as string]: LEVEL_COLORS[3] }} aria-pressed={value > 0} aria-label={label} onClick={() => onChange(value ? 0 : 1)}>
      ✓
    </button>
  );
}

/** Valeur à saisir : nombre (virgule acceptée), chrono (3:25) ou compteur avec − et +. Gardée dès qu'elle est lisible. */
export function NumberCell({ c, value, frac, onChange, label }: { c: EvalCriterion; value: number | undefined; frac?: number; onChange: (v: number | null) => void; label: string }) {
  const format = c.format ?? 'decimal';
  const shown = formatValue(value ?? null, format, c.decimals ?? 2);
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(shown);
  }, [shown, focus]);
  const bad = text.trim() !== '' && parseValue(text, format) === null;
  const input = (
    <input
      className={cls('input', 'num-cell', bad && 'num-bad')}
      style={frac !== undefined && value !== undefined ? { ['--frac' as string]: fracColor(frac) } : undefined}
      data-scored={frac !== undefined && value !== undefined ? '' : undefined}
      inputMode={format === 'time' ? 'text' : 'decimal'}
      placeholder={format === 'time' ? 'm:ss' : c.unit ?? ''}
      value={text}
      aria-label={label}
      aria-invalid={bad || undefined}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        setText(shown);
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseValue(e.target.value, format);
        if (e.target.value.trim() === '') onChange(null);
        else if (v !== null) onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
  if (format !== 'count') return input;
  return (
    <span className="num-count">
      <button type="button" className="lvl-btn" aria-label={`${label} : moins 1`} onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}>
        <Minus size={14} />
      </button>
      {input}
      <button type="button" className="lvl-btn" aria-label={`${label} : plus 1`} onClick={() => onChange((value ?? 0) + 1)}>
        <Plus size={14} />
      </button>
    </span>
  );
}

/** Valeur calculée : lecture seule, colorée selon les points si elle en rapporte. */
export function ComputedCell({ c, value, frac }: { c: EvalCriterion; value: number | null; frac?: number }) {
  if (value === null) return <span className="calc-cell muted">—</span>;
  return (
    <span className={cls('calc-cell', frac !== undefined && 'calc-scored')} style={frac !== undefined ? { ['--frac' as string]: fracColor(frac) } : undefined} title={c.expr}>
      {formatValue(value, c.format ?? 'decimal', c.decimals ?? 2)}
      {c.unit && c.format !== 'time' ? <span className="calc-unit"> {c.unit}</span> : null}
    </span>
  );
}

/**
 * Valeur calculée mais modifiable (projet d'après la VMA…) : affiche le calcul en italique ; taper une valeur la remplace
 * pour cet élève ; ↺ revient au calcul.
 */
export function EditableComputedCell({
  c,
  value,
  forced,
  frac,
  onChange,
  label,
}: {
  c: EvalCriterion;
  value: number | null;
  forced: boolean;
  frac?: number;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const format = c.format === 'time' ? 'time' : 'decimal';
  const shown = formatValue(value, format, c.decimals ?? 2);
  const [text, setText] = useState(shown);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(shown);
  }, [shown, focus]);
  const bad = text.trim() !== '' && parseValue(text, format) === null;
  return (
    <span className="num-count">
      <input
        className={cls('input', 'num-cell', !forced && 'num-calc', bad && 'num-bad')}
        style={frac !== undefined && value !== null ? { ['--frac' as string]: fracColor(frac) } : undefined}
        data-scored={frac !== undefined && value !== null ? '' : undefined}
        inputMode={format === 'time' ? 'text' : 'decimal'}
        placeholder="—"
        value={text}
        title={forced ? 'Valeur modifiée à la main' : `Calcul : ${c.expr ?? ''}`}
        aria-label={label}
        aria-invalid={bad || undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setText(shown);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseValue(e.target.value, format);
          if (e.target.value.trim() === '') onChange(null);
          else if (v !== null) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {forced && (
        <button type="button" className="lvl-btn" title="Revenir au calcul" aria-label={`${label} : revenir au calcul`} onClick={() => onChange(null)}>
          ↺
        </button>
      )}
    </span>
  );
}

export function ChoiceCell({ c, value, onChange, label }: { c: EvalCriterion; value: number | undefined; onChange: (v: number) => void; label: string }) {
  const o = value ? c.options?.[value - 1] : undefined;
  return (
    <select
      className="input input-sm choice-cell"
      style={o ? { ['--frac' as string]: fracColor(o.pct / 100) } : undefined}
      data-scored={o ? '' : undefined}
      value={value ?? 0}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value={0}>—</option>
      {(c.options ?? []).map((op, i) => (
        <option key={i} value={i + 1}>
          {op.label}
        </option>
      ))}
    </select>
  );
}

export function TextCell({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <input className="input input-sm text-cell" value={value} placeholder="…" aria-label={label} onChange={(e) => onChange(e.target.value)} />;
}
