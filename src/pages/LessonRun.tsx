import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListChecks, Pause, Play, RotateCcw, SkipForward, Timer, X } from 'lucide-react';
import { ReviewModal } from '../components/ReviewModal';
import { lessonMaterialTexts, mergeMaterials } from '../lib/materials';
import { useData } from '../store/data';
import { activityOf } from '../store/selectors';
import { AnimationPlayer } from '../animation/Player';
import { Markdown } from '../components/Markdown';
import { Button, IconButton } from '../components/ui';
import { BLOCK_KINDS } from '../lib/defaults';
import { cls } from '../lib/util';

function beep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.18;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.28);
      osc.stop(ctx.currentTime + i * 0.28 + 0.16);
    }
    setTimeout(() => void ctx.close(), 1400);
  } catch {
    /* audio indisponible */
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

const fmt = (s: number) => {
  const a = Math.abs(s);
  return `${s < 0 ? '+' : ''}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

/** Mode « cours » : plein écran, une situation à la fois, avec minuteur et animation. */
export function LessonRunPage() {
  const { id = '' } = useParams();
  const lesson = useData((s) => s.data.lessons[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [step, setStep] = useState(-1); // -1 : aperçu, 0..n-1 : blocs
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [gearChecked, setGearChecked] = useState<Set<string>>(new Set());
  const beeped = useRef(false);
  const gear = useMemo(() => (lesson ? mergeMaterials(lessonMaterialTexts(lesson)) : []), [lesson]);

  // Garde l'écran allumé pendant le cours.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* non supporté / refusé */
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);

  const blocks = lesson?.blocks ?? [];
  const block = step >= 0 ? blocks[step] : undefined;
  const remaining = block ? block.minutes * 60 - elapsed : 0;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (running && block && remaining <= 0 && !beeped.current) {
      beeped.current = true;
      beep();
    }
  }, [running, remaining, block]);

  const go = useCallback(
    (n: number) => {
      setStep(Math.max(-1, Math.min(blocks.length, n)));
      setElapsed(0);
      setRunning(false);
      beeped.current = false;
    },
    [blocks.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(step + 1);
      else if (e.key === 'ArrowLeft') go(step - 1);
      else if (e.key === ' ' && block) {
        e.preventDefault();
        setRunning((r) => !r);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, step, block]);

  if (!lesson) return <Navigate to="/classes" replace />;

  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  const court = activityOf(data, lesson.activityId ?? (lesson.cycleId ? data.cycles[lesson.cycleId]?.activityId : null) ?? null)?.court;
  void court;
  const doneMinutes = blocks.slice(0, Math.max(0, step)).reduce((s, b) => s + b.minutes, 0);
  const totalMinutes = blocks.reduce((s, b) => s + b.minutes, 0) || 1;
  const progress = step < 0 ? 0 : step >= blocks.length ? 100 : ((doneMinutes * 60 + Math.min(elapsed, (block?.minutes ?? 0) * 60)) / (totalMinutes * 60)) * 100;
  const kind = block ? BLOCK_KINDS[block.kind] : null;

  return (
    <div className="run" style={{ ['--kind' as string]: kind?.color ?? 'var(--primary)' }}>
      <header className="run-top">
        <IconButton label="Quitter le mode cours" onClick={() => navigate(`/lessons/${lesson.id}`)}>
          <X size={22} />
        </IconButton>
        <div className="run-title">
          <strong>{lesson.title || 'Séance'}</strong>
          <span className="muted small">{klass?.name}</span>
        </div>
        <IconButton label="Vue d'ensemble" onClick={() => go(-1)}>
          <ListChecks size={22} />
        </IconButton>
      </header>
      <div className="run-progress" aria-hidden>
        <div style={{ width: `${progress}%` }} />
      </div>

      <main className="run-main">
        {step === -1 && (
          <div className="run-card">
            <h1>{lesson.title || 'Séance'}</h1>
            {lesson.objective && (
              <section>
                <h3>🎯 Objectif</h3>
                <Markdown text={lesson.objective} />
              </section>
            )}
            {gear.length > 0 && (
              <section>
                <h3>🧰 Matériel à sortir</h3>
                <div className="mat-list">
                  {gear.map((m) => (
                    <label key={m.name} className={cls('check', 'mat-item', gearChecked.has(m.name) && 'mat-done')}>
                      <input
                        type="checkbox"
                        checked={gearChecked.has(m.name)}
                        onChange={() =>
                          setGearChecked((cur) => {
                            const next = new Set(cur);
                            if (next.has(m.name)) next.delete(m.name);
                            else next.add(m.name);
                            return next;
                          })
                        }
                      />
                      <span>
                        {m.qty !== null && <strong>{m.qty} × </strong>}
                        {m.name}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}
            {lesson.safety && (
              <section>
                <h3>⚠️ Sécurité</h3>
                <Markdown text={lesson.safety} />
              </section>
            )}
            <section>
              <h3>Déroulé</h3>
              {blocks.length === 0 ? (
                <p className="muted">Cette séance n'a pas encore de contenu.</p>
              ) : (
                <ol className="run-outline">
                  {blocks.map((b, i) => (
                    <li key={b.id}>
                      <button type="button" onClick={() => go(i)}>
                        <span className="dot" style={{ background: BLOCK_KINDS[b.kind].color }} />
                        <span className="grow">{b.title || BLOCK_KINDS[b.kind].label}</span>
                        <span className="muted">{b.minutes} min</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {blocks.length > 0 && (
              <Button variant="primary" onClick={() => go(0)} icon={<Play size={18} />}>
                Commencer
              </Button>
            )}
          </div>
        )}

        {block && kind && (
          <div className="run-card">
            <div className="row-between">
              <span className="chip chip-colored" style={{ ['--chip' as string]: kind.color }}>
                {kind.icon} {kind.label} · {step + 1}/{blocks.length}
              </span>
              <span className="muted small">{block.minutes} min prévues</span>
            </div>
            <h1>{block.title || kind.label}</h1>

            <div className={cls('run-timer', remaining <= 0 && 'run-timer-over', running && 'run-timer-on')}>
              <span className="run-time">{fmt(remaining)}</span>
              <div className="row">
                <Button variant={running ? 'secondary' : 'primary'} icon={running ? <Pause size={18} /> : <Play size={18} />} onClick={() => setRunning(!running)}>
                  {running ? 'Pause' : elapsed > 0 ? 'Reprendre' : 'Lancer le minuteur'}
                </Button>
                <IconButton
                  label="Remettre à zéro"
                  onClick={() => {
                    setElapsed(0);
                    setRunning(false);
                    beeped.current = false;
                  }}
                >
                  <RotateCcw size={18} />
                </IconButton>
              </div>
            </div>

            {showRotation ? (
              <RotationTimer onClose={() => setShowRotation(false)} />
            ) : (
              <Button size="sm" icon={<Timer size={16} />} onClick={() => setShowRotation(true)}>
                Chrono d'ateliers (rotations)
              </Button>
            )}

            {block.animation && <AnimationPlayer animation={block.animation} autoPlay maxHeight="50vh" />}
            {block.text && <Markdown text={block.text} className="md-big" />}
            {block.materials && (
              <p className="callout">
                🧰 <strong>Matériel :</strong> {block.materials}
              </p>
            )}
          </div>
        )}

        {step >= blocks.length && blocks.length > 0 && (
          <div className="run-card">
            <h1>Séance terminée 🎉</h1>
            <p className="muted">Notez votre bilan pendant que c'est frais : 30 secondes suffisent.</p>
            <div className="row">
              <Button variant="primary" onClick={() => setReviewing(true)}>
                Faire le bilan rapide
              </Button>
              <Button onClick={() => navigate(`/lessons/${lesson.id}`)}>Ouvrir la séance</Button>
              <Button variant="ghost" onClick={() => go(-1)}>
                Revoir le déroulé
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="run-nav">
        <Button size="md" icon={<ChevronLeft size={20} />} onClick={() => go(step - 1)} disabled={step <= -1}>
          Précédent
        </Button>
        <div className="run-dots" aria-hidden>
          {blocks.map((b, i) => (
            <span key={b.id} className={cls('run-dotp', i === step && 'on', i < step && 'past')} style={{ background: i <= step ? BLOCK_KINDS[b.kind].color : undefined }} />
          ))}
        </div>
        <Button variant="primary" onClick={() => go(step + 1)} disabled={step >= blocks.length || blocks.length === 0}>
          Suivant <ChevronRight size={20} />
        </Button>
      </footer>
      {reviewing && <ReviewModal lesson={lesson} onClose={() => setReviewing(false)} />}
    </div>
  );
}

const ROTATION_PRESETS = [
  { label: '30 s', s: 30 },
  { label: '45 s', s: 45 },
  { label: '1 min', s: 60 },
  { label: '1 min 30', s: 90 },
  { label: '2 min', s: 120 },
  { label: '3 min', s: 180 },
  { label: '5 min', s: 300 },
];

/** Chrono d'ateliers : N rotations de durée fixe, bip et message « Rotation ! » à chaque changement. */
function RotationTimer({ onClose }: { onClose: () => void }) {
  const [duration, setDuration] = useState(120);
  const [rounds, setRounds] = useState(4);
  const [round, setRound] = useState(1);
  const [left, setLeft] = useState(120);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (!running || left > 0) return;
    beep();
    setFlash(true);
    setTimeout(() => setFlash(false), 2500);
    if (round >= rounds) {
      setRunning(false);
      setDone(true);
    } else {
      setRound(round + 1);
      setLeft(duration);
    }
  }, [left, running, round, rounds, duration]);

  const reset = (d = duration) => {
    setRunning(false);
    setDone(false);
    setRound(1);
    setLeft(d);
  };
  const skip = () => {
    if (round >= rounds) return;
    setRound(round + 1);
    setLeft(duration);
  };
  const mm = String(Math.floor(Math.max(0, left) / 60)).padStart(2, '0');
  const ss = String(Math.max(0, left) % 60).padStart(2, '0');

  return (
    <div className={cls('rotation', flash && 'rotation-flash')}>
      <div className="row-between">
        <strong>⏱️ Chrono d'ateliers</strong>
        <IconButton label="Fermer le chrono" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="rotation-presets">
        {ROTATION_PRESETS.map((p) => (
          <button
            key={p.s}
            type="button"
            className={cls('chip chip-btn', duration === p.s && 'chip-active')}
            onClick={() => {
              setDuration(p.s);
              reset(p.s);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="row">
        <span className="muted small">Ateliers / rotations :</span>
        {[2, 3, 4, 5, 6, 8].map((n) => (
          <button
            key={n}
            type="button"
            className={cls('chip chip-btn', rounds === n && 'chip-active')}
            onClick={() => {
              setRounds(n);
              setRound(1);
              setDone(false);
              setLeft(duration);
              setRunning(false);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="rotation-display">
        {flash && !done ? <span className="rotation-go">Rotation !</span> : done ? <span className="rotation-go">Terminé</span> : <span className="run-time">{mm}:{ss}</span>}
        <span className="muted">
          Atelier {Math.min(round, rounds)} / {rounds}
        </span>
      </div>
      <div className="row">
        <Button variant={running ? 'secondary' : 'primary'} icon={running ? <Pause size={18} /> : <Play size={18} />} onClick={() => setRunning(!running)} disabled={done}>
          {running ? 'Pause' : left < duration || round > 1 ? 'Reprendre' : 'Lancer'}
        </Button>
        <IconButton label="Passer à l'atelier suivant" onClick={skip} disabled={round >= rounds}>
          <SkipForward size={18} />
        </IconButton>
        <IconButton label="Remettre à zéro" onClick={() => reset()}>
          <RotateCcw size={18} />
        </IconButton>
      </div>
    </div>
  );
}
