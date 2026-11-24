import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Play, Shuffle, Swords, Trash2, Trophy, Undo2 } from 'lucide-react';
import type { ID, Klass, Lesson } from '../types';
import { useStudents, useVault } from '../store/vault';
import { useData } from '../store/data';
import { confirmDialog, toastUndo } from '../store/ui';
import { byGroup } from '../lib/grouping';
import {
  challengeOrder,
  firstRoundLosers,
  knockoutRounds,
  knockoutSlots,
  ladderNext,
  ladderStart,
  meleeRound,
  meleeStandings,
  poolMatches,
  poolQualifiers,
  poolStandings,
  poolsStart,
  rotationsForAll,
  schedule,
  swissPairing,
  swissStandings,
  type Challenge,
  type KoMatch,
  type MeleeRound,
  type Rotation,
  type ScoredMatch,
  type SwissResult,
  type SwissRound,
} from '../lib/tournament';
import type { SavedTournament } from '../lib/privateData';
import { cls, plural, uid } from '../lib/util';
import { Button, Field, Modal, NumberInput, Tabs } from './ui';
import { VaultGate } from './VaultGate';
import { groupColor } from './GroupsTools';

// « Tournoi » : sept formules (roulement, rondes suisses, montante-descendante, poules, élimination directe, défis,
// double à la mêlée), en équipes ou en individuel. Tout se calcule sur l'appareil. Chaque tournoi est enregistré dans
// le coffre chiffré (`PrivateDoc.tournaments`) à chaque résultat : on le reprend plus tard, sur ce téléphone ou un autre.
// Formules tirées de « Formes de tournois », Office fédéral du sport suisse (OFSPO, Macolin, 2001, réimpr. 2014).

/** Activités où l'on s'affronte plutôt seul (ou en double) : le tournoi s'ouvre en « individuels ». */
const INDIVIDUAL_ACTIVITIES = new Set(['badminton', 'tt', 'tennis', 'judo', 'boxe']);

interface Participant {
  id: string;
  label: string;
  /** Couleur de l'équipe (numéro de groupe), absente en individuel. */
  team?: number;
  members?: string;
}

type Formula = 'rr' | 'swiss' | 'ladder' | 'pools' | 'ko' | 'challenge' | 'melee';
const FORMULAS: Array<{ id: Formula; label: string; hint: string; soloOnly?: boolean; min?: number }> = [
  { id: 'rr', label: 'Roulement sans revanche', hint: 'Tout le roulement est tiré d’un coup : chacun rencontre des adversaires différents. Résultats et classement au fil des matchs.' },
  { id: 'swiss', label: 'Rondes suisses', hint: 'Après chaque ronde, vous donnez les résultats : la ronde suivante oppose ceux qui ont le même nombre de points.' },
  { id: 'ladder', label: 'Montante-descendante', hint: 'Répartition sur les terrains ; à chaque tour, le gagnant monte d’un terrain et le perdant descend.' },
  { id: 'pools', label: 'Poules puis phase finale', hint: 'Poules où chacun rencontre chacun, puis tableau final pour les premiers de chaque poule et tableau de consolation pour les autres.', min: 3 },
  { id: 'ko', label: 'Élimination directe et consolante', hint: 'Tableau à élimination ; ceux qui perdent leur premier match jouent un tableau de consolation : tout le monde joue au moins deux fois.', min: 3 },
  { id: 'challenge', label: 'Défis (échelle)', hint: 'Classement de départ tiré au hasard ; on défie un joueur placé un peu au-dessus et, si on gagne, on prend sa place.' },
  { id: 'melee', label: 'Double à la mêlée', hint: 'À chaque tour, de nouveaux doubles sont tirés (jamais deux fois le même partenaire si possible) ; les points comptent pour chaque joueur.', soloOnly: true, min: 4 },
];
const formulaOf = (id: string) => FORMULAS.find((f) => f.id === id) ?? FORMULAS[0];

/** Choix gardés le temps de la session (formule, tournoi ouvert) par séance ou par classe. */
const KEPT = new Map<string, unknown>();
function useKept<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (KEPT.has(key) ? (KEPT.get(key) as T) : initial));
  return [
    value,
    (v: T) => {
      KEPT.set(key, v);
      setValue(v);
    },
  ];
}

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
  return (
    <Modal title="Tournoi" onClose={onClose} wide>
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
      <VaultGate>
        <Tournaments key={classId} classId={classId} lesson={lesson} activityId={activityId} />
      </VaultGate>
    </Modal>
  );
}

/** Tournoi ouvert, ou préparation d'un nouveau tournoi et liste des tournois enregistrés de la classe. */
function Tournaments({ classId, lesson, activityId }: { classId: ID; lesson?: Lesson; activityId?: ID | null }) {
  const scope = lesson?.id ?? classId;
  const [activeId, setActiveId] = useKept<string | null>(`${scope}:ouvert`, null);
  const active = useVault((s) => (activeId ? s.doc.tournaments[activeId] : undefined));
  if (activeId && active && !active.deleted && active.state) return <ActiveTournament id={activeId} tournament={active} onClose={() => setActiveId(null)} />;
  return <NewTournament classId={classId} lesson={lesson} activityId={activityId} scope={scope} onOpen={setActiveId} />;
}

function NewTournament({ classId, lesson, activityId, scope, onOpen }: { classId: ID; lesson?: Lesson; activityId?: ID | null; scope: string; onOpen: (id: string) => void }) {
  const [kind, setKind] = useKept<'teams' | 'solo'>(`${scope}:sorte`, activityId && INDIVIDUAL_ACTIVITIES.has(activityId) ? 'solo' : 'teams');
  const start = (formula: Formula, state: TState) => {
    const id = uid();
    useVault.getState().saveTournament(id, {
      classId,
      lessonId: lesson?.id ?? null,
      name: `${formulaOf(formula).label} du ${new Date().toLocaleDateString('fr-FR')}`,
      formula,
      state,
    });
    onOpen(id);
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      <SavedList classId={classId} onOpen={onOpen} />
      <Tabs<'teams' | 'solo'>
        value={kind}
        onChange={setKind}
        tabs={[
          { id: 'teams', label: 'Équipes' },
          { id: 'solo', label: 'Individuels' },
        ]}
      />
      {kind === 'teams' ? (
        <TeamsSetup key={`t-${scope}`} lesson={lesson} scope={scope} onStart={start} />
      ) : (
        <SoloSetup key={`s-${scope}`} classId={classId} scope={scope} onStart={start} />
      )}
    </div>
  );
}

/** Tournois enregistrés de la classe, à reprendre. */
function SavedList({ classId, onOpen }: { classId: ID; onOpen: (id: string) => void }) {
  const all = useVault((s) => s.doc.tournaments);
  const lessons = useData((s) => s.data.lessons);
  const list = Object.entries(all)
    .filter(([, x]) => x.classId === classId && !x.deleted && x.state)
    .sort(([, a], [, b]) => b.t - a.t);
  if (!list.length) return null;
  const remove = async (id: string, x: SavedTournament) => {
    if (!(await confirmDialog({ title: `Supprimer « ${x.name} » ?`, message: 'Ses rondes et ses résultats sont effacés.', confirmLabel: 'Supprimer' }))) return;
    useVault.getState().saveTournament(id, { ...x, name: '', state: null, deleted: true });
    toastUndo('Tournoi supprimé', () => useVault.getState().saveTournament(id, { ...x, deleted: false }));
  };
  return (
    <details className="card tourney-rot" open>
      <summary>
        <strong>Reprendre un tournoi enregistré ({list.length})</strong>
      </summary>
      <ul className="reuse-list" style={{ marginTop: 8 }}>
        {list.map(([id, x]) => {
          const l = x.lessonId ? lessons[x.lessonId] : undefined;
          return (
            <li key={id} className="row" style={{ gap: 6 }}>
              <button type="button" className="grow" onClick={() => onOpen(id)}>
                <strong>{x.name}</strong>
                <span className="muted small">
                  {' '}
                  · {progressOf(x)}
                  {l ? ` · ${l.title || 'séance'}` : ''} · modifié le {new Date(x.t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
              <button type="button" className="icon-btn" aria-label={`Supprimer ${x.name}`} title="Supprimer" onClick={() => remove(id, x)}>
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Où en est un tournoi, en quelques mots. */
function progressOf(x: SavedTournament): string {
  const s = x.state as TState;
  const n = s.participants?.length ?? 0;
  const who = plural(n, 'participant');
  switch (x.formula as Formula) {
    case 'swiss':
      return `${who}, ronde ${(s as SwissState).rounds.length}`;
    case 'ladder':
      return `${who}, tour ${(s as LadderState).turn}`;
    case 'melee':
      return `${who}, tour ${(s as MeleeState).rounds.length}`;
    case 'challenge':
      return `${who}, ${plural((s as ChallengeState).log.length, 'défi')}`;
    case 'pools':
      return `${who}, ${(s as PoolsState).finals ? 'phase finale' : 'poules'}`;
    default:
      return who;
  }
}

/** Équipes : les groupes de la séance s'il y en a, sinon un nombre d'équipes numérotées. */
function TeamsSetup({ lesson, scope, onStart }: { lesson?: Lesson; scope: string; onStart: Starter }) {
  const grouping = useVault((s) => (lesson ? s.doc.groups[lesson.id] : undefined));
  const students = useStudents(lesson?.classId);
  const hasGroups = !!grouping?.count;
  const [useGroups, setUseGroups] = useState(hasGroups);
  const [count, setCount] = useState<number | null>(grouping?.count && grouping.count > 1 ? grouping.count : 6);
  const participants: Participant[] = useMemo(() => {
    if (useGroups && hasGroups && grouping) {
      return byGroup(students, grouping.assign, grouping.count)
        .filter((g) => g.group)
        .map((g) => ({ id: `g${g.group}`, label: `Équipe ${g.group}`, team: g.group!, members: g.students.map((s) => s.name || 'Élève sans nom').join(', ') }));
    }
    return Array.from({ length: Math.max(0, Math.min(40, count ?? 0)) }, (_, i) => ({ id: `g${i + 1}`, label: `Équipe ${i + 1}`, team: i + 1 }));
  }, [useGroups, hasGroups, grouping, students, count]);

  return (
    <Setup scope={scope} participants={participants} kind="teams" onStart={onStart}>
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
          <NumberInput value={count} min={2} max={40} onChange={setCount} />
        </Field>
      )}
    </Setup>
  );
}

/** Individuels : les élèves présents de la classe. */
function SoloSetup({ classId, scope, onStart }: { classId: ID; scope: string; onStart: Starter }) {
  const students = useStudents(classId);
  const [absent, setAbsent] = useState<Set<ID>>(new Set());
  const [showAbsent, setShowAbsent] = useState(false);
  const participants: Participant[] = useMemo(() => students.filter((s) => !absent.has(s.id)).map((s) => ({ id: s.id, label: s.name || 'Élève sans nom' })), [students, absent]);
  if (!students.length) return <p className="muted">Pas encore d'élèves dans cette classe : ajoutez-les depuis la page de la classe.</p>;
  return (
    <Setup scope={scope} participants={participants} kind="solo" onStart={onStart}>
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
    </Setup>
  );
}

// ————— États enregistrés de chaque formule —————

interface Base {
  participants: Participant[];
  courts: number;
}
type RRState = Base & { rotations: Rotation[]; results: Record<string, SwissResult> };
type SwissState = Base & { order: string[]; rounds: SwissRound[] };
type LadderState = Base & { tables: string[][]; marks: Array<{ w?: string; l?: string }>; turn: number; history: string[][][] };
type Bracket = { slots: Array<string | null>; wins: Record<string, string> };
type PoolsState = Base & { pools: string[][]; matches: ScoredMatch[][]; qualify: number; finals?: { main: Bracket; consol?: Bracket } };
type KoState = Base & { main: Bracket; consol?: Bracket };
type ChallengeState = Base & { start: string[]; log: Challenge[]; reach: number };
type MeleeState = Base & { rounds: MeleeRound[] };
type TState = RRState | SwissState | LadderState | PoolsState | KoState | ChallengeState | MeleeState;
type Starter = (formula: Formula, state: TState) => void;

/** Réglages communs (formule, terrains) et options de départ de la formule choisie. */
function Setup({ scope, participants, kind, onStart, children }: { scope: string; participants: Participant[]; kind: 'teams' | 'solo'; onStart: Starter; children: ReactNode }) {
  const choices = FORMULAS.filter((f) => !f.soloOnly || kind === 'solo');
  const [formula0, setFormula] = useKept<Formula>(`${scope}:formule`, 'rr');
  const formula = choices.some((f) => f.id === formula0) ? formula0 : 'rr';
  const [courtsIn, setCourts] = useState<number | null>(() => Math.max(1, Math.min(4, Math.floor(participants.length / 2))));
  const courts = courtsIn ?? 0;
  const n = participants.length;
  const f = formulaOf(formula);
  const perMatch = formula === 'melee' ? 4 : 2;
  const used = Math.min(courts, Math.floor(n / perMatch));
  const base: Base = { participants, courts };
  const go = (state: object) => onStart(formula, { ...base, ...state } as TState);
  return (
    <div className="stack" style={{ gap: 12 }}>
      {children}
      <Field label="Formule" hint={f.hint}>
        <select className="input" value={formula} onChange={(e) => setFormula(e.target.value as Formula)}>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={formula === 'ladder' ? 'Terrains (ou tables)' : 'Terrains'} hint={courts < 1 ? '' : n >= perMatch ? (formula === 'ladder' && used < courts ? `${plural(used, 'terrain')} utilisés : 2 joueurs au moins par terrain` : `${plural(used, 'match')} à la fois`) : ''}>
        <NumberInput value={courtsIn} min={1} max={30} onChange={setCourts} />
      </Field>
      {courts < 1 ? (
        <p className="error-text small">Indiquez le nombre de terrains pour continuer.</p>
      ) : n < (f.min ?? 2) ? (
        <p className="error-text small">Il faut au moins {f.min ?? 2} participants pour cette formule.</p>
      ) : formula === 'rr' ? (
        <RRSetup participants={participants} courts={courts} go={go} />
      ) : formula === 'swiss' ? (
        <>
          <p className="muted small">Victoire 1 point, match nul ½ point, exempt (nombre impair) 1 point. Pour désigner un vainqueur, environ {plural(Math.ceil(Math.log2(n)), 'ronde')} suffisent.</p>
          <StartButton
            label="Tirer la ronde 1"
            onClick={() => {
              const order = shuffleIds(participants.map((p) => p.id));
              go({ order, rounds: [swissPairing(order, [])] });
            }}
          />
        </>
      ) : formula === 'ladder' ? (
        <>
          <LadderRules three={n > 2 * used} open />
          <StartButton label="Répartir sur les terrains" onClick={() => go({ tables: ladderStart(participants.map((p) => p.id), courts), marks: [], turn: 1, history: [] })} />
        </>
      ) : formula === 'pools' ? (
        <PoolsSetup participants={participants} go={go} />
      ) : formula === 'ko' ? (
        <>
          <p className="muted small">Tirage au sort du tableau. S’il manque des joueurs pour remplir le tableau, certains sont qualifiés d’office pour le 2e tour.</p>
          <StartButton label="Tirer le tableau" onClick={() => go({ main: { slots: knockoutSlots(shuffleIds(participants.map((p) => p.id))), wins: {} } })} />
        </>
      ) : formula === 'challenge' ? (
        <ChallengeSetup participants={participants} go={go} />
      ) : (
        <>
          <p className="muted small">Victoire 2 points pour chacun des deux joueurs du double, nul 1 point, défaite 0. {n % 4 ? 'Ceux qui ne jouent pas à un tour sont au repos, chacun son tour.' : ''}</p>
          <StartButton label="Tirer les doubles du tour 1" onClick={() => go({ rounds: [meleeRound(participants.map((p) => p.id), [], courts)] })} />
        </>
      )}
    </div>
  );
}

function StartButton({ label, onClick, missing }: { label: string; onClick: () => void; missing?: string }) {
  return (
    <div>
      <Button variant="primary" icon={<Play size={17} />} onClick={onClick} disabled={!!missing}>
        {label}
      </Button>
      {missing && <p className="error-text small">{missing}</p>}
    </div>
  );
}

function RRSetup({ participants, courts, go }: { participants: Participant[]; courts: number; go: (s: Partial<RRState>) => void }) {
  const [limit, setLimit] = useState<number | null>(null);
  const [referees, setReferees] = useState(true);
  const full = useMemo(() => rotationsForAll(participants.length, courts), [participants.length, courts]);
  return (
    <>
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
      <label className="check">
        <input type="checkbox" checked={referees} onChange={(e) => setReferees(e.target.checked)} />
        <span>
          <strong>Arbitres</strong> <span className="muted small">: pris parmi ceux qui ne jouent pas à la rotation</span>
        </span>
      </label>
      <StartButton label="Créer le roulement" onClick={() => go({ rotations: schedule(participants.map((p) => p.id), { courts, rotations: limit ?? undefined, referees }), results: {} })} />
    </>
  );
}

function PoolsSetup({ participants, go }: { participants: Participant[]; go: (s: Partial<PoolsState>) => void }) {
  const n = participants.length;
  const [pools, setPools] = useState<number | null>(() => Math.max(1, Math.round(n / 4)));
  const [qualify, setQualify] = useState<number | null>(2);
  const k = Math.max(1, Math.min(pools ?? 1, Math.floor(n / 2)));
  const small = Math.floor(n / k);
  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Field label="Poules" hint={pools ? `${plural(k, 'poule')} de ${small}${n % k ? ` ou ${small + 1}` : ''}` : ''}>
          <NumberInput value={pools} min={1} max={Math.max(1, Math.floor(n / 2))} onChange={setPools} />
        </Field>
        <Field label="Qualifiés par poule" hint="Pour le tableau final ; les autres jouent la consolante">
          <NumberInput value={qualify} min={1} max={Math.max(1, small)} onChange={setQualify} />
        </Field>
      </div>
      <p className="muted small">Victoire 2 points, nul 1, défaite 0. À égalité de points, la confrontation directe départage.</p>
      <StartButton
        label="Tirer les poules"
        missing={!pools ? 'Indiquez le nombre de poules.' : !qualify ? 'Indiquez le nombre de qualifiés par poule.' : undefined}
        onClick={() => {
          const p = poolsStart(
            participants.map((x) => x.id),
            k,
          );
          go({ pools: p, matches: p.map(poolMatches), qualify: Math.max(1, Math.min(qualify ?? 1, small)) });
        }}
      />
    </>
  );
}

function ChallengeSetup({ participants, go }: { participants: Participant[]; go: (s: Partial<ChallengeState>) => void }) {
  const [reach, setReach] = useState<number | null>(2);
  return (
    <>
      <Field label="On peut défier jusqu’à" hint="places au-dessus de soi">
        <NumberInput value={reach} min={1} max={10} onChange={setReach} />
      </Field>
      {reach ? <ChallengeRules reach={reach} /> : null}
      <StartButton label="Tirer le classement de départ" missing={reach ? undefined : 'Indiquez jusqu’à combien de places on peut défier.'} onClick={() => go({ start: shuffleIds(participants.map((p) => p.id)), log: [], reach: Math.max(1, reach ?? 1) })} />
    </>
  );
}

// ————— Tournoi ouvert —————

/** Affichage d'un participant : équipe en couleur, élève en gras. */
function useNames(participants: Participant[]) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const label = (id: string) => byId.get(id)?.label ?? '?';
  const node = (id: string) => {
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
  return { label, node };
}
type Names = ReturnType<typeof useNames>;
type Update<S> = (fn: (s: S) => S) => void;

function ActiveTournament({ id, tournament, onClose }: { id: string; tournament: SavedTournament; onClose: () => void }) {
  const state = tournament.state as TState;
  const names = useNames(state.participants ?? []);
  const [name, setName] = useState(tournament.name);
  const update = (fn: (s: TState) => TState) => {
    const cur = useVault.getState().doc.tournaments[id];
    if (!cur || !cur.state) return;
    useVault.getState().saveTournament(id, { ...cur, state: fn(cur.state as TState) });
  };
  const rename = () => {
    const cur = useVault.getState().doc.tournaments[id];
    if (cur && name.trim() && name.trim() !== cur.name) useVault.getState().saveTournament(id, { ...cur, name: name.trim() });
  };
  const f = formulaOf(tournament.formula);
  const props = { state, names, update } as const;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Nom du tournoi" hint={`${f.label} · ${plural(state.participants.length, 'participant')} · enregistré dans le coffre à chaque résultat`}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
        </Field>
        <Button variant="ghost" icon={<Undo2 size={16} />} onClick={onClose}>
          Autres tournois
        </Button>
      </div>
      {tournament.formula === 'swiss' ? (
        <SwissView {...(props as unknown as ViewProps<SwissState>)} />
      ) : tournament.formula === 'ladder' ? (
        <LadderView {...(props as unknown as ViewProps<LadderState>)} />
      ) : tournament.formula === 'pools' ? (
        <PoolsView {...(props as unknown as ViewProps<PoolsState>)} />
      ) : tournament.formula === 'ko' ? (
        <KoView {...(props as unknown as ViewProps<KoState>)} />
      ) : tournament.formula === 'challenge' ? (
        <ChallengeView {...(props as unknown as ViewProps<ChallengeState>)} />
      ) : tournament.formula === 'melee' ? (
        <MeleeView {...(props as unknown as ViewProps<MeleeState>)} />
      ) : (
        <RRView {...(props as unknown as ViewProps<RRState>)} />
      )}
    </div>
  );
}
type ViewProps<S> = { state: S; names: Names; update: Update<S> };

/** Un match : touchez le gagnant (ou « Nul »). Toucher à nouveau annule. */
function Duel({ a, b, result, onPick, draw = true }: { a: ReactNode; b: ReactNode; result?: SwissResult; onPick: (r: SwissResult) => void; draw?: boolean }) {
  return (
    <span className="tourney-duel">
      <button type="button" className="tourney-pick" aria-pressed={result === 'a'} onClick={() => onPick('a')}>
        {a}
      </button>
      <span className="muted small">contre</span>
      <button type="button" className="tourney-pick" aria-pressed={result === 'b'} onClick={() => onPick('b')}>
        {b}
      </button>
      {draw && (
        <button type="button" className="tourney-pick tourney-draw" aria-pressed={result === 'draw'} onClick={() => onPick('draw')}>
          Nul
        </button>
      )}
    </span>
  );
}
const toggle = (cur: SwissResult | undefined, r: SwissResult) => (cur === r ? undefined : r);
const pts = (p: number) => String(p).replace('.', ',');

function Standings({ rows, node, title = 'Classement', note }: { rows: Array<{ id: string; points: number; wins: number; draws: number; losses: number }>; node: Names['node']; title?: string; note?: string }) {
  return (
    <div>
      <strong>{title}</strong>
      <div className="tourney-scroll">
        <table className="tourney-table">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Nom</th>
              <th>Pts</th>
              <th title="Victoires">V</th>
              <th title="Nuls">N</th>
              <th title="Défaites">D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td>{i + 1}</td>
                <td>{node(s.id)}</td>
                <td>
                  <strong>{pts(s.points)}</strong>
                </td>
                <td>{s.wins}</td>
                <td>{s.draws}</td>
                <td>{s.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}

function RRView({ state, names, update }: ViewProps<RRState>) {
  const { label, node } = names;
  const matches: ScoredMatch[] = state.rotations.flatMap((r, i) => r.matches.map((m, j) => ({ a: m.a, b: m.b, result: state.results[`${i}-${j}`] })));
  const done = matches.filter((m) => m.result).length;
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>
        {plural(state.rotations.length, 'rotation')}, jamais deux fois le même match. Touchez le gagnant de chaque match (ou « Nul ») : {done} / {matches.length} résultats.
      </p>
      <div className="tourney">
        {state.rotations.map((r, i) => (
          <div key={i} className="card tourney-rot">
            <strong>Rotation {i + 1}</strong>
            <ul className="tourney-matches">
              {r.matches.map((m, j) => (
                <li key={m.court}>
                  <span className="muted small">
                    Terrain {m.court}
                    {m.referee ? ` · arbitre : ${label(m.referee)}` : ''}
                  </span>
                  <Duel a={node(m.a)} b={node(m.b)} result={state.results[`${i}-${j}`]} onPick={(res) => update((s) => ({ ...s, results: { ...s.results, [`${i}-${j}`]: toggle(s.results[`${i}-${j}`], res) as SwissResult } }))} />
                </li>
              ))}
            </ul>
            {r.resting.length > 0 && <p className="muted small">Au repos : {r.resting.map(label).join(', ')}</p>}
          </div>
        ))}
      </div>
      <Standings
        rows={poolStandings(
          state.participants.map((p) => p.id),
          matches,
        )}
        node={node}
        note="Victoire 2 points, nul 1, défaite 0 ; à égalité, la confrontation directe départage."
      />
    </>
  );
}

function SwissView({ state, names, update }: ViewProps<SwissState>) {
  const { label, node } = names;
  const { order, rounds, courts } = state;
  const setResult = (ri: number, mi: number, res: SwissResult) =>
    update((s) => ({ ...s, rounds: s.rounds.map((r, i) => (i !== ri ? r : { ...r, matches: r.matches.map((m, j) => (j !== mi ? m : { ...m, result: toggle(m.result, res) })) })) }));
  const last = rounds[rounds.length - 1];
  const missing = last.matches.filter((m) => !m.result).length;
  const next = () => update((s) => ({ ...s, rounds: [...s.rounds, swissPairing(s.order, s.rounds)] }));
  const undo = async () => {
    if (!(await confirmDialog({ title: `Annuler la ronde ${rounds.length} ?`, message: 'Ses matchs et ses résultats sont retirés ; la ronde d’avant redevient modifiable.', confirmLabel: 'Annuler la ronde' }))) return;
    update((s) => ({ ...s, rounds: s.rounds.slice(0, -1) }));
  };
  const passages = last.matches.length > courts;
  const roundView = (r: SwissRound, ri: number) => (
    <ul className="tourney-matches">
      {r.matches.map((m, j) => (
        <li key={j}>
          <span className="muted small">
            Terrain {(j % courts) + 1}
            {passages ? ` (passage ${Math.floor(j / courts) + 1})` : ''}
          </span>
          <Duel a={node(m.a)} b={node(m.b)} result={m.result} onPick={(res) => setResult(ri, j, res)} />
        </li>
      ))}
      {r.bye && <li className="muted small">Exempt (gagne d’office) : {label(r.bye)}</li>}
    </ul>
  );
  return (
    <>
      <div className="card tourney-rot">
        <strong>Ronde {rounds.length}</strong>
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          Touchez le gagnant de chaque match (ou « Nul »).
        </p>
        {last.rematches ? (
          <p className="small error-text">
            Plus assez d’adversaires nouveaux : {plural(last.rematches, 'match')} déjà joué{last.rematches > 1 ? 's' : ''} revient dans cette ronde.
          </p>
        ) : null}
        {roundView(last, rounds.length - 1)}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" icon={<ChevronRight size={17} />} onClick={next} disabled={missing > 0}>
            Ronde {rounds.length + 1}
          </Button>
          {rounds.length > 1 && (
            <Button variant="ghost" icon={<Undo2 size={16} />} onClick={undo}>
              Annuler cette ronde
            </Button>
          )}
        </div>
        {missing > 0 && <p className="muted small">Encore {plural(missing, 'résultat')} à donner.</p>}
      </div>
      <Standings
        rows={swissStandings(order, rounds).map((s) => ({ ...s, wins: s.wins + s.byes }))}
        node={node}
        note="Victoire 1 point, nul ½, exempt 1. À égalité de points, celui qui a rencontré les adversaires les plus forts passe devant."
      />
      {rounds.length > 1 && (
        <details>
          <summary className="small">Rondes précédentes (résultats modifiables)</summary>
          {rounds.slice(0, -1).map((r, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <strong className="small">Ronde {i + 1}</strong>
              {roundView(r, i)}
            </div>
          ))}
        </details>
      )}
    </>
  );
}

function LadderRules({ three, open }: { three: boolean; open?: boolean }) {
  return (
    <details className="card tourney-rot" open={open}>
      <summary>
        <strong>Fonctionnement de la montante-descendante</strong>
      </summary>
      <ul className="small tourney-rules">
        <li>Le terrain 1 est le terrain du haut, le dernier celui du bas. Chacun commence sur le terrain où il est placé.</li>
        <li>Tous les matchs se jouent en même temps, en temps limité (3 à 5 minutes) ou en points (par exemple 7 points). Au signal, on s’arrête.</li>
        <li>
          Le <strong>gagnant monte</strong> d’un terrain (vers le terrain 1), le <strong>perdant descend</strong> d’un terrain. Le gagnant du terrain 1 reste en haut, le perdant du dernier terrain reste en bas.
        </li>
        {three && <li>À trois ou plus sur un terrain : deux jouent, l’autre arbitre et prend la place du perdant à chaque point (ou échange). Au signal, le meilleur monte, le moins bon descend, les autres restent.</li>}
        <li>Égalité au signal : un point décisif.</li>
        <li>But : atteindre le terrain 1 et y rester. Au fil des tours, chacun joue contre des adversaires de son niveau.</li>
      </ul>
    </details>
  );
}

function LadderView({ state, names, update }: ViewProps<LadderState>) {
  const { label, node } = names;
  const { tables, marks, turn } = state;
  const tap = (i: number, id: string) =>
    update((cur) => {
      const size = cur.tables[i].length;
      const m = cur.marks[i] ?? {};
      let nm: { w?: string; l?: string };
      if (size === 2) nm = m.w === id ? {} : { w: id };
      // À trois ou plus : 1re touche = gagnant, 2e touche (un autre joueur) = perdant ; toucher à nouveau annule.
      else if (m.w === id) nm = { ...m, w: undefined };
      else if (m.l === id) nm = { ...m, l: undefined };
      else if (!m.w) nm = { ...m, w: id };
      else nm = { ...m, l: id };
      const next = [...cur.marks];
      next[i] = nm;
      return { ...cur, marks: next };
    });
  const done = (i: number) => !!marks[i]?.w && (tables[i].length === 2 || !!marks[i]?.l);
  const missing = tables.filter((_, i) => !done(i)).length;
  const next = () =>
    update((cur) => ({
      ...cur,
      tables: ladderNext(
        cur.tables,
        cur.tables.map((_, i) => cur.marks[i]?.w),
        cur.tables.map((_, i) => cur.marks[i]?.l),
      ),
      marks: [],
      turn: cur.turn + 1,
      history: [...cur.history, cur.tables],
    }));
  const back = () => update((cur) => (cur.history.length ? { ...cur, tables: cur.history[cur.history.length - 1], history: cur.history.slice(0, -1), marks: [], turn: cur.turn - 1 } : cur));
  const anyThree = tables.some((t) => t.length > 2);
  return (
    <>
      <LadderRules three={anyThree} />
      <p className="muted small" style={{ margin: 0 }}>
        <strong>Tour {turn}</strong> · touchez le gagnant de chaque terrain{anyThree ? ', puis, à trois ou plus, le perdant' : ''} (touchez à nouveau pour annuler). Le tour suivant place chacun sur son nouveau terrain.
      </p>
      <div className="tourney">
        {tables.map((t, i) => (
          <div key={i} className={cls('card tourney-rot', done(i) && 'tourney-done')}>
            <strong>
              Terrain {i + 1}
              {i === 0 ? ' (en haut)' : i === tables.length - 1 ? ' (en bas)' : ''}
            </strong>
            <div className="tourney-players">
              {t.map((pid) => {
                const isW = marks[i]?.w === pid;
                const isL = marks[i]?.l === pid || (t.length === 2 && !!marks[i]?.w && !isW);
                return (
                  <button key={pid} type="button" className={cls('tourney-pick', isW && 'is-win', isL && 'is-lose')} aria-pressed={isW} onClick={() => tap(i, pid)} title={label(pid)}>
                    {isW ? <ArrowUp size={14} /> : isL ? <ArrowDown size={14} /> : null}
                    {node(pid)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button variant="primary" icon={<ChevronRight size={17} />} onClick={next} disabled={missing > 0}>
          Tour {turn + 1}
        </Button>
        {state.history.length > 0 && (
          <Button variant="ghost" icon={<Undo2 size={16} />} onClick={back}>
            Revenir au tour {turn - 1}
          </Button>
        )}
      </div>
      {missing > 0 && <p className="muted small">Encore {plural(missing, 'terrain')} sans résultat.</p>}
    </>
  );
}

const ROUND_NAMES = ['Finale', 'Demi-finales', 'Quarts de finale', 'Huitièmes de finale', 'Seizièmes de finale'];

/** Tableau à élimination : tours du premier à la finale, vainqueur de chaque match à toucher. */
function BracketView({ title, bracket, names, onWin }: { title: string; bracket: Bracket; names: Names; onWin: (key: string, w: string | undefined) => void }) {
  const { node } = names;
  const rounds = knockoutRounds(bracket.slots, bracket.wins);
  const champion = rounds[rounds.length - 1][0].w;
  const finalMatch = rounds[rounds.length - 1][0];
  const runnerUp = champion && finalMatch.a && finalMatch.b ? (champion === finalMatch.a ? finalMatch.b : finalMatch.a) : null;
  const byes = rounds[0].filter((m) => (m.a === null) !== (m.b === null)).map((m) => (m.a ?? m.b) as string);
  const pick = (m: KoMatch, side: 'a' | 'b') => {
    const id = m[side] as string;
    onWin(m.key, m.w === id ? undefined : id);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <strong>{title}</strong>
      {champion && (
        <p className="tourney-champion">
          <Trophy size={16} /> Vainqueur : {node(champion)}
          {runnerUp ? <span className="muted small"> · finaliste : {names.label(runnerUp)}</span> : null}
        </p>
      )}
      <div className="tourney">
        {rounds.map((ms, r) => {
          const shown = ms.filter((m) => m.a && m.b !== null && !(m.a === null || m.b === null));
          const pending = ms.filter((m) => m.a !== null && m.b !== null && (!m.a || !m.b));
          if (!shown.length && !pending.length) return null;
          const fromEnd = rounds.length - 1 - r;
          return (
            <div key={r} className="card tourney-rot">
              <strong>{ROUND_NAMES[fromEnd] ?? `Tour ${r + 1}`}</strong>
              <ul className="tourney-matches">
                {ms.map((m) =>
                  m.a && m.b ? (
                    <li key={m.key}>
                      <span className="tourney-duel">
                        <button type="button" className="tourney-pick" aria-pressed={m.w === m.a} onClick={() => pick(m, 'a')}>
                          {node(m.a)}
                        </button>
                        <span className="muted small">contre</span>
                        <button type="button" className="tourney-pick" aria-pressed={m.w === m.b} onClick={() => pick(m, 'b')}>
                          {node(m.b)}
                        </button>
                      </span>
                    </li>
                  ) : m.a !== null && m.b !== null ? (
                    <li key={m.key} className="muted small">
                      {m.a ? node(m.a) : 'à venir'} contre {m.b ? node(m.b) : 'à venir'}
                    </li>
                  ) : null,
                )}
              </ul>
              {r === 0 && byes.length > 0 && <p className="muted small">Qualifiés d’office pour le tour suivant : {byes.map(names.label).join(', ')}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Tous les premiers matchs sont joués : on peut lancer la consolante avec leurs perdants. */
function consolReady(b: Bracket) {
  const rounds = knockoutRounds(b.slots, b.wins);
  const real = (ms: KoMatch[]) => ms.filter((m) => m.a !== null && m.b !== null);
  const hasByes = rounds[0].some((m) => (m.a === null) !== (m.b === null));
  return real(rounds[0]).every((m) => m.w) && (!hasByes || rounds.length < 2 || real(rounds[1]).every((m) => m.w));
}

function ConsolPart({ main, consol, names, onStart, onWin }: { main: Bracket; consol?: Bracket; names: Names; onStart: (b: Bracket) => void; onWin: (key: string, w: string | undefined) => void }) {
  if (consol) return <BracketView title="Tableau de consolation" bracket={consol} names={names} onWin={onWin} />;
  const losers = firstRoundLosers(knockoutRounds(main.slots, main.wins));
  if (losers.length < 2) return null;
  const ready = consolReady(main);
  return (
    <div>
      <Button icon={<Swords size={16} />} onClick={() => onStart({ slots: knockoutSlots(shuffleIds(losers)), wins: {} })} disabled={!ready}>
        Lancer la consolante ({plural(losers.length, 'joueur')})
      </Button>
      {!ready && <p className="muted small">Elle se lance quand tous les premiers matchs sont joués.</p>}
    </div>
  );
}

function KoView({ state, names, update }: ViewProps<KoState>) {
  const win = (part: 'main' | 'consol') => (key: string, w: string | undefined) =>
    update((s) => {
      const b = s[part];
      if (!b) return s;
      const wins = { ...b.wins };
      if (w) wins[key] = w;
      else delete wins[key];
      return { ...s, [part]: { ...b, wins } };
    });
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>
        Touchez le vainqueur de chaque match. Changer un résultat efface la suite qui en dépendait.
      </p>
      <BracketView title="Tableau principal" bracket={state.main} names={names} onWin={win('main')} />
      <ConsolPart main={state.main} consol={state.consol} names={names} onStart={(consol) => update((s) => ({ ...s, consol }))} onWin={win('consol')} />
    </>
  );
}

function PoolsView({ state, names, update }: ViewProps<PoolsState>) {
  const { node } = names;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const tables = state.pools.map((p, i) => poolStandings(p, state.matches[i]));
  const missing = state.matches.reduce((t, ms) => t + ms.filter((m) => !m.result).length, 0);
  const setResult = (pi: number, mi: number, res: SwissResult) =>
    update((s) => ({ ...s, matches: s.matches.map((ms, i) => (i !== pi ? ms : ms.map((m, j) => (j !== mi ? m : { ...m, result: toggle(m.result, res) })))) }));
  const toFinals = () =>
    update((s) => {
      const st = s.pools.map((p, i) => poolStandings(p, s.matches[i]).map((r) => r.id));
      const poolOf: Record<string, number> = {};
      st.forEach((ids, i) => ids.forEach((id) => (poolOf[id] = i)));
      const main = poolQualifiers(st, s.qualify);
      const others = st.flatMap((ids) => ids.slice(s.qualify));
      // Consolante : les suivants de chaque poule, rangés comme les qualifiés (3es, puis 4es…).
      const rest: string[] = [];
      for (let r = s.qualify; r < Math.max(...st.map((x) => x.length)); r++) for (const ids of st) if (ids[r]) rest.push(ids[r]);
      return {
        ...s,
        finals: {
          main: { slots: knockoutSlots(main, poolOf), wins: {} },
          ...(others.length >= 2 ? { consol: { slots: knockoutSlots(rest, poolOf), wins: {} } } : {}),
        },
      };
    });
  const win = (part: 'main' | 'consol') => (key: string, w: string | undefined) =>
    update((s) => {
      const b = s.finals?.[part];
      if (!s.finals || !b) return s;
      const wins = { ...b.wins };
      if (w) wins[key] = w;
      else delete wins[key];
      return { ...s, finals: { ...s.finals, [part]: { ...b, wins } } };
    });
  const backToPools = async () => {
    if (!(await confirmDialog({ title: 'Revenir aux poules ?', message: 'Les résultats de la phase finale sont effacés.', confirmLabel: 'Revenir aux poules' }))) return;
    update((s) => ({ ...s, finals: undefined }));
  };
  const poolsBlock = (
    <div className="tourney">
      {state.pools.map((p, i) => (
        <div key={i} className="card tourney-rot">
          <strong>
            Poule {letters[i] ?? i + 1}
            <span className="muted small"> · terrain {(i % state.courts) + 1}</span>
          </strong>
          <ul className="tourney-matches">
            {state.matches[i].map((m, j) => (
              <li key={j}>
                <Duel a={node(m.a)} b={node(m.b)} result={m.result} onPick={(res) => setResult(i, j, res)} />
              </li>
            ))}
          </ul>
          <ol className="small tourney-pool-rank">
            {tables[i].map((r, k) => (
              <li key={r.id} className={cls(k < state.qualify && 'tourney-qualified')}>
                {names.label(r.id)} : {pts(r.points)} pt{r.points > 1 ? 's' : ''}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
  if (!state.finals)
    return (
      <>
        <p className="muted small" style={{ margin: 0 }}>
          Chaque poule joue ses matchs dans l’ordre (chacun joue à son tour). Touchez le gagnant ou « Nul ». En gras : les {plural(state.qualify, 'qualifié')} de chaque poule pour le tableau final.
        </p>
        {poolsBlock}
        <div>
          <Button variant="primary" icon={<Swords size={17} />} onClick={toFinals} disabled={missing > 0}>
            Passer à la phase finale
          </Button>
          {missing > 0 && <p className="muted small">Encore {plural(missing, 'résultat')} à donner dans les poules.</p>}
        </div>
      </>
    );
  return (
    <>
      <BracketView title="Tableau final" bracket={state.finals.main} names={names} onWin={win('main')} />
      {state.finals.consol && <BracketView title="Consolante" bracket={state.finals.consol} names={names} onWin={win('consol')} />}
      <details>
        <summary className="small">Résultats des poules</summary>
        {poolsBlock}
      </details>
      <div>
        <Button size="sm" variant="ghost" icon={<Undo2 size={15} />} onClick={backToPools}>
          Revenir aux poules
        </Button>
      </div>
    </>
  );
}

function ChallengeRules({ reach }: { reach: number }) {
  return (
    <ul className="small tourney-rules muted">
      <li>Chacun peut défier un joueur placé au plus {plural(reach, 'place')} au-dessus de lui. Le joueur défié accepte s’il est libre.</li>
      <li>Si celui qui défie gagne, les deux échangent leur place ; s’il perd, rien ne change.</li>
      <li>Plusieurs défis se jouent en même temps, un par terrain ; un joueur ne relance pas tout de suite le même adversaire.</li>
    </ul>
  );
}

function ChallengeView({ state, names, update }: ViewProps<ChallengeState>) {
  const { label, node } = names;
  const order = challengeOrder(state.start, state.log);
  const [challenger, setChallenger] = useState<string | null>(null);
  const [defender, setDefender] = useState<string | null>(null);
  const ci = challenger ? order.indexOf(challenger) : -1;
  const can = (i: number) => ci > 0 && i < ci && i >= ci - state.reach;
  const tapRow = (id: string, i: number) => {
    if (challenger === id) {
      setChallenger(null);
      setDefender(null);
    } else if (challenger && can(i)) setDefender(id);
    else {
      setChallenger(id);
      setDefender(null);
    }
  };
  const record = (w: string) => {
    if (!challenger || !defender) return;
    update((s) => ({ ...s, log: [...s.log, { c: challenger, d: defender, w }] }));
    setChallenger(null);
    setDefender(null);
  };
  const lastLog = state.log[state.log.length - 1];
  return (
    <>
      <ChallengeRules reach={state.reach} />
      <p className="muted small" style={{ margin: 0 }}>
        Pour noter un défi : touchez celui qui défie, puis celui qu’il défie (en surbrillance), puis le vainqueur.
      </p>
      {challenger && defender && (
        <div className="card tourney-rot">
          <strong>Qui a gagné ?</strong>
          <div className="tourney-duel" style={{ marginTop: 6 }}>
            <button type="button" className="tourney-pick" onClick={() => record(challenger)}>
              {node(challenger)}
            </button>
            <span className="muted small">contre</span>
            <button type="button" className="tourney-pick" onClick={() => record(defender)}>
              {node(defender)}
            </button>
          </div>
        </div>
      )}
      <ol className="tourney-ladder">
        {order.map((id, i) => (
          <li key={id}>
            <button type="button" className={cls('tourney-pick', id === challenger && 'is-win', id === defender && 'is-lose', can(i) && !defender && 'tourney-target')} onClick={() => tapRow(id, i)}>
              <span className="muted small">{i + 1}.</span> {node(id)}
            </button>
          </li>
        ))}
      </ol>
      {state.log.length > 0 && (
        <details>
          <summary className="small">
            {plural(state.log.length, 'défi')} joué{state.log.length > 1 ? 's' : ''} · dernier : {label(lastLog.c)} contre {label(lastLog.d)}, gagné par {label(lastLog.w)}
          </summary>
          <ul className="small tourney-rules">
            {state.log
              .map((x, i) => (
                <li key={i}>
                  {label(x.c)} défie {label(x.d)} : {label(x.w)} gagne{x.w === x.c ? ' et prend sa place' : ''}
                </li>
              ))
              .reverse()}
          </ul>
          <Button size="sm" variant="ghost" icon={<Undo2 size={15} />} onClick={() => update((s) => ({ ...s, log: s.log.slice(0, -1) }))}>
            Annuler le dernier défi
          </Button>
        </details>
      )}
    </>
  );
}

function MeleeView({ state, names, update }: ViewProps<MeleeState>) {
  const { label, node } = names;
  const ids = state.participants.map((p) => p.id);
  const { rounds } = state;
  const last = rounds[rounds.length - 1];
  const ri = rounds.length - 1;
  const missing = last.matches.filter((m) => !m.result).length;
  const setResult = (mi: number, res: SwissResult) => update((s) => ({ ...s, rounds: s.rounds.map((r, i) => (i !== ri ? r : { ...r, matches: r.matches.map((m, j) => (j !== mi ? m : { ...m, result: toggle(m.result, res) })) })) }));
  const pair = (t: [string, string]) => (
    <>
      {node(t[0])} &amp; {node(t[1])}
    </>
  );
  return (
    <>
      <div className="card tourney-rot">
        <strong>Tour {rounds.length}</strong>
        <ul className="tourney-matches">
          {last.matches.map((m, j) => (
            <li key={j}>
              <span className="muted small">Terrain {j + 1}</span>
              <Duel a={pair(m.a)} b={pair(m.b)} result={m.result} onPick={(res) => setResult(j, res)} />
            </li>
          ))}
        </ul>
        {last.resting.length > 0 && <p className="muted small">Au repos : {last.resting.map(label).join(', ')}</p>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" icon={<ChevronRight size={17} />} onClick={() => update((s) => ({ ...s, rounds: [...s.rounds, meleeRound(ids, s.rounds, s.courts)] }))} disabled={missing > 0}>
            Tour {rounds.length + 1}
          </Button>
          {rounds.length > 1 && (
            <Button variant="ghost" icon={<Undo2 size={16} />} onClick={() => update((s) => ({ ...s, rounds: s.rounds.slice(0, -1) }))}>
              Annuler ce tour
            </Button>
          )}
        </div>
        {missing > 0 && <p className="muted small">Encore {plural(missing, 'résultat')} à donner.</p>}
      </div>
      <Standings rows={meleeStandings(ids, rounds)} node={node} title="Classement individuel" note="Victoire 2 points pour chaque joueur du double, nul 1, défaite 0. À égalité, le plus de victoires, puis le moins de matchs joués." />
    </>
  );
}

function shuffleIds(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
