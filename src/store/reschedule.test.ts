import { beforeEach, describe, expect, it } from 'vitest';
import { useData } from './data';
import { cancelAndShift, closeDays, extractSituations, postponeLesson, previewClosure, saveLessonAsTemplate } from './actions';
import { emptyData, newBlock, newCycle, newKlass, newLesson, newSlot, newYear } from './model';
import { cycleLessons } from './selectors';
import { criteriaOf, lessonMaterialTexts, mergeMaterials, splitMaterials } from '../lib/materials';

const MONDAYS = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'];

function setup() {
  const data = emptyData();
  const year = newYear('2026-2027', '2026-11-02', '2027-07-02');
  year.id = 'y';
  const k = newKlass('y', 0, '6e');
  k.id = 'k';
  k.slots = [newSlot(1, '08:00', '10:00')];
  const c = newCycle('k', 0, 'Cycle');
  c.id = 'c';
  data.years.y = year;
  data.classes.k = k;
  data.cycles.c = c;
  MONDAYS.forEach((d, i) => {
    const l = newLesson('k', 'c', i, `S${i + 1}`);
    l.id = `l${i}`;
    l.date = d;
    data.lessons[l.id] = l;
  });
  useData.getState().applyData(data);
}

const dates = () => cycleLessons(useData.getState().data, 'c').map((l) => [l.status, l.date]);

describe('imprévus', () => {
  beforeEach(setup);

  it('reporte une séance et décale la suite, puis annule', () => {
    const r = postponeLesson('l1')!;
    expect(dates()).toEqual([
      ['planned', '2026-11-02'],
      ['planned', '2026-11-16'],
      ['planned', '2026-11-23'],
      ['planned', '2026-11-30'],
    ]);
    expect(r.moved).toBe(3);
    r.undo();
    expect(dates().map((d) => d[1])).toEqual(MONDAYS);
  });

  it('annule une séance et fait remonter la suite', () => {
    cancelAndShift('l1');
    expect(dates()).toEqual([
      ['planned', '2026-11-02'],
      ['cancelled', '2026-11-09'],
      ['planned', '2026-11-09'],
      ['planned', '2026-11-16'],
    ]);
  });

  it('déclare une journée sans cours et décale les cycles concernés', () => {
    expect(previewClosure('y', '2026-11-09', '2026-11-09')).toEqual({ cycles: 1, lessons: 1, standalone: 0 });
    const r = closeDays('y', '2026-11-09', '2026-11-09', 'Sortie');
    expect(dates().map((d) => d[1])).toEqual(['2026-11-02', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(useData.getState().data.years.y.holidays.some((h) => h.label === 'Sortie')).toBe(true);
    expect(useData.getState().data.cycles.c.endDate).toBe('2026-11-30');
    r.undo();
    expect(dates().map((d) => d[1])).toEqual(MONDAYS);
    expect(useData.getState().data.years.y.holidays.some((h) => h.label === 'Sortie')).toBe(false);
  });
});

describe('niveaux dans la bibliothèque', () => {
  beforeEach(setup);
  it('une séance copiée dans la bibliothèque garde le niveau de sa classe, puis ses situations aussi', () => {
    useData.getState().patch('classes', 'k', { level: '4e' });
    const l = useData.getState().data.lessons.l0;
    useData.getState().patch('lessons', 'l0', { blocks: [newBlock('situation', 'Passe', 20)] });
    void l;
    const tpl = saveLessonAsTemplate('l0');
    expect(useData.getState().data.lessons[tpl].classLevels).toEqual(['4e']);
    extractSituations([tpl]);
    expect(Object.values(useData.getState().data.exercises)[0].classLevels).toEqual(['4e']);
  });
});

describe('extraction des situations', () => {
  it('ajoute les situations des séances modèles, sans échauffement ni doublon', () => {
    const data = emptyData();
    const l = newLesson(null, null, 0, 'Modèle');
    l.id = 'tpl';
    l.activityId = 'basket';
    l.blocks = [newBlock('warmup', 'Échauffement', 10), newBlock('situation', 'Passe et va', 20), newBlock('cooldown', 'Retour', 5)];
    l.blocks[1].text = '2 contre 1';
    l.blocks[1].sheets = ['marque-basket'];
    data.lessons.tpl = l;
    useData.getState().applyData(data);
    expect(extractSituations(['tpl'])).toEqual({ created: 1, skipped: 0 });
    const ex = Object.values(useData.getState().data.exercises);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ title: 'Passe et va', activityId: 'basket', sheets: ['marque-basket'] });
    expect(extractSituations(['tpl'])).toEqual({ created: 0, skipped: 1 });
    expect(extractSituations(['tpl'], { withWarmups: true }).created).toBe(2);
  });
});

describe('matériel et fiches', () => {
  it('découpe sans casser les parenthèses', () => {
    expect(splitMaterials('Piste (plots, dossards), chronomètres; sifflet.')).toEqual(['Piste (plots, dossards)', 'chronomètres', 'sifflet']);
  });
  it('ne prend pas « 8 à 10 tables » ni « 200 m » pour des quantités', () => {
    const items = mergeMaterials(['8 à 10 tables, anneau de 200 m, Gymnase']);
    expect(items.find((i) => /tables/.test(i.name))).toMatchObject({ qty: null, name: '8 à 10 tables' });
    expect(items.find((i) => /anneau/.test(i.name))?.venue).toBe(true);
    expect(items.find((i) => /gymnase/i.test(i.name))?.venue).toBe(true);
  });
  it('additionne les quantités et fusionne pluriels et doublons', () => {
    const items = mergeMaterials(['12 plots, ballons', '6 plots, Ballon, 4 chasubles']);
    expect(items.find((i) => i.name.toLowerCase().startsWith('plot'))?.qty).toBe(18);
    expect(items.filter((i) => /ballon/i.test(i.name))).toHaveLength(1);
  });
  it('matériel structuré : une ligne par objet, sans compter deux fois un objet resservi', () => {
    const l = {
      materials: '🏟 Installation : Gymnase (2 terrains)\n- 12 plots — bloc 1 (échauffement) ; bloc 2 (couloirs)\n- 15 ballons — bloc 2 (passes)',
      blocks: [{ materials: '- 8 plots (échauffement)' }, { materials: '- 12 plots (couloirs)\n- 15 ballons (passes)' }],
    };
    const items = mergeMaterials(lessonMaterialTexts(l));
    expect(items.find((i) => /plots/.test(i.name))?.qty).toBe(12);
    expect(items.find((i) => /ballons/.test(i.name))?.qty).toBe(15);
    expect(items.find((i) => /gymnase/i.test(i.name))?.venue).toBe(true);
  });
  it('extrait les critères d’évaluation d’un cycle', () => {
    const ev = 'Course de 8 min.\nCritères proposés : distance · régularité (écart) · précision du contrat · observation.\nBarème indicatif /20.';
    expect(criteriaOf(ev)).toEqual(['Distance', 'Régularité (écart)', 'Précision du contrat', 'Observation']);
  });
});
