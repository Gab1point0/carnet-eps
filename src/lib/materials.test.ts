import { describe, expect, it } from 'vitest';
import { lessonMaterialTexts, materialsFromBlocks } from './materials';

describe('matériel de la séance depuis les blocs', () => {
  it('garde la plus grande quantité et indique les blocs où sert chaque objet', () => {
    const blocks = [{ materials: '- 15 ballons (passes)\n- 12 plots (couloirs)' }, { materials: '' }, { materials: '- 8 ballons (match), 1 sifflet' }];
    expect(materialsFromBlocks({ materials: '', blocks })).toBe('- 15 ballons — bloc 1 (passes) ; bloc 3 (match)\n- 12 plots — bloc 1 (couloirs)\n- 1 sifflet — bloc 3');
  });

  it('remplace les anciennes lignes et conserve ce qui a été écrit à la main', () => {
    const materials = '🏟 Installation : Gymnase\nÀ demander au collègue\n- 15 ballons — bloc 1 (passes)\n- 2 trousses de secours\n- 4 plots';
    const after = materialsFromBlocks({ materials, blocks: [{ materials: '- 10 plots (zones)' }] });
    expect(after).toBe('🏟 Installation : Gymnase\nÀ demander au collègue\n- 10 plots — bloc 1 (zones)\n- 2 trousses de secours');
  });

  it('reste lisible par le total de la semaine', () => {
    const materials = materialsFromBlocks({ materials: '', blocks: [{ materials: '- 6 poids (3 à 5 kg) (lancer)' }] });
    expect(materials).toBe('- 6 poids (3 à 5 kg) — bloc 1 (lancer)');
    expect(lessonMaterialTexts({ materials, blocks: [] })).toEqual(['6 poids (3 à 5 kg)']);
  });
});
