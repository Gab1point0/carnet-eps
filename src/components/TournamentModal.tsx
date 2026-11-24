import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Shuffle, Trophy, Undo2 } from 'lucide-react';
import type { ID, Klass, Lesson } from '../types';
import { useStudents, useVault } from '../store/vault';
import { useData } from '../store/data';
import { byGroup } from '../lib/grouping';
import { ladderNext, ladderStart, rotationsForAll, schedule, swissPairing, swissStandings, type Rotation, type SwissResult, type SwissRound } from '../lib/tournament';
import { confirmDialog } from '../store/ui';
import { cls, plural } from '../lib/util';
import { Button, Field, Modal, NumberInput, Tabs } from './ui';
import { VaultGate } from './VaultGate';
import { groupColor } from './GroupsTools';

// « Tournoi » : roulement sans revanche, rondes suisses ou montante-descendante, en équipes ou en individuel. Tout se fait sur l'appareil.
// Le tournoi reste affiché le temps de la session (fenêtre refermée puis rouverte) ; il n'est pas enregistré,
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

/** Tournois en cours (roulement, rondes, montante-descendante) par séance ou par classe, le temps de la session. */
const LAST = new Map<string, unknown>();

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

/** Garde une valeur en mémoire (le temps de la session) sous une clé : retrouvée si la fenêtre est rouverte. */
function useKept<T>(key: string, initial: T): [T, (v: T | ((cur: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (LAST.has(key) ? (LAST.get(key) as T) : initial));
  const set = (v: T | ((cur: T) => T)) =>
    setValue((cur) => {
      const next = typeof v === 'function' ? (v as (cur: T) => T)(cur) : v;
      LAST.set(key, next);
      return next;
    });
  return [value, set];
}

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

type Formula = 'rr' | 'swiss' | 'ladder';
const FORMULAS: Array<{ id: Formula; label: string; hint: string }> = [
  { id: 'rr', label: 'Roulement sans revanche', hint: 'Tout le roulement est tiré d’un coup : chacun rencontre des adversaires différents.' },
  { id: 'swiss', label: 'Rondes suisses', hint: 'Après chaque ronde, vous donnez les résultats : la ronde suivante oppose ceux qui ont le même nombre de victoires.' },
  { id: 'ladder', label: 'Montante-descendante', hint: 'Répartition sur les terrains ; à chaque tour, le gagnant monte d’un terrain et le perdant descend.' },
];

/** Réglages communs (formule, terrains) puis la formule choisie. */
function Generator({ storeKey, participants, children }: { storeKey: string; participants: Participant[]; children: ReactNode }) {
  const [formula, setFormula] = useKept<Formula>(`${storeKey}:formule`, 'rr');
  const [courts, setCourts] = useState(() => Math.max(1, Math.min(4, Math.floor(participants.length / 2))));
  const n = participants.length;
  const used = Math.min(courts, Math.floor(n / 2));
  const current = FORMULAS.find((f) => f.id === formula) ?? FORMULAS[0];
  return (
    <div className="stack" style={{ gap: 12 }}>
      {children}
      <Field label="Formule" hint={current.hint}>
        <select className="input" value={formula} onChange={(e) => setFormula(e.target.value as Formula)}>
          {FORMULAS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={formula === 'ladder' ? 'Terrains (ou tables)' : 'Terrains'} hint={formula === 'ladder' ? (n >= 2 && used < courts ? `${plural(used, 'terrain')} utilisés : 2 joueurs au moins par terrain` : '') : `${plural(Math.max(0, used), 'match')} à la fois`}>
        <NumberInput value={courts} min={1} max={30} onChange={(v) => setCourts(Math.max(1, v ?? 1))} />
      </Field>
      {n < 2 ? (
        <p className="error-text small">Il faut au moins 2 participants.</p>
      ) : formula === 'swiss' ? (
        <SwissPanel storeKey={`${storeKey}:swiss`} participants={participants} courts={courts} />
      ) : formula === 'ladder' ? (
        <LadderPanel storeKey={`${storeKey}:ladder`} participants={participants} courts={courts} />
      ) : (
        <RoundRobinPanel storeKey={`${storeKey}:rr`} participants={participants} courts={courts} />
      )}
    </div>
  );
}

type RoundRobin = { rotations: Rotation[]; participants: Participant[] };

/** Roulement complet tiré d'un coup (rotations, arbitres). */
function RoundRobinPanel({ storeKey, participants, courts }: { storeKey: string; participants: Participant[]; courts: number }) {
  const [limit, setLimit] = useState<number | null>(null);
  const [referees, setReferees] = useState(true);
  const [saved, setSaved] = useKept<RoundRobin | null>(storeKey, null);
  const n = participants.length;
  const full = useMemo(() => (n >= 2 ? rotationsForAll(n, courts) : 0), [n, courts]);
  const { label, node } = useNames(saved?.participants ?? participants);

  const run = () => {
    const rotations = schedule(
      participants.map((p) => p.id),
      { courts, rotations: limit ?? undefined, referees },
    );
    setSaved({ rotations, participants });
  };

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
      <div>
        <Button variant="primary" icon={<Shuffle size={17} />} onClick={run}>
          {saved ? 'Refaire le tirage' : 'Créer le roulement'}
        </Button>
      </div>
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
                    <span className="muted small">Terrain {m.court} :</span> {node(m.a)} <span className="muted">contre</span> {node(m.b)}
                    {m.referee && <span className="muted small"> · arbitre : {label(m.referee)}</span>}
                  </li>
                ))}
              </ul>
              {r.resting.length > 0 && <p className="muted small">Au repos : {r.resting.map(label).join(', ')}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

type Swiss = { participants: Participant[]; order: string[]; rounds: SwissRound[] };

/** Rondes suisses : une ronde à la fois, résultats saisis, puis appariement par nombre de points. */
function SwissPanel({ storeKey, participants, courts }: { storeKey: string; participants: Participant[]; courts: number }) {
  const [saved, setSaved] = useKept<Swiss | null>(storeKey, null);
  const { label, node } = useNames(saved?.participants ?? participants);
  const roundsHint = Math.ceil(Math.log2(Math.max(2, participants.length)));

  const start = async () => {
    if (saved && !(await confirmDialog({ title: 'Recommencer le tournoi ?', message: 'Les rondes et les résultats en cours sont effacés.', confirmLabel: 'Recommencer' }))) return;
    const order = shuffleIds(participants.map((p) => p.id));
    setSaved({ participants, order, rounds: [swissPairing(order, [])] });
  };
  if (!saved)
    return (
      <>
        <p className="muted small">
          Victoire 1 point, match nul ½ point, exempt (nombre impair) 1 point. Pour désigner un vainqueur, environ {plural(roundsHint, 'ronde')} suffisent.
        </p>
        <div>
          <Button variant="primary" icon={<Shuffle size={17} />} onClick={start}>
            Tirer la ronde 1
          </Button>
        </div>
      </>
    );

  const { order, rounds } = saved;
  const setResult = (ri: number, mi: number, res: SwissResult) =>
    setSaved((cur) =>
      cur
        ? {
            ...cur,
            rounds: cur.rounds.map((r, i) => (i !== ri ? r : { ...r, matches: r.matches.map((m, j) => (j !== mi ? m : { ...m, result: m.result === res ? undefined : res })) })),
          }
        : cur,
    );
  const last = rounds[rounds.length - 1];
  const missing = last.matches.filter((m) => !m.result).length;
  const next = () => setSaved((cur) => (cur ? { ...cur, rounds: [...cur.rounds, swissPairing(cur.order, cur.rounds)] } : cur));
  const undo = async () => {
    if (!(await confirmDialog({ title: `Annuler la ronde ${rounds.length} ?`, message: 'Ses matchs et ses résultats sont retirés ; la ronde d’avant redevient modifiable.', confirmLabel: 'Annuler la ronde' }))) return;
    setSaved((cur) => (cur ? { ...cur, rounds: cur.rounds.slice(0, -1) } : cur));
  };
  const standings = swissStandings(order, rounds);
  const passages = last.matches.length > courts;

  const roundView = (r: SwissRound, ri: number) => (
    <ul className="tourney-matches">
      {r.matches.map((m, j) => (
        <li key={j}>
          <span className="muted small">
            Terrain {(j % courts) + 1}
            {passages ? ` (passage ${Math.floor(j / courts) + 1})` : ''} :
          </span>
          <span className="tourney-duel">
            <button type="button" className="tourney-pick" aria-pressed={m.result === 'a'} onClick={() => setResult(ri, j, 'a')}>
              {node(m.a)}
            </button>
            <span className="muted small">contre</span>
            <button type="button" className="tourney-pick" aria-pressed={m.result === 'b'} onClick={() => setResult(ri, j, 'b')}>
              {node(m.b)}
            </button>
            <button type="button" className="tourney-pick tourney-draw" aria-pressed={m.result === 'draw'} onClick={() => setResult(ri, j, 'draw')}>
              Nul
            </button>
          </span>
        </li>
      ))}
      {r.bye && (
        <li className="muted small">
          Exempt (gagne d’office) : {label(r.bye)}
        </li>
      )}
    </ul>
  );

  return (
    <>
      <div className="card tourney-rot">
        <strong>Ronde {rounds.length}</strong>
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          Touchez le gagnant de chaque match (ou « Nul »).
        </p>
        {last.rematches ? <p className="small error-text">Plus assez d’adversaires nouveaux : {plural(last.rematches, 'match')} déjà joué{last.rematches > 1 ? 's' : ''} revient dans cette ronde.</p> : null}
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
      <div>
        <strong>Classement</strong>
        <div className="tourney-scroll">
          <table className="tourney-table">
            <thead>
              <tr>
                <th>Rang</th>
                <th>Nom</th>
                <th title="Points : victoire 1, nul ½, exempt 1">Pts</th>
                <th title="Victoires">V</th>
                <th title="Nuls">N</th>
                <th title="Défaites">D</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>{node(s.id)}</td>
                  <td>
                    <strong>{String(s.points).replace('.', ',')}</strong>
                  </td>
                  <td>{s.wins + s.byes}</td>
                  <td>{s.draws}</td>
                  <td>{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">À égalité de points, celui qui a rencontré les adversaires les plus forts passe devant.</p>
      </div>
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
      <div>
        <Button size="sm" variant="ghost" icon={<Shuffle size={15} />} onClick={start}>
          Recommencer le tournoi
        </Button>
      </div>
    </>
  );
}

type Ladder = { participants: Participant[]; tables: string[][]; marks: Array<{ w?: string; l?: string }>; turn: number; history: string[][][] };

/** Montante-descendante : répartition sur les terrains, puis gagnant ↑ et perdant ↓ à chaque tour. */
function LadderPanel({ storeKey, participants, courts }: { storeKey: string; participants: Participant[]; courts: number }) {
  const [saved, setSaved] = useKept<Ladder | null>(storeKey, null);
  const { label, node } = useNames(saved?.participants ?? participants);

  const start = async () => {
    if (saved && !(await confirmDialog({ title: 'Refaire la répartition ?', message: 'Les tours joués sont effacés.', confirmLabel: 'Refaire' }))) return;
    setSaved({ participants, tables: ladderStart(participants.map((p) => p.id), courts), marks: [], turn: 1, history: [] });
  };
  const three = (saved?.tables ?? []).some((t) => t.length > 2) || participants.length > 2 * Math.min(courts, Math.floor(participants.length / 2));
  const rules = (
    <details className="card tourney-rot" open={!saved}>
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
  if (!saved)
    return (
      <>
        {rules}
        <div>
          <Button variant="primary" icon={<Shuffle size={17} />} onClick={start}>
            Répartir sur les terrains
          </Button>
        </div>
      </>
    );

  const { tables, marks, turn } = saved;
  const tap = (i: number, id: string) =>
    setSaved((cur) => {
      if (!cur) return cur;
      const size = cur.tables[i].length;
      const m = cur.marks[i] ?? {};
      let nm: { w?: string; l?: string };
      if (size === 2) nm = m.w === id ? {} : { w: id };
      // À trois ou plus : 1re touche = gagnant, 2e touche (un autre joueur) = perdant ; toucher à nouveau annule.
      else if (m.w === id) nm = { ...m, w: undefined };
      else if (m.l === id) nm = { ...m, l: undefined };
      else if (!m.w) nm = { ...m, w: id };
      else nm = { ...m, l: id };
      const marks = [...cur.marks];
      marks[i] = nm;
      return { ...cur, marks };
    });
  const done = (i: number) => !!marks[i]?.w && (tables[i].length === 2 || !!marks[i]?.l);
  const missing = tables.filter((_, i) => !done(i)).length;
  const next = () =>
    setSaved((cur) =>
      cur
        ? {
            ...cur,
            tables: ladderNext(
              cur.tables,
              cur.tables.map((_, i) => cur.marks[i]?.w),
              cur.tables.map((_, i) => cur.marks[i]?.l),
            ),
            marks: [],
            turn: cur.turn + 1,
            history: [...cur.history, cur.tables],
          }
        : cur,
    );
  const back = () => setSaved((cur) => (cur && cur.history.length ? { ...cur, tables: cur.history[cur.history.length - 1], history: cur.history.slice(0, -1), marks: [], turn: cur.turn - 1 } : cur));
  const anyThree = tables.some((t) => t.length > 2);

  return (
    <>
      {rules}
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
              {t.map((id) => {
                const isW = marks[i]?.w === id;
                const isL = marks[i]?.l === id || (t.length === 2 && !!marks[i]?.w && !isW);
                return (
                  <button key={id} type="button" className={cls('tourney-pick', isW && 'is-win', isL && 'is-lose')} aria-pressed={isW} onClick={() => tap(i, id)} title={label(id)}>
                    {isW ? <ArrowUp size={14} /> : isL ? <ArrowDown size={14} /> : null}
                    {node(id)}
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
        {saved.history.length > 0 && (
          <Button variant="ghost" icon={<Undo2 size={16} />} onClick={back}>
            Revenir au tour {turn - 1}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Shuffle size={15} />} onClick={start}>
          Refaire la répartition
        </Button>
      </div>
      {missing > 0 && <p className="muted small">Encore {plural(missing, 'terrain')} sans résultat.</p>}
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
