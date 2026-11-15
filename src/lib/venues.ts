import type { Klass, Lesson, Settings, Slot, Venue } from '../types';
import { durationOf, weekdayOf } from './dates';

/** Créneau de la classe où tombe la séance (même jour ; même heure de début si la classe a deux créneaux ce jour-là). */
export function slotOf(klass: Pick<Klass, 'slots'> | undefined, lesson: Pick<Lesson, 'date' | 'start'>): Slot | undefined {
  if (!klass || !lesson.date) return undefined;
  const day = klass.slots.filter((s) => s.weekday === weekdayOf(lesson.date!));
  return day.find((s) => s.start === lesson.start) ?? (day.length === 1 ? day[0] : undefined);
}

/** Lieu choisi sur la séance ; sinon celui du créneau de l'emploi du temps. */
export function venueOf(settings: Pick<Settings, 'venues'>, lesson: Pick<Lesson, 'venueId'> & Partial<Pick<Lesson, 'date' | 'start'>>, klass?: Pick<Klass, 'slots'>): Venue | undefined {
  const id = lesson.venueId ?? slotOf(klass, { date: lesson.date ?? null, start: lesson.start ?? '' })?.venueId;
  return id ? settings.venues.find((v) => v.id === id) : undefined;
}

export interface VenueStep {
  id: string;
  label: string;
  icon: string;
  minutes: number;
  kind: 'travel' | 'locker';
}

/** Temps pris sur le créneau par ce lieu : le trajet et le vestiaire comptent chacun avant et après la séance. */
export function venueTime(venue: Venue | undefined) {
  const oneWay = venue?.travelMinutes ?? 0;
  const locker = venue?.lockerMinutes ?? 0;
  const before: VenueStep[] = [
    { id: 'travel-before', label: 'Trajet aller', icon: '🚶', minutes: oneWay, kind: 'travel' as const },
    { id: 'locker-before', label: 'Vestiaire', icon: '👕', minutes: locker, kind: 'locker' as const },
  ].filter((s) => s.minutes > 0);
  const after: VenueStep[] = [
    { id: 'locker-after', label: 'Vestiaire', icon: '👕', minutes: locker, kind: 'locker' as const },
    { id: 'travel-after', label: 'Trajet retour', icon: '🚶', minutes: oneWay, kind: 'travel' as const },
  ].filter((s) => s.minutes > 0);
  return { oneWay, locker, before, after, total: 2 * (oneWay + locker) };
}

/** Minutes réellement disponibles pour les situations de la séance. */
export function availableMinutes(lesson: Pick<Lesson, 'start' | 'end'>, venue: Venue | undefined): number {
  const slot = lesson.start && lesson.end ? durationOf(lesson.start, lesson.end) : 0;
  return slot ? Math.max(0, slot - venueTime(venue).total) : 0;
}
