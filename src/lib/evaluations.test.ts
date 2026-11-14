import { describe, expect, it } from 'vitest';
import { evaluationsToGrade, GRADED } from './evaluations';
import { newBlock, newLesson } from '../store/model';
import type { Lesson } from '../types';

const lesson = (id: string, p: Partial<Lesson>): Lesson => ({ ...newLesson('c', null, 0, id), id, start: '10:00', end: '11:00', ...p });

describe('évaluations à rendre', () => {
  const evalBlock = newBlock('evaluation', 'Épreuve', 30);
  const all = [
    lesson('somm', { evalKind: 'summative', date: '2026-11-10' }),
    lesson('form', { evalKind: 'formative', date: '2026-11-12' }),
    lesson('bloc', { blocks: [evalBlock], date: '2026-11-03' }),
    lesson('diag', { evalKind: 'diagnostic', date: '2026-11-05' }),
    lesson('futur', { evalKind: 'summative', date: '2026-11-20' }),
    lesson('aujourdhui', { evalKind: 'summative', date: '2026-11-14', start: '15:00', end: '16:00' }),
    lesson('annulee', { evalKind: 'summative', date: '2026-11-04', status: 'cancelled' }),
    lesson('notee', { evalKind: 'summative', date: '2026-11-06', tasksDone: [GRADED] }),
    lesson('ecole-directe', { evalKind: 'formative', date: '2026-11-07' }),
    lesson('suivante', { date: '2026-11-08', tasksDone: ['auto:ed:ecole-directe'] }),
  ];

  it('liste les évaluations passées non notées, les plus anciennes d\'abord', () => {
    expect(evaluationsToGrade(all, '2026-11-14', '12:00').map((l) => l.id)).toEqual(['bloc', 'somm', 'form']);
  });

  it('ajoute la séance du jour une fois terminée', () => {
    expect(evaluationsToGrade(all, '2026-11-14', '16:30').map((l) => l.id)).toContain('aujourdhui');
  });
});
