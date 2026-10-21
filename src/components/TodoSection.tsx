import { useEffect, useMemo, useState } from 'react';
import { fetchForecast, type Hour } from '../lib/weather';
import { Link } from 'react-router-dom';
import { ListChecks, Plus, X } from 'lucide-react';
import type { Lesson } from '../types';
import { Button, Card, Section } from './ui';
import { ClassDot } from './cards';
import { useData } from '../store/data';
import { taskGroups, type Task } from '../lib/tasks';
import { formatShort } from '../lib/dates';
import { cls, uid } from '../lib/util';
import { toast } from '../store/ui';

/** « À faire avant les prochaines séances » : tâches calculées + tâches ajoutées à la main. */
export function TodoSection({ lessons, today }: { lessons: Lesson[]; today: string }) {
  const data = useData((s) => s.data);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);

  const place = data.settings.weather;
  const [forecast, setForecast] = useState<Hour[] | null>(null);
  useEffect(() => {
    let alive = true;
    setForecast(null);
    if (place) fetchForecast(place).then((h) => alive && setForecast(h)).catch(() => alive && setForecast(null));
    return () => {
      alive = false;
    };
  }, [place?.lat, place?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => taskGroups(data, lessons, today, { place: !!place, forecast }), [data, lessons, today, place, forecast]);
  const open = groups.map((g) => ({ ...g, open: g.tasks.filter((t) => !t.done), done: g.tasks.filter((t) => t.done) })).filter((g) => g.open.length > 0);
  const total = open.reduce((n, g) => n + g.open.length, 0);

  // Séances auxquelles on peut rattacher une tâche : les 2 prochaines de chaque classe.
  const candidates = useMemo(() => {
    const seen = new Map<string, number>();
    return lessons.filter((l) => {
      if (!l.classId || !l.date || l.date < today || l.status !== 'planned') return false;
      const n = seen.get(l.classId) ?? 0;
      seen.set(l.classId, n + 1);
      return n < 3;
    });
  }, [lessons, today]);

  const toggle = (t: Task) => {
    const l = data.lessons[t.lessonId];
    if (!l) return;
    const flip = (cur: Lesson) => {
      const patch = useData.getState().patch;
      if (t.manual) patch('lessons', cur.id, { todos: cur.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) });
      else patch('lessons', cur.id, { tasksDone: cur.tasksDone.includes(t.id) ? cur.tasksDone.filter((x) => x !== t.id) : [...cur.tasksDone, t.id] });
    };
    flip(l);
    if (!t.done) toast('Tâche faite', { ms: 6000, action: { label: 'Annuler', run: () => flip(useData.getState().data.lessons[l.id]) } });
  };
  const remove = (t: Task) => {
    const l = data.lessons[t.lessonId];
    if (l) useData.getState().patch('lessons', l.id, { todos: l.todos.filter((x) => x.id !== t.id) });
  };
  const add = () => {
    const l = data.lessons[target || candidates[0]?.id];
    if (!l || !text.trim()) return;
    useData.getState().patch('lessons', l.id, { todos: [...l.todos, { id: uid(), text: text.trim(), done: false }] });
    setText('');
  };

  if (total === 0 && !adding) {
    return (
      <p className="muted small todo-empty">
        Rien à faire avant vos prochaines séances.{' '}
        <button type="button" className="link-btn" onClick={() => setAdding(true)}>
          + Ajouter une tâche
        </button>
      </p>
    );
  }

  const shown = all ? open : open.slice(0, 4);

  return (
    <Section
      title={
        <span>
          <ListChecks size={18} style={{ verticalAlign: '-3px' }} /> À faire avant les prochaines séances ({total})
        </span>
      }
      actions={
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setAdding((a) => !a)}>
          Ajouter
        </Button>
      }
    >
      {adding && (
        <Card className="todo-add">
          <select className="input" value={target || candidates[0]?.id || ''} onChange={(e) => setTarget(e.target.value)} aria-label="Avant quelle séance ?">
            {candidates.map((l) => (
              <option key={l.id} value={l.id}>
                {data.classes[l.classId!]?.name} · {l.date && formatShort(l.date)} · {l.title || 'Séance'}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={text}
            placeholder="Ex. : créer les groupes, saisir les notes sur École Directe…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button variant="primary" size="sm" onClick={add} disabled={!text.trim()}>
            Ajouter
          </Button>
        </Card>
      )}
      <div className="stack">
        {shown.map((g) => (
          <Card key={g.lesson.id} className="todo-group" style={{ ['--class' as string]: g.klass?.color }}>
            <div className="todo-head">
              {g.klass && <ClassDot color={g.klass.color} size={12} />}
              <strong>{g.klass?.name}</strong>
              <Link to={`/lessons/${g.lesson.id}`} className="small">
                {g.lesson.date && formatShort(g.lesson.date)} · {g.lesson.title || 'Séance'}
              </Link>
            </div>
            {g.open.map((t) => (
              <div key={t.id} className="todo-item">
                <label className="check">
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t)} />
                  <span className={cls(t.manual && 'todo-manual')}>
                    {t.to ? <Link to={t.to}>{t.text}</Link> : t.text}
                    {t.detail && <span className="muted small todo-detail">{t.detail}</span>}
                  </span>
                </label>
                {t.manual && (
                  <button type="button" className="icon-btn" aria-label="Supprimer la tâche" onClick={() => remove(t)}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </Card>
        ))}
      </div>
      {open.length > 4 && (
        <button type="button" className="link-btn" onClick={() => setAll((a) => !a)}>
          {all ? 'Réduire' : `Voir les ${open.length - 4} autres séances`}
        </button>
      )}
    </Section>
  );
}
