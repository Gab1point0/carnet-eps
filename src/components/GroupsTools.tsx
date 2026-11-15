import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Save, Shuffle, Trash2, Users, X } from 'lucide-react';
import type { ID, Lesson } from '../types';
import { useData } from '../store/data';
import { useVault } from '../store/vault';
import { confirmDialog, toast, toastUndo } from '../store/ui';
import { autoGroups, type GroupMode } from '../lib/grouping';
import { criterionKey, type Grouping, type Student } from '../lib/privateData';
import { scoreOf } from '../lib/evalSheet';
import { formatShort } from '../lib/dates';
import { cls, plural, uid } from '../lib/util';
import { Button, Field, IconButton, Modal, NumberInput, Tabs, TextInput } from './ui';

export const GROUP_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0d9488', '#db2777', '#ca8a04', '#4f46e5', '#dc2626', '#0891b2'];
export const groupColor = (g: number) => GROUP_COLORS[(g - 1) % GROUP_COLORS.length];

/** Petit choix du groupe d'un élève, sur sa carte ou sa ligne. */
export function GroupSelect({ value, count, onChange, label }: { value: number | undefined; count: number; onChange: (g: number | null) => void; label: string }) {
  return (
    <select
      className="group-select"
      aria-label={label}
      value={value && value <= count ? String(value) : ''}
      style={{ ['--grp' as string]: value && value <= count ? groupColor(value) : 'var(--border-strong)' }}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">—</option>
      {Array.from({ length: count }, (_, i) => (
        <option key={i} value={i + 1}>
          G{i + 1}
        </option>
      ))}
    </select>
  );
}

/** Barre des groupes d'une fiche : former, afficher un groupe à la fois, reprendre, enregistrer, automatique. */
export function GroupsBar({
  lesson,
  students,
  grouping,
  one,
  setOne,
}: {
  lesson: Lesson;
  students: Student[];
  grouping: Grouping | undefined;
  one: number | null;
  setOne: (g: number | null) => void;
}) {
  const [forming, setForming] = useState(false);
  const [active, setActive] = useState(1);
  const [modal, setModal] = useState<'auto' | 'reuse' | 'save' | null>(null);
  const count = grouping?.count ?? 0;
  const assign = grouping?.assign ?? {};
  const set = (g: Omit<Grouping, 't'> | null) => useVault.getState().setGroups(lesson.id, g);
  const sizes = Array.from({ length: count }, (_, i) => students.filter((s) => assign[s.id] === i + 1).length);
  const unplaced = students.filter((s) => !assign[s.id] || assign[s.id] > count).length;

  const startForming = () => {
    if (!count) set({ assign: {}, count: 2 });
    setActive(1);
    setForming(true);
    setOne(null);
  };
  const tap = (s: Student) => set({ count, assign: { ...assign, [s.id]: assign[s.id] === active ? 0 : active } });
  const clearAll = async () => {
    const before = grouping;
    if (!(await confirmDialog({ title: 'Retirer les groupes de cette fiche ?', message: 'Les résultats des élèves ne changent pas.', confirmLabel: 'Retirer' }))) return;
    set(null);
    setForming(false);
    setOne(null);
    if (before) toastUndo('Groupes retirés', () => set({ assign: before.assign, count: before.count }));
  };

  return (
    <div className="groups-bar card">
      {!forming ? (
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" icon={<Users size={15} />} onClick={startForming}>
              {count ? 'Modifier les groupes' : 'Former des groupes'}
            </Button>
            {count > 0 && (
              <Tabs<'all' | 'one'>
                value={one ? 'one' : 'all'}
                onChange={(v) => setOne(v === 'one' ? 1 : null)}
                tabs={[
                  { id: 'all', label: 'Tous' },
                  { id: 'one', label: 'Un groupe à la fois' },
                ]}
              />
            )}
          </div>
          {count > 0 && one && (
            <div className="row" style={{ gap: 4 }}>
              <IconButton label="Groupe précédent" disabled={one <= 1} onClick={() => setOne(one - 1)}>
                <ChevronLeft size={18} />
              </IconButton>
              <strong className="group-pill" style={{ ['--grp' as string]: groupColor(one) }}>
                Groupe {one} / {count}
              </strong>
              <IconButton label="Groupe suivant" disabled={one >= count} onClick={() => setOne(one + 1)}>
                <ChevronRight size={18} />
              </IconButton>
            </div>
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 6 }}>
            <strong>Former les groupes</strong>
            <Button size="sm" variant="primary" onClick={() => setForming(false)}>
              Terminer
            </Button>
          </div>
          <p className="muted small">Choisissez un groupe, puis touchez ses élèves. Toucher à nouveau un élève le retire du groupe.</p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                className={cls('group-chip', active === i + 1 && 'group-chip-on')}
                style={{ ['--grp' as string]: groupColor(i + 1) }}
                onClick={() => setActive(i + 1)}
              >
                Groupe {i + 1} · {sizes[i]}
              </button>
            ))}
            <IconButton label="Ajouter un groupe" onClick={() => set({ assign, count: count + 1 })}>
              <Plus size={16} />
            </IconButton>
            <IconButton
              label="Retirer le dernier groupe"
              disabled={count <= 1}
              onClick={() => {
                set({ count: count - 1, assign: Object.fromEntries(Object.entries(assign).map(([k, g]) => [k, g === count ? 0 : g])) });
                if (active >= count) setActive(count - 1);
              }}
            >
              <Minus size={16} />
            </IconButton>
          </div>
          <div className="group-names">
            {students.map((s) => {
              const g = assign[s.id] && assign[s.id] <= count ? assign[s.id] : 0;
              return (
                <button key={s.id} type="button" className={cls('group-name', g > 0 && 'group-name-in')} style={{ ['--grp' as string]: g ? groupColor(g) : 'transparent' }} onClick={() => tap(s)}>
                  {g ? <span className="group-tag">G{g}</span> : null}
                  {s.name || 'Élève sans nom'}
                </button>
              );
            })}
          </div>
          <p className="muted small">{unplaced ? `${plural(unplaced, 'élève')} à placer.` : 'Tous les élèves sont placés.'}</p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" icon={<Shuffle size={15} />} onClick={() => setModal('auto')}>
              Groupes automatiques…
            </Button>
            <Button size="sm" onClick={() => setModal('reuse')}>
              Reprendre des groupes…
            </Button>
            <Button size="sm" icon={<Save size={15} />} onClick={() => setModal('save')} disabled={!count}>
              Enregistrer ces groupes…
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={clearAll}>
              Retirer les groupes
            </Button>
          </div>
        </div>
      )}
      {modal === 'auto' && <AutoGroupsModal lesson={lesson} students={students} onClose={() => setModal(null)} onDone={(g) => set(g)} hasGroups={count > 0} />}
      {modal === 'reuse' && <ReuseGroupsModal lesson={lesson} students={students} onClose={() => setModal(null)} onPick={(g) => set(g)} />}
      {modal === 'save' && grouping && <SaveGroupsModal lesson={lesson} grouping={grouping} onClose={() => setModal(null)} />}
    </div>
  );
}

/** Autres fiches de la même classe (séances avec une fiche d'évaluation). */
function useClassSheets(lesson: Lesson) {
  const lessons = useData((s) => s.data.lessons);
  return useMemo(
    () =>
      Object.values(lessons)
        .filter((l) => l.id !== lesson.id && l.classId === lesson.classId && l.evalSheet)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [lessons, lesson.id, lesson.classId],
  );
}

function AutoGroupsModal({ lesson, students, hasGroups, onClose, onDone }: { lesson: Lesson; students: Student[]; hasGroups: boolean; onClose: () => void; onDone: (g: Omit<Grouping, 't'>) => void }) {
  const sheets = useClassSheets(lesson);
  const doc = useVault((s) => s.doc);
  const withMarks = [lesson, ...sheets].filter((l) => l.evalSheet && Object.keys(doc.sheets[l.id] ?? {}).length);
  const [by, setBy] = useState<'count' | 'size'>('count');
  const [n, setN] = useState(4);
  const [mode, setMode] = useState<GroupMode>('random');
  const [source, setSource] = useState<ID>(withMarks[0]?.id ?? '');
  const count = Math.max(1, by === 'count' ? n : Math.ceil(students.length / Math.max(1, n)));

  const run = async () => {
    if (hasGroups && !(await confirmDialog({ title: 'Remplacer les groupes actuels ?', confirmLabel: 'Remplacer' }))) return;
    const scores: Record<ID, number> = {};
    if (mode !== 'random') {
      const src = withMarks.find((l) => l.id === source);
      const rows = doc.sheets[source] ?? {};
      if (src?.evalSheet) for (const s of students) if (rows[s.id] && !rows[s.id].absent) scores[s.id] = scoreOf(src.evalSheet, rows[s.id].v, criterionKey).total;
    }
    onDone({ assign: autoGroups(students, count, mode, scores), count });
    onClose();
  };

  return (
    <Modal
      title="Groupes automatiques"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={run} disabled={mode !== 'random' && !source}>
            Former {plural(count, 'groupe')}
          </Button>
        </>
      }
    >
      <Tabs<'count' | 'size'>
        value={by}
        onChange={setBy}
        tabs={[
          { id: 'count', label: 'Nombre de groupes' },
          { id: 'size', label: 'Élèves par groupe' },
        ]}
      />
      <Field label={by === 'count' ? 'Nombre de groupes' : 'Élèves par groupe'} hint={`${students.length} élèves → ${plural(count, 'groupe')} d'environ ${Math.round(students.length / count)}`}>
        <NumberInput value={n} min={1} max={students.length || 1} onChange={(v) => setN(v ?? 1)} />
      </Field>
      <div className="stack" style={{ gap: 6 }}>
        {(
          [
            ['random', 'Au hasard', ''],
            ['homogeneous', 'Homogènes', 'les élèves de même niveau ensemble'],
            ['heterogeneous', 'Hétérogènes', 'des niveaux mélangés dans chaque groupe'],
          ] as const
        ).map(([v, label, hint]) => (
          <label key={v} className="check">
            <input type="radio" name="group-mode" checked={mode === v} onChange={() => setMode(v)} />
            <span>
              <strong>{label}</strong> {hint && <span className="muted small">: {hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {mode !== 'random' &&
        (withMarks.length ? (
          <Field label="Niveaux pris dans la fiche">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              {withMarks.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id === lesson.id ? 'Cette fiche' : `${l.title || 'Séance'}${l.date ? ` (${formatShort(l.date)})` : ''}`}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="error-text small">Aucune fiche remplie pour cette classe : faites d'abord une évaluation (par exemple le diagnostic), ou choisissez « Au hasard ».</p>
        ))}
      <p className="muted small">Vous pourrez ensuite déplacer qui vous voulez.</p>
    </Modal>
  );
}

function ReuseGroupsModal({ lesson, students, onClose, onPick }: { lesson: Lesson; students: Student[]; onClose: () => void; onPick: (g: Omit<Grouping, 't'>) => void }) {
  const sheets = useClassSheets(lesson);
  const doc = useVault((s) => s.doc);
  const fromSheets = sheets.filter((l) => (doc.groups[l.id]?.count ?? 0) > 0).map((l) => ({ id: l.id, label: `${l.title || 'Séance'}${l.date ? ` (${formatShort(l.date)})` : ''}`, g: doc.groups[l.id], saved: false }));
  const saved = Object.entries(doc.savedGroups)
    .filter(([, g]) => g.classId === lesson.classId && !g.deleted)
    .map(([id, g]) => ({ id, label: g.name, g, saved: true }));
  const ids = new Set(students.map((s) => s.id));
  const pick = (g: Grouping) => {
    onPick({ count: g.count, assign: Object.fromEntries(Object.entries(g.assign).filter(([sid]) => ids.has(sid))) });
    toast('Groupes repris : les nouveaux élèves sont « à placer ».', { tone: 'success' });
    onClose();
  };
  const remove = (id: ID, g: (typeof saved)[number]['g']) => {
    useVault.getState().saveGroups(id, { ...g, deleted: true });
    toastUndo(`« ${g.name} » supprimé`, () => useVault.getState().saveGroups(id, { ...g, deleted: false }));
  };
  const list = [...saved, ...fromSheets];
  return (
    <Modal title="Reprendre des groupes" onClose={onClose}>
      {list.length === 0 ? (
        <p className="muted">Pas encore de groupes enregistrés ni d'autre fiche avec des groupes pour cette classe.</p>
      ) : (
        <ul className="reuse-list">
          {list.map((x) => (
            <li key={x.id}>
              <button type="button" className="grow" onClick={() => pick(x.g)}>
                <strong>{x.label}</strong>
                <span className="muted small"> · {plural(x.g.count, 'groupe')}{x.saved ? ' · enregistrés' : ' · d’une fiche'}</span>
              </button>
              {x.saved && (
                <IconButton label={`Supprimer ${x.label}`} onClick={() => remove(x.id, x.g as (typeof saved)[number]['g'])}>
                  <X size={15} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function SaveGroupsModal({ lesson, grouping, onClose }: { lesson: Lesson; grouping: Grouping; onClose: () => void }) {
  const [name, setName] = useState('');
  const save = () => {
    useVault.getState().saveGroups(uid(), { classId: lesson.classId ?? '', name: name.trim(), assign: grouping.assign, count: grouping.count });
    toast(`Groupes « ${name.trim()} » enregistrés pour la classe`, { tone: 'success' });
    onClose();
  };
  return (
    <Modal
      title="Enregistrer ces groupes"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field label="Nom" hint="Réutilisables dans toutes les fiches de la classe (« Reprendre des groupes »).">
        <TextInput value={name} onChange={setName} placeholder="Équipes du tournoi, groupes de niveau…" autoFocus />
      </Field>
    </Modal>
  );
}
