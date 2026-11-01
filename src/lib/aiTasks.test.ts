import { describe, expect, it } from 'vitest';
import { ANIMATION_SCHEMA, FICHE_SCHEMA, LESSON_SCHEMA, applyOps, cleanSheet, toAnimation, toCustomSheet, type LessonOp } from './aiTasks';
import { applyChanges, emptyDraft } from './voiceLesson';
import { customDef } from './fiches';
import { newBlock, newLesson } from '../store/model';

const op = (o: Partial<LessonOp>): LessonOp => ({ action: 'add', target: null, kind: null, title: null, minutes: null, estimated: false, text: null, materials: null, field: null, value: null, ...o });

/** Le mode strict de l'API exige des objets fermés dont toutes les propriétés sont obligatoires. */
function checkStrict(s: unknown) {
  if (!s || typeof s !== 'object') return;
  const n = s as Record<string, unknown>;
  if (n.type === 'object') {
    expect(n.additionalProperties).toBe(false);
    expect((n.required as string[]).sort()).toEqual(Object.keys(n.properties as object).sort());
  }
  // Un `enum` ne doit pas être combiné à un type multiple : l'API renvoie une erreur 400.
  if (n.enum) expect(typeof n.type).toBe('string');
  for (const v of Object.values(n)) if (typeof v === 'object') checkStrict(v);
}

describe('schémas envoyés à Claude', () => {
  it('sont fermés et complets', () => {
    for (const s of [LESSON_SCHEMA, FICHE_SCHEMA, ANIMATION_SCHEMA]) checkStrict(s);
  });
});

describe('dictée par Claude', () => {
  it('ajoute, corrige puis retire, sur le brouillon et sur la séance', () => {
    const lesson = newLesson('k', 'c', 0);
    lesson.blocks = [{ ...newBlock('game', 'Match', 30), id: 'g' }];
    let r = applyOps(emptyDraft(), lesson, [op({ action: 'add', kind: 'warmup', title: 'Échauffement', minutes: 15, text: '1. **Footing** (15 min)' })], 'échauffement');
    const id = r.draft.changes[0].id;
    expect(r.draft.changes[0]).toMatchObject({ op: 'add', kind: 'warmup', minutes: 15, heard: 'échauffement' });
    r = applyOps(r.draft, lesson, [op({ action: 'update', target: id, minutes: 20 }), op({ action: 'update', target: 'g', minutes: 40 })], 'corrections');
    expect(r.draft.changes.find((c) => c.id === id)).toMatchObject({ minutes: 20, text: '1. **Footing** (15 min)' });
    expect(r.draft.changes.find((c) => c.blockId === 'g')).toMatchObject({ op: 'update', minutes: 40, title: 'Match' });
    r = applyOps(r.draft, lesson, [op({ action: 'remove', target: id }), op({ action: 'field', field: 'objective', value: 'Marquer.' })], 'retire');
    expect(r.draft.changes.some((c) => c.id === id)).toBe(false);
    const patch = applyChanges(lesson, r.draft.changes);
    expect(patch.objective).toBe('Marquer.');
    expect(patch.blocks!.map((b) => b.minutes)).toEqual([40]);
  });

  it('signale une cible inconnue sans rien casser', () => {
    const r = applyOps(emptyDraft(), newLesson('k', 'c', 0), [op({ action: 'update', target: 'inconnu', minutes: 5 })], 'x');
    expect(r.draft.changes).toEqual([]);
    expect(r.unclear).toHaveLength(1);
  });
});

describe('fiche sur mesure', () => {
  it('écarte les sections incomplètes et se construit comme une fiche', () => {
    const none = { title: null, head: null, cols: null, rows: null, tall: null, items: null, levels: null, n: null, fields: null, text: null };
    const sheet = toCustomSheet({
      title: 'Observer le revers',
      who: 'observateur',
      size: 'half',
      ident: ['Observateur'],
      sections: [
        { ...none, type: 'table', head: 'Set', cols: ['Revers tentés', 'Points'], rows: ['Set 1'] },
        { ...none, type: 'table', cols: ['Vide'] },
        { ...none, type: 'lines', title: 'Conseil', n: 50 },
      ],
    });
    expect(sheet.sections.map((s) => s.type)).toEqual(['table', 'lines']);
    expect(sheet.sections[1]).toMatchObject({ n: 8 });
    expect(customDef(sheet).build({ criteria: [] })).toHaveLength(2);
  });
});

describe('fiche modifiée à la main', () => {
  it('garde son identifiant, retire les lignes vides et les parties incomplètes', () => {
    const clean = cleanSheet({
      id: 'fiche1',
      title: ' Observer ',
      who: 'groupe',
      size: 'full',
      ident: ['Classe', ''],
      sections: [
        { type: 'checks', title: '', items: ['Regarde', '', ' Annonce '] },
        { type: 'table', cols: [''], rows: [''] },
        { type: 'text', text: '  ' },
        { type: 'lines', n: 3 },
      ],
    });
    expect(clean).toMatchObject({ id: 'fiche1', title: 'Observer', who: 'groupe', size: 'full', ident: ['Classe'] });
    expect(clean.sections).toEqual([
      { type: 'checks', title: undefined, items: ['Regarde', 'Annonce'] },
      { type: 'lines', title: undefined, n: 3 },
    ]);
  });
});

describe('animation', () => {
  it('borne les coordonnées, complète les positions, vérifie les références', () => {
    const a = toAnimation({
      court: 'basket',
      tokens: [
        { id: 'A', kind: 'player', label: 'A', color: '#2563eb' },
        { id: 'b', kind: 'ball', label: '', color: 'pas une couleur' },
      ],
      frames: [
        { caption: 'Départ', positions: [{ token: 'A', x: 120, y: -5, hidden: false, carried_by: null }, { token: 'b', x: 10, y: 10, hidden: false, carried_by: 'A' }, { token: 'fantome', x: 1, y: 1, hidden: false, carried_by: null }], arrows: [{ x1: 0, y1: 0, x2: 200, y2: 50, style: 'pass' }] },
        { caption: 'Suite', positions: [{ token: 'A', x: 50, y: 50, hidden: false, carried_by: 'inconnu' }], arrows: [] },
      ],
    });
    expect(a.frames[0].pos.A).toEqual({ x: 100, y: 0 });
    expect(a.frames[0].pos.b).toMatchObject({ carry: 'A' });
    expect(a.frames[0].pos.fantome).toBeUndefined();
    expect(a.frames[0].arrows[0].x2).toBe(100);
    expect(a.frames[1].pos.b).toMatchObject({ carry: 'A' });
    expect(a.frames[1].pos.A.carry).toBeUndefined();
    expect(a.tokens[1].color).toBe('#2563eb');
  });
});
