import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Card, Chip, EmptyState, PageHeader, TextInput } from '../components/ui';
import { ClassDot } from '../components/cards';
import { useData } from '../store/data';
import { activityOf } from '../store/selectors';
import { formatShort } from '../lib/dates';
import { normalize } from '../lib/util';

/** Recherche globale : classes, cycles, séances, situations. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const data = useData((s) => s.data);
  const nq = normalize(q.trim());

  const results = useMemo(() => {
    if (nq.length < 2) return null;
    const has = (...parts: Array<string | undefined>) => normalize(parts.filter(Boolean).join(' ')).includes(nq);
    const classes = Object.values(data.classes).filter((k) => has(k.name, k.level, k.notes));
    const act = (id: string | null) => activityOf(data, id)?.name;
    const cycles = Object.values(data.cycles).filter((c) => has(c.title, act(c.activityId), c.objectives, c.competences, c.evaluation, c.notes));
    const lessons = Object.values(data.lessons)
      .filter((l) =>
        has(
          l.title,
          act(l.activityId ?? (l.cycleId ? data.cycles[l.cycleId]?.activityId ?? null : null)),
          l.objective,
          l.materials,
          l.safety,
          l.bilan,
          l.tags.join(' '),
          l.blocks.map((b) => `${b.title} ${b.text} ${b.materials}`).join(' '),
        ),
      )
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const exercises = Object.values(data.exercises).filter((e) => has(e.title, act(e.activityId), e.text, e.materials, e.tags.join(' ')));
    return { classes, cycles, lessons, exercises };
  }, [nq, data]);

  const total = results ? results.classes.length + results.cycles.length + results.lessons.length + results.exercises.length : 0;

  return (
    <>
      <PageHeader title="Recherche" />
      <div className="search-box search-box-lg">
        <Search size={19} />
        <TextInput value={q} onChange={(v) => setParams(v ? { q: v } : {}, { replace: true })} placeholder="Une classe, une activité, un mot dans une consigne…" autoFocus aria-label="Rechercher" />
      </div>

      {!results ? (
        <p className="muted">Saisissez au moins deux lettres. La recherche porte sur les classes, cycles, séances (y compris leur contenu et leurs bilans) et la bibliothèque.</p>
      ) : total === 0 ? (
        <EmptyState icon="🔍" title="Aucun résultat">
          Essayez un autre mot.
        </EmptyState>
      ) : (
        <div className="stack-lg">
          {results.classes.length > 0 && (
            <ResultGroup title="Classes">
              {results.classes.map((k) => (
                <Link key={k.id} to={`/classes/${k.id}`} className="result">
                  <ClassDot color={k.color} /> <strong>{k.name}</strong> <span className="muted small">{data.years[k.yearId]?.label}</span>
                </Link>
              ))}
            </ResultGroup>
          )}
          {results.cycles.length > 0 && (
            <ResultGroup title="Cycles">
              {results.cycles.map((c) => (
                <Link key={c.id} to={`/cycles/${c.id}`} className="result">
                  <span>{activityOf(data, c.activityId)?.emoji ?? '📘'}</span> <strong>{c.title || 'Cycle sans titre'}</strong>
                  <span className="muted small">{c.classId ? data.classes[c.classId]?.name : 'Modèle'}</span>
                </Link>
              ))}
            </ResultGroup>
          )}
          {results.lessons.length > 0 && (
            <ResultGroup title="Séances">
              {results.lessons.slice(0, 40).map((l) => (
                <Link key={l.id} to={`/lessons/${l.id}`} className="result">
                  <strong>{l.title || 'Séance sans titre'}</strong>
                  <span className="muted small">
                    {l.classId ? data.classes[l.classId]?.name : 'Modèle'}
                    {l.date ? ` · ${formatShort(l.date)}` : ''}
                  </span>
                </Link>
              ))}
            </ResultGroup>
          )}
          {results.exercises.length > 0 && (
            <ResultGroup title="Situations de la bibliothèque">
              {results.exercises.map((e) => (
                <Link key={e.id} to={`/exercises/${e.id}`} className="result">
                  <span>{activityOf(data, e.activityId)?.emoji ?? '🎯'}</span> <strong>{e.title || 'Sans titre'}</strong>
                  {e.tags.slice(0, 3).map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </Link>
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="stack">
      <h2>{title}</h2>
      <Card style={{ padding: 6 }} className="result-list">
        {children}
      </Card>
    </section>
  );
}
