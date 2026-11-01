import type { Lesson, Settings, Venue } from '../types';
import { durationOf } from './dates';

export const venueOf = (settings: Pick<Settings, 'venues'>, lesson: Pick<Lesson, 'venueId'>): Venue | undefined =>
  lesson.venueId ? settings.venues.find((v) => v.id === lesson.venueId) : undefined;

/** Temps pris sur le créneau par ce lieu : le trajet compte à l'aller et au retour, le vestiaire une fois. */
export function venueTime(venue: Venue | undefined) {
  const oneWay = venue?.travelMinutes ?? 0;
  const locker = venue?.lockerMinutes ?? 0;
  return { oneWay, travel: 2 * oneWay, locker, total: 2 * oneWay + locker };
}

/** Minutes réellement disponibles pour les situations de la séance. */
export function availableMinutes(lesson: Pick<Lesson, 'start' | 'end'>, venue: Venue | undefined): number {
  const slot = lesson.start && lesson.end ? durationOf(lesson.start, lesson.end) : 0;
  return slot ? Math.max(0, slot - venueTime(venue).total) : 0;
}
