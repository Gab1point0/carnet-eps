import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { EvalBlock, EvalCriterion, EvalSheetSpec, CriterionKind } from '../lib/evalSheet';
import { critPoints, isScored, KIND_NAMES, LEVEL_NAMES, sheetProblems, tidyEvalSheet, withRefs } from '../lib/evalSheet';
import { FUNCTION_HELP, formatValue, parseValue, slugRef, type ScalePoint, type ValueFormat } from '../lib/evalCalc';
import { Button, Field, IconButton, NumberInput, TextArea, TextInput } from './ui';

const lines = (v: string) => v.split('\n');
const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** Zone de texte « une ligne = valeur ; nombre », relue à chaque frappe mais qui garde ce qu'on tape. */
function PairsArea({ initial, parse, placeholder, minRows = 2 }: { initial: string; parse: (text: string) => void; placeholder: string; minRows?: number }) {
  const [text, setText] = useState(initial);
  return (
    <TextArea
      value={text}
      onChange={(v) => {
        setText(v);
        parse(v);
      }}
      minRows={minRows}
      placeholder={placeholder}
    />
  );
}

const splitPair = (l: string) => {
  const i = l.lastIndexOf(';');
  return i < 0 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)];
};

/** Modèles de formules, comme les fonctions d'un tableur. */
const PRESETS: Array<{ label: string; make: (a: string, b: string) => string }> = [
  { label: 'Écart en %', make: (a, b) => `ABS(${a} - ${b}) / ${b} * 100` },
  { label: 'Différence', make: (a, b) => `${a} - ${b}` },
  { label: 'Pourcentage', make: (a, b) => `${a} / ${b} * 100` },
  { label: 'Meilleur essai', make: (a, b) => `MAX(${a}; ${b})` },
  { label: 'Moyenne', make: (a, b) => `MOYENNE(${a}; ${b})` },
  { label: 'Somme', make: (a, b) => `SOMME(${a}; ${b})` },
  { label: 'Si… alors…', make: (a) => `SI(${a} >= 10; 1; 0)` },
  { label: 'Vitesse (km/h)', make: (a, b) => `${a} / ${b} * 3,6` },
  { label: 'Par rapport au meilleur', make: (a) => `${a} / CLASSE_MAX(${a}) * 100` },
];

/** Modifier la fiche d'évaluation à la main, avec les outils d'un tableur : valeurs, formules, barèmes, listes, poids. */
export function EvalSheetEditor({ spec, onChange }: { spec: EvalSheetSpec; onChange: (s: EvalSheetSpec) => void }) {
  const setBlocks = (blocks: EvalBlock[]) => onChange({ ...spec, blocks });
  const setBlock = (i: number, p: Partial<EvalBlock>) => setBlocks(spec.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const setCrit = (bi: number, ci: number, p: Partial<EvalCriterion>) => setBlock(bi, { criteria: spec.blocks[bi].criteria.map((c, j) => (j === ci ? { ...c, ...p } : c)) });
  const move = <T,>(list: T[], i: number, by: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    return next;
  };
  const total = spec.blocks.reduce((s, b) => s + b.points, 0);
  const named = withRefs(spec);
  const refs = named.blocks.flatMap((b) => b.criteria.filter((c) => c.ref).map((c) => ({ ref: c.ref!, label: c.label, kind: c.kind })));
  const freeRef = (base: string) => {
    let r = slugRef(base || 'valeur');
    const used = new Set(refs.map((x) => x.ref));
    for (let i = 2; used.has(r); i++) r = `${slugRef(base || 'valeur')}_${i}`;
    return r;
  };
  /** Renommer une valeur la renomme aussi dans toutes les formules. */
  const renameRef = (bi: number, ci: number, next: string) => {
    const old = named.blocks[bi].criteria[ci].ref;
    const clean = next.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const re = old ? new RegExp(`\\b${old}\\b`, 'g') : null;
    setBlocks(
      spec.blocks.map((b, i) => ({
        ...b,
        criteria: b.criteria.map((c, j) => {
          if (i === bi && j === ci) return { ...c, ref: clean };
          return re && c.expr ? { ...c, expr: c.expr.replace(re, clean) } : c;
        }),
      })),
    );
  };
  const setKind = (bi: number, ci: number, kind: CriterionKind) => {
    const c = spec.blocks[bi].criteria[ci];
    const p: Partial<EvalCriterion> = { kind };
    if (kind !== 'text' && !c.ref) p.ref = freeRef(c.label);
    if ((kind === 'number' || kind === 'computed') && !c.scoring) p.scoring = { type: 'none' };
    if (kind === 'computed' && !c.expr) p.expr = '';
    if (kind === 'choice' && !c.options?.length) p.options = [{ label: 'Oui', pct: 100 }, { label: 'En partie', pct: 50 }, { label: 'Non', pct: 0 }];
    setCrit(bi, ci, p);
  };
  const problems = sheetProblems(named);

  return (
    <div className="stack">
      <Field label="Titre">
        <TextInput value={spec.title} onChange={(title) => onChange({ ...spec, title })} />
      </Field>
      {problems.length > 0 && (
        <div className="card error-text small" role="alert">
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
      {spec.blocks.map((b, bi) => (
        <div key={bi} className="card stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <TextInput value={b.name} onChange={(name) => setBlock(bi, { name })} aria-label="Nom du bloc" />
            <NumberInput value={b.points} min={0} max={20} onChange={(v) => setBlock(bi, { points: v ?? 0 })} aria-label="Points du bloc" style={{ width: 64 }} />
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
          {b.criteria.map((c, ci) => {
            const nc = named.blocks[bi].criteria[ci];
            const pts = critPoints(named.blocks[bi], nc);
            return (
              <div key={ci} className="eval-edit-crit stack" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <TextInput value={c.label} onChange={(label) => setCrit(bi, ci, { label })} placeholder="Intitulé (6 mots au plus)" aria-label="Critère" style={{ flex: '1 1 160px' }} />
                  <select className="input input-sm" value={c.kind} onChange={(e) => setKind(bi, ci, e.target.value as CriterionKind)} aria-label="Type de critère">
                    {(Object.keys(KIND_NAMES) as CriterionKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_NAMES[k]}
                      </option>
                    ))}
                  </select>
                  <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                    <IconButton label="Monter le critère" disabled={ci === 0} onClick={() => setBlock(bi, { criteria: move(b.criteria, ci, -1) })}>
                      <ArrowUp size={14} />
                    </IconButton>
                    <IconButton label="Descendre le critère" disabled={ci === b.criteria.length - 1} onClick={() => setBlock(bi, { criteria: move(b.criteria, ci, 1) })}>
                      <ArrowDown size={14} />
                    </IconButton>
                    <IconButton
                      label="Dupliquer le critère"
                      onClick={() => {
                        const copy = { ...c, label: `${c.label} (2)`, ...(c.ref ? { ref: freeRef(`${c.ref}_2`) } : {}) };
                        setBlock(bi, { criteria: [...b.criteria.slice(0, ci + 1), copy, ...b.criteria.slice(ci + 1)] });
                      }}
                    >
                      <Copy size={14} />
                    </IconButton>
                    <IconButton label="Retirer le critère" onClick={() => setBlock(bi, { criteria: b.criteria.filter((_, j) => j !== ci) })}>
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                </div>
                <TextArea
                  value={c.observe.join('\n')}
                  onChange={(v) => setCrit(bi, ci, { observe: lines(v) })}
                  minRows={c.kind === 'levels' ? 4 : 1}
                  placeholder={c.kind === 'levels' ? LEVEL_NAMES.map((n) => `${n} : ce qu'on observe`).join('\n') : c.kind === 'single' ? 'Réussi si…' : 'Ce qui est mesuré ou observé (facultatif)'}
                />

                {(c.kind === 'number' || c.kind === 'computed') && (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <label className="small row" style={{ gap: 4 }}>
                      Nom dans les calculs
                      <input className="input input-sm" style={{ width: 110 }} value={nc.ref ?? ''} onChange={(e) => renameRef(bi, ci, e.target.value)} />
                    </label>
                    <label className="small row" style={{ gap: 4 }}>
                      Unité
                      <input className="input input-sm" style={{ width: 70 }} value={c.unit ?? ''} placeholder="km/h" onChange={(e) => setCrit(bi, ci, { unit: e.target.value })} />
                    </label>
                    <select className="input input-sm" value={c.format ?? 'decimal'} onChange={(e) => setCrit(bi, ci, { format: e.target.value as ValueFormat })} aria-label="Format">
                      <option value="decimal">Nombre</option>
                      <option value="time">Chrono (min:s)</option>
                      {c.kind === 'number' && <option value="count">Compteur (− / +)</option>}
                    </select>
                    <label className="small row" style={{ gap: 4 }}>
                      Décimales
                      <NumberInput value={c.decimals ?? 2} min={0} max={4} onChange={(v) => setCrit(bi, ci, { decimals: v ?? 2 })} style={{ width: 54 }} />
                    </label>
                  </div>
                )}

                {c.kind === 'computed' && (
                  <div className="stack" style={{ gap: 6 }}>
                    <TextInput value={c.expr ?? ''} onChange={(expr) => setCrit(bi, ci, { expr })} placeholder="ABS(score1 - projet1) / projet1 * 100" aria-label="Formule" className="formula-input" />
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <span className="muted small">Valeurs :</span>
                      {refs
                        .filter((r) => r.ref !== nc.ref)
                        .map((r) => (
                          <button key={r.ref} type="button" className="chip chip-btn small" title={r.label} onClick={() => setCrit(bi, ci, { expr: `${c.expr ?? ''}${c.expr?.trim() ? ' ' : ''}${r.ref}` })}>
                            {r.ref}
                          </button>
                        ))}
                    </div>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <span className="muted small">Modèles :</span>
                      {PRESETS.map((p) => {
                        const others = refs.filter((r) => r.ref !== nc.ref && r.kind !== 'text').map((r) => r.ref);
                        return (
                          <button key={p.label} type="button" className="chip chip-btn small" onClick={() => setCrit(bi, ci, { expr: p.make(others[0] ?? 'a', others[1] ?? 'b') })}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    <label className="check small">
                      <input type="checkbox" checked={!!c.editable} onChange={(e) => setCrit(bi, ci, { editable: e.target.checked })} /> Modifiable à la main élève par élève (la valeur tapée remplace le calcul)
                    </label>
                    <details className="small">
                      <summary>Fonctions disponibles</summary>
                      <ul className="formula-help">
                        {FUNCTION_HELP.map(([f, d]) => (
                          <li key={f}>
                            <code className="formula">{f}</code> {d}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}

                {(c.kind === 'number' || c.kind === 'computed') && (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <span className="small">Points :</span>
                      <select
                        className="input input-sm"
                        value={c.scoring?.type ?? 'none'}
                        onChange={(e) => {
                          const type = e.target.value as 'none' | 'table' | 'rank';
                          setCrit(bi, ci, {
                            scoring: type === 'table' ? { type, points: c.scoring?.points?.length ? c.scoring.points : [{ at: 0, pct: 0 }, { at: 10, pct: 100 }], steps: c.scoring?.steps } : type === 'rank' ? { type, best: c.scoring?.best ?? 'high' } : { type },
                          });
                        }}
                        aria-label="Points"
                      >
                        <option value="none">Aucun (valeur d'appui)</option>
                        <option value="table">Barème (tableau de valeurs)</option>
                        <option value="rank">Rang dans la classe</option>
                      </select>
                      {c.scoring?.type === 'rank' && (
                        <select className="input input-sm" value={c.scoring.best ?? 'high'} onChange={(e) => setCrit(bi, ci, { scoring: { type: 'rank', best: e.target.value as 'high' | 'low' } })} aria-label="Meilleure valeur">
                          <option value="high">la plus grande valeur est la meilleure</option>
                          <option value="low">la plus petite valeur est la meilleure (chrono)</option>
                        </select>
                      )}
                    </div>
                    {c.scoring?.type === 'table' && (
                      <>
                        <span className="field-hint">
                          Une ligne par repère : « valeur ; % des points du critère » ({num(pts)} pt{pts > 1 ? 's' : ''} ici). Ex. « 5 ; 100 » puis « 20 ; 0 » : tous les points jusqu'à 5, plus rien à 20, et régulièrement entre les deux.
                        </span>
                        <PairsArea
                          key={`t${bi}-${ci}`}
                          initial={(c.scoring.points ?? []).map((p) => `${formatValue(p.at, c.format === 'time' ? 'time' : 'decimal', 3)} ; ${num(p.pct)}`).join('\n')}
                          placeholder={'5 ; 100\n20 ; 0'}
                          parse={(text) => {
                            const points: ScalePoint[] = lines(text)
                              .map(splitPair)
                              .map(([a, p]) => ({ at: parseValue(a, c.format === 'time' ? 'time' : 'decimal') ?? NaN, pct: parseValue(p) ?? NaN }))
                              .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.pct));
                            setCrit(bi, ci, { scoring: { ...c.scoring!, type: 'table', points } });
                          }}
                        />
                        <label className="check small">
                          <input type="checkbox" checked={!!c.scoring.steps} onChange={(e) => setCrit(bi, ci, { scoring: { ...c.scoring!, steps: e.target.checked } })} /> Par paliers (pas de points intermédiaires entre deux lignes)
                        </label>
                      </>
                    )}
                  </div>
                )}

                {c.kind === 'choice' && (
                  <>
                    <span className="field-hint">Une ligne par choix de la liste : « intitulé ; % des points du critère ».</span>
                    <PairsArea
                      key={`c${bi}-${ci}`}
                      initial={(c.options ?? []).map((o) => `${o.label} ; ${num(o.pct)}`).join('\n')}
                      placeholder={'Arbitre autonome ; 100\nArbitre aidé ; 50\nNe tient pas le rôle ; 0'}
                      minRows={3}
                      parse={(text) =>
                        setCrit(bi, ci, {
                          options: lines(text)
                            .map(splitPair)
                            .filter(([l]) => l.trim())
                            .map(([l, p]) => ({ label: l.trim(), pct: Math.max(0, Math.min(100, parseValue(p) ?? 0)) })),
                        })
                      }
                    />
                  </>
                )}

                {c.kind !== 'text' && (
                  <label className="small row" style={{ gap: 6 }}>
                    Poids dans le bloc
                    <NumberInput value={c.weight ?? 1} min={0} max={10} onChange={(v) => setCrit(bi, ci, { weight: v ?? 1 })} style={{ width: 60 }} />
                    <span className="muted">{isScored(nc) ? `= ${num(pts)} pt${pts > 1 ? 's' : ''} sur ${b.points}` : 'ne compte pas dans la note'}</span>
                  </label>
                )}
              </div>
            );
          })}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setBlock(bi, { criteria: [...b.criteria, { label: '', kind: 'levels', observe: [] }] })}>
              Critère
            </Button>
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setBlock(bi, { criteria: [...b.criteria, { label: 'Valeur', kind: 'number', observe: [], ref: freeRef('valeur'), scoring: { type: 'none' } }] })}>
              Valeur à saisir
            </Button>
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setBlock(bi, { criteria: [...b.criteria, { label: 'Calcul', kind: 'computed', observe: [], ref: freeRef('calcul'), expr: '', scoring: { type: 'none' } }] })}>
              Calcul
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
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label className="small row" style={{ gap: 6 }}>
          Arrondi de la note finale
          <select className="input input-sm" value={spec.rounding ?? 0.1} onChange={(e) => onChange({ ...spec, rounding: Number(e.target.value) })}>
            <option value={0.1}>au dixième</option>
            <option value={0.25}>au quart de point</option>
            <option value={0.5}>au demi-point</option>
            <option value={1}>au point</option>
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={!!spec.cap} onChange={(e) => onChange({ ...spec, cap: e.target.checked })} /> Plafonner à 20 (bonus compris)
        </label>
      </div>
      <Field label="Attendus visés (un par ligne)">
        <TextArea value={spec.expectations.join('\n')} onChange={(v) => onChange({ ...spec, expectations: lines(v) })} minRows={2} />
      </Field>
      <Field label="Notes sur les choix faits">
        <TextArea value={spec.notes} onChange={(notes) => onChange({ ...spec, notes })} minRows={2} />
      </Field>
    </div>
  );
}

/** Lignes laissées vides pendant la saisie : retirées avant d'utiliser la fiche ; noms des calculs fixés. */
export function cleanEvalSheet(s: EvalSheetSpec): EvalSheetSpec {
  const keep = (v: string[]) => v.map((x) => x.trim()).filter(Boolean);
  const out = withRefs({
    ...s,
    blocks: s.blocks
      .map((b) => ({ ...b, name: b.name.trim() || 'Bloc', criteria: b.criteria.filter((c) => c.label.trim()).map((c) => ({ ...c, label: c.label.trim(), observe: keep(c.observe) })) }))
      .filter((b) => b.criteria.length),
    bonus: s.bonus.filter((b) => b.label.trim()).map((b) => ({ ...b, label: b.label.trim() })),
    expectations: keep(s.expectations),
  });
  // Même nettoyage que pour une fiche venue de Claude, sans toucher au barème choisi à la main.
  const tidy = tidyEvalSheet(out);
  return { ...tidy, blocks: tidy.blocks.map((b, i) => ({ ...b, points: out.blocks[i]?.points ?? b.points })) };
}
