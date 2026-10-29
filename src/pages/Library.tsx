import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileOutput, Film, ListChecks, Plus, Search } from 'lucide-react';
import { extractSituations } from '../store/actions';
import { toast } from '../store/ui';
import type { ID } from '../types';
import { Button, Card, Chip, EmptyState, PageHeader, Select, Tabs, TextInput } from '../components/ui';
import { ActivityChip, LessonRow } from '../components/cards';
import { FrameThumb } from '../animation/Player';
import { useData } from '../store/data';
import { activityOf, cycleLessons, useExercises, useSettings } from '../store/selectors';
import { newCycle, newExercise, newLesson } from '../store/model';
import { BLOCK_KINDS } from '../lib/defaults';
import { normalize, plural } from '../lib/util';

type Tab = 'exercises' | 'lessons' | 'cycles';

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>('exercises');
  const [q, setQ] = useState('');
  const [activity, setActivity] = useState<ID | ''>('');
  const settings = useSettings();
  const exercises = useExercises();
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withWarmups, setWithWarmups] = useState(false);

  const nq = normalize(q);
  const match = (text: string, act: ID | null) => (!activity || act === activity) && (!nq || normalize(text).includes(nq));

  const filteredExercises = useMemo(
    () => exercises.filter((e) => match(`${e.title} ${e.tags.join(' ')} ${e.text}`, e.activityId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises, nq, activity],
  );
  const templateLessons = useMemo(
    () =>
      Object.values(data.lessons)
        .filter((l) => l.classId === null && match(`${l.title} ${l.objective} ${l.tags.join(' ')}`, l.activityId))
        .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.lessons, nq, activity],
  );
  const templateCycles = useMemo(
    () =>
      Object.values(data.cycles)
        .filter((c) => c.classId === null && match(`${c.title} ${c.objectives}`, c.activityId))
        .sort((a, b) => a.title.localeCompare(b.title, 'fr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.cycles, nq, activity],
  );

  const create = () => {
    if (tab === 'exercises') {
      const e = newExercise('');
      e.activityId = activity || null;
      useData.getState().put('exercises', e);
      navigate(`/exercises/${e.id}`);
    } else if (tab === 'lessons') {
      const l = newLesson(null, null, 0, '');
      l.activityId = activity || null;
      useData.getState().put('lessons', l);
      navigate(`/lessons/${l.id}`);
    } else {
      const c = newCycle(null, 0, '');
      c.activityId = activity || null;
      useData.getState().put('cycles', c);
      navigate(`/cycles/${c.id}`);
    }
  };

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const extract = () => {
    const { created, skipped } = extractSituations([...selected], { withWarmups });
    toast(
      created === 0
        ? 'Aucune nouvelle situation : celles de ces séances sont déjà dans la bibliothèque.'
        : `${plural(created, 'situation')} ajoutée${created > 1 ? 's' : ''} à la bibliothèque${skipped ? ` (${skipped} déjà présente${skipped > 1 ? 's' : ''}, ignorée${skipped > 1 ? 's' : ''})` : ''}.`,
      { tone: created ? 'success' : undefined },
    );
    if (created) {
      stopSelecting();
      setTab('exercises');
    }
  };

  const createLabel = tab === 'exercises' ? 'Nouvelle situation' : tab === 'lessons' ? 'Nouvelle séance modèle' : 'Nouveau cycle modèle';

  return (
    <>
      <PageHeader
        title="Bibliothèque"
        subtitle="Vos situations, séances et cycles réutilisables d'une classe et d'une année à l'autre."
        actions={
          <Button variant="primary" icon={<Plus size={18} />} onClick={create}>
            {createLabel}
          </Button>
        }
      />

      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'exercises', label: `Situations (${exercises.length})` },
            { id: 'lessons', label: `Séances (${Object.values(data.lessons).filter((l) => l.classId === null).length})` },
            { id: 'cycles', label: `Cycles (${Object.values(data.cycles).filter((c) => c.classId === null).length})` },
          ]}
        />
      </div>

      <div className="filters">
        <div className="search-box">
          <Search size={17} />
          <TextInput value={q} onChange={setQ} placeholder="Rechercher…" aria-label="Rechercher dans la bibliothèque" />
        </div>
        <Select<string>
          value={activity}
          onChange={(v) => setActivity(v)}
          placeholder="Toutes les activités"
          options={settings.activities.map((a) => ({ value: a.id, label: `${a.emoji} ${a.name}` }))}
        />
      </div>

      {tab === 'exercises' &&
        (filteredExercises.length === 0 ? (
          <EmptyState icon="🎯" title={exercises.length ? 'Aucune situation ne correspond' : 'Votre bibliothèque de situations est vide'} action={<Button variant="primary" icon={<Plus size={18} />} onClick={create}>Créer une situation</Button>}>
            Chaque situation peut contenir un schéma animé réutilisable dans toutes vos séances. Vous pouvez aussi enregistrer un bloc existant depuis une séance.
          </EmptyState>
        ) : (
          <div className="grid grid-cards">
            {filteredExercises.map((e) => (
              <Link key={e.id} to={`/exercises/${e.id}`} className="ex-card">
                <Card className="card-click ex-card-inner">
                  <div className="ex-thumb">
                    {e.animation ? <FrameThumb animation={e.animation} /> : <div className="ex-thumb-empty">{activityOf(data, e.activityId)?.emoji ?? '🎯'}</div>}
                    {e.animation && e.animation.frames.length > 1 && (
                      <span className="ex-thumb-badge">
                        <Film size={12} /> {e.animation.frames.length} étapes
                      </span>
                    )}
                  </div>
                  <h3>{e.title || 'Situation sans titre'}</h3>
                  <div className="row" style={{ gap: 6 }}>
                    <ActivityChip activityId={e.activityId} />
                    <Chip color={BLOCK_KINDS[e.kind].color}>{BLOCK_KINDS[e.kind].label}</Chip>
                    <span className="muted small">{e.minutes} min</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ))}

      {tab === 'lessons' &&
        (templateLessons.length === 0 ? (
          <EmptyState icon="📄" title="Aucune séance modèle" action={<Button variant="primary" icon={<Plus size={18} />} onClick={create}>Créer une séance modèle</Button>}>
            Depuis une séance de classe, utilisez « Enregistrer comme séance modèle » pour la conserver ici.
          </EmptyState>
        ) : (
          <>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="muted small">Sélectionnez des séances pour en extraire les situations dans l'onglet « Situations ».</span>
              <Button size="sm" icon={<ListChecks size={15} />} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                {selecting ? 'Terminer la sélection' : 'Sélectionner des séances'}
              </Button>
            </div>
            {selecting && (
              <Card className="select-bar">
                <strong>{plural(selected.size, 'séance')} sélectionnée{selected.size > 1 ? 's' : ''}</strong>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" onClick={() => setSelected(selected.size < templateLessons.length ? new Set(templateLessons.map((l) => l.id)) : new Set())}>
                    {selected.size < templateLessons.length ? 'Tout sélectionner' : 'Tout désélectionner'}
                  </Button>
                  <label className="check">
                    <input type="checkbox" checked={withWarmups} onChange={(e) => setWithWarmups(e.target.checked)} />
                    avec échauffements et retours au calme
                  </label>
                  <Button size="sm" variant="primary" icon={<FileOutput size={15} />} onClick={extract} disabled={selected.size === 0}>
                    Extraire les situations
                  </Button>
                </div>
              </Card>
            )}
            <Card style={{ padding: 6 }} className="lesson-list">
              {templateLessons.map((l) =>
                selecting ? (
                  <div key={l.id} className="select-row">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${l.title || 'la séance'}`}
                      checked={selected.has(l.id)}
                      onChange={(e) =>
                        setSelected((cur) => {
                          const next = new Set(cur);
                          if (e.target.checked) next.add(l.id);
                          else next.delete(l.id);
                          return next;
                        })
                      }
                    />
                    <div className="grow">
                      <LessonRow lesson={l} />
                    </div>
                  </div>
                ) : (
                  <LessonRow key={l.id} lesson={l} />
                ),
              )}
            </Card>
          </>
        ))}

      {tab === 'cycles' &&
        (templateCycles.length === 0 ? (
          <EmptyState icon="🗂️" title="Aucun cycle modèle" action={<Button variant="primary" icon={<Plus size={18} />} onClick={create}>Créer un cycle modèle</Button>}>
            Depuis un cycle de classe, utilisez « Enregistrer comme modèle de cycle ». Vous pourrez ensuite l'appliquer à n'importe quelle classe en un clic.
          </EmptyState>
        ) : (
          <div className="grid grid-cards">
            {templateCycles.map((c) => (
              <Link key={c.id} to={`/cycles/${c.id}`} className="ex-card">
                <Card className="card-click">
                  <h3>{c.title || 'Cycle sans titre'}</h3>
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    <ActivityChip activityId={c.activityId} />
                    <span className="muted small">{plural(cycleLessons(data, c.id).length, 'séance')}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ))}
    </>
  );
}
