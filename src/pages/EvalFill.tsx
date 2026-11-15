import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Info } from 'lucide-react';
import type { ID } from '../types';
import { useData } from '../store/data';
import { useStudents, useVault } from '../store/vault';
import { activityOf } from '../store/selectors';
import { Button, Card, Modal } from '../components/ui';
import { VaultGate } from '../components/VaultGate';
import { GroupSelect, GroupsBar, groupColor } from '../components/GroupsTools';
import { byGroup } from '../lib/grouping';
import { buildEvalWorkbook, bonusKey, LEVEL_NAMES, scoreOf, type EvalCriterion, type EvalSheetSpec } from '../lib/evalSheet';
import { criterionKey, type StudentMarks } from '../lib/privateData';
import { formatLong } from '../lib/dates';
import { cls } from '../lib/util';

const LEVEL_SHORT = ['D', 'EC', 'A', 'Av'];
const LEVEL_COLORS = ['#e5484d', '#f5a524', '#e2c200', '#30a46c'];
const EMPTY_ROWS: Record<ID, StudentMarks> = {};

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

/** 4 boutons Débutant → Avancé : toucher un niveau le choisit, toucher à nouveau le niveau choisi l'efface. */
function LevelPicker({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="lvl-pick" role="group" aria-label={label}>
      {LEVEL_SHORT.map((s, i) => (
        <button
          key={s}
          type="button"
          className={cls('lvl-btn', value > i && 'lvl-on')}
          style={{ ['--lvl' as string]: LEVEL_COLORS[Math.max(0, value - 1)] }}
          aria-pressed={value === i + 1}
          title={LEVEL_NAMES[i]}
          onClick={() => onChange(value === i + 1 ? 0 : i + 1)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function Check({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <button type="button" className={cls('lvl-btn', 'lvl-single', value > 0 && 'lvl-on')} style={{ ['--lvl' as string]: LEVEL_COLORS[3] }} aria-pressed={value > 0} aria-label={label} onClick={() => onChange(value ? 0 : 1)}>
      ✓
    </button>
  );
}

/** Fiche d'évaluation remplie dans l'application : une ligne (ou une carte) par élève, notes calculées en direct. */
export function EvalFillPage() {
  const { id = '' } = useParams();
  const lesson = useData((s) => s.data.lessons[id]);
  const data = useData((s) => s.data);
  const students = useStudents(lesson?.classId);
  const rows = useVault((s) => s.doc.sheets[id]) ?? EMPTY_ROWS;
  const narrow = useNarrow();
  // Critère touché : ce qu'on observe à chaque niveau (repris du référentiel), lisible sur téléphone et tablette.
  const [info, setInfo] = useState<{ block: string; criterion: EvalCriterion } | null>(null);
  const grouping = useVault((s) => s.doc.groups[id]);
  // « Un groupe à la fois » : numéro du groupe affiché, ou null pour tous.
  const [one, setOne] = useState<number | null>(null);
  if (!lesson) return <Navigate to="/classes" replace />;
  const spec: EvalSheetSpec | null = lesson.evalSheet;
  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const activity = activityOf(data, lesson.activityId ?? cycle?.activityId ?? null)?.name ?? '';

  const marksOf = (sid: ID) => rows[sid]?.v ?? {};
  const setMark = (sid: ID, key: string, v: number) => useVault.getState().setMarks(lesson.id, sid, { v: { ...marksOf(sid), [key]: v }, absent: rows[sid]?.absent });
  const setAbsent = (sid: ID, absent: boolean) => useVault.getState().setMarks(lesson.id, sid, { v: marksOf(sid), absent });

  const exportXlsx = async () => {
    if (!spec) return;
    const { workbook } = await buildEvalWorkbook(spec, {
      students: students.length,
      className: klass?.name ?? '',
      activity,
      date: lesson.date ? formatLong(lesson.date) : undefined,
      rows: sections.flatMap((sec) =>
        sec.students.map((s) => ({ name: rows[s.id]?.absent ? `${s.name} (absent)` : s.name, marks: marksOf(s.id), group: count ? (sec.group ? `Groupe ${sec.group}` : 'À placer') : undefined })),
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
  const items: Array<{ head: (typeof sections)[number] } | { student: (typeof students)[number] }> = shown.flatMap((sec) => [
    ...(count ? [{ head: sec }] : []),
    ...sec.students.map((student) => ({ student })),
  ]);
  const doneIn = (list: typeof students) => list.filter((x) => Object.values(marksOf(x.id)).some(Boolean) || rows[x.id]?.absent).length;
  const headText = (sec: (typeof sections)[number]) =>
    `${sec.group ? `Groupe ${sec.group}` : 'À placer'} · ${sec.students.length} élève${sec.students.length > 1 ? 's' : ''} · ${doneIn(sec.students)} noté${doneIn(sec.students) > 1 ? 's' : ''}`;

  const filled = students.filter((s) => Object.values(marksOf(s.id)).some(Boolean) || rows[s.id]?.absent).length;

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
                const score = scoreOf(spec, m, criterionKey);
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
                        <strong className="fill-total">{absent ? '—' : `${String(score.total).replace('.', ',')}/20`}</strong>
                      </span>
                    </div>
                    {!absent &&
                      spec.blocks.map((b, bi) => (
                        <div key={b.name} className="fill-block">
                          <div className="row-between small">
                            <strong>{b.name}</strong>
                            <span className="muted">
                              {String(score.blocks[bi]).replace('.', ',')}/{b.points}
                            </span>
                          </div>
                          {b.criteria.map((c) => {
                            const key = criterionKey(b.name, c.label);
                            return (
                              <div key={key} className="fill-crit">
                                <button type="button" className="crit-info-btn small" onClick={() => setInfo({ block: b.name, criterion: c })}>
                                  {c.label} <Info size={13} aria-hidden />
                                </button>
                                {c.kind === 'levels' ? (
                                  <LevelPicker value={m[key] ?? 0} onChange={(v) => setMark(s.id, key, v)} label={`${s.name} : ${c.label}`} />
                                ) : (
                                  <Check value={m[key] ?? 0} onChange={(v) => setMark(s.id, key, v)} label={`${s.name} : ${c.label}`} />
                                )}
                              </div>
                            );
                          })}
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
                        <th key={`${b.name}${c.label}`} className="fill-crit-head">
                          <button type="button" className="crit-info-btn" onClick={() => setInfo({ block: b.name, criterion: c })} title={c.observe.join(' / ')}>
                            {c.label} <Info size={13} aria-hidden />
                          </button>
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
                    const score = scoreOf(spec, m, criterionKey);
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
                          ...b.criteria.map((c) => {
                            const key = criterionKey(b.name, c.label);
                            return (
                              <td key={key}>
                                {absent ? null : c.kind === 'levels' ? (
                                  <LevelPicker value={m[key] ?? 0} onChange={(v) => setMark(s.id, key, v)} label={`${s.name} : ${c.label}`} />
                                ) : (
                                  <Check value={m[key] ?? 0} onChange={(v) => setMark(s.id, key, v)} label={`${s.name} : ${c.label}`} />
                                )}
                              </td>
                            );
                          }),
                          <td key={`${b.name}-note`} className="fill-note">
                            {absent ? '' : String(score.blocks[bi]).replace('.', ',')}
                          </td>,
                        ])}
                        {spec.bonus.map((b) => (
                          <td key={b.label}>{!absent && <Check value={m[bonusKey(b.label)] ?? 0} onChange={(v) => setMark(s.id, bonusKey(b.label), v)} label={`${s.name} : bonus ${b.label}`} />}</td>
                        ))}
                        <td className="fill-note fill-total">{absent ? '—' : String(score.total).replace('.', ',')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
            </>
          )}
        </VaultGate>
      </div>

      {info && (
        <Modal title={info.criterion.label} onClose={() => setInfo(null)}>
          <p className="muted small">{info.block}</p>
          {info.criterion.kind === 'levels' ? (
            <ol className="crit-levels">
              {LEVEL_NAMES.map((n, i) => (
                <li key={n} style={{ ['--lvl' as string]: LEVEL_COLORS[i] }}>
                  <span className="crit-level-name">{n}</span>
                  <span>{info.criterion.observe[i] || <span className="muted">Non précisé dans la fiche.</span>}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              <strong>Réussi si : </strong>
              {info.criterion.observe[0] || <span className="muted">Non précisé dans la fiche.</span>}
            </p>
          )}
          {spec && spec.sources.length > 0 && <p className="muted small">Source : {spec.sources.join(' · ')}</p>}
        </Modal>
      )}
    </div>
  );
}
