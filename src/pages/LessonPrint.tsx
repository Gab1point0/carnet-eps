import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import { useData } from '../store/data';
import { activityOf, lessonTotalMinutes } from '../store/selectors';
import { FrameThumb } from '../animation/Player';
import { Markdown } from '../components/Markdown';
import { Button } from '../components/ui';
import { BLOCK_KINDS } from '../lib/defaults';
import { formatDuration, formatLong } from '../lib/dates';
import { sanitizeAnimation } from '../animation/engine';

/** Fiche de séance imprimable (impression papier ou « Enregistrer en PDF »). */
export function LessonPrintPage() {
  const { id = '' } = useParams();
  const lesson = useData((s) => s.data.lessons[id]);
  const data = useData((s) => s.data);
  const navigate = useNavigate();
  if (!lesson) return <Navigate to="/classes" replace />;

  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const act = activityOf(data, lesson.activityId ?? cycle?.activityId ?? null);

  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <Button variant="ghost" icon={<ChevronLeft size={18} />} onClick={() => navigate(`/lessons/${lesson.id}`)}>
          Retour
        </Button>
        <Button variant="primary" icon={<Printer size={18} />} onClick={() => window.print()}>
          Imprimer / enregistrer en PDF
        </Button>
      </div>

      <article className="sheet">
        <header className="sheet-head">
          <div>
            <p className="sheet-kicker">
              {[klass?.name, cycle?.title || (act ? `${act.emoji} ${act.name}` : null)].filter(Boolean).join(' · ')}
            </p>
            <h1>{lesson.title || 'Séance'}</h1>
          </div>
          <div className="sheet-when">
            {lesson.date && <div>{formatLong(lesson.date)}</div>}
            <div>
              {lesson.start}–{lesson.end} · {formatDuration(lessonTotalMinutes(lesson))} de contenu
            </div>
          </div>
        </header>

        <div className="sheet-grid">
          {lesson.objective && (
            <section>
              <h2>🎯 Objectif</h2>
              <Markdown text={lesson.objective} />
            </section>
          )}
          {lesson.materials && (
            <section>
              <h2>🧰 Matériel</h2>
              <Markdown text={lesson.materials} />
            </section>
          )}
        </div>
        {lesson.safety && (
          <section>
            <h2>⚠️ Sécurité</h2>
            <Markdown text={lesson.safety} />
          </section>
        )}

        {lesson.blocks.map((b, i) => {
          const anim = b.animation ? sanitizeAnimation(b.animation) : null;
          return (
            <section key={b.id} className="sheet-block">
              <h2>
                <span className="sheet-num">{i + 1}</span> {b.title || BLOCK_KINDS[b.kind].label}
                <span className="sheet-min">
                  {BLOCK_KINDS[b.kind].icon} {BLOCK_KINDS[b.kind].label} · {b.minutes} min
                </span>
              </h2>
              <div className={anim ? 'sheet-block-grid' : undefined}>
                <div>
                  {b.text && <Markdown text={b.text} />}
                  {b.materials && (
                    <div className="small">
                      <strong>Matériel :</strong>
                      <Markdown text={b.materials} />
                    </div>
                  )}
                </div>
                {anim && (
                  <div className="sheet-anim">
                    <FrameThumb animation={anim} frame={0} />
                    {anim.frames.length > 1 && (
                      <div className="sheet-frames">
                        {anim.frames.slice(1, 5).map((f, k) => (
                          <figure key={f.id}>
                            <FrameThumb animation={anim} frame={k + 1} />
                            <figcaption className="small">
                              {k + 2}. {f.caption}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                    {anim.frames[0].caption && <p className="small">1. {anim.frames[0].caption}</p>}
                  </div>
                )}
              </div>
            </section>
          );
        })}

        <section>
          <h2>📝 Bilan</h2>
          {lesson.bilan ? <Markdown text={lesson.bilan} /> : <div className="sheet-lines" />}
        </section>
      </article>
    </div>
  );
}
