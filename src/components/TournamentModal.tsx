import { useMemo, useState, type ReactNode } from 'react';
import { Shuffle, Trophy } from 'lucide-react';
import type { ID, Klass, Lesson } from '../types';
import { useStudents, useVault } from '../store/vault';
import { useData } from '../store/data';
import { byGroup } from '../lib/grouping';
import { rotationsForAll, schedule, type Rotation } from '../lib/tournament';
import { cls, plural } from '../lib/util';
import { Button, Field, Modal, NumberInput, Tabs } from './ui';
import { VaultGate } from './VaultGate';
import { groupColor } from './GroupsTools';

// « Tournoi » : roulement de matchs sans revanche, en équipes ou en individuel. Tout se fait sur l'appareil.
// Le roulement reste affiché le temps de la session (fenêtre refermée puis rouverte) ; il n'est pas enregistré,
// pour ne garder aucun nom d'élève en dehors du coffre chiffré.

/** Activités où l'on s'affronte plutôt seul (ou en double) : le tournoi s'ouvre en « individuels ». */
const INDIVIDUAL_ACTIVITIES = new Set(['badminton', 'tt', 'tennis', 'judo', 'boxe']);

interface Participant {
  id: string;
  label: string;
  /** Couleur de l'équipe (numéro de groupe), absente en individuel. */
  team?: number;
  members?: string;
}

type Saved = { rotations: Rotation[]; participants: Participant[] };
/** Dernier roulement par séance ou par classe, le temps de la session. */
const LAST = new Map<string, Saved>();

/** Bouton « Tournoi » d'une séance. */
export function LessonTournamentButton({ lesson }: { lesson: Lesson }) {
  const [open, setOpen] = useState(false);
  const data = useData((s) => s.data);
  if (!lesson.classId) return null;
  const klass = data.classes[lesson.classId];
  const activityId = lesson.activityId ?? (lesson.cycleId ? data.cycles[lesson.cycleId]?.activityId : null) ?? null;
  return (
    <>
      <Button icon={<Trophy size={17} />} onClick={() => setOpen(true)}>
        Tournoi
      </Button>
      {open && klass && <TournamentModal classes={[klass]} initialClassId={klass.id} lesson={lesson} activityId={activityId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function TournamentModal({
  classes,
  initialClassId,
  lesson,
  activityId,
  onClose,
}: {
  classes: Klass[];
  initialClassId?: ID;
  lesson?: Lesson;
  activityId?: ID | null;
  onClose: () => void;
}) {
  const [classId, setClassId] = useState<ID>(initialClassId ?? classes[0]?.id ?? '');
  const [kind, setKind] = useState<'teams' | 'solo'>(activityId && INDIVIDUAL_ACTIVITIES.has(activityId) ? 'solo' : 'teams');
  const key = lesson?.id ?? classId;
  return (
    <Modal title="Tournoi : roulement des matchs" onClose={onClose} wide>
      {classes.length > 1 && (
        <Field label="Classe">
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Tabs<'teams' | 'solo'>
        value={kind}
        onChange={setKind}
        tabs={[
          { id: 'teams', label: 'Équipes' },
          { id: 'solo', label: 'Individuels' },
        ]}
      />
      {kind === 'teams' ? <TeamsSetup key={`t-${key}`} storeKey={`t-${key}`} lesson={lesson} /> : <VaultGate><SoloSetup key={`s-${key}`} storeKey={`s-${key}`} classId={classId} /></VaultGate>}
    </Modal>
  );
}

/** Équipes : les groupes de la séance s'il y en a, sinon un nombre d'équipes numérotées. */
function TeamsSetup({ storeKey, lesson }: { storeKey: string; lesson?: Lesson }) {
  const vaultOpen = useVault((s) => s.status === 'open');
  const grouping = useVault((s) => (lesson ? s.doc.groups[lesson.id] : undefined));
  const students = useStudents(lesson?.classId);
  const hasGroups = vaultOpen && !!grouping?.count;
  const [useGroups, setUseGroups] = useState(hasGroups);
  const [count, setCount] = useState(grouping?.count && grouping.count > 1 ? grouping.count : 6);
  const participants: Participant[] = useMemo(() => {
    if (useGroups && hasGroups && grouping) {
      return byGroup(students, grouping.assign, grouping.count)
        .filter((g) => g.group)
        .map((g) => ({ id: `g${g.group}`, label: `Équipe ${g.group}`, team: g.group!, members: g.students.map((s) => s.name || 'Élève sans nom').join(', ') }));
    }
    return Array.from({ length: Math.max(2, count) }, (_, i) => ({ id: `g${i + 1}`, label: `Équipe ${i + 1}`, team: i + 1 }));
  }, [useGroups, hasGroups, grouping, students, count]);

  return (
    <Generator storeKey={storeKey} participants={participants}>
      {hasGroups && (
        <label className="check">
          <input type="checkbox" checked={useGroups} onChange={(e) => setUseGroups(e.target.checked)} />
          <span>
            <strong>Prendre les groupes de la séance</strong> <span className="muted small">({plural(grouping!.count, 'équipe')})</span>
          </span>
        </label>
      )}
      {useGroups && hasGroups && (
        <ul className="small tourney-members">
          {participants.map((p) => (
            <li key={p.id}>
              <span className="tourney-team" style={{ ['--grp' as string]: groupColor(p.team ?? 1) }}>
                {p.label}
              </span>{' '}
              : {p.members || 'personne'}
            </li>
          ))}
        </ul>
      )}
      {!(useGroups && hasGroups) && (
        <Field label="Nombre d'équipes" hint="Les équipes sont numérotées : formez-les sur le terrain, ou faites d'abord les groupes de la séance (bouton « Groupes »).">
          <NumberInput value={count} min={2} max={40} onChange={(v) => setCount(Math.max(2, v ?? 2))} />
        </Field>
      )}
    </Generator>
  );
}

/** Individuels : les élèves présents de la classe. */
function SoloSetup({ storeKey, classId }: { storeKey: string; classId: ID }) {
  const students = useStudents(classId);
  const [absent, setAbsent] = useState<Set<ID>>(new Set());
  const [showAbsent, setShowAbsent] = useState(false);
  const participants: Participant[] = useMemo(() => students.filter((s) => !absent.has(s.id)).map((s) => ({ id: s.id, label: s.name || 'Élève sans nom' })), [students, absent]);
  if (!students.length) return <p className="muted">Pas encore d'élèves dans cette classe : ajoutez-les depuis la page de la classe.</p>;
  return (
    <Generator storeKey={storeKey} participants={participants}>
      <div>
        <button type="button" className="cycle-toggle muted small" onClick={() => setShowAbsent(!showAbsent)}>
          {absent.size ? `${plural(absent.size, 'absent')} · modifier` : 'Des absents ? Touchez-les pour les retirer'}
        </button>
        {showAbsent && (
          <div className="group-names" style={{ marginTop: 6 }}>
            {students.map((s) => (
              <button
                key={s.id}
                type="button"
                className={cls('group-name', absent.has(s.id) && 'random-absent')}
                aria-pressed={absent.has(s.id)}
                onClick={() =>
                  setAbsent((cur) => {
                    const next = new Set(cur);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
              >
                {s.name || 'Élève sans nom'}
              </button>
            ))}
          </div>
        )}
      </div>
    </Generator>
  );
}

/** Réglages communs (terrains, rotations, arbitres) et affichage du roulement. */
function Generator({ storeKey, participants, children }: { storeKey: string; participants: Participant[]; children: ReactNode }) {
  const [courts, setCourts] = useState(() => Math.max(1, Math.min(4, Math.floor(participants.length / 2))));
  const [limit, setLimit] = useState<number | null>(null);
  const [referees, setReferees] = useState(true);
  const [saved, setSaved] = useState<Saved | null>(() => LAST.get(storeKey) ?? null);
  const n = participants.length;
  const full = useMemo(() => (n >= 2 ? rotationsForAll(n, courts) : 0), [n, courts]);
  const perRotation = Math.min(courts, Math.floor(n / 2));

  const run = () => {
    const rotations = schedule(
      participants.map((p) => p.id),
      { courts, rotations: limit ?? undefined, referees },
    );
    const next = { rotations, participants };
    LAST.set(storeKey, next);
    setSaved(next);
  };
  const byId = new Map((saved?.participants ?? participants).map((p) => [p.id, p]));
  const name = (id: string) => {
    const p = byId.get(id);
    if (!p) return '?';
    return p.team ? (
      <span className="tourney-team" style={{ ['--grp' as string]: groupColor(p.team) }} title={p.members}>
        {p.label}
      </span>
    ) : (
      <strong>{p.label}</strong>
    );
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {children}
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Field label="Terrains" hint={`${plural(perRotation, 'match')} à la fois`}>
          <NumberInput value={courts} min={1} max={20} onChange={(v) => setCourts(Math.max(1, v ?? 1))} />
        </Field>
        <Field label="Rotations" hint={full ? `Tout le monde se rencontre en ${plural(full, 'rotation')}` : ''}>
          <select className="input" value={limit ?? ''} onChange={(e) => setLimit(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Toutes ({full})</option>
            {Array.from({ length: Math.max(0, full - 1) }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={referees} onChange={(e) => setReferees(e.target.checked)} />
        <span>
          <strong>Arbitres</strong> <span className="muted small">: pris parmi ceux qui ne jouent pas à la rotation</span>
        </span>
      </label>
      <div>
        <Button variant="primary" icon={<Shuffle size={17} />} onClick={run} disabled={n < 2}>
          {saved ? 'Refaire le tirage' : 'Créer le roulement'}
        </Button>
      </div>
      {n < 2 && <p className="error-text small">Il faut au moins 2 participants.</p>}
      {saved && (
        <div className="tourney">
          <p className="muted small">
            {plural(saved.participants.length, 'participant')}, {plural(saved.rotations.length, 'rotation')} : jamais deux fois le même match.
          </p>
          {saved.rotations.map((r, i) => (
            <div key={i} className="card tourney-rot">
              <strong>Rotation {i + 1}</strong>
              <ul>
                {r.matches.map((m) => (
                  <li key={m.court}>
                    <span className="muted small">Terrain {m.court} :</span> {name(m.a)} <span className="muted">contre</span> {name(m.b)}
                    {m.referee && (
                      <span className="muted small">
                        {' '}
                        · arbitre : {byId.get(m.referee)?.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {r.resting.length > 0 && (
                <p className="muted small">
                  Au repos : {r.resting.map((id) => byId.get(id)?.label).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
