import { useEffect, useRef, useState } from 'react';
import { Check, Eye, Film, Loader, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Animation, AppData, Block, CustomSheet, Lesson } from '../types';
import { Button, Modal, TextArea } from './ui';
import { AnimationPlayer } from '../animation/Player';
import { FicheEditor } from './FicheEditor';
import { FicheView } from '../pages/Fiche';
import { useData } from '../store/data';
import { activityOf } from '../store/selectors';
import { aiReady } from '../lib/ai';
import { aiAnimation, aiFiche, cleanSheet, type TeachingCtx } from '../lib/aiTasks';
import { customDef } from '../lib/fiches';
import { availableMinutes, venueOf } from '../lib/venues';

/** Ce que Claude doit savoir de la classe et de la séance. */
export function teachingCtx(data: AppData, lesson: Lesson): TeachingCtx {
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  return {
    students: klass?.students ?? null,
    level: klass?.level ?? lesson.classLevels?.[0] ?? '',
    cycle: cycle?.title ?? '',
    activity: activityOf(data, lesson.activityId ?? cycle?.activityId ?? null)?.name ?? '',
    planned: availableMinutes(lesson, venueOf(data.settings, lesson)),
    activities: data.settings.activities.map((a) => a.name),
  };
}

type Mode = 'fiche' | 'animation';

/** Boutons d'un bloc : créer avec Claude une fiche adaptée ou le schéma animé. */
export function AiBlockTools({ lesson, block, onChange }: { lesson?: Lesson; block: Block; onChange: (p: Partial<Block>) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<CustomSheet | null>(null);
  const [noKey, setNoKey] = useState(false);
  const open = (m: Mode) => {
    if (!aiReady()) setNoKey(true);
    else setMode(m);
  };
  const close = () => {
    setMode(null);
    setEditing(null);
  };
  return (
    <>
      {lesson && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" icon={<Sparkles size={15} />} onClick={() => open('fiche')} disabled={!block.text.trim()}>
            Créer une fiche adaptée
          </Button>
          <Button size="sm" icon={<Film size={15} />} onClick={() => open('animation')} disabled={!block.text.trim()}>
            {block.animation ? 'Refaire le schéma avec Claude' : 'Créer le schéma animé'}
          </Button>
        </div>
      )}
      {(block.customSheets ?? []).map((s) => (
        <div key={s.id} className="row small" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span>« {s.title} » :</span>
          <button type="button" className="link-btn small" onClick={() => setEditing(s)}>
            Modifier la fiche
          </button>
          <button type="button" className="link-btn small" onClick={() => onChange({ customSheets: block.customSheets!.filter((x) => x.id !== s.id) })}>
            Retirer la fiche
          </button>
        </div>
      ))}
      {noKey && (
        <p className="muted small">
          Ces boutons utilisent Claude : ajoutez votre clé d'API dans <Link to="/settings">Réglages, « Assistant IA »</Link>.
        </p>
      )}
      {(mode || editing) && (
        <AiPreviewModal
          mode={mode ?? 'fiche'}
          lesson={lesson}
          block={block}
          initial={editing}
          onClose={close}
          onKeepFiche={(s) => onChange({ customSheets: editing ? block.customSheets!.map((x) => (x.id === s.id ? s : x)) : [...(block.customSheets ?? []), s] })}
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
  initial,
  onClose,
  onKeepFiche,
  onKeepAnimation,
}: {
  mode: Mode;
  lesson?: Lesson;
  block: Block;
  /** Fiche déjà gardée à modifier : rien n'est généré à l'ouverture. */
  initial: CustomSheet | null;
  onClose: () => void;
  onKeepFiche: (s: CustomSheet) => void;
  onKeepAnimation: (a: Animation) => void;
}) {
  const data = useData((s) => s.data);
  const [busy, setBusy] = useState(!initial);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<CustomSheet | null>(initial);
  const [anim, setAnim] = useState<Animation | null>(null);
  const [instruction, setInstruction] = useState('');
  const [byHand, setByHand] = useState(false);
  const alive = useRef(true);
  const canAsk = !!lesson && aiReady();

  const generate = async (first: boolean) => {
    if (!lesson) return;
    setBusy(true);
    setError('');
    const ctx = teachingCtx(data, lesson);
    try {
      if (mode === 'fiche') {
        const s = await aiFiche(block, ctx, first || !sheet ? null : cleanSheet(sheet), first ? '' : instruction);
        // Une fiche modifiée garde son identifiant : les liens d'impression restent valables.
        if (alive.current) {
          setSheet(initial ? { ...s, id: initial.id } : s);
          setByHand(false);
        }
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
    if (!initial) void generate(true);
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = mode === 'fiche' ? sheet : anim;
  const keep = () => {
    if (mode === 'fiche' && sheet) onKeepFiche(cleanSheet(sheet));
    if (mode === 'animation' && anim) onKeepAnimation(anim);
    onClose();
  };
  const showSheet = () => {
    if (sheet) setSheet(cleanSheet(sheet));
    setByHand(false);
  };

  return (
    <Modal
      title={mode === 'fiche' ? `Fiche pour « ${block.title} »` : `Schéma de « ${block.title} »`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={<X size={16} />} onClick={onClose}>
            {initial ? 'Annuler' : 'Ne pas garder'}
          </Button>
          <Button variant="primary" icon={<Check size={16} />} onClick={keep} disabled={!ready || busy}>
            {initial ? 'Enregistrer' : 'Garder'}
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
      {!busy && sheet && mode === 'fiche' && (
        <>
          <Button size="sm" icon={byHand ? <Eye size={15} /> : <Pencil size={15} />} onClick={() => (byHand ? showSheet() : setByHand(true))}>
            {byHand ? 'Voir la fiche' : 'Modifier à la main'}
          </Button>
          {byHand ? (
            <FicheEditor sheet={sheet} onChange={setSheet} />
          ) : (
            <div className="fiche-preview">
              <FicheView def={customDef(sheet)} ctx={{ criteria: [] }} />
            </div>
          )}
        </>
      )}
      {!busy && anim && mode === 'animation' && (
        <>
          <AnimationPlayer animation={anim} autoPlay maxHeight="360px" />
          <p className="muted small">Vérifiez les placements : vous pourrez aussi les corriger à la main avec « Modifier l'animation ».</p>
        </>
      )}
      {!busy && canAsk && (
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
