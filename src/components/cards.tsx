import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, Film, XCircle } from 'lucide-react';
import type { Cycle, Klass, Lesson } from '../types';
import { useData } from '../store/data';
import { activityOf, fieldOfActivity, lessonTotalMinutes } from '../store/selectors';
import { formatDM, formatDuration, formatShort } from '../lib/dates';
import { Chip } from './ui';
import { cls } from '../lib/util';

export function StatusIcon({ status, size = 18 }: { status: Lesson['status']; size?: number }) {
  if (status === 'done') return <CheckCircle2 size={size} color="var(--success)" aria-label="Faite" />;
  if (status === 'cancelled') return <XCircle size={size} color="var(--danger)" aria-label="Annulée" />;
  return <Circle size={size} color="var(--muted)" aria-label="Prévue" />;
}

export function ClassDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="class-dot" style={{ background: color, width: size, height: size }} />;
}

export function ActivityChip({ activityId }: { activityId: string | null }) {
  const data = useData((s) => s.data);
  const act = activityOf(data, activityId);
  if (!act) return null;
  const field = fieldOfActivity(data, activityId);
  return (
    <Chip color={field?.color}>
      {act.emoji} {act.name}
    </Chip>
  );
}

/** Ligne de séance : numéro, titre, date, durée, présence d'animations. */
export function LessonRow({
  lesson,
  klass,
  cycle,
  showClass,
  actions,
}: {
  lesson: Lesson;
  klass?: Klass;
  cycle?: Cycle;
  showClass?: boolean;
  actions?: React.ReactNode;
}) {
  const minutes = lessonTotalMinutes(lesson);
  const hasAnim = lesson.blocks.some((b) => b.animation);
  const empty = lesson.blocks.length === 0;
  return (
    <div className={cls('lesson-row', lesson.status === 'cancelled' && 'lesson-cancelled')}>
      <Link to={`/lessons/${lesson.id}`} className="lesson-row-main">
        {showClass && klass ? <ClassDot color={klass.color} size={12} /> : <StatusIcon status={lesson.status} />}
        <div className="lesson-row-text">
          <div className="lesson-row-title">
            {showClass && klass && <strong>{klass.name}</strong>} <span>{lesson.title || 'Séance sans titre'}</span>
          </div>
          <div className="lesson-row-meta muted small">
            {lesson.date ? (
              <span>
                {formatShort(lesson.date)} · {lesson.start}–{lesson.end}
              </span>
            ) : (
              <span>Date à définir</span>
            )}
            {cycle && <span> · {cycle.title}</span>}
            {minutes > 0 && (
              <span>
                {' '}
                · <Clock size={12} style={{ verticalAlign: '-1px' }} /> {formatDuration(minutes)}
              </span>
            )}
            {hasAnim && (
              <span>
                {' '}
                · <Film size={12} style={{ verticalAlign: '-1px' }} />
              </span>
            )}
          </div>
        </div>
        {lesson.rating ? <span title="Ressenti après la séance">{['', '😕', '🙂', '😀'][lesson.rating]}</span> : null}
        {lesson.adjust && <span title="À ajuster">🔧</span>}
        {empty && <Chip className="chip-todo">À préparer</Chip>}
      </Link>
      {actions}
    </div>
  );
}

export function formatDateRange(a: string | null, b: string | null): string {
  if (a && b) return `${formatDM(a)} → ${formatDM(b)}`;
  if (a) return `à partir du ${formatDM(a)}`;
  return 'Dates à définir';
}
