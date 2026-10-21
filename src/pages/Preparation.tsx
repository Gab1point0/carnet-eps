import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import type { Klass, Lesson } from '../types';
import { Button, Card, Chip, EmptyState, PageHeader, Section, Tabs } from '../components/ui';
import { ClassDot } from '../components/cards';
import { useCurrentYear, useYearClasses, useYearLessons } from '../store/selectors';
import { lessonMaterialTexts, mergeMaterials } from '../lib/materials';
import { addDays, formatDM, formatShort, startOfWeek, todayISO } from '../lib/dates';
import { cls, plural } from '../lib/util';

type Tab = 'prep' | 'materiel';
type Prep = 'empty' | 'partial' | 'ready';

/** État de préparation : vide, partiel (blocs mais pas d'objectif ou moins de 3 blocs), prête. */
export function prepState(l: Lesson): Prep {
  if (l.blocks.length === 0) return 'empty';
  return l.blocks.length >= 3 && l.objective.trim() ? 'ready' : 'partial';
}

const PREP_LABEL: Record<Prep, string> = { empty: 'À préparer', partial: 'À compléter', ready: 'Prête' };

function useChecked(key: string): [Set<string>, (k: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setSet(new Set(JSON.parse(localStorage.getItem(key) ?? '[]')));
    } catch {
      setSet(new Set());
    }
  }, [key]);
  const toggle = (k: string) =>
    setSet((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  return [set, toggle];
}

export function PreparationPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('d') || todayISO();
  const tab = (params.get('tab') as Tab) || 'prep';
  const year = useCurrentYear();
  const classes = useYearClasses();
  const lessons = useYearLessons();
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const [checked, toggle] = useChecked(`carnet-eps:materiel:${weekStart}`);

  const classById = useMemo(() => new Map<string, Klass>(classes.map((k) => [k.id, k])), [classes]);
  const week = useMemo(() => lessons.filter((l) => l.date && l.date >= weekStart && l.date <= weekEnd && l.status !== 'cancelled'), [lessons, weekStart, weekEnd]);

  const counts = useMemo(() => {
    const c = { empty: 0, partial: 0, ready: 0 };
    for (const l of week) c[prepState(l)]++;
    return c;
  }, [week]);

  // Aperçu des semaines suivantes : combien de séances restent à préparer.
  const ahead = useMemo(
    () =>
      [1, 2, 3].map((n) => {
        const s = addDays(weekStart, 7 * n);
        const list = lessons.filter((l) => l.date && l.date >= s && l.date <= addDays(s, 6) && l.status !== 'cancelled');
        return { start: s, total: list.length, todo: list.filter((l) => prepState(l) !== 'ready').length };
      }),
    [lessons, weekStart],
  );

  const materials = useMemo(() => mergeMaterials(week.flatMap(lessonMaterialTexts)), [week]);

  const go = (d: string, t: Tab = tab) => setParams({ d, tab: t }, { replace: true });

  if (!year) {
    return (
      <>
        <PageHeader title="Préparation" />
        <EmptyState icon="📅" title="Pas encore d'année scolaire">
          Créez une année scolaire depuis l'accueil.
        </EmptyState>
      </>
    );
  }

  const byDay = new Map<string, Lesson[]>();
  for (const l of week) byDay.set(l.date!, [...(byDay.get(l.date!) ?? []), l]);
  const days = [...byDay.keys()].sort();

  return (
    <>
      <PageHeader
        title="Préparation"
        subtitle={
          <span>
            Semaine du {formatDM(weekStart)} au {formatDM(weekEnd)} · {plural(week.length, 'séance')}
          </span>
        }
        actions={
          <div className="row" style={{ gap: 4 }}>
            <Button size="sm" aria-label="Semaine précédente" icon={<ChevronLeft size={18} />} onClick={() => go(addDays(weekStart, -7))} />
            <Button size="sm" onClick={() => go(todayISO())}>
              Cette semaine
            </Button>
            <Button size="sm" aria-label="Semaine suivante" icon={<ChevronRight size={18} />} onClick={() => go(addDays(weekStart, 7))} />
          </div>
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={(t) => go(date, t)}
        tabs={[
          { id: 'prep', label: `À préparer (${counts.empty + counts.partial})` },
          { id: 'materiel', label: `Matériel (${materials.filter((m) => !m.venue).length})` },
        ]}
      />

      {tab === 'prep' && (
        <>
          <Card className="stat">
            <div style={{ flex: 1 }}>
              <strong>
                {counts.ready}/{week.length}
              </strong>
              <span className="muted small"> séances prêtes cette semaine</span>
              <div className="progress" style={{ marginTop: 6 }}>
                <div style={{ width: `${week.length ? (counts.ready / week.length) * 100 : 0}%` }} />
              </div>
              <p className="muted small" style={{ marginTop: 6 }}>
                Prête = objectif renseigné et au moins 3 blocs. {counts.partial > 0 && `${plural(counts.partial, 'séance')} à compléter. `}
                {counts.empty > 0 && `${plural(counts.empty, 'séance')} encore vide${counts.empty > 1 ? 's' : ''}.`}
              </p>
            </div>
          </Card>

          {week.length === 0 ? (
            <EmptyState icon="🌴" title="Aucune séance cette semaine">
              Vacances, jour sans cours, ou rien de planifié. Utilisez les flèches pour changer de semaine.
            </EmptyState>
          ) : (
            days.map((d) => (
              <Section key={d} title={<span className="cap-first">{formatShort(d)}</span>}>
                <Card style={{ padding: 6 }} className="lesson-list">
                  {byDay.get(d)!
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((l) => {
                      const k = l.classId ? classById.get(l.classId) : undefined;
                      const s = prepState(l);
                      return (
                        <Link key={l.id} to={`/lessons/${l.id}`} className="lesson-row lesson-row-main prep-row">
                          {k && <ClassDot color={k.color} size={12} />}
                          <div className="lesson-row-text">
                            <div className="lesson-row-title">
                              <strong>{k?.name}</strong> <span>{l.title || 'Séance sans titre'}</span>
                            </div>
                            <div className="lesson-row-meta muted small">
                              {l.start}–{l.end} · {plural(l.blocks.length, 'bloc')}
                              {l.adjust && ' · 🔧 à ajuster'}
                            </div>
                          </div>
                          <Chip className={cls('prep-chip', `prep-${s}`)}>{PREP_LABEL[s]}</Chip>
                        </Link>
                      );
                    })}
                </Card>
              </Section>
            ))
          )}

          <Section title="Les semaines suivantes">
            <div className="grid grid-2">
              {ahead.map((a) => (
                <button key={a.start} type="button" className="card card-click ahead" onClick={() => go(a.start)}>
                  <strong>Semaine du {formatDM(a.start)}</strong>
                  <span className="muted small">
                    {a.total === 0 ? 'Aucune séance' : a.todo === 0 ? `✅ ${plural(a.total, 'séance')} prête${a.total > 1 ? 's' : ''}` : `${a.todo} sur ${a.total} à préparer`}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      {tab === 'materiel' && (
        <>
          <div className="row-between">
            <p className="muted">Cochez au fur et à mesure que le matériel est sorti. Les quantités s'additionnent quand elles sont écrites en chiffres (« 12 plots »).</p>
            <Button size="sm" className="no-print" icon={<Printer size={16} />} onClick={() => window.print()}>
              Imprimer
            </Button>
          </div>

          {materials.length === 0 ? (
            <EmptyState icon="🧰" title="Pas de matériel renseigné cette semaine">
              Le matériel vient du champ « Matériel » des séances et des blocs.
            </EmptyState>
          ) : (
            <>
              <Section title="Tout le matériel de la semaine">
                <Card>
                  <div className="mat-list">
                    {materials.filter((m) => !m.venue).map((m) => {
                      const k = `all:${m.name}`;
                      return (
                        <label key={k} className={cls('check', 'mat-item', checked.has(k) && 'mat-done')}>
                          <input type="checkbox" checked={checked.has(k)} onChange={() => toggle(k)} />
                          <span>
                            {m.qty !== null && <strong>{m.qty} × </strong>}
                            {m.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {materials.some((m) => m.venue) && (
                    <p className="muted small" style={{ marginTop: 12 }}>
                      Installations : {materials.filter((m) => m.venue).map((m) => m.name).join(' · ')}
                    </p>
                  )}
                </Card>
              </Section>

              <Section title="Séance par séance">
                <div className="stack">
                  {days.flatMap((d) =>
                    byDay
                      .get(d)!
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((l) => {
                        const k = l.classId ? classById.get(l.classId) : undefined;
                        const items = mergeMaterials(lessonMaterialTexts(l));
                        return (
                          <Card key={l.id} className="card-flat">
                            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                              {k && <ClassDot color={k.color} size={12} />}
                              <strong>{k?.name}</strong>
                              <span className="muted small">
                                {formatShort(l.date!)} · {l.start}
                              </span>
                              <Link to={`/lessons/${l.id}`} className="small">
                                {l.title || 'Séance'}
                              </Link>
                            </div>
                            {items.length === 0 ? (
                              <p className="muted small">Pas de matériel indiqué.</p>
                            ) : (
                              <ul className="mat-inline">
                                {items.map((m) => (
                                  <li key={m.name}>
                                    {m.qty !== null && <strong>{m.qty} × </strong>}
                                    {m.name}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Card>
                        );
                      }),
                  )}
                </div>
              </Section>
            </>
          )}
        </>
      )}
    </>
  );
}
