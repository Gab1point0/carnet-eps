import { useEffect, useRef, useState } from 'react';
import { Check, Film, Loader, RefreshCw, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Animation, AppData, Block, CustomSheet, Lesson } from '../types';
import { Button, Modal, TextArea } from './ui';
import { AnimationPlayer } from '../animation/Player';
import { FicheView } from '../pages/Fiche';
import { useData } from '../store/data';
import { activityOf } from '../store/selectors';
import { aiReady } from '../lib/ai';
import { aiAnimation, aiFiche, type TeachingCtx } from '../lib/aiTasks';
import { customDef } from '../lib/fiches';
import { durationOf } from '../lib/dates';

/** Ce que Claude doit savoir de la classe et de la séance. */
export function teachingCtx(data: AppData, lesson: Lesson): TeachingCtx {
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  return {
    students: klass?.students ?? null,
    level: klass?.level ?? lesson.classLevels?.[0] ?? '',
    cycle: cycle?.title ?? '',
    activity: activityOf(data, lesson.activityId ?? cycle?.activityId ?? null)?.name ?? '',
    planned: lesson.start && lesson.end ? durationOf(lesson.start, lesson.end) : 0,
    activities: data.settings.activities.map((a) => a.name),
  };
}

type Mode = 'fiche' | 'animation';

/** Boutons d'un bloc : créer avec Claude une fiche adaptée ou le schéma animé. */
export function AiBlockTools({ lesson, block, onChange }: { lesson: Lesson; block: Block; onChange: (p: Partial<Block>) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [noKey, setNoKey] = useState(false);
  const open = (m: Mode) => {
    if (!aiReady()) setNoKey(true);
    else setMode(m);
  };
  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" icon={<Sparkles size={15} />} onClick={() => open('fiche')} disabled={!block.text.trim()}>
          Créer une fiche adaptée
        </Button>
        <Button size="sm" icon={<Film size={15} />} onClick={() => open('animation')} disabled={!block.text.trim()}>
          {block.animation ? 'Refaire le schéma avec Claude' : 'Créer le schéma animé'}
        </Button>
      </div>
      {noKey && (
        <p className="muted small">
          Ces boutons utilisent Claude : ajoutez votre clé d'API dans <Link to="/settings">Réglages, « Assistant IA »</Link>.
        </p>
      )}
      {mode && (
        <AiPreviewModal
          mode={mode}
          lesson={lesson}
          block={block}
          onClose={() => setMode(null)}
          onKeepFiche={(s) => onChange({ customSheets: [...(block.customSheets ?? []), s] })}
          onKeepAnimation={(a) => onChange({ animation: a })}
        />
      )}
    </>
  );
}

function AiPreviewModal({
  mode,
  lesson,
  block,
  onClose,
  onKeepFiche,
  onKeepAnimation,
}: {
  mode: Mode;
  lesson: Lesson;
  block: Block;
  onClose: () => void;
  onKeepFiche: (s: CustomSheet) => void;
  onKeepAnimation: (a: Animation) => void;
}) {
  const data = useData((s) => s.data);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<CustomSheet | null>(null);
  const [anim, setAnim] = useState<Animation | null>(null);
  const [instruction, setInstruction] = useState('');
  const alive = useRef(true);

  const generate = async (first: boolean) => {
    setBusy(true);
    setError('');
    const ctx = teachingCtx(data, lesson);
    try {
      if (mode === 'fiche') {
        const s = await aiFiche(block, ctx, first ? null : sheet, first ? '' : instruction);
        if (alive.current) setSheet(s);
      } else {
        const a = await aiAnimation(block, ctx, first ? null : anim, first ? '' : instruction);
        if (alive.current) setAnim(a);
      }
      if (alive.current) setInstruction('');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    void generate(true);
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = mode === 'fiche' ? sheet : anim;
  const keep = () => {
    if (mode === 'fiche' && sheet) onKeepFiche(sheet);
    if (mode === 'animation' && anim) onKeepAnimation(anim);
    onClose();
  };

  return (
    <Modal
      title={mode === 'fiche' ? `Fiche pour « ${block.title} »` : `Schéma de « ${block.title} »`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={<X size={16} />} onClick={onClose}>
            Ne pas garder
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={keep} disabled={!ready || busy}>
            Garder
          </Button>
        </>
      }
    >
      {busy && (
        <p className="muted row" style={{ gap: 8 }}>
          <Loader size={16} className="spin" /> Claude prépare {mode === 'fiche' ? 'la fiche' : 'le schéma'}…
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      {!busy && sheet && mode === 'fiche' && <FicheView def={customDef(sheet)} ctx={{ criteria: [] }} />}
      {!busy && anim && mode === 'animation' && (
        <>
          <AnimationPlayer animation={anim} autoPlay maxHeight="360px" />
          <p className="muted small">Vérifiez les placements : vous pourrez aussi les corriger à la main avec « Modifier l'animation ».</p>
        </>
      )}
      {!busy && (
        <div className="voice-type">
          <TextArea value={instruction} onChange={setInstruction} minRows={2} placeholder={ready ? 'Ce qu\'il faut changer (facultatif) : « ajoute une colonne pour les fautes », « mets 2 défenseurs »…' : 'Précisions pour Claude (facultatif)'} />
          <Button size="sm" icon={<RefreshCw size={15} />} onClick={() => generate(!ready)}>
            {ready ? 'Refaire avec ces changements' : 'Réessayer'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
