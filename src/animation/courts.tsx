import type { ReactNode } from 'react';
import type { CourtId } from '../types';

// Terrains dessinés en mètres (aux dimensions réelles, à peu de chose près).
// Le trait est « non-scaling » (voir styles.css) : il reste net quelle que soit la taille d'affichage.

export interface CourtDef {
  w: number;
  h: number;
  /** Marge visible autour du terrain (en mètres). */
  margin: number;
  surface: string;
  line: string;
  draw: () => ReactNode;
}

const Mirror = ({ w, children }: { w: number; children: ReactNode }) => (
  <g transform={`translate(${w},0) scale(-1,1)`}>{children}</g>
);

// ── Basket ──────────────────────────────────────────────────────────────────

const basketSide = () => (
  <>
    {/* raquette, lancer franc, 3 points */}
    <rect x={0} y={5.05} width={5.8} height={4.9} fill="rgba(220,38,38,.22)" />
    <path d="M5.8 5.7 A1.8 1.8 0 0 1 5.8 9.3" />
    <path d="M5.8 5.7 A1.8 1.8 0 0 0 5.8 9.3" strokeDasharray="0.35 0.3" />
    <path d="M0 0.9 H2.99 A6.75 6.75 0 0 1 2.99 14.1 H0" />
    <line x1={1.2} y1={6.6} x2={1.2} y2={8.4} strokeWidth={3} />
    <circle cx={1.575} cy={7.5} r={0.23} stroke="#ea580c" />
  </>
);

const drawBasket = (w: number, h: number, half = false) => (
  <>
    <rect x={0} y={0} width={w} height={h} />
    {half ? (
      <>
        <line x1={w} y1={0} x2={w} y2={h} />
        <path d={`M${w} ${h / 2 - 1.8} A1.8 1.8 0 0 0 ${w} ${h / 2 + 1.8}`} />
        {basketSide()}
      </>
    ) : (
      <>
        <line x1={w / 2} y1={0} x2={w / 2} y2={h} />
        <circle cx={w / 2} cy={h / 2} r={1.8} />
        {basketSide()}
        <Mirror w={w}>{basketSide()}</Mirror>
      </>
    )}
  </>
);

// ── Handball / futsal ───────────────────────────────────────────────────────

const handSide = () => (
  <>
    <path d="M0 2.5 A6 6 0 0 1 6 8.5 L6 11.5 A6 6 0 0 1 0 17.5" fill="rgba(255,255,255,.12)" />
    <path d="M0 -0.5 A9 9 0 0 1 9 8.5 L9 11.5 A9 9 0 0 1 0 20.5" strokeDasharray="0.7 0.5" />
    <line x1={7} y1={9.8} x2={7} y2={10.2} />
    <line x1={4} y1={9.9} x2={4} y2={10.1} />
    <rect x={-1} y={8.5} width={1} height={3} fill="rgba(255,255,255,.55)" />
  </>
);

const drawHand = () => (
  <>
    <defs>
      <clipPath id="clip-hand">
        <rect x={0} y={0} width={40} height={20} />
      </clipPath>
    </defs>
    <rect x={0} y={0} width={40} height={20} />
    <line x1={20} y1={0} x2={20} y2={20} />
    <circle cx={20} cy={10} r={0.15} />
    <g clipPath="url(#clip-hand)">{handSide()}</g>
    <rect x={-1} y={8.5} width={1} height={3} fill="rgba(255,255,255,.55)" />
    <Mirror w={40}>
      <g clipPath="url(#clip-hand)">{handSide()}</g>
    </Mirror>
    <rect x={40} y={8.5} width={1} height={3} fill="rgba(255,255,255,.55)" />
  </>
);

// ── Football (terrain à 7) ─────────────────────────────────────────────────

const footSide = () => (
  <>
    <rect x={0} y={9} width={12} height={22} />
    <rect x={0} y={15} width={4} height={10} />
    <circle cx={8} cy={20} r={0.18} />
    <path d="M12 17.94 A4.5 4.5 0 0 1 12 22.06" />
    <rect x={-1.5} y={17} width={1.5} height={6} fill="rgba(255,255,255,.6)" />
  </>
);

const drawFoot = () => (
  <>
    <rect x={0} y={0} width={60} height={40} />
    <line x1={30} y1={0} x2={30} y2={40} />
    <circle cx={30} cy={20} r={4.5} />
    <circle cx={30} cy={20} r={0.2} />
    {footSide()}
    <Mirror w={60}>{footSide()}</Mirror>
  </>
);

// ── Rugby ───────────────────────────────────────────────────────────────────

const drawRugby = () => (
  <>
    <rect x={0} y={0} width={120} height={70} />
    <line x1={10} y1={0} x2={10} y2={70} strokeWidth={2.5} />
    <line x1={110} y1={0} x2={110} y2={70} strokeWidth={2.5} />
    <line x1={60} y1={0} x2={60} y2={70} />
    <line x1={32} y1={0} x2={32} y2={70} />
    <line x1={88} y1={0} x2={88} y2={70} />
    <line x1={50} y1={0} x2={50} y2={70} strokeDasharray="1.2 1.2" />
    <line x1={70} y1={0} x2={70} y2={70} strokeDasharray="1.2 1.2" />
    <path d="M10 31 H5 M10 39 H5 M5 31 V39" strokeOpacity=".0" />
    <line x1={10} y1={31} x2={10} y2={39} strokeWidth={4} stroke="rgba(255,255,255,.85)" />
    <line x1={110} y1={31} x2={110} y2={39} strokeWidth={4} stroke="rgba(255,255,255,.85)" />
  </>
);

// ── Ultimate ────────────────────────────────────────────────────────────────

const drawUltimate = () => (
  <>
    <rect x={0} y={0} width={100} height={37} />
    <line x1={18} y1={0} x2={18} y2={37} />
    <line x1={82} y1={0} x2={82} y2={37} />
    <rect x={0} y={0} width={18} height={37} fill="rgba(255,255,255,.12)" />
    <rect x={82} y={0} width={18} height={37} fill="rgba(255,255,255,.12)" />
  </>
);

// ── Volley ──────────────────────────────────────────────────────────────────

const drawVolley = () => (
  <>
    <rect x={0} y={0} width={18} height={9} />
    <line x1={6} y1={0} x2={6} y2={9} />
    <line x1={12} y1={0} x2={12} y2={9} />
    <line x1={9} y1={-0.8} x2={9} y2={9.8} stroke="#111827" strokeWidth={4} />
    <line x1={9} y1={-0.8} x2={9} y2={9.8} stroke="#f8fafc" strokeWidth={1.2} strokeDasharray="0.25 0.25" />
    <circle cx={9} cy={-0.8} r={0.2} fill="#111827" />
    <circle cx={9} cy={9.8} r={0.2} fill="#111827" />
  </>
);

// ── Badminton ───────────────────────────────────────────────────────────────

const drawBadminton = () => (
  <>
    <rect x={0} y={0} width={13.4} height={6.1} />
    <line x1={0} y1={0.46} x2={13.4} y2={0.46} />
    <line x1={0} y1={5.64} x2={13.4} y2={5.64} />
    <line x1={4.72} y1={0} x2={4.72} y2={6.1} />
    <line x1={8.68} y1={0} x2={8.68} y2={6.1} />
    <line x1={0.76} y1={0} x2={0.76} y2={6.1} />
    <line x1={12.64} y1={0} x2={12.64} y2={6.1} />
    <line x1={0} y1={3.05} x2={4.72} y2={3.05} />
    <line x1={8.68} y1={3.05} x2={13.4} y2={3.05} />
    <line x1={6.7} y1={-0.4} x2={6.7} y2={6.5} stroke="#111827" strokeWidth={4} />
    <line x1={6.7} y1={-0.4} x2={6.7} y2={6.5} stroke="#f8fafc" strokeWidth={1.2} strokeDasharray="0.15 0.15" />
  </>
);

// ── Tennis & tennis de table ───────────────────────────────────────────────

const drawTennis = () => (
  <>
    <rect x={0} y={0} width={23.77} height={10.97} />
    <line x1={0} y1={1.37} x2={23.77} y2={1.37} />
    <line x1={0} y1={9.6} x2={23.77} y2={9.6} />
    <line x1={5.485} y1={1.37} x2={5.485} y2={9.6} />
    <line x1={18.285} y1={1.37} x2={18.285} y2={9.6} />
    <line x1={5.485} y1={5.485} x2={18.285} y2={5.485} />
    <line x1={11.885} y1={-0.9} x2={11.885} y2={11.87} stroke="#111827" strokeWidth={4} />
  </>
);

const drawTT = () => (
  <>
    <rect x={0} y={0} width={2.74} height={1.525} fill="rgba(255,255,255,.08)" />
    <line x1={0} y1={0.7625} x2={2.74} y2={0.7625} strokeOpacity=".6" />
    <line x1={1.37} y1={-0.12} x2={1.37} y2={1.645} stroke="#111827" strokeWidth={3} />
  </>
);

// ── Piste d'athlétisme ─────────────────────────────────────────────────────

const drawTrack = () => {
  const lanes = 6;
  const lw = 2.6;
  const x0 = 6;
  const y0 = 6;
  const W = 108;
  const H = 62;
  const lines = [];
  for (let i = 0; i <= lanes; i++) {
    const inset = i * lw;
    lines.push(
      <rect
        key={i}
        x={x0 + inset}
        y={y0 + inset}
        width={W - 2 * inset}
        height={H - 2 * inset}
        rx={H / 2 - inset}
      />,
    );
  }
  const inner = lanes * lw;
  return (
    <>
      <rect x={x0} y={y0} width={W} height={H} rx={H / 2} fill="rgba(194,65,12,.85)" stroke="none" />
      <rect
        x={x0 + inner}
        y={y0 + inner}
        width={W - 2 * inner}
        height={H - 2 * inner}
        rx={H / 2 - inner}
        fill="#4c9a4c"
        stroke="none"
      />
      {lines}
      <line x1={80} y1={y0} x2={80} y2={y0 + lanes * lw} strokeWidth={3} />
    </>
  );
};

// ── Terrain libre ───────────────────────────────────────────────────────────

const drawBlank = () => (
  <>
    {Array.from({ length: 11 }, (_, i) => (
      <line key={`v${i}`} x1={(i + 1) * 2} y1={0} x2={(i + 1) * 2} y2={14} strokeOpacity=".5" />
    ))}
    {Array.from({ length: 6 }, (_, i) => (
      <line key={`h${i}`} x1={0} y1={(i + 1) * 2} x2={24} y2={(i + 1) * 2} strokeOpacity=".5" />
    ))}
    <rect x={0} y={0} width={24} height={14} />
  </>
);

export const COURT_DEFS: Record<CourtId, CourtDef> = {
  blank: { w: 24, h: 14, margin: 0.8, surface: '#e8edf2', line: '#b4bfcb', draw: drawBlank },
  basket: { w: 28, h: 15, margin: 1.4, surface: '#d9a35f', line: '#ffffff', draw: () => drawBasket(28, 15) },
  'basket-half': { w: 14, h: 15, margin: 1.4, surface: '#d9a35f', line: '#ffffff', draw: () => drawBasket(14, 15, true) },
  volley: { w: 18, h: 9, margin: 2.4, surface: '#d99a55', line: '#ffffff', draw: drawVolley },
  badminton: { w: 13.4, h: 6.1, margin: 1.4, surface: '#3f8f6a', line: '#ffffff', draw: drawBadminton },
  hand: { w: 40, h: 20, margin: 2.4, surface: '#d9a35f', line: '#ffffff', draw: drawHand },
  foot: { w: 60, h: 40, margin: 3, surface: '#4c9a4c', line: '#ffffff', draw: drawFoot },
  rugby: { w: 120, h: 70, margin: 4, surface: '#4c9a4c', line: '#ffffff', draw: drawRugby },
  ultimate: { w: 100, h: 37, margin: 3, surface: '#4c9a4c', line: '#ffffff', draw: drawUltimate },
  tennis: { w: 23.77, h: 10.97, margin: 2.2, surface: '#4a86b8', line: '#ffffff', draw: drawTennis },
  tt: { w: 2.74, h: 1.525, margin: 0.35, surface: '#2b6aa8', line: '#ffffff', draw: drawTT },
  track: { w: 120, h: 74, margin: 0, surface: '#4c9a4c', line: '#ffffff', draw: drawTrack },
};

/** Unité d'affichage des jetons : proportionnelle à la taille du terrain. */
export const unitOf = (d: CourtDef) => Math.sqrt(d.w * d.h) / 24;
