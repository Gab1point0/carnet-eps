import type { Lesson, Settings, Venue } from '../types';
import { durationOf } from './dates';

export const venueOf = (settings: Pick<Settings, 'venues'>, lesson: Pick<Lesson, 'venueId'>): Venue | undefined =>
  lesson.venueId ? settings.venues.find((v) => v.id === lesson.venueId) : undefined;

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
