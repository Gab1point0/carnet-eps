import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { EvalBlock, EvalCriterion, EvalSheetSpec } from '../lib/evalSheet';
import { LEVEL_NAMES } from '../lib/evalSheet';
import { Button, Field, IconButton, NumberInput, TextArea, TextInput } from './ui';

const lines = (v: string) => v.split('\n');

/** Modifier la fiche d'évaluation à la main : blocs, points, critères (4 cases ou 1 case), bonus, attendus. */
export function EvalSheetEditor({ spec, onChange }: { spec: EvalSheetSpec; onChange: (s: EvalSheetSpec) => void }) {
  const setBlocks = (blocks: EvalBlock[]) => onChange({ ...spec, blocks });
  const setBlock = (i: number, p: Partial<EvalBlock>) => setBlocks(spec.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const setCrit = (bi: number, ci: number, p: Partial<EvalCriterion>) =>
    setBlock(bi, { criteria: spec.blocks[bi].criteria.map((c, j) => (j === ci ? { ...c, ...p } : c)) });
  const move = <T,>(list: T[], i: number, by: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    return next;
  };
  const total = spec.blocks.reduce((s, b) => s + b.points, 0);

  return (
    <div className="stack">
      <Field label="Titre">
        <TextInput value={spec.title} onChange={(title) => onChange({ ...spec, title })} />
      </Field>
      {spec.blocks.map((b, bi) => (
        <div key={bi} className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <TextInput value={b.name} onChange={(name) => setBlock(bi, { name })} aria-label="Nom du bloc" />
            <NumberInput value={b.points} min={0} max={20} onChange={(v) => setBlock(bi, { points: v ?? 0 })} aria-label="Points du bloc" />
            <span className="muted small">pts</span>
            <IconButton label="Monter le bloc" disabled={bi === 0} onClick={() => setBlocks(move(spec.blocks, bi, -1))}>
              <ArrowUp size={15} />
            </IconButton>
            <IconButton label="Descendre le bloc" disabled={bi === spec.blocks.length - 1} onClick={() => setBlocks(move(spec.blocks, bi, 1))}>
              <ArrowDown size={15} />
            </IconButton>
            <IconButton label="Retirer le bloc" onClick={() => setBlocks(spec.blocks.filter((_, j) => j !== bi))}>
              <Trash2 size={15} />
            </IconButton>
          </div>
          {b.criteria.map((c, ci) => (
            <div key={ci} className="eval-edit-crit stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <TextInput value={c.label} onChange={(label) => setCrit(bi, ci, { label })} placeholder="Critère (6 mots au plus)" aria-label="Critère" />
                <select className="input input-sm" value={c.kind} onChange={(e) => setCrit(bi, ci, { kind: e.target.value as EvalCriterion['kind'] })} aria-label="Type de critère">
                  <option value="levels">4 cases</option>
                  <option value="single">1 case</option>
                </select>
                <IconButton label="Retirer le critère" onClick={() => setBlock(bi, { criteria: b.criteria.filter((_, j) => j !== ci) })}>
                  <Trash2 size={15} />
                </IconButton>
              </div>
              <TextArea
                value={c.observe.join('\n')}
                onChange={(v) => setCrit(bi, ci, { observe: lines(v) })}
                minRows={c.kind === 'levels' ? 4 : 1}
                placeholder={c.kind === 'levels' ? LEVEL_NAMES.map((n) => `${n} : ce qu'on observe`).join('\n') : 'Réussi si…'}
              />
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setBlock(bi, { criteria: [...b.criteria, { label: '', kind: 'levels', observe: [] }] })}>
              Critère
            </Button>
          </div>
        </div>
      ))}
      <div className="row-between">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setBlocks([...spec.blocks, { name: 'Nouveau bloc', points: 0, criteria: [{ label: '', kind: 'levels', observe: [] }] }])}>
          Bloc
        </Button>
        <span className={total === 20 ? 'muted small' : 'error-text small'}>Total : {total}/20</span>
      </div>
      <Field label="Bonus (une ligne par bonus : intitulé ; points)">
        <TextArea
          value={spec.bonus.map((b) => `${b.label} ; ${b.points}`).join('\n')}
          onChange={(v) =>
            onChange({
              ...spec,
              bonus: lines(v).map((l) => {
                const [label, pts] = l.split(';');
                return { label: label ?? '', points: Number((pts ?? '').replace(',', '.')) || 0 };
              }),
            })
          }
          minRows={1}
          placeholder="Progrès depuis le diagnostic ; 1"
        />
      </Field>
      <Field label="Attendus visés (un par ligne)">
        <TextArea value={spec.expectations.join('\n')} onChange={(v) => onChange({ ...spec, expectations: lines(v) })} minRows={2} />
      </Field>
      <Field label="Notes sur les choix faits">
        <TextArea value={spec.notes} onChange={(notes) => onChange({ ...spec, notes })} minRows={2} />
      </Field>
    </div>
  );
}

/** Lignes laissées vides pendant la saisie : retirées avant d'utiliser la fiche. */
export function cleanEvalSheet(s: EvalSheetSpec): EvalSheetSpec {
  const keep = (v: string[]) => v.map((x) => x.trim()).filter(Boolean);
  return {
    ...s,
    blocks: s.blocks
      .map((b) => ({ ...b, name: b.name.trim() || 'Bloc', criteria: b.criteria.filter((c) => c.label.trim()).map((c) => ({ ...c, label: c.label.trim(), observe: keep(c.observe) })) }))
      .filter((b) => b.criteria.length),
    bonus: s.bonus.filter((b) => b.label.trim()).map((b) => ({ ...b, label: b.label.trim() })),
    expectations: keep(s.expectations),
  };
}
