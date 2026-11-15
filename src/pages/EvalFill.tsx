import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Info } from 'lucide-react';
import type { ID, Lesson } from '../types';
import { useData } from '../store/data';
import { useStudents, useVault } from '../store/vault';
import { activityOf } from '../store/selectors';
import { toast } from '../store/ui';
import { Button, Card, Modal } from '../components/ui';
import { VaultGate } from '../components/VaultGate';
import { GroupSelect, GroupsBar, groupColor } from '../components/GroupsTools';
import { Check, ChoiceCell, ComputedCell, EditableComputedCell, LEVEL_COLORS, LevelPicker, NumberCell, TextCell } from '../components/EvalCells';
import { byGroup } from '../lib/grouping';
import { formatValue } from '../lib/evalCalc';
import { buildEvalWorkbook, bonusKey, critPoints, evaluateSheet, isScored, KIND_NAMES, LEVEL_NAMES, scoringText, withRefs, type EvalBlock, type EvalCriterion, type EvalSheetSpec, type RowResult } from '../lib/evalSheet';
import { criterionKey, type Student, type StudentMarks } from '../lib/privateData';
import { formatLong } from '../lib/dates';
import { cls } from '../lib/util';

const EMPTY_ROWS: Record<ID, StudentMarks> = {};
const num = (v: number) => String(v).replace('.', ',');

function useNarrow() {
  const q = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Fiche d'évaluation remplie dans l'application : une ligne (ou une carte) par élève, notes calculées en direct. */
export function EvalFillPage() {
  const { id = '' } = useParams();
  const lesson = useData((s) => s.data.lessons[id]);
  const data = useData((s) => s.data);
  const students = useStudents(lesson?.classId);
  const rows = useVault((s) => s.doc.sheets[id]) ?? EMPTY_ROWS;
  const narrow = useNarrow();
  // Critère touché : ce qu'on observe, le calcul, le barème ; lisible sur téléphone et tablette.
  const [info, setInfo] = useState<{ block: EvalBlock; criterion: EvalCriterion } | null>(null);
  const grouping = useVault((s) => s.doc.groups[id]);
  // « Un groupe à la fois » : numéro du groupe affiché, ou null pour tous.
  const [one, setOne] = useState<number | null>(null);
  const spec: EvalSheetSpec | null = lesson?.evalSheet ? withRefs(lesson.evalSheet) : null;
  // Notes de toute la classe d'un coup : rangs et statistiques de classe dépendent des autres élèves.
  const results = useMemo(() => {
    const out = new Map<ID, RowResult>();
    if (!spec) return out;
    const res = evaluateSheet(
      spec,
      students.map((s) => ({ marks: rows[s.id]?.v ?? {}, absent: rows[s.id]?.absent })),
      criterionKey,
    );
    students.forEach((s, i) => out.set(s.id, res[i]));
    return out;
  }, [spec, students, rows]);
  if (!lesson) return <Navigate to="/classes" replace />;
  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const activity = activityOf(data, lesson.activityId ?? cycle?.activityId ?? null)?.name ?? '';

  const marksOf = (sid: ID) => rows[sid]?.v ?? {};
  const write = (sid: ID, p: Partial<Omit<StudentMarks, 't'>>) => {
    const cur = rows[sid];
    useVault.getState().setMarks(lesson.id, sid, { v: cur?.v ?? {}, ...(cur?.txt ? { txt: cur.txt } : {}), absent: cur?.absent, ...p });
  };
  const setMark = (sid: ID, key: string, v: number | null) => {
    const next = { ...marksOf(sid) };
    if (v === null) delete next[key];
    else next[key] = v;
    write(sid, { v: next });
  };
  const setText = (sid: ID, key: string, t: string) => write(sid, { txt: { ...(rows[sid]?.txt ?? {}), [key]: t } });
  const setAbsent = (sid: ID, absent: boolean) => write(sid, { absent });
  const filledOf = (sid: ID) => Object.values(marksOf(sid)).some((v) => v !== 0) || Object.values(rows[sid]?.txt ?? {}).some(Boolean) || !!rows[sid]?.absent;

  const exportXlsx = async () => {
    if (!spec) return;
    const { workbook } = await buildEvalWorkbook(spec, {
      students: students.length,
      className: klass?.name ?? '',
      activity,
      date: lesson.date ? formatLong(lesson.date) : undefined,
      rows: sections.flatMap((sec) =>
        sec.students.map((s) => ({
          // Absent : nom marqué, et rien de saisi (pour ne pas compter dans les rangs et moyennes du tableur).
          name: rows[s.id]?.absent ? `${s.name} (absent)` : s.name,
          marks: rows[s.id]?.absent ? {} : marksOf(s.id),
          texts: rows[s.id]?.txt,
          group: count ? (sec.group ? `Groupe ${sec.group}` : 'À placer') : undefined,
        })),
      ),
      keyOf: criterionKey,
    });
    const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Évaluation - ${klass?.name ?? ''} - ${activity || spec.title} - résultats.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  // Élèves rangés par groupe (s'il y en a), avec un en-tête par groupe ; « un groupe à la fois » n'en garde qu'un.
  const count = grouping?.count ?? 0;
  const assign = grouping?.assign ?? {};
  const setGroup = (sid: ID, g: number | null) => useVault.getState().setGroups(lesson.id, { count, assign: { ...assign, [sid]: g ?? 0 } });
  const sections = count ? byGroup(students, assign, count) : [{ group: null, students }];
  // Un groupe retiré pendant l'affichage « un groupe à la fois » : on revient à tous.
  const oneShown = one && one <= count ? one : null;
  const shown = oneShown ? sections.filter((x) => x.group === oneShown) : sections;
  const items: Array<{ head: (typeof sections)[number] } | { student: Student }> = shown.flatMap((sec) => [...(count ? [{ head: sec }] : []), ...sec.students.map((student) => ({ student }))]);
  const doneIn = (list: Student[]) => list.filter((x) => filledOf(x.id)).length;
  const headText = (sec: (typeof sections)[number]) =>
    `${sec.group ? `Groupe ${sec.group}` : 'À placer'} · ${sec.students.length} élève${sec.students.length > 1 ? 's' : ''} · ${doneIn(sec.students)} noté${doneIn(sec.students) > 1 ? 's' : ''}`;
  const filled = doneIn(students);

  // Moyennes de la classe (élèves présents) : valeurs, notes des blocs, total.
  const present = students.filter((s) => !rows[s.id]?.absent && filledOf(s.id));
  const avg = (xs: Array<number | null | undefined>) => {
    const ok = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    return ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null;
  };

  /** La case d'un critère pour un élève. */
  const cell = (s: Student, b: EvalBlock, c: EvalCriterion) => {
    const key = criterionKey(b.name, c.label);
    const m = marksOf(s.id);
    const res = results.get(s.id);
    const frac = isScored(c) ? res?.fracs[key] : undefined;
    const label = `${s.name} : ${c.label}`;
    switch (c.kind) {
      case 'levels':
        return <LevelPicker value={m[key] ?? 0} onChange={(v) => setMark(s.id, key, v)} label={label} />;
      case 'single':
        return <Check value={m[key] ?? 0} onChange={(v) => setMark(s.id, key, v)} label={label} />;
      case 'number':
        return <NumberCell c={c} value={m[key]} frac={frac} onChange={(v) => setMark(s.id, key, v)} label={label} />;
      case 'computed':
        return c.editable ? (
          <EditableComputedCell c={c} value={res?.values[key] ?? null} forced={typeof m[key] === 'number'} frac={frac} onChange={(v) => setMark(s.id, key, v)} label={label} />
        ) : (
          <ComputedCell c={c} value={res?.values[key] ?? null} frac={frac} />
        );
      case 'choice':
        return <ChoiceCell c={c} value={m[key]} onChange={(v) => setMark(s.id, key, v || null)} label={label} />;
      case 'text':
        return <TextCell value={rows[s.id]?.txt?.[key] ?? ''} onChange={(t) => setText(s.id, key, t)} label={label} />;
    }
  };
  const unitOf = (c: EvalCriterion) => (c.format === 'time' ? 'min:s' : c.unit);
  const critButton = (b: EvalBlock, c: EvalCriterion, small = false) => (
    <button type="button" className={cls('crit-info-btn', small && 'small')} onClick={() => setInfo({ block: b, criterion: c })} title={c.observe.join(' / ')}>
      {c.label}
      {unitOf(c) && c.kind !== 'levels' ? <span className="muted"> ({unitOf(c)})</span> : null} <Info size={13} aria-hidden />
    </button>
  );

  return (
    <div className="fill-page">
      <header className="fill-top">
        <Link to={`/lessons/${lesson.id}`} className="back-link">
          <ChevronLeft size={16} /> Séance
        </Link>
        <div className="fill-title">
          <strong>{spec?.title ?? lesson.title}</strong>
          <span className="muted small">
            {klass?.name} · {filled}/{students.length} élèves
          </span>
        </div>
        <Button size="sm" icon={<Download size={15} />} onClick={exportXlsx} disabled={!spec || !students.length}>
          Excel
        </Button>
      </header>

      <div className="fill-body">
        <VaultGate>
          {!spec ? (
            <Card>
              <p>Cette séance n'a pas encore de fiche d'évaluation.</p>
              <Link to={`/lessons/${lesson.id}`}>Préparer la fiche depuis la séance →</Link>
            </Card>
          ) : !students.length ? (
            <Card>
              <p>Aucun élève dans cette classe pour l'instant.</p>
              {klass && <Link to={`/classes/${klass.id}`}>Ajouter les élèves de {klass.name} →</Link>}
            </Card>
          ) : (
            <>
              <GroupsBar lesson={lesson} students={students} grouping={grouping} one={oneShown} setOne={setOne} />
              {narrow ? (
                <div className="stack">
                  {items.map((it) => {
                    if ('head' in it)
                      return (
                        <h3 key={`g${it.head.group}`} className="fill-group-head" style={{ ['--grp' as string]: it.head.group ? groupColor(it.head.group) : 'var(--muted)' }}>
                          {headText(it.head)}
                        </h3>
                      );
                    const s = it.student;
                    const m = marksOf(s.id);
                    const absent = !!rows[s.id]?.absent;
                    const score = results.get(s.id);
                    return (
                      <Card key={s.id} className={cls('fill-card', absent && 'fill-absent')}>
                        <div className="row-between">
                          <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
                            {count > 0 && <GroupSelect value={assign[s.id]} count={count} onChange={(g) => setGroup(s.id, g)} label={`Groupe de ${s.name}`} />}
                            <strong>{s.name || 'Élève sans nom'}</strong>
                          </span>
                          <span className="row" style={{ gap: 10 }}>
                            <label className="check small">
                              <input type="checkbox" checked={absent} onChange={(e) => setAbsent(s.id, e.target.checked)} /> Absent
                            </label>
                            <strong className="fill-total">{absent || !score ? '—' : `${num(score.total)}/20`}</strong>
                          </span>
                        </div>
                        {!absent &&
                          spec.blocks.map((b, bi) => (
                            <div key={b.name} className="fill-block">
                              <div className="row-between small">
                                <strong>{b.name}</strong>
                                <span className="muted">
                                  {num(score?.blocks[bi] ?? 0)}/{b.points}
                                </span>
                              </div>
                              {b.criteria.map((c) => (
                                <div key={c.label} className={cls('fill-crit', c.kind === 'text' && 'fill-crit-text')}>
                                  {critButton(b, c, true)}
                                  {cell(s, b, c)}
                                </div>
                              ))}
                            </div>
                          ))}
                        {!absent &&
                          spec.bonus.map((b) => (
                            <div key={b.label} className="fill-crit">
                              <span className="small">
                                Bonus : {b.label} (+{b.points})
                              </span>
                              <Check value={m[bonusKey(b.label)] ?? 0} onChange={(v) => setMark(s.id, bonusKey(b.label), v)} label={`${s.name} : bonus ${b.label}`} />
                            </div>
                          ))}
                      </Card>
                    );
                  })}
                  {present.length > 1 && (
                    <Card className="fill-card fill-stats">
                      <div className="row-between">
                        <strong>Moyenne de la classe</strong>
                        <strong className="fill-total">{num(avg(present.map((s) => results.get(s.id)?.total)) ?? 0)}/20</strong>
                      </div>
                      <span className="muted small">
                        {spec.blocks.map((b, bi) => `${b.name} : ${num(avg(present.map((s) => results.get(s.id)?.blocks[bi])) ?? 0)}/${b.points}`).join(' · ')}
                      </span>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="fill-scroll">
                  <table className="fill-table">
                    <thead>
                      <tr>
                        <th className="fill-name" rowSpan={2}>
                          Élève
                        </th>
                        {spec.blocks.map((b) => (
                          <th key={b.name} colSpan={b.criteria.length + 1} className="fill-block-head">
                            {b.name} ({b.points} pts)
                          </th>
                        ))}
                        {spec.bonus.length > 0 && <th colSpan={spec.bonus.length}>Bonus</th>}
                        <th rowSpan={2}>/20</th>
                      </tr>
                      <tr>
                        {spec.blocks.map((b) => [
                          ...b.criteria.map((c) => (
                            <th key={`${b.name}${c.label}`} className={cls('fill-crit-head', c.kind === 'text' && 'fill-text-head')}>
                              {critButton(b, c)}
                            </th>
                          )),
                          <th key={`${b.name}-note`} className="fill-note-head">
                            /{b.points}
                          </th>,
                        ])}
                        {spec.bonus.map((b) => (
                          <th key={b.label} className="fill-crit-head">
                            {b.label} (+{b.points})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => {
                        if ('head' in it)
                          return (
                            <tr key={`g${it.head.group}`} className="fill-group-row" style={{ ['--grp' as string]: it.head.group ? groupColor(it.head.group) : 'var(--muted)' }}>
                              <th colSpan={99} className="fill-group-cell">
                                <span>{headText(it.head)}</span>
                              </th>
                            </tr>
                          );
                        const s = it.student;
                        const m = marksOf(s.id);
                        const absent = !!rows[s.id]?.absent;
                        const score = results.get(s.id);
                        return (
                          <tr key={s.id} className={cls(absent && 'fill-absent')}>
                            <th className="fill-name">
                              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                                {count > 0 && <GroupSelect value={assign[s.id]} count={count} onChange={(g) => setGroup(s.id, g)} label={`Groupe de ${s.name}`} />}
                                <span className="fill-name-text">{s.name || 'Élève sans nom'}</span>
                              </span>
                              <label className="check small" title="Absent">
                                <input type="checkbox" checked={absent} onChange={(e) => setAbsent(s.id, e.target.checked)} /> abs.
                              </label>
                            </th>
                            {spec.blocks.map((b, bi) => [
                              ...b.criteria.map((c) => <td key={c.label}>{absent ? null : cell(s, b, c)}</td>),
                              <td key={`${b.name}-note`} className="fill-note">
                                {absent ? '' : num(score?.blocks[bi] ?? 0)}
                              </td>,
                            ])}
                            {spec.bonus.map((b) => (
                              <td key={b.label}>{!absent && <Check value={m[bonusKey(b.label)] ?? 0} onChange={(v) => setMark(s.id, bonusKey(b.label), v)} label={`${s.name} : bonus ${b.label}`} />}</td>
                            ))}
                            <td className="fill-note fill-total">{absent || !score ? '—' : num(score.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {present.length > 1 && (
                      <tfoot>
                        <tr className="fill-stats">
                          <th className="fill-name">Moyenne</th>
                          {spec.blocks.map((b, bi) => [
                            ...b.criteria.map((c) => {
                              const key = criterionKey(b.name, c.label);
                              const a = c.kind === 'number' || c.kind === 'computed' ? avg(present.map((s) => results.get(s.id)?.values[key])) : null;
                              return <td key={c.label}>{a === null ? '' : formatValue(a, c.format ?? 'decimal', 1)}</td>;
                            }),
                            <td key={`${b.name}-note`} className="fill-note">
                              {num(avg(present.map((s) => results.get(s.id)?.blocks[bi])) ?? 0)}
                            </td>,
                          ])}
                          {spec.bonus.map((b) => (
                            <td key={b.label} />
                          ))}
                          <td className="fill-note fill-total">{num(avg(present.map((s) => results.get(s.id)?.total)) ?? 0)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </>
          )}
        </VaultGate>
      </div>

      {info && spec && <CriterionInfo lesson={lesson} spec={spec} block={info.block} criterion={info.criterion} students={students} onClose={() => setInfo(null)} />}
    </div>
  );
}

/** Ce qu'on observe à chaque niveau, ou le calcul et le barème ; pour une valeur à saisir, reprise depuis une autre fiche. */
function CriterionInfo({ lesson, spec, block, criterion: c, students, onClose }: { lesson: Lesson; spec: EvalSheetSpec; block: EvalBlock; criterion: EvalCriterion; students: Student[]; onClose: () => void }) {
  const pts = critPoints(block, c);
  return (
    <Modal title={c.label} onClose={onClose}>
      <p className="muted small">
        {block.name} · {KIND_NAMES[c.kind]}
        {isScored(c) ? ` · ${num(Math.round(pts * 100) / 100)} pt${pts > 1 ? 's' : ''} sur ${block.points}` : c.kind === 'levels' || c.kind === 'single' ? '' : ' · sans points'}
      </p>
      {c.kind === 'levels' ? (
        <ol className="crit-levels">
          {LEVEL_NAMES.map((n, i) => (
            <li key={n} style={{ ['--lvl' as string]: LEVEL_COLORS[i] }}>
              <span className="crit-level-name">{n}</span>
              <span>{c.observe[i] || <span className="muted">Non précisé dans la fiche.</span>}</span>
            </li>
          ))}
        </ol>
      ) : c.kind === 'single' ? (
        <p>
          <strong>Réussi si : </strong>
          {c.observe[0] || <span className="muted">Non précisé dans la fiche.</span>}
        </p>
      ) : (
        <>
          {c.observe.length > 0 && <p>{c.observe.join(' ')}</p>}
          {c.kind === 'computed' && c.expr && (
            <p>
              <strong>Calcul : </strong>
              <code className="formula">{c.expr}</code>
            </p>
          )}
          {isScored(c) && (
            <p>
              <strong>Points : </strong>
              {scoringText(c, pts)}
            </p>
          )}
          {c.kind === 'number' && <ReuseValues lesson={lesson} spec={spec} block={block} criterion={c} students={students} onDone={onClose} />}
        </>
      )}
      {spec.sources.length > 0 && <p className="muted small">Source : {spec.sources.join(' · ')}</p>}
    </Modal>
  );
}

/** « Reprendre les VMA de la séance 1 » : valeurs d'une autre fiche de la classe (saisies ou calculées). */
function ReuseValues({ lesson, spec, block, criterion, students, onDone }: { lesson: Lesson; spec: EvalSheetSpec; block: EvalBlock; criterion: EvalCriterion; students: Student[]; onDone: () => void }) {
  const lessons = useData((s) => s.data.lessons);
  const doc = useVault((s) => s.doc);
  const sources = Object.values(lessons)
    .filter((l) => l.classId === lesson.classId && l.evalSheet && doc.sheets[l.id])
    .flatMap((l) =>
      withRefs(l.evalSheet!).blocks.flatMap((b) =>
        b.criteria.filter((c) => (c.kind === 'number' || c.kind === 'computed') && !(l.id === lesson.id && b.name === block.name && c.label === criterion.label)).map((c) => ({ l, b, c, id: `${l.id}|${b.name}|${c.label}` })),
      ),
    )
    .sort((a, b) => (a.l.date ?? '').localeCompare(b.l.date ?? ''));
  // Par défaut : un critère qui porte le même nom (« VMA »).
  const same = sources.find((x) => x.c.ref === criterion.ref || x.c.label.toLowerCase() === criterion.label.toLowerCase());
  const [pick, setPick] = useState(same?.id ?? sources[0]?.id ?? '');
  if (!sources.length) return <p className="muted small">Pour reprendre ces valeurs d'une autre fiche de la classe (VMA mesurée avant…), il faut une autre fiche remplie avec une valeur.</p>;
  const run = (replace: boolean) => {
    const src = sources.find((x) => x.id === pick);
    if (!src) return;
    const rows = doc.sheets[src.l.id] ?? {};
    const res = evaluateSheet(
      src.l.evalSheet!,
      students.map((s) => ({ marks: rows[s.id]?.v ?? {}, absent: rows[s.id]?.absent })),
      criterionKey,
    );
    const key = criterionKey(block.name, criterion.label);
    const srcKey = criterionKey(src.b.name, src.c.label);
    const cur = doc.sheets[lesson.id] ?? {};
    let n = 0;
    students.forEach((s, i) => {
      const v = res[i].values[srcKey];
      if (v === null || v === undefined) return;
      const mine = cur[s.id];
      if (!replace && mine?.v[key] !== undefined) return;
      useVault.getState().setMarks(lesson.id, s.id, { v: { ...(mine?.v ?? {}), [key]: v }, ...(mine?.txt ? { txt: mine.txt } : {}), absent: mine?.absent });
      n++;
    });
    toast(n ? `${n} valeur${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''}.` : 'Aucune valeur à reprendre.', { tone: n ? 'success' : 'info' });
    onDone();
  };
  return (
    <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <strong className="small">Reprendre ces valeurs d'une autre fiche</strong>
      <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Fiche et valeur à reprendre">
        {sources.map((x) => (
          <option key={x.id} value={x.id}>
            {x.l.title} — {x.c.label}
          </option>
        ))}
      </select>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" variant="primary" onClick={() => run(false)}>
          Remplir les cases vides
        </Button>
        <Button size="sm" variant="ghost" onClick={() => run(true)}>
          Tout remplacer
        </Button>
      </div>
    </div>
  );
}
