import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Eye,
  EyeOff,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
  Check,
  MoveUpRight,
} from 'lucide-react';
import type { Animation, Arrow, ArrowStyle, CourtId, Frame, ID, Token, TokenKind } from '../types';
import { COURT_DEFS } from './courts';
import {
  addToken,
  arrowLength,
  createFrame,
  duplicateToken,
  makeToken,
  nextPlayerLabel,
  removeToken,
  resolveFrame,
  sanitizeAnimation,
  TOKEN_LABELS,
} from './engine';
import { Stage, TokenIcon } from './Stage';
import { AnimationPlayer } from './Player';
import { Button, ColorSwatches, Field, IconButton, Select, TextArea, TextInput } from '../components/ui';
import { COURTS, TOKEN_COLORS } from '../lib/defaults';
import { clamp, cls, uid } from '../lib/util';

interface Props {
  value: Animation;
  onChange: (a: Animation) => void;
  onClose: () => void;
  title?: string;
}

type Mode = 'move' | 'arrow' | 'preview';

const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#eab308', '#111827', '#e5e7eb'];
const OBJECT_KINDS: TokenKind[] = ['ball', 'cone', 'hoop', 'goal', 'mat', 'bench', 'text'];
const ARROW_STYLES: Array<{ id: ArrowStyle; label: string }> = [
  { id: 'move', label: 'Déplacement' },
  { id: 'pass', label: 'Passe' },
  { id: 'dribble', label: 'Dribble' },
  { id: 'shoot', label: 'Tir' },
  { id: 'line', label: 'Ligne' },
];
const ARROW_COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f97316', '#ffffff'];

type Drag =
  | { kind: 'token'; id: ID; offX: number; offY: number }
  | { kind: 'arrow'; x1: number; y1: number }
  | null;

interface History {
  past: Animation[];
  future: Animation[];
}

export function AnimationEditor({ value, onChange, onClose, title }: Props) {
  const base = useMemo(() => sanitizeAnimation(value), [value]);
  const [draft, setDraft] = useState<Animation | null>(null);
  const anim = draft ?? base;
  const [frameIdx, setFrameIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('move');
  const [selTok, setSelTok] = useState<ID | null>(null);
  const [selArrow, setSelArrow] = useState<ID | null>(null);
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle>('move');
  const [arrowColor, setArrowColor] = useState('#111827');
  const [draftArrow, setDraftArrow] = useState<Arrow | null>(null);
  const [showNext, setShowNext] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag>(null);
  const history = useRef<History>({ past: [], future: [] });
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  const idx = clamp(frameIdx, 0, anim.frames.length - 1);
  const frame = anim.frames[idx];
  const def = COURT_DEFS[anim.court] ?? COURT_DEFS.blank;
  const resolved = useMemo(() => resolveFrame(anim.tokens, frame), [anim.tokens, frame]);
  const nextFrame = anim.frames[idx + 1];
  const ghost = useMemo(
    () => (showNext && nextFrame && mode !== 'preview' ? resolveFrame(anim.tokens, nextFrame) : null),
    [showNext, nextFrame, anim.tokens, mode],
  );
  const token = anim.tokens.find((t) => t.id === selTok) ?? null;
  const arrow = frame.arrows.find((a) => a.id === selArrow) ?? null;

  // ── Historique ────────────────────────────────────────────────────────────

  const commit = (next: Animation) => {
    history.current = { past: [...history.current.past.slice(-79), base], future: [] };
    onChange(next);
    rerender();
  };
  const undo = () => {
    const h = history.current;
    const prev = h.past[h.past.length - 1];
    if (!prev) return;
    history.current = { past: h.past.slice(0, -1), future: [base, ...h.future] };
    onChange(prev);
    rerender();
  };
  const redo = () => {
    const h = history.current;
    const next = h.future[0];
    if (!next) return;
    history.current = { past: [...h.past, base], future: h.future.slice(1) };
    onChange(next);
    rerender();
  };

  const patchFrame = (i: number, p: Partial<Frame>, src: Animation = anim): Animation => ({
    ...src,
    frames: src.frames.map((f, k) => (k === i ? { ...f, ...p } : f)),
  });

  const setTokenPos = (src: Animation, id: ID, x: number, y: number): Animation => {
    const f = src.frames[idx];
    const p = f.pos[id];
    if (!p) return src;
    let next = { ...p, x, y };
    if (p.carry) {
      const carrier = resolveFrame(src.tokens, f)[p.carry];
      if (carrier) next = { ...p, dx: x - carrier.x, dy: y - carrier.y };
    }
    return patchFrame(idx, { pos: { ...f.pos, [id]: next } }, src);
  };

  const patchPos = (id: ID, p: Partial<Frame['pos'][string]>) => {
    commit(patchFrame(idx, { pos: { ...frame.pos, [id]: { ...frame.pos[id], ...p } } }));
  };

  const patchToken = (id: ID, p: Partial<Token>) => {
    commit({ ...anim, tokens: anim.tokens.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  };

  // ── Interactions sur la scène ─────────────────────────────────────────────

  const toPct = (e: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 50, y: 50 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: clamp((p.x / def.w) * 100, -3, 103), y: clamp((p.y / def.h) * 100, -3, 103) };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === 'preview') return;
    const target = e.target as Element;
    const tokEl = target.closest('[data-token]');
    const arrEl = target.closest('[data-arrow]');
    const pct = toPct(e);
    if (mode === 'move') {
      if (tokEl) {
        const id = tokEl.getAttribute('data-token')!;
        const r = resolved[id];
        setSelTok(id);
        setSelArrow(null);
        dragRef.current = { kind: 'token', id, offX: (r?.x ?? pct.x) - pct.x, offY: (r?.y ?? pct.y) - pct.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (arrEl) {
        setSelArrow(arrEl.getAttribute('data-arrow'));
        setSelTok(null);
      } else {
        setSelTok(null);
        setSelArrow(null);
      }
    } else if (mode === 'arrow') {
      const id = tokEl?.getAttribute('data-token');
      const start = id && resolved[id] ? { x: resolved[id].x, y: resolved[id].y } : pct;
      dragRef.current = { kind: 'arrow', x1: start.x, y1: start.y };
      setDraftArrow({ id: 'draft', x1: start.x, y1: start.y, x2: pct.x, y2: pct.y, style: arrowStyle, color: arrowColor });
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const pct = toPct(e);
    if (d.kind === 'token') {
      setDraft(setTokenPos(base, d.id, clamp(pct.x + d.offX, -3, 103), clamp(pct.y + d.offY, -3, 103)));
    } else {
      setDraftArrow((a) => (a ? { ...a, x2: pct.x, y2: pct.y } : a));
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.kind === 'token') {
      if (draft) commit(draft);
      setDraft(null);
    } else if (draftArrow) {
      let { x2, y2 } = draftArrow;
      // Si l'on relâche sur un jeton, la flèche s'accroche à son centre.
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-token]');
      const underId = under?.getAttribute('data-token');
      if (underId && resolved[underId]) {
        x2 = resolved[underId].x;
        y2 = resolved[underId].y;
      }
      setDraftArrow(null);
      const a: Arrow = { ...draftArrow, id: uid(), x2, y2 };
      if (arrowLength(a) > 3) {
        commit(patchFrame(idx, { arrows: [...frame.arrows, a] }));
        setSelArrow(a.id);
      }
    }
  };

  // ── Opérations ────────────────────────────────────────────────────────────

  const addNew = (kind: TokenKind, color: string) => {
    const label = kind === 'player' ? nextPlayerLabel(anim, color) : kind === 'text' ? 'Texte' : '';
    const t = makeToken(kind, color, label);
    commit(addToken(anim, t));
    setSelTok(t.id);
    setSelArrow(null);
    setMode('move');
  };

  const deleteSelected = () => {
    if (token) {
      commit(removeToken(anim, token.id));
      setSelTok(null);
    } else if (arrow) {
      commit(patchFrame(idx, { arrows: frame.arrows.filter((a) => a.id !== arrow.id) }));
      setSelArrow(null);
    }
  };

  const addFrame = () => {
    const f = createFrame(anim.tokens, frame);
    // Les liens « porté par » sont conservés, mais pas les flèches.
    const frames = [...anim.frames.slice(0, idx + 1), f, ...anim.frames.slice(idx + 1)];
    commit({ ...anim, frames });
    setFrameIdx(idx + 1);
  };

  const deleteFrame = () => {
    if (anim.frames.length <= 1) return;
    commit({ ...anim, frames: anim.frames.filter((_, i) => i !== idx) });
    setFrameIdx(Math.max(0, idx - 1));
  };

  const moveFrame = (dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= anim.frames.length) return;
    const frames = [...anim.frames];
    [frames[idx], frames[j]] = [frames[j], frames[idx]];
    commit({ ...anim, frames });
    setFrameIdx(j);
  };

  // Raccourcis clavier
  const keyRef = useRef({ undo, redo, deleteSelected });
  keyRef.current = { undo, redo, deleteSelected };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        (e.shiftKey ? keyRef.current.redo : keyRef.current.undo)();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        keyRef.current.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault();
        keyRef.current.deleteSelected();
      } else if (e.key === 'Escape' && !typing) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const carriers = anim.tokens.filter((t) => (t.kind === 'player' || t.kind === 'coach') && t.id !== selTok);
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const hasRotation = token && ['goal', 'mat', 'bench', 'text'].includes(token.kind);

  return createPortal(
    <div className="ae" role="dialog" aria-modal="true" aria-label="Éditeur d'animation">
      <div className="ae-top">
        <div className="ae-top-left">
          <strong className="ae-title">{title || 'Animation'}</strong>
          <Select<CourtId>
            className="ae-court"
            value={anim.court}
            onChange={(v) => v && commit({ ...anim, court: v })}
            options={COURTS.map((c) => ({ value: c.id, label: c.label }))}
          />
        </div>
        <div className="ae-modes" role="group" aria-label="Outil">
          <button type="button" className={cls('seg', mode === 'move' && 'seg-on')} onClick={() => setMode('move')}>
            <MousePointer2 size={16} /> <span>Déplacer</span>
          </button>
          <button type="button" className={cls('seg', mode === 'arrow' && 'seg-on')} onClick={() => { setMode('arrow'); setSelTok(null); }}>
            <MoveUpRight size={16} /> <span>Flèches</span>
          </button>
          <button type="button" className={cls('seg', mode === 'preview' && 'seg-on')} onClick={() => { setMode('preview'); setSelTok(null); setSelArrow(null); }}>
            <Play size={16} /> <span>Aperçu</span>
          </button>
        </div>
        <div className="ae-top-right">
          <IconButton label="Annuler (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 size={19} />
          </IconButton>
          <IconButton label="Rétablir (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
            <Redo2 size={19} />
          </IconButton>
          <Button variant="primary" icon={<Check size={17} />} onClick={onClose}>
            Terminer
          </Button>
        </div>
      </div>

      <div className="ae-body">
        <div className="ae-main">
          <div className="ae-stage">
            {mode === 'preview' ? (
              <AnimationPlayer animation={anim} autoPlay maxHeight="62vh" />
            ) : (
              <>
                <Stage
                  court={anim.court}
                  tokens={anim.tokens}
                  rendered={resolved}
                  arrows={frame.arrows}
                  ghost={ghost}
                  selectedTokenId={selTok}
                  selectedArrowId={selArrow}
                  draftArrow={draftArrow}
                  revealHidden
                  svgRef={svgRef}
                  className={cls('stage-edit', mode === 'arrow' && 'stage-arrow')}
                  style={{ maxHeight: '62vh' }}
                  svgProps={{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }}
                />
                {!anim.tokens.length && (
                  <div className="ae-hint">Ajoutez des joueurs, un ballon ou du matériel depuis la palette →</div>
                )}
              </>
            )}
          </div>

          <div className="ae-frames" aria-label="Étapes">
            {anim.frames.map((f, i) => (
              <button
                key={f.id}
                type="button"
                className={cls('ae-frame', i === idx && 'ae-frame-on')}
                onClick={() => {
                  setFrameIdx(i);
                  setSelArrow(null);
                  if (mode === 'preview') setMode('move');
                }}
              >
                <Stage court={anim.court} tokens={anim.tokens} rendered={resolveFrame(anim.tokens, f)} arrows={f.arrows} className="ae-thumb" />
                <span className="ae-frame-n">{i + 1}</span>
              </button>
            ))}
            <button type="button" className="ae-frame ae-frame-add" onClick={addFrame} aria-label="Ajouter une étape">
              <Plus size={22} />
              <span>Étape</span>
            </button>
          </div>
        </div>

        <aside className="ae-side">
          {mode === 'arrow' && (
            <section className="ae-panel">
              <h3>Tracer une flèche</h3>
              <p className="muted small">Glissez sur le terrain. Partir d'un joueur ou finir sur un joueur accroche la flèche.</p>
              <div className="ae-chips">
                {ARROW_STYLES.map((s) => (
                  <button key={s.id} type="button" className={cls('chip chip-btn', arrowStyle === s.id && 'chip-active')} onClick={() => setArrowStyle(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <ColorSwatches value={arrowColor} onChange={setArrowColor} colors={ARROW_COLORS} />
            </section>
          )}

          {arrow && (
            <section className="ae-panel">
              <h3>Flèche sélectionnée</h3>
              <Select<ArrowStyle>
                value={arrow.style}
                onChange={(v) => v && commit(patchFrame(idx, { arrows: frame.arrows.map((a) => (a.id === arrow.id ? { ...a, style: v } : a)) }))}
                options={ARROW_STYLES.map((s) => ({ value: s.id, label: s.label }))}
              />
              <ColorSwatches
                value={arrow.color}
                onChange={(c) => commit(patchFrame(idx, { arrows: frame.arrows.map((a) => (a.id === arrow.id ? { ...a, color: c } : a)) }))}
                colors={ARROW_COLORS}
              />
              <Button variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={deleteSelected}>
                Supprimer la flèche
              </Button>
            </section>
          )}

          {token && (
            <section className="ae-panel ae-panel-sel">
              <h3>
                {TOKEN_LABELS[token.kind]} <span className="muted small">sélectionné</span>
              </h3>
              {(token.kind === 'player' || token.kind === 'text' || token.kind === 'coach') && (
                <Field label={token.kind === 'text' ? 'Texte' : 'Numéro / lettre'}>
                  <TextInput value={token.label} maxLength={token.kind === 'text' ? 40 : 3} onChange={(v) => patchToken(token.id, { label: v })} />
                </Field>
              )}
              <div className="field">
                <span className="field-label">Couleur</span>
                <ColorSwatches value={token.color} onChange={(c) => patchToken(token.id, { color: c })} colors={TOKEN_COLORS} />
              </div>
              <label className="field">
                <span className="field-label">Taille ({token.size.toFixed(1)}×)</span>
                <input type="range" min={0.5} max={2.5} step={0.1} value={token.size} onChange={(e) => patchToken(token.id, { size: Number(e.target.value) })} />
              </label>
              {hasRotation && (
                <label className="field">
                  <span className="field-label">Rotation ({Math.round(frame.pos[token.id]?.rot ?? 0)}°)</span>
                  <input type="range" min={0} max={345} step={15} value={frame.pos[token.id]?.rot ?? 0} onChange={(e) => patchPos(token.id, { rot: Number(e.target.value) })} />
                </label>
              )}
              {token.kind !== 'player' && token.kind !== 'coach' && carriers.length > 0 && (
                <Field label="Porté / conduit par (à cette étape)">
                  <Select<string>
                    value={frame.pos[token.id]?.carry ?? ''}
                    onChange={(v) => {
                      if (!v) patchPos(token.id, { carry: undefined, dx: undefined, dy: undefined });
                      else {
                        const c = resolved[v];
                        const me = resolved[token.id];
                        const near = c && me && Math.hypot(me.x - c.x, me.y - c.y) < 9;
                        patchPos(token.id, { carry: v, dx: near ? me.x - c.x : 2.4, dy: near ? me.y - c.y : 0 });
                      }
                    }}
                    placeholder="— Personne —"
                    options={carriers.map((c) => ({ value: c.id, label: `${TOKEN_LABELS[c.kind]} ${c.label}`.trim() }))}
                  />
                </Field>
              )}
              <div className="ae-row">
                <Button size="sm" icon={frame.pos[token.id]?.hidden ? <Eye size={15} /> : <EyeOff size={15} />} onClick={() => patchPos(token.id, { hidden: !frame.pos[token.id]?.hidden })}>
                  {frame.pos[token.id]?.hidden ? 'Afficher' : 'Masquer'} à cette étape
                </Button>
              </div>
              <div className="ae-row">
                <Button size="sm" icon={<Copy size={15} />} onClick={() => commit(duplicateToken(anim, token.id))}>
                  Dupliquer
                </Button>
                <Button variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={deleteSelected}>
                  Supprimer
                </Button>
              </div>
            </section>
          )}

          <section className="ae-panel">
            <h3>Ajouter</h3>
            <div className="ae-palette">
              {PLAYER_COLORS.map((c) => (
                <button key={c} type="button" className="ae-pal" onClick={() => addNew('player', c)} title="Ajouter un joueur">
                  <TokenIcon kind="player" color={c} label="1" />
                </button>
              ))}
              <button type="button" className="ae-pal" onClick={() => addNew('coach', '#111827')} title="Enseignant">
                <TokenIcon kind="coach" color="#111827" label="P" />
              </button>
              {OBJECT_KINDS.map((k) => (
                <button key={k} type="button" className="ae-pal" onClick={() => addNew(k, makeToken(k, '#000').color)} title={TOKEN_LABELS[k]}>
                  <TokenIcon kind={k} color={makeToken(k, '#000').color} label={k === 'text' ? 'Aa' : ''} />
                </button>
              ))}
            </div>
          </section>

          <section className="ae-panel">
            <h3>
              Étape {idx + 1} <span className="muted small">sur {anim.frames.length}</span>
            </h3>
            <Field label="Légende affichée pendant l'animation">
              <TextArea
                minRows={2}
                value={frame.caption}
                placeholder="Ex. A passe à B puis court vers le panier."
                onChange={(v) => commit(patchFrame(idx, { caption: v }))}
              />
            </Field>
            {idx > 0 && (
              <label className="field">
                <span className="field-label">Durée du déplacement ({(frame.moveMs / 1000).toFixed(1)} s)</span>
                <input type="range" min={0} max={5000} step={100} value={frame.moveMs} onChange={(e) => commit(patchFrame(idx, { moveMs: Number(e.target.value) }))} />
              </label>
            )}
            <label className="field">
              <span className="field-label">Pause sur l'étape ({(frame.holdMs / 1000).toFixed(1)} s)</span>
              <input type="range" min={0} max={6000} step={100} value={frame.holdMs} onChange={(e) => commit(patchFrame(idx, { holdMs: Number(e.target.value) }))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={showNext} onChange={(e) => setShowNext(e.target.checked)} />
              Montrer en transparence l'étape suivante
            </label>
            <div className="ae-row">
              <IconButton label="Déplacer l'étape à gauche" onClick={() => moveFrame(-1)} disabled={idx === 0}>
                <ArrowLeft size={18} />
              </IconButton>
              <IconButton label="Déplacer l'étape à droite" onClick={() => moveFrame(1)} disabled={idx === anim.frames.length - 1}>
                <ArrowRight size={18} />
              </IconButton>
              <Button size="sm" icon={<Plus size={15} />} onClick={addFrame}>
                Nouvelle étape
              </Button>
              <Button variant="danger" size="sm" icon={<X size={15} />} onClick={deleteFrame} disabled={anim.frames.length <= 1}>
                Supprimer
              </Button>
            </div>
            {frame.arrows.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => commit(patchFrame(idx, { arrows: [] }))}>
                Effacer les flèches de cette étape
              </Button>
            )}
          </section>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
