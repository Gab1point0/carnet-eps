import { useMemo } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import type { Lesson } from '../types';
import { Button, Card, Section } from './ui';
import { useData } from '../store/data';
import { cycleLessons } from '../store/selectors';
import { applyChanges, levelProposals, proposalsFor } from '../lib/suggestions';
import { uid } from '../lib/util';
import { toast } from '../store/ui';

/** Dernière séance du même cycle qui a reçu un bilan (texte, ressenti ou « à ajuster »). */
export function previousReviewed(lessons: Lesson[], lesson: Lesson): Lesson | undefined {
  return lessons
    .filter((l) => l.order < lesson.order && l.status !== 'cancelled' && (l.bilan.trim() || l.rating !== null || l.adjust || l.levels))
    .sort((a, b) => b.order - a.order)[0];
}

export function pendingProposals(lessons: Lesson[], lesson: Lesson) {
  if (lesson.status !== 'planned' || !lesson.cycleId) return { prev: undefined, list: [] };
  const prev = previousReviewed(lessons, lesson);
  const all = [...(prev ? proposalsFor(prev, lesson) : []), ...levelProposals(lessons, lesson)];
  const seen = new Set<string>();
  const list = all.filter((p) => !lesson.proposalsDone.includes(p.id) && !seen.has(p.id) && seen.add(p.id));
  return { prev, list };
}

/** Propositions d'ajustement de cette séance d'après le bilan de la précédente : l'enseignant accepte ou refuse. */
export function ProposalsPanel({ lesson }: { lesson: Lesson }) {
  const data = useData((s) => s.data);
  const { prev, list } = useMemo(() => pendingProposals(lesson.cycleId ? cycleLessons(data, lesson.cycleId) : [], lesson), [data, lesson]);
  if (list.length === 0) return null;

  const mark = (id: string, extra: Partial<Lesson> = {}) => useData.getState().patch('lessons', lesson.id, { ...extra, proposalsDone: [...lesson.proposalsDone, id] });

  return (
    <Section title={<span><Lightbulb size={18} style={{ verticalAlign: '-3px' }} /> Propositions d'après {prev ? `le bilan de « ${prev.title || 'la séance précédente'} »` : 'les évaluations'}</span>}>
      <Card className="proposals">
        {list.map((p) => (
          <div key={p.id} className="proposal">
            <div className="proposal-text">
              <strong>{p.title}</strong>
              <p className="muted small">{p.why}</p>
            </div>
            <div className="proposal-actions">
              <Button
                size="sm"
                variant="primary"
                icon={<Check size={15} />}
                onClick={() => {
                  const before = { blocks: lesson.blocks, objective: lesson.objective, materials: lesson.materials, safety: lesson.safety, proposalsDone: lesson.proposalsDone };
                  mark(p.id, applyChanges(lesson, p.changes, uid));
                  toast('Modification appliquée', { tone: 'success', ms: 8000, action: { label: 'Annuler', run: () => useData.getState().patch('lessons', lesson.id, before) } });
                }}
              >
                Accepter
              </Button>
              <Button size="sm" icon={<X size={15} />} onClick={() => mark(p.id)}>
                Refuser
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </Section>
  );
}
