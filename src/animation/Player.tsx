import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import type { Animation } from '../types';
import { buildTimeline, resolveFrame, sanitizeAnimation, stateAt } from './engine';
import { Stage } from './Stage';
import { cls } from '../lib/util';

interface PlayerProps {
  animation: Animation;
  autoPlay?: boolean;
  loop?: boolean;
  /** Version réduite : sans boutons d'étapes ni vitesse. */
  compact?: boolean;
  className?: string;
  /** Hauteur maximale de la scène (ex. « 60vh »). */
  maxHeight?: string;
}

const SPEEDS = [0.5, 1, 1.5, 2];

export function AnimationPlayer({ animation, autoPlay = false, loop: loopProp = true, compact, className, maxHeight }: PlayerProps) {
  const anim = useMemo(() => sanitizeAnimation(animation), [animation]);
  const tl = useMemo(() => buildTimeline(anim), [anim]);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && !reduced);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(loopProp);
  const raf = useRef(0);
  const tRef = useRef(0);
  const setTime = (n: number) => {
    tRef.current = n;
    setT(n);
  };

  useEffect(() => {
    tRef.current = 0;
    setT(0);
  }, [anim.frames.length]);

  useEffect(() => {
    if (!playing) return;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) * speed;
      prev = now;
      let n = tRef.current + dt;
      let stop = false;
      if (n >= tl.total) {
        if (loop) n = n % tl.total;
        else {
          n = tl.total;
          stop = true;
        }
      }
      tRef.current = n;
      setT(n);
      if (stop) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, loop, tl.total]);

  const state = stateAt(anim, tl, t);
  const multi = anim.frames.length > 1;
  const stepCount = anim.frames.length;

  const toggle = () => {
    if (!playing && t >= tl.total - 1) setTime(0);
    setPlaying(!playing);
  };
  const goStep = (dir: 1 | -1) => {
    setPlaying(false);
    const starts = tl.frameStart;
    if (dir > 0) setTime(starts.find((s) => s > t + 5) ?? starts[starts.length - 1]);
    else setTime([...starts].reverse().find((s) => s < t - 5) ?? 0);
  };

  return (
    <div className={cls('player', className)}>
      <div className="player-stage">
        <Stage
          court={anim.court}
          tokens={anim.tokens}
          rendered={state.rendered}
          arrows={state.arrows}
          style={maxHeight ? { maxHeight } : undefined}
        />
        {multi && !playing && t === 0 && (
          <button type="button" className="player-big-play" onClick={toggle} aria-label="Lancer l'animation">
            <Play size={30} fill="currentColor" />
          </button>
        )}
      </div>
      {state.caption && <p className="player-caption">{state.caption}</p>}
      {multi && (
        <div className="player-controls">
          <button type="button" className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          {!compact && (
            <button type="button" className="icon-btn" onClick={() => goStep(-1)} aria-label="Étape précédente">
              <SkipBack size={18} />
            </button>
          )}
          <input
            className="player-scrub"
            type="range"
            min={0}
            max={tl.total}
            step={20}
            value={Math.min(t, tl.total)}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
            aria-label="Position dans l'animation"
          />
          {!compact && (
            <button type="button" className="icon-btn" onClick={() => goStep(1)} aria-label="Étape suivante">
              <SkipForward size={18} />
            </button>
          )}
          <span className="player-step muted">
            {state.frame + 1}/{stepCount}
          </span>
          {!compact && (
            <>
              <button
                type="button"
                className={cls('icon-btn', loop && 'icon-btn-on')}
                onClick={() => setLoop(!loop)}
                aria-pressed={loop}
                aria-label="Lecture en boucle"
                title="Boucle"
              >
                <Repeat size={17} />
              </button>
              <button
                type="button"
                className="chip chip-btn"
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                aria-label="Vitesse"
                title="Vitesse de lecture"
              >
                ×{speed}
              </button>
            </>
          )}
          {compact && (
            <button type="button" className="icon-btn" onClick={() => { setPlaying(false); setTime(0); }} aria-label="Recommencer">
              <RotateCcw size={17} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Image fixe d'une étape (miniatures, impression). */
export function FrameThumb({ animation, frame = 0, className }: { animation: Animation; frame?: number; className?: string }) {
  const anim = useMemo(() => sanitizeAnimation(animation), [animation]);
  const f = anim.frames[Math.min(frame, anim.frames.length - 1)];
  return (
    <Stage
      court={anim.court}
      tokens={anim.tokens}
      rendered={resolveFrame(anim.tokens, f)}
      arrows={f.arrows}
      className={className}
    />
  );
}
