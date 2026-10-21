import { describe, expect, it } from 'vitest';
import { applyChanges, proposalsFor, sentimentOf, themesOf } from './suggestions';
import { newBlock, newLesson } from '../store/model';

function lessonWith(minutes: number[], over: Partial<ReturnType<typeof newLesson>> = {}) {
  const l = newLesson('k', 'c', 0);
  l.start = '08:00';
  l.end = '10:00';
  l.blocks = minutes.map((m, i) => ({ ...newBlock(i === 0 ? 'warmup' : 'situation', `B${i}`, m), id: `b${i}` }));
  return Object.assign(l, over);
}

describe('propositions après bilan', () => {
  it('repère les thèmes dictés, accents ou pas', () => {
    expect([...themesOf("On n'a pas eu le temps de finir, et c'était trop facile pour certains")].sort()).toEqual(['easy', 'time']);
    expect(sentimentOf('Super séance, les élèves étaient motivés')).toBe(3);
    expect(sentimentOf('Séance compliquée, un vrai problème')).toBe(1);
  });

  it('manque de temps : raccourcit le bloc le plus long', () => {
    const prev = lessonWith([], { id: 'p', bilan: 'Pas eu le temps de finir la situation.', adjust: true });
    const next = lessonWith([10, 50, 20, 10], { id: 'n' });
    const [p] = proposalsFor(prev, next);
    expect(p.changes).toEqual([{ type: 'minutes', blockId: 'b1', minutes: 40 }]);
    const patch = applyChanges(next, p.changes, () => 'x');
    expect(patch.blocks!.map((b) => b.minutes)).toEqual([10, 40, 20, 10]);
  });

  it('séance qui dépasse le créneau : retire l\'excédent', () => {
    const prev = lessonWith([], { id: 'p', bilan: 'trop long' });
    const next = lessonWith([10, 70, 30, 20], { id: 'n' }); // 130 min pour 120
    const [p] = proposalsFor(prev, next);
    expect(p.changes[0]).toMatchObject({ type: 'minutes', minutes: 55 }); // 70 − max(5, 15 (20 % arrondi à 5), 10)
  });

  it('trop difficile : insère un rappel en prenant du temps au plus long bloc', () => {
    const prev = lessonWith([], { id: 'p', bilan: "Ils n'ont pas compris la consigne, c'était trop difficile." });
    const next = lessonWith([10, 40, 20], { id: 'n' });
    const [p] = proposalsFor(prev, next);
    const patch = applyChanges(next, p.changes, () => 'new');
    expect(patch.blocks!.map((b) => [b.id, b.minutes])).toEqual([['b0', 10], ['new', 5], ['b1', 35], ['b2', 20]]);
    expect(patch.blocks!.reduce((a, b) => a + b.minutes, 0)).toBe(70);
  });

  it('ajoute les consignes dans les champs texte sans écraser', () => {
    const prev = lessonWith([], { id: 'p', bilan: 'Beaucoup de bruit et des files d\'attente.' });
    const next = lessonWith([20], { id: 'n', safety: 'Zones.' });
    const ps = proposalsFor(prev, next);
    expect(ps.map((p) => p.id.split(':')[1]).sort()).toEqual(['noise', 'wait']);
    const patch = applyChanges(next, ps.flatMap((p) => p.changes), () => 'x');
    expect(patch.safety!.startsWith('Zones.\n')).toBe(true);
  });

  it('rien à proposer sans bilan exploitable', () => {
    expect(proposalsFor(lessonWith([], { id: 'p', bilan: '' }), lessonWith([20]))).toEqual([]);
  });
});
