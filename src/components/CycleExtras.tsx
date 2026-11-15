import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader, Mic, MicOff, Sparkles } from 'lucide-react';
import type { Cycle, Lesson } from '../types';
import { useData } from '../store/data';
import { toast, toastUndo } from '../store/ui';
import { aiReady } from '../lib/ai';
import { aiCycleFields, aiCycleReview, aiLessonTitles, isGenericTitle } from '../lib/aiTasks';
import { useDictation } from '../lib/dictation';
import { activityOf } from '../store/selectors';
import { classAverage } from '../lib/grading';
import { EVAL_KINDS } from '../lib/levels';
import { formatShort, todayISO } from '../lib/dates';
import { cls, plural } from '../lib/util';
import { Button, Modal, Section, TextArea } from './ui';
import { MarkdownField } from './MarkdownField';

/** Frise du cycle : une pastille par séance (faite, bilan à faire, prête, à préparer), l'évaluation marquée. */
export function CycleTimeline({ lessons }: { lessons: Lesson[] }) {
  const today = todayISO();
  if (!lessons.length) return null;
  const next = lessons.find((l) => l.status !== 'cancelled' && l.date && l.date >= today);
  const done = lessons.filter((l) => l.status === 'done').length;
  const state = (l: Lesson) =>
    l.status === 'cancelled' ? 'cancelled' : l.status === 'done' ? 'done' : l.date && l.date < today ? 'review' : l.blocks.length ? 'ready' : 'empty';
  const LABEL = { cancelled: 'annulée', done: 'faite', review: 'bilan à faire', ready: 'prête', empty: 'à préparer' } as const;
  return (
    <div className="cycle-timeline">
      <div className="cycle-dots">
        {lessons.map((l, i) => {
          const st = state(l);
          return (
            <Link
              key={l.id}
              to={`/lessons/${l.id}`}
              className={cls('cycle-dot', `cycle-dot-${st}`, next?.id === l.id && 'cycle-dot-next')}
              title={`${i + 1}. ${l.title || 'Séance'}${l.date ? ` · ${formatShort(l.date)}` : ''} · ${LABEL[st]}`}
            >
              {l.evalKind ? EVAL_KINDS[l.evalKind].emoji : i + 1}
            </Link>
          );
        })}
      </div>
      <p className="muted small">
        {done}/{lessons.length} faites
        {next && (
          <>
            {' · Prochaine : '}
            <Link to={`/lessons/${next.id}`}>{next.title || `séance ${lessons.indexOf(next) + 1}`}</Link>
            {next.date && ` (${formatShort(next.date)})`}
          </>
        )}
      </p>
    </div>
  );
}

/** « Proposer des titres » : Claude nomme les séances qui s'appellent seulement « Séance 3 » ou « Nouvelle séance ». */
export function TitlesButton({ cycle, lessons }: { cycle: Cycle; lessons: Lesson[] }) {
  const generic = lessons.filter((l) => isGenericTitle(l.title) && (l.blocks.length || l.objective.trim()));
  const [busy, setBusy] = useState(false);
  const [proposals, setProposals] = useState<Array<{ id: string; title: string; keep: boolean }> | null>(null);
  if (!generic.length || !aiReady()) return null;

  const ask = async () => {
    setBusy(true);
    try {
      const titles = await aiLessonTitles(
        cycle.title,
        generic.map((l) => ({ id: l.id, number: lessons.indexOf(l) + 1, objective: l.objective, blocks: l.blocks.map((b) => b.title) })),
      );
      setProposals(titles.map((t) => ({ ...t, keep: true })));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Claude est indisponible.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const apply = () => {
    const kept = (proposals ?? []).filter((p) => p.keep);
    const before = kept.map((p) => ({ id: p.id, title: useData.getState().data.lessons[p.id]?.title ?? '' }));
    useData.getState().transact((tx) => kept.forEach((p) => tx.patch('lessons', p.id, { title: p.title })));
    toastUndo(`${plural(kept.length, 'titre')} appliqué${kept.length > 1 ? 's' : ''}`, () =>
      useData.getState().transact((tx) => before.forEach((b) => tx.patch('lessons', b.id, { title: b.title }))),
    );
    setProposals(null);
  };

  return (
    <>
      <Button size="sm" icon={busy ? <Loader size={15} className="spin" /> : <Sparkles size={15} />} onClick={ask} disabled={busy}>
        Proposer des titres ({generic.length})
      </Button>
      {proposals && (
        <Modal
          title="Titres proposés par Claude"
          onClose={() => setProposals(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setProposals(null)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={apply} disabled={!proposals.some((p) => p.keep)}>
                Appliquer
              </Button>
            </>
          }
        >
          <div className="stack" style={{ gap: 10 }}>
            {proposals.map((p) => (
              <label key={p.id} className="check" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={p.keep} onChange={(e) => setProposals((cur) => cur!.map((x) => (x.id === p.id ? { ...x, keep: e.target.checked } : x)))} />
                <span className="grow">
                  <input className="input" value={p.title} onChange={(e) => setProposals((cur) => cur!.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)))} />
                  <span className="muted small">Actuellement : {useData.getState().data.lessons[p.id]?.title || 'sans titre'}</span>
                </span>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Bilan de fin de cycle : écrit à la main, ou rédigé par Claude à partir des bilans de séance et des niveaux relevés. */
export function CycleReview({ cycle, lessons }: { cycle: Cycle; lessons: Lesson[] }) {
  const [busy, setBusy] = useState(false);
  const patch = (review: string) => useData.getState().patch('cycles', cycle.id, { review });
  const reviewed = lessons.filter((l) => l.bilan.trim() || l.rating || l.levels || l.grading).length;

  const write = async () => {
    setBusy(true);
    try {
      const text = await aiCycleReview({
        cycle: cycle.title,
        objectifs: cycle.objectives,
        evaluation: cycle.evaluation,
        seances: lessons.map((l, i) => ({
          numero: i + 1,
          titre: l.title,
          date: l.date,
          etat: l.status,
          evaluation: l.evalKind,
          ressenti: l.rating ? ['', 'à revoir', 'correct', 'très bien'][l.rating] : null,
          a_ajuster: l.adjust,
          bilan: l.bilan || null,
          niveaux_debutant_encours_acquis_avance: l.levels,
          moyenne_sur_20: classAverage(l.grading),
        })),
      });
      const before = cycle.review;
      patch(text);
      if (before.trim()) toastUndo('Bilan du cycle rédigé', () => patch(before));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Claude est indisponible.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Bilan du cycle"
      actions={
        aiReady() && (
          <Button size="sm" icon={busy ? <Loader size={15} className="spin" /> : <Sparkles size={15} />} onClick={write} disabled={busy || reviewed === 0} title={reviewed ? undefined : 'Faites au moins un bilan de séance'}>
            {cycle.review.trim() ? 'Réécrire avec Claude' : 'Rédiger avec Claude'}
          </Button>
        )
      }
    >
      <MarkdownField
        value={cycle.review}
        onChange={patch}
        minRows={3}
        placeholder={reviewed ? 'Ce qui a marché, ce qui a coincé, le niveau atteint, ce que vous changerez la prochaine fois…' : 'À écrire à la fin du cycle. Claude peut le rédiger à partir de vos bilans de séance.'}
      />
    </Section>
  );
}

/** « Compléter avec Claude » : à l'écrit ou à l'oral, Claude remplit objectifs, attendus, évaluation et notes du cycle. */
export function CycleAiFill({ cycle, lessons }: { cycle: Cycle; lessons: Lesson[] }) {
  const data = useData((s) => s.data);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const textRef = useRef('');
  const setT = (v: string) => {
    textRef.current = v;
    setText(v);
  };
  const dictation = useDictation((t) => setT(textRef.current.trim() ? `${textRef.current.trim()} ${t}` : t));
  if (!aiReady()) return null;
  const klass = cycle.classId ? data.classes[cycle.classId] : undefined;
  const empty = !cycle.objectives.trim() && !cycle.competences.trim() && !cycle.evaluation.trim();

  const run = async () => {
    dictation.stop();
    const pending = await dictation.flush();
    const spoken = `${textRef.current} ${pending}`.trim();
    setBusy(true);
    try {
      const current = { objectives: cycle.objectives, competences: cycle.competences, evaluation: cycle.evaluation, notes: cycle.notes };
      const next = await aiCycleFields({
        className: klass?.name ?? '',
        level: klass?.level ?? cycle.classLevels[0] ?? '',
        students: klass?.students ?? null,
        activity: activityOf(data, cycle.activityId)?.name ?? '',
        title: cycle.title,
        dates: [cycle.startDate, cycle.endDate].filter(Boolean).join(' → '),
        lessons: lessons.map((l) => l.title),
        current,
        spoken,
      });
      useData.getState().patch('cycles', cycle.id, next);
      setT('');
      toastUndo('Cycle complété par Claude', () => useData.getState().patch('cycles', cycle.id, current));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Claude est indisponible.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack cycle-ai" style={{ gap: 8 }}>
      <strong className="row" style={{ gap: 6 }}>
        <Sparkles size={16} /> {empty ? 'Compléter le cycle avec Claude' : 'Modifier le cycle avec Claude'}
      </strong>
      <p className="muted small">
        Dites ou écrivez ce que vous voulez (« objectif : construire le surnombre ; évaluation en tournoi par équipes »), ou laissez vide : Claude remplit objectifs, attendus (AFC ou AFL), évaluation et notes d'après la classe et l'activité.
      </p>
      {dictation.supported && (
        <button type="button" className={cls('dictate-btn', dictation.listening && 'dictate-on')} onClick={dictation.listening ? dictation.stop : dictation.start}>
          {dictation.listening ? <MicOff size={20} /> : <Mic size={20} />}
          <span>{dictation.listening ? 'Je vous écoute… touchez pour arrêter' : 'Parler'}</span>
        </button>
      )}
      {dictation.error && <p className="error-text small">{dictation.error}</p>}
      {dictation.interim && <p className="muted small dictate-interim">… {dictation.interim}</p>}
      {dictation.status && <p className="muted small dictate-interim">{dictation.status}</p>}
      <TextArea value={text} onChange={setT} minRows={2} placeholder="Ce que vous voulez dans ce cycle (facultatif)" />
      <div>
        <Button variant="primary" size="sm" icon={busy ? <Loader size={15} className="spin" /> : <Sparkles size={15} />} onClick={run} disabled={busy}>
          {busy ? 'Claude complète le cycle…' : empty ? 'Compléter avec Claude' : 'Appliquer avec Claude'}
        </Button>
      </div>
    </div>
  );
}
