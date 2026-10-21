import { describe, expect, it } from 'vitest';
import { FICHES, FICHE_BY_ID, LEVEL_KEYS, buildFiche, fichesOfActivity, levelKeyOf } from './fiches';

describe('fiches imprimables', () => {
  it('chaque fiche a un identifiant unique et se construit avec ou sans critères', () => {
    expect(new Set(FICHES.map((f) => f.id)).size).toBe(FICHES.length);
    for (const f of FICHES) {
      expect(f.build({ criteria: [] }).length).toBeGreaterThan(0);
      expect(f.build({ criteria: ['Critère A', 'Critère B'] }).length).toBeGreaterThan(0);
    }
  });

  it('retrouve les fiches d\'une activité, plus les fiches communes', () => {
    const basket = fichesOfActivity('Basket-ball — mardi').map((f) => f.id);
    expect(basket).toContain('marque-basket');
    expect(basket).toContain('observation-binome');
    expect(basket).not.toContain('score-baseball');
    expect(fichesOfActivity('Crossfit').map((f) => f.id)).toContain('carnet-wod');
    expect(fichesOfActivity('Renforcement musculaire — jeudi').map((f) => f.id)).toContain('carnet-wod');
  });

  it('le tableau d\'allures donne des temps croissants avec le pourcentage de VMA', () => {
    const t = FICHE_BY_ID.get('tableau-allures')!.build({ criteria: [] }).find((s) => s.type === 'table');
    expect(t && t.type === 'table' && t.cells?.[6]).toEqual(['37 s', '35 s', '33 s']); // VMA 12 km/h : 100 m en 30 s à 100 %, donc ≈ 37 s à 80 %
  });

  it('reconnaît les niveaux des classes', () => {
    expect(['6e', '5e', '4e', '3e', '2nde', '1re', 'Terminale', 'UNSS'].map(levelKeyOf)).toEqual(['6e', '5e', '4e', '3e', '2nde', '1re', 'Tle', undefined]);
  });

  it('toutes les fiches se construisent à tous les niveaux, sans mention des attendus', () => {
    for (const f of FICHES) {
      for (const level of LEVEL_KEYS) {
        const text = JSON.stringify(buildFiche(f, { criteria: [], level }));
        expect(text.length).toBeGreaterThan(20);
        expect(text).not.toMatch(/AFC|AFL|attendu/i);
      }
    }
  });

  it('plus on monte en niveau, plus la fiche est fournie et exigeante', () => {
    const rows = (level: any) => {
      const t = buildFiche(FICHE_BY_ID.get('observation-basket')!, { criteria: [], level }).find((x) => x.type === 'table');
      return t && t.type === 'table' && Array.isArray(t.rows) ? [t.rows.length, t.cols.length] : [0, 0];
    };
    expect(rows('6e')).toEqual([3, 3]);
    expect(rows('3e')[0]).toBe(7);
    const lv = (level: any) => {
      const s = buildFiche(FICHE_BY_ID.get('observation-escalade')!, { criteria: [], level }).find((x) => x.type === 'levels');
      return s && s.type === 'levels' ? s.levels : [];
    };
    expect(lv('6e')).toEqual(['Pas encore', 'Presque', 'Oui !']);
    expect(lv('1re')).toHaveLength(4);
    // Régulation écrite à partir de la 2nde, version générale sans adaptation.
    expect(buildFiche(FICHE_BY_ID.get('contrat-individuel')!, { criteria: [], level: '2nde' }).some((s) => s.type === 'table' && s.head === 'Régulation')).toBe(true);
    expect(buildFiche(FICHE_BY_ID.get('contrat-individuel')!, { criteria: [] }).length).toBe(FICHE_BY_ID.get('contrat-individuel')!.build({ criteria: [] }).length);
  });
});