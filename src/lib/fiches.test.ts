import { describe, expect, it } from 'vitest';
import { FICHES, FICHE_BY_ID, fichesOfActivity } from './fiches';

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
});
