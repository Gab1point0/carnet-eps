import { describe, expect, it } from 'vitest';
import { currentLesson, dayToShow } from './Today';
import { newLesson } from '../store/model';
import type { Lesson } from '../types';

const at = (id: string, date: string, start: string, end: string): Lesson => ({ ...newLesson('c', null, 0, id), id, date, start, end });

describe('vue du jour', () => {
  const lessons = [at('a', '2026-11-16', '08:30', '10:20'), at('b', '2026-11-16', '13:55', '14:50'), at('c', '2026-11-17', '13:55', '15:45')];
  it('ouvre la séance en cours ou qui commence dans 15 minutes', () => {
    expect(currentLesson(lessons, '2026-11-16', 8 * 60 + 20)?.id).toBe('a');
    expect(currentLesson(lessons, '2026-11-16', 9 * 60)?.id).toBe('a');
    expect(currentLesson(lessons, '2026-11-16', 11 * 60)).toBeUndefined();
    expect(currentLesson(lessons, '2026-11-16', 13 * 60 + 45)?.id).toBe('b');
  });
  it('passe au prochain jour de cours quand la journée est finie', () => {
    expect(dayToShow(lessons, '2026-11-16', 12 * 60)).toBe('2026-11-16');
    expect(dayToShow(lessons, '2026-11-16', 15 * 60)).toBe('2026-11-17');
    expect(dayToShow(lessons, '2026-11-18', 8 * 60)).toBeNull();
  });
});
