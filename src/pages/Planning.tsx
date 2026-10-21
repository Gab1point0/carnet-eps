import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarOff, ChevronLeft, ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { ClosureModal } from '../components/ClosureModal';
import type { Holiday, Klass, Lesson, SchoolYear, Slot } from '../types';
import { Button, EmptyState, PageHeader, Tabs } from '../components/ui';
import { StatusIcon } from '../components/cards';
import { useData } from '../store/data';
import { activityOf, fieldOfActivity, sortCycles, useCurrentYear, useYearClasses, useYearCycles, useYearLessons } from '../store/selectors';
import { createLessonAt } from '../store/actions';
import { holidayOn } from '../lib/holidays';
import {
  addDays,
  addMonths,
  diffDays,
  formatDM,
  formatLong,
  formatMonth,
  formatMonthYear,
  formatShort,
  fromISO,
  startOfMonth,
  startOfWeek,
  timeToMin,
  todayISO,
  weekdayOf,
  WEEKDAYS_SHORT,
} from '../lib/dates';
import { cls } from '../lib/util';

type View = 'week' | 'month' | 'year';

interface Item {
  key: string;
  klass: Klass;
  date: string;
  start: string;
  end: string;
  lesson?: Lesson;
  slot?: Slot;
}

const HOUR_PX = 58;

function itemsForDay(day: string, classes: Klass[], lessons: Lesson[], year: SchoolYear): Item[] {
  const klassById = new Map(classes.map((k) => [k.id, k]));
  const out: Item[] = [];
  for (const l of lessons) {
    if (l.date !== day) continue;
    const k = l.classId ? klassById.get(l.classId) : undefined;
    if (k) out.push({ key: l.id, klass: k, date: day, start: l.start, end: l.end, lesson: l });
  }
  if (!holidayOn(year.holidays, day) && day >= year.start && day <= year.end) {
    for (const k of classes) {
      for (const s of k.slots) {
        if (s.weekday !== weekdayOf(day)) continue;
        const covered = out.some((o) => o.klass.id === k.id && o.lesson && timeToMin(o.start) < timeToMin(s.end) && timeToMin(s.start) < timeToMin(o.end));
        if (!covered) out.push({ key: `${k.id}-${s.id}-${day}`, klass: k, date: day, start: s.start, end: s.end, slot: s });
      }
    }
  }
  return out.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
}

/** Répartit les éléments qui se chevauchent sur plusieurs colonnes. */
function layout(items: Item[]): Array<Item & { lane: number; lanes: number }> {
  const res: Array<Item & { lane: number; lanes: number }> = [];
  let group: typeof res = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.lanes = lanes;
    res.push(...group);
    group = [];
  };
  for (const it of items) {
    const s = timeToMin(it.start);
    if (group.length && s >= groupEnd) flush();
    const used = new Set(group.filter((g) => timeToMin(g.end) > s).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ ...it, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, timeToMin(it.end));
  }
  flush();
  return res;
}

export function PlanningPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'week';
  const date = params.get('d') || todayISO();
  const year = useCurrentYear();
  const classes = useYearClasses();
  const lessons = useYearLessons();
  const cycles = useYearCycles();
  const [closing, setClosing] = useState(false);

  const go = (v: View, d: string) => setParams({ view: v, d }, { replace: true });

  if (!year) {
    return (
      <>
        <PageHeader title="Planning" />
        <EmptyState icon="📅" title="Pas encore d'année scolaire">
          Créez une année scolaire depuis l'accueil pour voir votre planning.
        </EmptyState>
      </>
    );
  }

  const shift = (n: number) => {
    if (view === 'week') go(view, addDays(date, 7 * n));
    else if (view === 'month') go(view, addMonths(date, n));
  };

  const weekStart = startOfWeek(date);
  const title =
    view === 'week'
      ? `Du ${formatDM(weekStart)} au ${formatDM(addDays(weekStart, 6))}`
      : view === 'month'
        ? formatMonthYear(date)
        : `Année ${year.label}`;

  return (
    <>
      <PageHeader
        title="Planning"
        subtitle={<span className="cap-first">{title}</span>}
        actions={
          <>
            {view !== 'year' && (
              <div className="row" style={{ gap: 4 }}>
                <Button size="sm" onClick={() => shift(-1)} aria-label="Précédent" icon={<ChevronLeft size={18} />} />
                <Button size="sm" onClick={() => go(view, todayISO())}>
                  Aujourd'hui
                </Button>
                <Button size="sm" onClick={() => shift(1)} aria-label="Suivant" icon={<ChevronRight size={18} />} />
              </div>
            )}
            <Button size="sm" icon={<CalendarOff size={16} />} onClick={() => setClosing(true)}>
              Jour sans cours
            </Button>
            <Link to={`/preparation?d=${date}`}>
              <Button size="sm" icon={<ClipboardList size={16} />}>
                Préparation
              </Button>
            </Link>
            <Tabs
              value={view}
              onChange={(v) => go(v, date)}
              tabs={[
                { id: 'week', label: 'Semaine' },
                { id: 'month', label: 'Mois' },
                { id: 'year', label: 'Année' },
              ]}
            />
          </>
        }
      />

      {classes.length === 0 ? (
        <EmptyState icon="🏫" title="Aucune classe" action={<Link to="/classes"><Button variant="primary">Ajouter une classe</Button></Link>}>
          Le planning se remplit à partir de l'emploi du temps de vos classes.
        </EmptyState>
      ) : view === 'week' ? (
        <WeekView weekStart={weekStart} classes={classes} lessons={lessons} year={year} />
      ) : view === 'month' ? (
        <MonthView date={date} classes={classes} lessons={lessons} year={year} onPick={(d) => go('week', d)} />
      ) : (
        <YearView year={year} classes={classes} cycles={cycles} />
      )}
      {closing && <ClosureModal yearId={year.id} initialDate={view === 'week' || view === 'month' ? date : undefined} onClose={() => setClosing(false)} />}
    </>
  );
}

// ── Semaine ─────────────────────────────────────────────────────────────────

function WeekView({ weekStart, classes, lessons, year }: { weekStart: string; classes: Klass[]; lessons: Lesson[]; year: SchoolYear }) {
  const navigate = useNavigate();
  const today = todayISO();
  const days = useMemo(() => {
    const base = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const data = base.map((d) => ({ date: d, holiday: holidayOn(year.holidays, d), items: itemsForDay(d, classes, lessons, year) }));
    // Le dimanche (et le samedi) n'apparaissent que s'ils contiennent quelque chose.
    return data.filter((d, i) => i < 5 || d.items.length > 0);
  }, [weekStart, classes, lessons, year]);

  const allItems = days.flatMap((d) => d.items);
  const minH = Math.max(6, Math.min(8, ...allItems.map((i) => Math.floor(timeToMin(i.start) / 60))));
  const maxH = Math.min(22, Math.max(17, ...allItems.map((i) => Math.ceil(timeToMin(i.end) / 60))));
  const height = (maxH - minH) * HOUR_PX;

  const open = (it: Item) => {
    if (it.lesson) navigate(`/lessons/${it.lesson.id}`);
    else navigate(`/lessons/${createLessonAt(it.klass, it.date, it.start, it.end)}`);
  };

  return (
    <>
      {/* Grille : ordinateur */}
      <div className="wk-grid card">
        <div className="wk-head" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
          <div />
          {days.map((d) => (
            <div key={d.date} className={cls('wk-dayhead', d.date === today && 'today')}>
              <span>{WEEKDAYS_SHORT[weekdayOf(d.date) - 1]}</span>
              <strong>{fromISO(d.date).getDate()}</strong>
              {d.holiday && <em title={d.holiday.label}>{d.holiday.label}</em>}
            </div>
          ))}
        </div>
        <div className="wk-body" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)`, height }}>
          <div className="wk-hours">
            {Array.from({ length: maxH - minH }, (_, i) => (
              <span key={i} style={{ top: i * HOUR_PX }}>
                {minH + i}h
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d.date}
              className={cls('wk-col', d.holiday && 'wk-holiday', d.date === today && 'today')}
              style={{ backgroundSize: `100% ${HOUR_PX}px` }}
            >
              {layout(d.items).map((it) => {
                const top = ((timeToMin(it.start) - minH * 60) / 60) * HOUR_PX;
                const h = Math.max(26, ((timeToMin(it.end) - timeToMin(it.start)) / 60) * HOUR_PX - 2);
                return (
                  <button
                    key={it.key}
                    type="button"
                    className={cls('wk-item', it.slot && 'wk-slot', it.lesson?.status === 'done' && 'wk-done', it.lesson?.status === 'cancelled' && 'wk-cancel')}
                    style={{
                      top,
                      height: h,
                      left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / it.lanes}% - 4px)`,
                      ['--class' as string]: it.klass.color,
                    }}
                    onClick={() => open(it)}
                    title={it.lesson ? it.lesson.title : `Créer une séance pour ${it.klass.name}`}
                  >
                    <strong>{it.klass.name}</strong>
                    <span>{it.lesson ? it.lesson.title || 'Séance sans titre' : '+ séance'}</span>
                    <small>
                      {it.start}–{it.end}
                    </small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Liste : téléphone */}
      <div className="wk-list">
        {days.map((d) => (
          <section key={d.date} className={cls('wk-day', d.date === today && 'today')}>
            <h3 className="cap-first">{formatLong(d.date).replace(/ \d{4}$/, '')}</h3>
            {d.holiday && <p className="muted small">🌴 {d.holiday.label}</p>}
            {d.items.length === 0 && !d.holiday && <p className="muted small">Pas de cours</p>}
            <div className="stack" style={{ gap: 8 }}>
              {d.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={cls('wk-card', it.slot && 'wk-slot', it.lesson?.status === 'cancelled' && 'wk-cancel')}
                  style={{ ['--class' as string]: it.klass.color }}
                  onClick={() => open(it)}
                >
                  <span className="wk-card-time">
                    <strong>{it.start}</strong>
                    <small>{it.end}</small>
                  </span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <strong>{it.klass.name}</strong>
                    <br />
                    <span className="muted">{it.lesson ? it.lesson.title || 'Séance sans titre' : 'Créneau libre — créer une séance'}</span>
                  </span>
                  {it.lesson ? <StatusIcon status={it.lesson.status} size={18} /> : <Plus size={18} />}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// ── Mois ────────────────────────────────────────────────────────────────────

function MonthView({ date, classes, lessons, year, onPick }: { date: string; classes: Klass[]; lessons: Lesson[]; year: SchoolYear; onPick: (d: string) => void }) {
  const today = todayISO();
  const monthStart = startOfMonth(date);
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = fromISO(monthStart).getMonth();
  const klassById = new Map(classes.map((k) => [k.id, k]));

  return (
    <div className="month card">
      <div className="month-head">
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((d) => {
          const dayLessons = lessons.filter((l) => l.date === d);
          const holiday = holidayOn(year.holidays, d);
          const outside = fromISO(d).getMonth() !== month;
          return (
            <button key={d} type="button" className={cls('month-cell', outside && 'outside', holiday && 'holiday', d === today && 'today')} onClick={() => onPick(d)}>
              <span className="month-num">{fromISO(d).getDate()}</span>
              {holiday && !outside && <span className="month-hol">{holiday.label.replace(/^Vacances (de |d'|du )?/i, '')}</span>}
              <span className="month-pills">
                {dayLessons.slice(0, 3).map((l) => {
                  const k = l.classId ? klassById.get(l.classId) : undefined;
                  return (
                    <span key={l.id} className={cls('pill', l.status === 'cancelled' && 'pill-cancel')} style={{ background: k?.color }}>
                      {k?.name}
                    </span>
                  );
                })}
                {dayLessons.length > 3 && <span className="pill pill-more">+{dayLessons.length - 3}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Année (cycles par classe) ──────────────────────────────────────────────

function YearView({ year, classes, cycles }: { year: SchoolYear; classes: Klass[]; cycles: ReturnType<typeof useYearCycles> }) {
  const navigate = useNavigate();
  const data = useData((s) => s.data);
  const from = startOfMonth(year.start);
  const to = year.end;
  const total = Math.max(1, diffDays(from, to) + 1);
  const pct = (d: string) => (diffDays(from, d) / total) * 100;
  const today = todayISO();

  const months: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);

  const holidays: Holiday[] = year.holidays.filter((h) => h.kind !== 'ferie' && h.end >= from && h.start <= to);
  const undated = cycles.filter((c) => !c.startDate || !c.endDate);

  return (
    <div className="stack-lg">
      <div className="gantt card">
        <div className="gantt-inner">
          <div className="gantt-row gantt-months">
            <div className="gantt-label" />
            <div className="gantt-track">
              {months.map((m) => (
                <span key={m} className="gantt-month" style={{ left: `${pct(m)}%` }}>
                  {formatMonth(m)}
                </span>
              ))}
            </div>
          </div>
          {classes.map((k) => {
            const list = sortCycles(cycles.filter((c) => c.classId === k.id && c.startDate && c.endDate));
            // Plusieurs lignes si des cycles se chevauchent.
            const rows: typeof list[] = [];
            for (const c of list) {
              const row = rows.find((r) => r[r.length - 1].endDate! < c.startDate!);
              if (row) row.push(c);
              else rows.push([c]);
            }
            return (
              <div key={k.id} className="gantt-row">
                <Link to={`/classes/${k.id}`} className="gantt-label">
                  <span className="class-dot" style={{ background: k.color }} /> {k.name}
                </Link>
                <div className="gantt-track" style={{ height: Math.max(1, rows.length) * 40 + 8 }}>
                  {holidays.map((h) => (
                    <span key={h.id} className="gantt-hol" title={h.label} style={{ left: `${pct(h.start < from ? from : h.start)}%`, width: `${((diffDays(h.start < from ? from : h.start, h.end > to ? to : h.end) + 1) / total) * 100}%` }} />
                  ))}
                  {today >= from && today <= to && <span className="gantt-today" style={{ left: `${pct(today)}%` }} />}
                  {rows.map((r, ri) =>
                    r.map((c) => {
                      const act = activityOf(data, c.activityId);
                      const color = fieldOfActivity(data, c.activityId)?.color ?? k.color;
                      const width = ((diffDays(c.startDate!, c.endDate!) + 1) / total) * 100;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="gantt-bar"
                          style={{ left: `${pct(c.startDate!)}%`, width: `${width}%`, top: 4 + ri * 40, background: color }}
                          title={`${c.title} · ${formatShort(c.startDate!)} → ${formatShort(c.endDate!)}`}
                          onClick={() => navigate(`/cycles/${c.id}`)}
                        >
                          {act?.emoji} {c.title}
                        </button>
                      );
                    }),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted small">Les bandes grisées sont les vacances. Touchez un cycle pour l'ouvrir.</p>
      {undated.length > 0 && (
        <div className="stack">
          <h3>Cycles sans dates</h3>
          <div className="row">
            {undated.map((c) => (
              <Link key={c.id} to={`/cycles/${c.id}`} className="chip">
                {data.classes[c.classId!]?.name} · {c.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
