import { describe, expect, it } from 'vitest';
import { cleanWhisper } from './localDictation';

describe('moteur de dictée intégré', () => {
  it('écarte les phrases inventées sur du silence', () => {
    expect(cleanWhisper(" Sous-titres réalisés para la communauté d'Amara.org")).toBe('');
    expect(cleanWhisper(' ...')).toBe('');
    expect(cleanWhisper(' Merci.')).toBe('Merci.');
  });

  it('corrige les mots du métier mal entendus', () => {
    expect(cleanWhisper(' et chauffement de 10 minutes avec des passes à 2.')).toBe('Échauffement de 10 minutes avec des passes à 2.');
  });
});
