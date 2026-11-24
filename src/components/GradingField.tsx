import { Plus, X } from 'lucide-react';
import type { Grading } from '../types';
import { LEVELS } from '../lib/levels';
import { classAverage } from '../lib/grading';
import { Button, IconButton, NumberInput } from './ui';

const n = (v: string) => Math.max(0, Math.round(Number(v) || 0));

/**
 * Résultats d'une évaluation, sans nom d'élève : pour chaque critère, combien d'élèves à chaque degré,
 * et la note sur 20 de chaque degré. Donne la moyenne de la classe (utile pour École Directe).
 */
export function GradingField({ value, onChange }: { value: Grading; onChange: (g: Grading) => void }) {
  const avg = classAverage(value);
  const setCriterion = (i: number, p: Partial<Grading['criteria'][number]>) => onChange({ ...value, criteria: value.criteria.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="grading-wrap">
        <table className="grading">
          <thead>
            <tr>
              <th>Critère</th>
              {LEVELS.map((lv) => (
                <th key={lv.label} style={{ color: lv.color }}>
                  {lv.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {value.criteria.map((c, i) => (
              <tr key={i}>
                <td>
                  <input className="input" value={c.label} placeholder={`Critère ${i + 1}`} onChange={(e) => setCriterion(i, { label: e.target.value })} />
                </td>
                {c.counts.map((k, j) => (
                  <td key={j}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={k || ''}
                      placeholder="0"
                      aria-label={`${c.label || `Critère ${i + 1}`} : élèves ${LEVELS[j].label}`}
                      onChange={(e) => setCriterion(i, { counts: c.counts.map((x, m) => (m === j ? n(e.target.value) : x)) as Grading['criteria'][number]['counts'] })}
                    />
                  </td>
                ))}
                <td>
                  <IconButton label="Retirer ce critère" disabled={value.criteria.length < 2} onClick={() => onChange({ ...value, criteria: value.criteria.filter((_, j) => j !== i) })}>
                    <X size={15} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="muted small">Note du degré (/20)</td>
              {value.scale.map((p, j) => (
                <td key={j}>
                  <NumberInput
                    min={0}
                    max={20}
                    step={0.5}
                    value={p}
                    aria-label={`Note sur 20 du degré ${LEVELS[j].label}`}
                    onChange={(v) => onChange({ ...value, scale: value.scale.map((x, m) => (m === j ? Math.min(20, v ?? 0) : x)) as Grading['scale'] })}
                  />
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="row-between">
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onChange({ ...value, criteria: [...value.criteria, { label: '', counts: [0, 0, 0, 0] }] })}>
          Critère
        </Button>
        <strong>{avg === null ? 'Moyenne : —' : `Moyenne de la classe : ${String(avg).replace('.', ',')}/20`}</strong>
      </div>
    </div>
  );
}
