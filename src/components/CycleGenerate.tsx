import { useRef, useState } from 'react';
import { AlertTriangle, ListOrdered, Loader, Sparkles, Wand2 } from 'lucide-react';
import type { Cycle, Lesson } from '../types';
import { useData } from '../store/data';
import { cycleLessons, activityOf } from '../store/selectors';
import { toast, toastUndo } from '../store/ui';
import { aiReady } from '../lib/ai';
import { aiCyclePlan, aiFromObjective, isGenericTitle, type CycleCtx, type PlannedLesson } from '../lib/aiTasks';
import { applyChanges, emptyDraft } from '../lib/voiceLesson';
import { materialsFromBlocks } from '../lib/materials';
import { durationOf } from '../lib/dates';
import { cls } from '../lib/util';
import { teachingCtx } from './AiBlockTools';
import { LESSON_FORMATS, lessonFormatOf } from '../lib/lessonFormats';
import { Button, Modal } from './ui';
import { VoiceTextArea, type VoiceTextAreaHandle } from './VoiceTextArea';

type Mode = 'plan' | 'full';

/** Une séance « vide » : pas de bloc et un titre qui ne dit rien. C'est elle que la génération remplit par défaut. */
const isEmptyLesson = (l: Lesson) => l.blocks.length === 0;

/**
 * « Générer les séances » : Claude propose le plan de la séquence (titres, objectifs, moments d'évaluation),
 * puis, en mode complet, construit chaque séance d'après ce plan. Annulable d'un coup à la fin.
 */
export function CycleGenerateButton({ cycle, lessons }: { cycle: Cycle; lessons: Lesson[] }) {
  const [open, setOpen] = useState(false);
  if (!aiReady() || !lessons.length) return null;
  return (
    <>
      <Button size="sm" variant="primary" icon={<Wand2 size={15} />} onClick={() => setOpen(true)}>
        Générer les séances
      </Button>
      {open && <CycleGenerateModal cycle={cycle} lessons={lessons} onClose={() => setOpen(false)} />}
    </>
  );
}

function CycleGenerateModal({ cycle, lessons, onClose }: { cycle: Cycle; lessons: Lesson[]; onClose: () => void }) {
  const data = useData((s) => s.data);
  const [mode, setMode] = useState<Mode>('plan');
  const [replace, setReplace] = useState(false);
  const [instruction, setInstruction] = useState('');
  const voice = useRef<VoiceTextAreaHandle>(null);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState('');
  const cancel = useRef(false);

  const live = lessons.filter((l) => l.status !== 'cancelled');
  const targets = live.filter((l) => replace || isEmptyLesson(l));
  const missing = [!cycle.objectives.trim() && 'les objectifs', !cycle.competences.trim() && 'les attendus', !cycle.evaluation.trim() && "l'évaluation"].filter(Boolean) as string[];
  const klass = cycle.classId ? data.classes[cycle.classId] : undefined;
  // Format de séance gardé avec le cycle : le même à chaque génération, tant qu'on ne le change pas.
  const format = lessonFormatOf(cycle.lessonFormat);
  const setFormat = (id: string) => useData.getState().patch('cycles', cycle.id, { lessonFormat: id || undefined });

  const run = async () => {
    setError('');
    cancel.current = false;
    const said = (await voice.current?.finish()) ?? instruction;
    const snapshot = targets.map((l) => ({ id: l.id, before: { title: l.title, objective: l.objective, evalKind: l.evalKind, blocks: l.blocks, materials: l.materials, safety: l.safety } }));
    const restore = () => useData.getState().transact((tx) => snapshot.forEach((s) => tx.patch('lessons', s.id, s.before)));
    let done = 0;
    try {
      setProgress('Claude prépare le plan de la séquence…');
      const plan: PlannedLesson[] = await aiCyclePlan({
        className: klass?.name ?? '',
        level: klass?.level ?? cycle.classLevels[0] ?? '',
        students: klass?.students ?? null,
        activity: activityOf(data, cycle.activityId)?.name ?? '',
        cycle: { title: cycle.title, objectives: cycle.objectives, competences: cycle.competences, evaluation: cycle.evaluation, notes: cycle.notes },
        lessons: live.map((l, i) => ({
          number: i + 1,
          date: l.date,
          minutes: l.start && l.end ? durationOf(l.start, l.end) : 0,
          title: isGenericTitle(l.title) ? '' : l.title,
          objective: l.objective,
          prepared: !isEmptyLesson(l),
        })),
        instruction: said,
        format: format?.prompt,
      });
      const planText = plan.map((p, k) => `${k + 1}. ${p.title} — ${p.objective}`).join('\n');

      for (const l of targets) {
        if (cancel.current) break;
        const i = live.findIndex((x) => x.id === l.id);
        const p = plan[i];
        if (!p?.title) continue;
        const base: Partial<Lesson> = {
          title: p.title,
          ...(replace || !l.objective.trim() ? { objective: p.objective } : {}),
          ...(replace || !l.evalKind ? { evalKind: p.evalKind } : {}),
        };
        if (mode === 'plan') {
          useData.getState().patch('lessons', l.id, base);
        } else {
          setProgress(`Claude construit la séance ${i + 1} sur ${live.length}… (${done}/${targets.length} faites)`);
          const state = useData.getState().data;
          const current = state.lessons[l.id];
          // Mode « remplacer » : on repart d'une séance vide, pour que Claude ne garde rien de l'ancienne.
          const start: Lesson = { ...current, ...base, blocks: replace ? [] : current.blocks };
          const all = cycleLessons(state, cycle.id).filter((x) => x.status !== 'cancelled');
          const pos = all.findIndex((x) => x.id === l.id);
          const cycleCtx: CycleCtx = {
            objectives: cycle.objectives,
            evaluation: cycle.evaluation,
            position: pos + 1,
            count: all.length,
            previous: all.slice(Math.max(0, pos - 3), pos).map((x) => ({ title: x.title, objective: x.objective, bilan: x.bilan })),
            format: format?.prompt,
          };
          const r = await aiFromObjective(
            emptyDraft(),
            start,
            `${p.title} : ${p.objective}\n\nPlan de la séquence (pour situer cette séance dans la progression) :\n${planText}${said.trim() ? `\n\nConsignes de l'enseignant pour tout le cycle : ${said.trim()}` : ''}`,
            teachingCtx(state, start),
            cycleCtx,
          );
          const patch = applyChanges(start, r.draft.changes);
          const blocks = patch.blocks ?? start.blocks;
          // Le plan fixe le titre et le moment d'évaluation ; le matériel de la séance se déduit des blocs.
          useData.getState().patch('lessons', l.id, { ...patch, ...base, blocks, materials: materialsFromBlocks({ materials: '', blocks }) });
        }
        done++;
      }
      setProgress('');
      toastUndo(`${done} séance${done > 1 ? 's' : ''} ${mode === 'plan' ? 'planifiée' : 'générée'}${done > 1 ? 's' : ''} par Claude`, restore);
      onClose();
    } catch (e) {
      setProgress('');
      setError(`${e instanceof Error ? e.message : 'Claude est indisponible.'}${done ? ` ${done} séance${done > 1 ? 's ont' : ' a'} déjà été faite${done > 1 ? 's' : ''} : vous pouvez relancer pour la suite.` : ''}`);
      if (done) toast(`${done} séance${done > 1 ? 's' : ''} déjà générée${done > 1 ? 's' : ''}.`, { action: { label: 'Annuler', run: restore }, ms: 10000 });
    }
  };

  const running = !!progress;

  return (
    <Modal
      title="Générer les séances du cycle"
      onClose={() => (running ? (cancel.current = true) : onClose())}
      footer={
        running ? (
          <Button variant="ghost" onClick={() => (cancel.current = true)}>
            Arrêter après cette séance
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" icon={<Sparkles size={16} />} onClick={run} disabled={targets.length === 0}>
              Générer {targets.length} séance{targets.length > 1 ? 's' : ''}
            </Button>
          </>
        )
      }
    >
      <div className="callout gen-disclaimer">
        <AlertTriangle size={18} />
        <p className="small">
          <strong>Attention :</strong> ce que génère l'IA est une proposition, purement indicative. Votre expertise d'enseignant, votre connaissance de la classe et des installations restent bien plus pertinentes pour construire la séquence : relisez et adaptez chaque séance.
        </p>
      </div>

      {missing.length > 0 && (
        <p className="error-text small">
          Il manque {missing.join(', ')} du cycle : la génération sera moins juste. Utilisez d'abord « Compléter le cycle avec Claude » dans « Objectifs, évaluation et réglages ».
        </p>
      )}

      <div className="gen-modes">
        <button type="button" className={cls('card', 'gen-mode', mode === 'plan' && 'gen-mode-on')} onClick={() => setMode('plan')} aria-pressed={mode === 'plan'}>
          <ListOrdered size={20} />
          <strong>Plan de la séquence</strong>
          <span className="muted small">Titre, objectif et moment d'évaluation de chaque séance : un guide, vous écrivez le contenu. Rapide.</span>
        </button>
        <button type="button" className={cls('card', 'gen-mode', mode === 'full' && 'gen-mode-on')} onClick={() => setMode('full')} aria-pressed={mode === 'full'}>
          <Wand2 size={20} />
          <strong>Séances complètes</strong>
          <span className="muted small">Chaque séance construite en détail : échauffement, situations, organisation, matériel. Une demande à Claude par séance (quelques minutes).</span>
        </button>
      </div>

      <label className="field">
        <span className="field-label">Format des séances</span>
        <select className="input" value={format?.id ?? ''} onChange={(e) => setFormat(e.target.value)}>
          <option value="">Libre : Claude choisit la structure de chaque séance</option>
          {LESSON_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.fits})
            </option>
          ))}
        </select>
        <span className="field-hint">{format ? `${format.hint} Gardé pour ce cycle.` : 'Choisissez un format pour que toutes les séances du cycle aient la même structure.'}</span>
      </label>

      <label className="check small">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Remplacer aussi les séances déjà préparées ({live.length - live.filter(isEmptyLesson).length})
      </label>
      <p className="muted small">
        {targets.length === 0 ? 'Toutes les séances sont déjà préparées : cochez la case ci-dessus pour les refaire.' : `${targets.length} séance${targets.length > 1 ? 's' : ''} sur ${live.length} ser${targets.length > 1 ? 'ont' : 'a'} remplie${targets.length > 1 ? 's' : ''}. Tout s'annule d'un geste à la fin.`}
      </p>

      <VoiceTextArea ref={voice} value={instruction} onChange={setInstruction} minRows={2} placeholder="Consignes pour tout le cycle (facultatif) : « le même échauffement à chaque séance », « une seule salle », « travail par ateliers »…" />

      {progress && (
        <p className="muted row" style={{ gap: 8 }}>
          <Loader size={16} className="spin" /> {progress}
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
    </Modal>
  );
}
