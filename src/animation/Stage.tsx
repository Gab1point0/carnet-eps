import type { CSSProperties, Ref, SVGProps } from 'react';
import type { Arrow, CourtId, ID, Token } from '../types';
import { COURT_DEFS, unitOf } from './courts';
import type { Rendered } from './engine';
import { readableOn } from '../lib/util';

export type DrawableArrow = Arrow & { opacity?: number };

export interface StageProps {
  court: CourtId;
  tokens: Token[];
  rendered: Record<ID, Rendered>;
  arrows?: DrawableArrow[];
  /** Positions de l'étape suivante, affichées en transparence (éditeur). */
  ghost?: Record<ID, Rendered> | null;
  selectedTokenId?: ID | null;
  selectedArrowId?: ID | null;
  /** Rend visibles (en pâle) les jetons masqués dans l'étape courante. */
  revealHidden?: boolean;
  draftArrow?: Arrow | null;
  svgRef?: Ref<SVGSVGElement>;
  className?: string;
  style?: CSSProperties;
  svgProps?: SVGProps<SVGSVGElement>;
}

const LAYER: Record<Token['kind'], number> = {
  mat: 0, bench: 0, goal: 1, hoop: 1, cone: 2, player: 4, coach: 4, ball: 5, text: 6,
};

export function Stage({
  court,
  tokens,
  rendered,
  arrows = [],
  ghost,
  selectedTokenId,
  selectedArrowId,
  revealHidden,
  draftArrow,
  svgRef,
  className,
  style,
  svgProps,
}: StageProps) {
  const def = COURT_DEFS[court] ?? COURT_DEFS.blank;
  const m = def.margin;
  const u = unitOf(def);
  const px = (x: number) => (x / 100) * def.w;
  const py = (y: number) => (y / 100) * def.h;
  const ordered = [...tokens].sort((a, b) => LAYER[a.kind] - LAYER[b.kind]);

  return (
    <svg
      ref={svgRef}
      className={`stage ${className ?? ''}`}
      style={style}
      viewBox={`${-m} ${-m} ${def.w + 2 * m} ${def.h + 2 * m}`}
      preserveAspectRatio="xMidYMid meet"
      {...svgProps}
    >
      <rect x={-m} y={-m} width={def.w + 2 * m} height={def.h + 2 * m} fill={def.surface} />
      <g className="court" stroke={def.line} fill="none" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        {def.draw()}
      </g>

      <g className="arrows">
        {arrows.map((a) => (
          <ArrowShape key={a.id} arrow={a} u={u} px={px} py={py} selected={a.id === selectedArrowId} />
        ))}
        {draftArrow && <ArrowShape arrow={draftArrow} u={u} px={px} py={py} selected />}
      </g>

      {ghost && (
        <g className="ghosts" opacity={0.28} pointerEvents="none">
          {ordered.map((t) => {
            const g = ghost[t.id];
            const cur = rendered[t.id];
            if (!g || !cur || g.opacity === 0) return null;
            const moved = Math.hypot(g.x - cur.x, g.y - cur.y) > 0.3;
            if (!moved) return null;
            return (
              <g key={t.id}>
                <line
                  x1={px(cur.x)} y1={py(cur.y)} x2={px(g.x)} y2={py(g.y)}
                  stroke="#0f172a" strokeWidth={1.4} strokeDasharray="4 4"
                />
                <TokenShape token={t} r={{ ...g, opacity: 1 }} x={px(g.x)} y={py(g.y)} u={u} />
              </g>
            );
          })}
        </g>
      )}

      <g className="tokens">
        {ordered.map((t) => {
          const r = rendered[t.id];
          if (!r) return null;
          const opacity = revealHidden ? Math.max(r.opacity, 0.22) : r.opacity;
          if (opacity <= 0.01) return null;
          return (
            <TokenShape
              key={t.id}
              token={t}
              r={{ ...r, opacity }}
              x={px(r.x)}
              y={py(r.y)}
              u={u}
              selected={t.id === selectedTokenId}
              interactive
            />
          );
        })}
      </g>
    </svg>
  );
}

// ── Jetons ──────────────────────────────────────────────────────────────────

/** Petite icône d'un type de jeton (palette de l'éditeur). */
export function TokenIcon({ kind, color, label }: { kind: Token['kind']; color: string; label?: string }) {
  const token: Token = { id: 'icon', kind, color, label: label ?? '', size: 1 };
  return (
    <svg viewBox="-10 -10 20 20" width={28} height={28} aria-hidden>
      <TokenShape token={token} r={{ x: 0, y: 0, rot: 0, opacity: 1 }} x={0} y={0} u={kind === 'goal' || kind === 'bench' || kind === 'mat' ? 3 : 6} />
    </svg>
  );
}

function TokenShape({
  token,
  r,
  x,
  y,
  u,
  selected,
  interactive,
}: {
  token: Token;
  r: Rendered;
  x: number;
  y: number;
  u: number;
  selected?: boolean;
  interactive?: boolean;
}) {
  const s = token.size || 1;
  const fg = readableOn(token.color);
  const outline = fg === '#ffffff' ? '#ffffff' : '#111827';
  let body: React.ReactNode;
  let hit = 1.5 * u * Math.max(1, s);

  switch (token.kind) {
    case 'player':
      body = (
        <>
          <circle r={0.9 * u * s} fill={token.color} stroke={outline} strokeWidth={1.6} />
          {token.label && (
            <text fontSize={0.95 * u * s} fill={fg} textAnchor="middle" dominantBaseline="central" fontWeight={700}>
              {token.label}
            </text>
          )}
        </>
      );
      break;
    case 'coach':
      body = (
        <>
          <rect x={-0.85 * u * s} y={-0.85 * u * s} width={1.7 * u * s} height={1.7 * u * s} rx={0.35 * u * s} fill={token.color} stroke="#fff" strokeWidth={1.6} />
          <text fontSize={0.95 * u * s} fill="#fff" textAnchor="middle" dominantBaseline="central" fontWeight={700}>
            {token.label || 'P'}
          </text>
        </>
      );
      break;
    case 'ball':
      body = (
        <>
          <circle r={0.5 * u * s} fill={token.color} stroke="#111827" strokeWidth={1.4} />
          <path d={`M${-0.5 * u * s} 0 H${0.5 * u * s} M0 ${-0.5 * u * s} V${0.5 * u * s}`} stroke="#111827" strokeWidth={0.9} fill="none" />
        </>
      );
      hit = 1.1 * u * Math.max(1, s);
      break;
    case 'cone':
      body = (
        <polygon
          points={`0,${-0.8 * u * s} ${0.7 * u * s},${0.6 * u * s} ${-0.7 * u * s},${0.6 * u * s}`}
          fill={token.color}
          stroke="#7c2d12"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      );
      break;
    case 'hoop':
      body = <circle r={0.8 * u * s} fill="none" stroke={token.color} strokeWidth={3.2} />;
      break;
    case 'goal':
      hit = 2 * u * s;
      body = (
        <>
          <rect x={-1.8 * u * s} y={-0.6 * u * s} width={3.6 * u * s} height={1.2 * u * s} fill="rgba(255,255,255,.55)" stroke={token.color === '#ffffff' ? '#111827' : token.color} strokeWidth={2} />
          <path d={`M${-1.2 * u * s} ${-0.6 * u * s} V${0.6 * u * s} M0 ${-0.6 * u * s} V${0.6 * u * s} M${1.2 * u * s} ${-0.6 * u * s} V${0.6 * u * s}`} stroke="#111827" strokeOpacity={0.35} strokeWidth={0.8} />
        </>
      );
      break;
    case 'mat':
      hit = 1.8 * u * s;
      body = <rect x={-1.4 * u * s} y={-0.9 * u * s} width={2.8 * u * s} height={1.8 * u * s} rx={0.25 * u * s} fill={token.color} fillOpacity={0.85} stroke="#fff" strokeWidth={1.4} />;
      break;
    case 'bench':
      hit = 1.8 * u * s;
      body = <rect x={-1.7 * u * s} y={-0.4 * u * s} width={3.4 * u * s} height={0.8 * u * s} rx={0.15 * u * s} fill={token.color} stroke="#fff" strokeWidth={1.2} />;
      break;
    case 'text': {
      const fs = 1.15 * u * s;
      const w = Math.max(1, token.label.length) * fs * 0.58 + fs * 0.9;
      hit = Math.max(w / 2, 1.2 * u);
      body = (
        <>
          <rect x={-w / 2} y={-fs * 0.85} width={w} height={fs * 1.7} rx={fs * 0.4} fill="rgba(255,255,255,.88)" />
          <text fontSize={fs} fill={token.color} textAnchor="middle" dominantBaseline="central" fontWeight={700}>
            {token.label || 'Texte'}
          </text>
        </>
      );
      break;
    }
  }

  return (
    <g
      transform={`translate(${x},${y}) rotate(${r.rot})`}
      opacity={r.opacity}
      data-token={interactive ? token.id : undefined}
      style={{ cursor: interactive ? 'grab' : undefined }}
    >
      {selected && <circle r={hit * 1.05} fill="none" stroke="#f97316" strokeWidth={2.2} strokeDasharray="5 3" pointerEvents="none" />}
      <circle r={hit} fill="transparent" />
      {body}
    </g>
  );
}

// ── Flèches ─────────────────────────────────────────────────────────────────

function ArrowShape({
  arrow,
  u,
  px,
  py,
  selected,
}: {
  arrow: DrawableArrow;
  u: number;
  px: (x: number) => number;
  py: (y: number) => number;
  selected?: boolean;
}) {
  const x1 = px(arrow.x1);
  const y1 = py(arrow.y1);
  const x2 = px(arrow.x2);
  const y2 = py(arrow.y2);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.01) return null;
  const dx = (x2 - x1) / len;
  const dy = (y2 - y1) / len;
  const head = (arrow.style === 'shoot' ? 1.5 : 1.15) * u;
  const hasHead = arrow.style !== 'line';
  const bx = x2 - dx * head;
  const by = y2 - dy * head;
  const nx = -dy;
  const ny = dx;
  const sw = arrow.style === 'shoot' ? 4 : 2.4;

  let path: string;
  if (arrow.style === 'dribble') {
    const steps = Math.max(2, Math.round((len - (hasHead ? head : 0)) / (0.9 * u)));
    const end = hasHead ? len - head : len;
    const pts = [`${x1},${y1}`];
    for (let i = 1; i <= steps; i++) {
      const d = (end * i) / steps;
      const off = i === steps ? 0 : (i % 2 ? 1 : -1) * 0.4 * u;
      pts.push(`${x1 + dx * d + nx * off},${y1 + dy * d + ny * off}`);
    }
    path = 'M' + pts.join(' L');
  } else {
    path = `M${x1},${y1} L${hasHead ? bx : x2},${hasHead ? by : y2}`;
  }

  return (
    <g opacity={arrow.opacity ?? 1} data-arrow={arrow.id} style={{ cursor: 'pointer' }}>
      <path d={path} stroke="transparent" strokeWidth={18} fill="none" />
      {selected && <path d={path} stroke="#f97316" strokeWidth={sw + 5} fill="none" strokeOpacity={0.45} strokeLinecap="round" />}
      <path
        d={path}
        stroke={arrow.color}
        strokeWidth={sw}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={arrow.style === 'pass' ? '7 6' : undefined}
      />
      {hasHead && (
        <polygon
          points={`${x2},${y2} ${bx + nx * head * 0.5},${by + ny * head * 0.5} ${bx - nx * head * 0.5},${by - ny * head * 0.5}`}
          fill={arrow.color}
          stroke={arrow.color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
