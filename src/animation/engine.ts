import type { Animation, Arrow, CourtId, Frame, ID, Token, TokenKind, TokenPos } from '../types';
import { clamp, uid } from '../lib/util';

/** Position « calculée » d'un jeton à un instant donné. */
export interface Rendered {
  x: number;
  y: number;
  rot: number;
  opacity: number;
}

export const DEFAULT_MOVE_MS = 1300;
export const DEFAULT_HOLD_MS = 700;

export function createFrame(tokens: Token[], from?: Frame): Frame {
  const pos: Record<ID, TokenPos> = {};
  for (const t of tokens) pos[t.id] = from?.pos[t.id] ? { ...from.pos[t.id] } : { x: 50, y: 50 };
  return { id: uid(), caption: '', holdMs: DEFAULT_HOLD_MS, moveMs: DEFAULT_MOVE_MS, pos, arrows: [] };
}

export function createAnimation(court: CourtId = 'blank'): Animation {
  return { court, tokens: [], frames: [createFrame([])] };
}

/** Garantit qu'une animation écrite à la main reste cohérente (positions manquantes, étape vide…). */
export function sanitizeAnimation(a: Animation): Animation {
  const frames = a.frames?.length ? a.frames : [createFrame(a.tokens ?? [])];
  return {
    court: a.court ?? 'blank',
    tokens: (a.tokens ?? []).map((t) => ({ ...t, size: t.size ?? 1, label: t.label ?? '', color: t.color ?? '#2563eb' })),
    frames: frames.map((f) => {
      const pos = { ...(f.pos ?? {}) };
      for (const t of a.tokens ?? []) if (!pos[t.id]) pos[t.id] = { x: 50, y: 50 };
      return {
        id: f.id ?? uid(),
        caption: f.caption ?? '',
        holdMs: f.holdMs ?? DEFAULT_HOLD_MS,
        moveMs: f.moveMs ?? DEFAULT_MOVE_MS,
        pos,
        arrows: f.arrows ?? [],
      };
    }),
  };
}

/** Applique les liens « porté par » et retourne les positions finales d'une étape. */
export function resolveFrame(tokens: Token[], frame: Frame): Record<ID, Rendered> {
  const out: Record<ID, Rendered> = {};
  const visiting = new Set<ID>();
  const get = (id: ID): Rendered | null => {
    if (out[id]) return out[id];
    const p = frame.pos[id];
    if (!p || visiting.has(id)) return null;
    visiting.add(id);
    let x = p.x;
    let y = p.y;
    if (p.carry) {
      const c = get(p.carry);
      if (c) {
        x = c.x + (p.dx ?? 0);
        y = c.y + (p.dy ?? 0);
      }
    }
    visiting.delete(id);
    return (out[id] = { x, y, rot: p.rot ?? 0, opacity: p.hidden ? 0 : 1 });
  };
  for (const t of tokens) get(t.id);
  return out;
}

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

export interface Segment {
  kind: 'hold' | 'move';
  frame: number;
  start: number;
  end: number;
}

export interface Timeline {
  segments: Segment[];
  total: number;
  /** Instant où chaque étape est atteinte (début de sa pause). */
  frameStart: number[];
}

export function buildTimeline(anim: Animation): Timeline {
  const segments: Segment[] = [];
  const frameStart: number[] = [];
  let t = 0;
  anim.frames.forEach((f, i) => {
    if (i > 0 && f.moveMs > 0) {
      segments.push({ kind: 'move', frame: i, start: t, end: t + f.moveMs });
      t += f.moveMs;
    }
    frameStart.push(t);
    const hold = Math.max(i === anim.frames.length - 1 ? 600 : 0, f.holdMs, i === 0 ? 300 : 0);
    segments.push({ kind: 'hold', frame: i, start: t, end: t + hold });
    t += hold;
  });
  return { segments, total: t, frameStart };
}

export interface PlaybackState {
  rendered: Record<ID, Rendered>;
  arrows: Array<Arrow & { opacity: number }>;
  caption: string;
  frame: number;
  phase: 'hold' | 'move';
}

export function stateAt(anim: Animation, tl: Timeline, tMs: number): PlaybackState {
  const t = clamp(tMs, 0, tl.total);
  const seg = tl.segments.find((s) => t >= s.start && t < s.end) ?? tl.segments[tl.segments.length - 1];
  const cur = anim.frames[seg.frame];
  if (seg.kind === 'hold') {
    return {
      rendered: resolveFrame(anim.tokens, cur),
      arrows: cur.arrows.map((a) => ({ ...a, opacity: 1 })),
      caption: cur.caption,
      frame: seg.frame,
      phase: 'hold',
    };
  }
  const prev = anim.frames[seg.frame - 1];
  const from = resolveFrame(anim.tokens, prev);
  const to = resolveFrame(anim.tokens, cur);
  const raw = (t - seg.start) / Math.max(1, seg.end - seg.start);
  const p = ease(raw);
  const rendered: Record<ID, Rendered> = {};
  for (const tok of anim.tokens) {
    const a = from[tok.id];
    const b = to[tok.id];
    if (!a || !b) {
      if (a || b) rendered[tok.id] = (a ?? b)!;
      continue;
    }
    rendered[tok.id] = {
      x: a.x + (b.x - a.x) * p,
      y: a.y + (b.y - a.y) * p,
      rot: a.rot + (b.rot - a.rot) * p,
      opacity: a.opacity + (b.opacity - a.opacity) * p,
    };
  }
  return {
    rendered,
    arrows: prev.arrows.map((a) => ({ ...a, opacity: Math.max(0, 1 - raw * 2.5) })),
    caption: cur.caption || prev.caption,
    frame: seg.frame,
    phase: 'move',
  };
}

// ── Aides d'édition ─────────────────────────────────────────────────────────

export const TOKEN_LABELS: Record<TokenKind, string> = {
  player: 'Joueur',
  coach: 'Enseignant',
  ball: 'Ballon',
  cone: 'Plot',
  hoop: 'Cerceau',
  goal: 'But',
  mat: 'Tapis',
  bench: 'Banc',
  text: 'Texte',
};

export function makeToken(kind: TokenKind, color: string, label = ''): Token {
  const defaults: Record<TokenKind, { color: string; size: number }> = {
    player: { color, size: 1 },
    coach: { color: '#111827', size: 1 },
    ball: { color: '#f97316', size: 1 },
    cone: { color: '#f97316', size: 1 },
    hoop: { color: '#eab308', size: 1 },
    goal: { color: '#ffffff', size: 1 },
    mat: { color: '#3b82f6', size: 1 },
    bench: { color: '#92400e', size: 1 },
    text: { color: '#111827', size: 1 },
  };
  const d = defaults[kind];
  return { id: uid(), kind, label, color: d.color, size: d.size };
}

/** Ajoute un jeton dans toutes les étapes, légèrement décalé pour éviter les superpositions. */
export function addToken(anim: Animation, token: Token, at?: { x: number; y: number }): Animation {
  const n = anim.tokens.length;
  const x = at?.x ?? clamp(50 + ((n * 7) % 30) - 15, 8, 92);
  const y = at?.y ?? clamp(50 + ((n * 11) % 30) - 15, 10, 90);
  return {
    ...anim,
    tokens: [...anim.tokens, token],
    frames: anim.frames.map((f) => ({ ...f, pos: { ...f.pos, [token.id]: { x, y } } })),
  };
}

export function removeToken(anim: Animation, id: ID): Animation {
  return {
    ...anim,
    tokens: anim.tokens.filter((t) => t.id !== id),
    frames: anim.frames.map((f) => {
      const pos = { ...f.pos };
      delete pos[id];
      // Les jetons portés par ce joueur restent où ils sont.
      const resolved = resolveFrame(anim.tokens, f);
      for (const [tid, p] of Object.entries(pos)) {
        if (p.carry === id) {
          const r = resolved[tid];
          pos[tid] = { ...p, x: r?.x ?? p.x, y: r?.y ?? p.y, carry: undefined, dx: undefined, dy: undefined };
        }
      }
      return { ...f, pos };
    }),
  };
}

export function duplicateToken(anim: Animation, id: ID): Animation {
  const src = anim.tokens.find((t) => t.id === id);
  if (!src) return anim;
  const copy: Token = { ...src, id: uid() };
  return {
    ...anim,
    tokens: [...anim.tokens, copy],
    frames: anim.frames.map((f) => {
      const p = f.pos[id];
      return { ...f, pos: { ...f.pos, [copy.id]: p ? { ...p, x: clamp(p.x + 4, 0, 100), y: clamp(p.y + 4, 0, 100) } : { x: 50, y: 50 } } };
    }),
  };
}

/** Prochain numéro libre pour les joueurs d'une couleur (1, 2, 3…). */
export function nextPlayerLabel(anim: Animation, color: string): string {
  const used = new Set(anim.tokens.filter((t) => t.kind === 'player' && t.color === color).map((t) => t.label));
  for (let i = 1; i < 99; i++) if (!used.has(String(i))) return String(i);
  return '';
}

export function arrowLength(a: Pick<Arrow, 'x1' | 'y1' | 'x2' | 'y2'>): number {
  return Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
}

export function totalSeconds(anim: Animation): number {
  return buildTimeline(anim).total / 1000;
}
