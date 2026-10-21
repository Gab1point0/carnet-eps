import { describe, expect, it } from 'vitest';
import { emptyData, newBlock, newCycle, newKlass, newLesson } from '../store/model';
import { previousLesson, taskGroups, tasksFor } from './tasks';
import type { AppData, Lesson } from '../types';

function setup() {
  const data: AppData = emptyData();
  const k = newKlass('y', 0, '4e');
  k.id = 'k';
  const c1 = newCycle('k', 0, 'Basket-ball');
  c1.id = 'c1';
  c1.startDate = '2026-11-23';
  const c2 = newCycle('k', 1, 'Natation');
  c2.id = 'c2';
  c2.startDate = '2027-02-22';
  data.classes.k = k;
  data.cycles.c1 = c1;
  data.cycles.c2 = c2;
  const mk = (cycle: string, order: number, date: string, over: Partial<Lesson> = {}) => {
    const l = newLesson('k', cycle, order, `S${order + 1}`);
    l.id = `${cycle}-${order}`;
    l.date = date;
    l.blocks = [newBlock('warmup'), newBlock('situation'), newBlock('cooldown')];
    l.objective = 'Objectif';
    Object.assign(l, over);
    data.lessons[l.id] = l;
    return l;
  };
  return { data, mk };
}

describe('tâches avant la prochaine séance', () => {
  it('après une évaluation faite : École Directe, bilan et niveau à relever', () => {
    const { data, mk } = setup();
    mk('c1', 0, '2026-11-23', { status: 'done', evalKind: 'formative' });
    const next = mk('c1', 1, '2026-11-30');
    const ids = tasksFor(data, next, '2026-11-24').map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['auto:ed:c1-0', 'auto:levels:c1-0']));
    // Le bilan n'est demandé que si la séance est passée sans bilan.
    expect(ids.some((i) => i.startsWith('auto:bilan'))).toBe(true);
  });

  it('une évaluation diagnostique, jamais notée, ne demande pas de saisie École Directe', () => {
    const { data, mk } = setup();
    mk('c1', 0, '2026-11-23', { status: 'done', evalKind: 'diagnostic' });
    const next = mk('c1', 1, '2026-11-30');
    const ids = tasksFor(data, next, '2026-11-24').map((t) => t.id);
    expect(ids.some((i) => i.startsWith('auto:ed:'))).toBe(false);
    expect(ids).toContain('auto:levels:c1-0');
  });

  it('une tâche faite est mémorisée, une tâche manuelle apparaît', () => {
    const { data, mk } = setup();
    mk('c1', 0, '2026-11-23', { status: 'done', evalKind: 'summative', rating: 2 });
    const next = mk('c1', 1, '2026-11-30', { tasksDone: ['auto:ed:c1-0'], todos: [{ id: 't1', text: 'Réserver le gymnase', done: false }] });
    const tasks = tasksFor(data, next, '2026-11-24');
    expect(tasks.find((t) => t.id === 'auto:ed:c1-0')?.done).toBe(true);
    expect(tasks.find((t) => t.id === 't1')).toMatchObject({ manual: true, text: 'Réserver le gymnase' });
  });

  it('la séance précédente d\'un nouveau cycle est la dernière du cycle d\'avant', () => {
    const { data, mk } = setup();
    mk('c1', 0, '2026-11-23');
    const last = mk('c1', 1, '2026-11-30', { evalKind: 'summative', status: 'done' });
    const first = mk('c2', 0, '2027-02-22');
    expect(previousLesson(data, first)?.id).toBe(last.id);
  });

  it('début de cycle : groupes d\'après l\'effectif, installation de natation', () => {
    const { data, mk } = setup();
    const l = mk('c2', 0, '2027-02-22', { safety: 'Règles.\n👥 Effectif 28 élèves : 3 groupes (9 de 9 + 1 de 10).' });
    const tasks = tasksFor(data, l, '2027-02-20');
    expect(tasks.find((t) => t.id === 'auto:groups')?.detail).toMatch(/3 groupes/);
    expect(tasks.some((t) => t.id === 'auto:facility')).toBe(true);
  });

  it('ne regroupe que les 2 prochaines séances de chaque classe', () => {
    const { data, mk } = setup();
    ['2026-11-23', '2026-11-30', '2026-12-07'].forEach((d, i) => mk('c1', i, d, { blocks: [] }));
    const lessons = Object.values(data.lessons).sort((a, b) => a.date!.localeCompare(b.date!));
    expect(taskGroups(data, lessons, '2026-11-20')).toHaveLength(2);
  });
});
