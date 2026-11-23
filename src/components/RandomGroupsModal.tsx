import { useMemo, useState } from 'react';
import { Save, Shuffle, Trash2, Users } from 'lucide-react';
import type { ID, Klass, Lesson } from '../types';
import { useStudents, useVault } from '../store/vault';
import { useData } from '../store/data';
import { confirmDialog, toast, toastUndo } from '../store/ui';
import { autoGroups, byGroup } from '../lib/grouping';
import type { Grouping, Student } from '../lib/privateData';
import { formatShort } from '../lib/dates';
import { cls, plural, uid } from '../lib/util';
import { Button, Field, Modal, NumberInput, Tabs } from './ui';
import { VaultGate } from './VaultGate';
import { groupColor, ParityCheck, useParity } from './GroupsTools';

// Groupes au hasard (accueil) et groupes d'une séance. Tout se fait sur l'appareil : rien n'est envoyé à Claude.

type NewGroups = { assign: Record<ID, number>; count: number };

/** Depuis l'accueil : une classe, un nombre de groupes (ou d'élèves par groupe), et c'est tiré. */
export function RandomGroupsModal({ classes, initialClassId, onClose }: { classes: Klass[]; initialClassId?: ID; onClose: () => void }) {
  const [classId, setClassId] = useState<ID>(initialClassId ?? classes[0]?.id ?? '');
  return (
    <Modal title="Groupes au hasard" onClose={onClose} wide>
      <Field label="Classe">
        <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </Field>
      <VaultGate>
        <RandomGroups key={classId} classId={classId} onSave={(g) => saveForClass(classId, g)} saveLabel="Enregistrer pour la classe" />
      </VaultGate>
    </Modal>
  );
}

function saveForClass(classId: ID, g: NewGroups) {
  const name = `Au hasard du ${new Date().toLocaleDateString('fr-FR')}`;
  useVault.getState().saveGroups(uid(), { classId, name, assign: g.assign, count: g.count });
  toast(`Groupes enregistrés (« ${name} ») : à reprendre dans une séance de la classe.`, { tone: 'success' });
}

/** Les groupes, en cartes de couleur. */
function GroupsGrid({ students, grouping }: { students: Student[]; grouping: NewGroups }) {
  return (
    <div className="random-groups">
      {byGroup(students, grouping.assign, grouping.count).map((g) => (
        <div key={g.group ?? 'rest'} className="random-group" style={{ ['--grp' as string]: g.group ? groupColor(g.group) : 'var(--border-strong)' }}>
          <strong className="random-group-title">{g.group ? `Groupe ${g.group}` : 'Sans groupe'}</strong>
          {g.students.length ? (
            <ul>
              {g.students.map((s) => (
                <li key={s.id}>{s.name || 'Élève sans nom'}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Personne</p>
          )}
        </div>
      ))}
    </div>
  );
}

function RandomGroups({ classId, onSave, saveLabel }: { classId: ID; onSave: (g: NewGroups) => unknown; saveLabel: string }) {
  const students = useStudents(classId);
  const [by, setBy] = useState<'count' | 'size'>('count');
  const [n, setN] = useState(4);
  const [absent, setAbsent] = useState<Set<ID>>(new Set());
  const [showAbsent, setShowAbsent] = useState(false);
  const [result, setResult] = useState<NewGroups | null>(null);
  const [saved, setSaved] = useState(false);
  const [parity, setParity] = useParity();
  const present = useMemo(() => students.filter((s) => !absent.has(s.id)), [students, absent]);
  // « 3 élèves par groupe » pour 13 élèves : 4 groupes de 3 ou 4 plutôt que 5 groupes de 2 ou 3.
  const count = Math.max(1, Math.min(present.length || 1, by === 'count' ? n : Math.round(present.length / Math.max(1, n))));

  if (!students.length) return <p className="muted">Pas encore d'élèves dans cette classe : ajoutez-les depuis la page de la classe.</p>;

  const draw = () => {
    setResult({ assign: autoGroups(present, count, 'random', {}, Math.random, parity), count });
    setSaved(false);
  };
  const toggleAbsent = (id: ID) => {
    setAbsent((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
  };
  const small = Math.floor(present.length / count);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Tabs<'count' | 'size'>
        value={by}
        onChange={(v) => {
          setBy(v);
          setResult(null);
        }}
        tabs={[
          { id: 'count', label: 'Nombre de groupes' },
          { id: 'size', label: 'Élèves par groupe' },
        ]}
      />
      <Field label={by === 'count' ? 'Nombre de groupes' : 'Élèves par groupe'} hint={`${plural(present.length, 'élève')} → ${plural(count, 'groupe')} de ${small}${present.length % count ? ` ou ${small + 1}` : ''}`}>
        <NumberInput
          value={n}
          min={1}
          max={present.length || 1}
          onChange={(v) => {
            setN(v ?? 1);
            setResult(null);
          }}
        />
      </Field>
      <ParityCheck
        students={present}
        checked={parity}
        onChange={(v) => {
          setParity(v);
          setResult(null);
        }}
      />
      <div>
        <button type="button" className="cycle-toggle muted small" onClick={() => setShowAbsent(!showAbsent)}>
          {absent.size ? `${plural(absent.size, 'absent')} · modifier` : 'Des absents ? Touchez-les pour les retirer'}
        </button>
        {showAbsent && (
          <div className="group-names" style={{ marginTop: 6 }}>
            {students.map((s) => (
              <button key={s.id} type="button" className={cls('group-name', absent.has(s.id) && 'random-absent')} onClick={() => toggleAbsent(s.id)} aria-pressed={absent.has(s.id)}>
                {s.name || 'Élève sans nom'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button variant={result ? 'secondary' : 'primary'} icon={<Shuffle size={17} />} onClick={draw} disabled={!present.length}>
          {result ? 'Refaire le tirage' : `Tirer ${plural(count, 'groupe')} au sort`}
        </Button>
        {result && (
          <Button
            variant="primary"
            icon={<Save size={16} />}
            onClick={async () => {
              if ((await onSave(result)) !== false) setSaved(true);
            }}
            disabled={saved}
          >
            {saved ? 'Enregistrés' : saveLabel}
          </Button>
        )}
      </div>
      {result && <GroupsGrid students={present} grouping={result} />}
    </div>
  );
}

/** Bouton « Groupes » d'une fiche de séance : voir les groupes faits pour cette séance, en tirer au hasard ou en reprendre. */
export function LessonGroupsButton({ lesson }: { lesson: Lesson }) {
  const [open, setOpen] = useState(false);
  const count = useVault((s) => (s.status === 'open' ? (s.doc.groups[lesson.id]?.count ?? 0) : 0));
  if (!lesson.classId) return null;
  return (
    <>
      <Button icon={<Users size={17} />} onClick={() => setOpen(true)}>
        {count ? `Groupes (${count})` : 'Groupes'}
      </Button>
      {open && <LessonGroupsModal lesson={lesson} onClose={() => setOpen(false)} />}
    </>
  );
}

function LessonGroupsModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  return (
    <Modal title="Groupes de la séance" onClose={onClose} wide>
      <VaultGate>
        <LessonGroups lesson={lesson} />
      </VaultGate>
    </Modal>
  );
}

function LessonGroups({ lesson }: { lesson: Lesson }) {
  const classId = lesson.classId ?? '';
  const students = useStudents(classId);
  const grouping = useVault((s) => s.doc.groups[lesson.id]);
  const [mode, setMode] = useState<'view' | 'random' | 'reuse'>(grouping?.count ? 'view' : 'random');
  const set = (g: NewGroups | null) => useVault.getState().setGroups(lesson.id, g);

  const remove = async () => {
    const before = grouping;
    if (!(await confirmDialog({ title: 'Retirer les groupes de cette séance ?', message: lesson.evalSheet ? 'Les résultats de la fiche d’évaluation ne changent pas.' : undefined, confirmLabel: 'Retirer' }))) return;
    set(null);
    setMode('random');
    if (before) toastUndo('Groupes retirés', () => set({ assign: before.assign, count: before.count }));
  };
  const replace = async () => !grouping?.count || (await confirmDialog({ title: 'Remplacer les groupes de la séance ?', confirmLabel: 'Remplacer' }));

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Tabs<'view' | 'random' | 'reuse'>
        value={mode}
        onChange={setMode}
        tabs={[
          ...(grouping?.count ? [{ id: 'view' as const, label: 'Groupes de la séance' }] : []),
          { id: 'random', label: 'Au hasard' },
          { id: 'reuse', label: 'Groupes déjà faits' },
        ]}
      />
      {mode === 'view' && grouping?.count ? (
        <>
          <GroupsGrid students={students} grouping={grouping} />
          {lesson.evalSheet && <p className="muted small">Ce sont aussi les groupes de la fiche d’évaluation de la séance : on peut y déplacer les élèves un par un.</p>}
          <div>
            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={remove}>
              Retirer les groupes
            </Button>
          </div>
        </>
      ) : mode === 'random' ? (
        <RandomGroups
          classId={classId}
          saveLabel="Enregistrer dans la séance"
          onSave={async (g) => {
            if (!(await replace())) return false;
            set(g);
            toast('Groupes enregistrés dans la séance.', { tone: 'success' });
            setMode('view');
          }}
        />
      ) : (
        <ReuseList
          lesson={lesson}
          students={students}
          onPick={async (g) => {
            if (!(await replace())) return;
            set(g);
            toast('Groupes repris : les nouveaux élèves sont « sans groupe ».', { tone: 'success' });
            setMode('view');
          }}
        />
      )}
    </div>
  );
}

/** Groupes enregistrés pour la classe et groupes des autres séances de la classe. */
function ReuseList({ lesson, students, onPick }: { lesson: Lesson; students: Student[]; onPick: (g: NewGroups) => void }) {
  const lessons = useData((s) => s.data.lessons);
  const doc = useVault((s) => s.doc);
  const ids = new Set(students.map((s) => s.id));
  const saved = Object.entries(doc.savedGroups)
    .filter(([, g]) => g.classId === lesson.classId && !g.deleted)
    .sort(([, a], [, b]) => b.t - a.t)
    .map(([id, g]) => ({ id, label: g.name || 'Groupes enregistrés', detail: 'enregistrés', g }));
  const fromLessons = Object.values(lessons)
    .filter((l) => l.id !== lesson.id && l.classId === lesson.classId && (doc.groups[l.id]?.count ?? 0) > 0)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .map((l) => ({ id: l.id, label: `${l.title || 'Séance'}${l.date ? ` (${formatShort(l.date)})` : ''}`, detail: 'd’une séance', g: doc.groups[l.id] as Grouping }));
  const list = [...saved, ...fromLessons];
  if (!list.length) return <p className="muted">Pas encore de groupes enregistrés ni d’autre séance avec des groupes pour cette classe.</p>;
  return (
    <ul className="reuse-list">
      {list.map((x) => (
        <li key={x.id}>
          <button type="button" className="grow" onClick={() => onPick({ count: x.g.count, assign: Object.fromEntries(Object.entries(x.g.assign).filter(([sid]) => ids.has(sid))) })}>
            <strong>{x.label}</strong>
            <span className="muted small">
              {' '}
              · {plural(x.g.count, 'groupe')} · {x.detail}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
