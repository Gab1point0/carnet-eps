import { describe, expect, it } from 'vitest';
import { applyChanges, emptyDraft, findDurations, ingest, type Draft } from './voiceLesson';
import { newBlock, newLesson } from '../store/model';

const ctx = { students: 30, activity: 'Tennis de table', planned: 110, activities: ['Tennis de table', 'Badminton', 'Basket-ball'] };

function say(phrases: string[], lesson = newLesson('k', 'c', 0)) {
  let draft: Draft = emptyDraft();
  for (const p of phrases) draft = ingest(draft, lesson, p, ctx).draft;
  return { draft, lesson, c: draft.changes };
}

describe('durées dites à l\'oral', () => {
  it('reconnaît chiffres, lettres et expressions', () => {
    expect(findDurations('15 minutes')[0].minutes).toBe(15);
    expect(findDurations('pendant vingt minutes')[0].minutes).toBe(20);
    expect(findDurations('un quart d\'heure')[0].minutes).toBe(15);
    expect(findDurations('une demi-heure')[0].minutes).toBe(30);
    expect(findDurations('rotation toutes les 5 minutes')).toEqual([]);
  });
});

describe('dictée d\'une séance', () => {
  it('échauffement : met en forme les étapes et répartit le temps', () => {
    const { c } = say(['échauffement 15 minutes, éducatifs puis footing']);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ op: 'add', kind: 'warmup', title: 'Échauffement', minutes: 15, estimated: false });
    expect(c[0].text).toMatch(/1\. \*\*Éducatifs de course.*\(8 min\)/);
    expect(c[0].text).toMatch(/2\. \*\*Footing progressif.*\(8 min\)/);
  });

  it('match avec règle : titre clair, temps estimé, organisation selon l\'effectif', () => {
    const { c } = say(["je veux une situation de match en tennis de table où les points seraient bonifiés lorsque l'on tape en revers"]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'game', estimated: true, minutes: 20 });
    expect(c[0].title).toBe('Match à thème : points bonifiés en revers');
    expect(c[0].text).toMatch(/les points sont bonifiés lorsque l'on frappe en revers/);
    expect(c[0].text).toMatch(/10 tables/);
  });

  it('plusieurs blocs dans la même phrase', () => {
    const { c } = say(['échauffement 10 minutes footing puis un atelier de service 20 minutes puis un match 25 minutes et retour au calme 5 minutes']);
    expect(c.map((x) => [x.kind, x.minutes])).toEqual([['warmup', 10], ['skill', 20], ['game', 25], ['cooldown', 5]]);
  });

  it('les informations s\'ajoutent au fur et à mesure', () => {
    const { c } = say(['échauffement', '15 minutes', 'footing puis gainage']);
    expect(c).toHaveLength(1);
    expect(c[0].minutes).toBe(15);
    expect(c[0].text).toMatch(/Footing/);
    expect(c[0].text).toMatch(/Gainage/);
  });

  it('revenir sur une information la change', () => {
    const a = say(['échauffement 15 minutes footing', "finalement l'échauffement 20 minutes"]).c;
    expect(a).toHaveLength(1);
    expect(a[0].minutes).toBe(20);
    const b = say(['un match 20 minutes', 'finalement 30 minutes']).c;
    expect(b[0].minutes).toBe(30);
    const d = say(['un match où les points sont bonifiés en revers', 'pas en revers mais en coup droit']).c;
    expect(d[0].text).toMatch(/coup droit/);
    expect(d[0].text).not.toMatch(/revers/);
    const e = say(['échauffement footing', 'un match', 'enlève le match']).c;
    expect(e.map((x) => x.kind)).toEqual(['warmup']);
  });

  it('cible la bonne situation et complète un bloc précis', () => {
    const a = say(['une situation de passes 10 minutes', 'une situation de tirs 10 minutes', 'la première situation 15 minutes']).c;
    expect(a.map((x) => x.minutes)).toEqual([15, 10]);
    const b = say(['échauffement footing', 'un match', "ajoute du gainage à l'échauffement"]).c;
    expect(b[0].text).toMatch(/Gainage/);
    expect(b).toHaveLength(2);
  });

  it('agit sur les blocs déjà présents dans la séance', () => {
    const lesson = newLesson('k', 'c', 0);
    lesson.blocks = [{ ...newBlock('warmup', 'Échauffement', 10), id: 'w' }, { ...newBlock('game', 'Match', 30), id: 'g' }];
    const { c } = say(['le match 40 minutes', "enlève l'échauffement"], lesson);
    expect(c.find((x) => x.blockId === 'g')).toMatchObject({ op: 'update', minutes: 40 });
    expect(c.find((x) => x.blockId === 'w')).toMatchObject({ op: 'remove' });
    const patch = applyChanges(lesson, c);
    expect(patch.blocks!.map((b) => [b.id, b.minutes])).toEqual([['g', 40]]);
  });

  it('objectif et champs de la séance', () => {
    const { c } = say(['objectif de la séance apprendre le service court']);
    expect(c[0]).toMatchObject({ op: 'field', field: 'objective', value: 'Apprendre le service court.' });
  });

  it('applique seulement les changements choisis, dans le bon ordre', () => {
    const lesson = newLesson('k', 'c', 0);
    lesson.blocks = [{ ...newBlock('cooldown', 'Fin', 5), id: 'fin' }];
    const { c } = say(['un match 20 minutes', 'échauffement footing', 'un atelier de service'], lesson);
    const kept = c.filter((x) => x.kind !== 'skill');
    const patch = applyChanges(lesson, kept);
    expect(patch.blocks!.map((b) => b.kind)).toEqual(['warmup', 'game', 'cooldown']);
  });
});
