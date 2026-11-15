import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import type { ID } from '../types';
import { useData } from '../store/data';
import { useStudents, useVault } from '../store/vault';
import { activityOf } from '../store/selectors';
import { Button, Card } from '../components/ui';
import { VaultGate } from '../components/VaultGate';
import { buildEvalWorkbook, bonusKey, LEVEL_NAMES, scoreOf, type EvalSheetSpec } from '../lib/evalSheet';
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
      rows: students.map((s) => ({ name: rows[s.id]?.absent ? `${s.name} (absent)` : s.name, marks: marksOf(s.id) })),
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
          ) : narrow ? (
            <div className="stack">
              {students.map((s) => {
                const m = marksOf(s.id);
                const absent = !!rows[s.id]?.absent;
                const score = scoreOf(spec, m, criterionKey);
                return (
                  <Card key={s.id} className={cls('fill-card', absent && 'fill-absent')}>
                    <div className="row-between">
                      <strong>{s.name || 'Élève sans nom'}</strong>
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
                                <span className="small">{c.label}</span>
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
                        <th key={`${b.name}${c.label}`} className="fill-crit-head" title={c.observe.join(' / ')}>
                          {c.label}
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
                  {students.map((s) => {
                    const m = marksOf(s.id);
                    const absent = !!rows[s.id]?.absent;
                    const score = scoreOf(spec, m, criterionKey);
                    return (
                      <tr key={s.id} className={cls(absent && 'fill-absent')}>
                        <th className="fill-name">
                          <span>{s.name || 'Élève sans nom'}</span>
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
        </VaultGate>
      </div>
    </div>
  );
}
