import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Copy, Download, Eye, FileText, Image, Loader, Paperclip, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';
import { EvalSheetEditor, cleanEvalSheet } from './EvalSheetEditor';
import type { Lesson } from '../types';
import { useData } from '../store/data';
import { toast } from '../store/ui';
import { aiReady, type Attachment } from '../lib/ai';
import { MAX_TOTAL_BYTES, attachmentBytes, fileToAttachment } from '../lib/attachments';
import { aiEvalSheet, isLyceeLevel } from '../lib/aiTasks';
import { buildEvalWorkbook, cumulativeScript, LEVEL_NAMES, type EvalSheetSpec } from '../lib/evalSheet';
import { activityOf } from '../store/selectors';
import { formatLong } from '../lib/dates';
import { Button, IconButton, Modal, NumberInput, TextArea } from './ui';

/**
 * « Fiche d'évaluation » d'une séance : Claude prépare les critères (d'après la séance, le cycle, la classe,
 * les attendus officiels ou le référentiel du bac), puis l'application produit un fichier Excel
 * qui s'ouvre aussi dans Google Sheets.
 */
export function EvalSheetModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const data = useData((s) => s.data);
  const klass = lesson.classId ? data.classes[lesson.classId] : undefined;
  const cycle = lesson.cycleId ? data.cycles[lesson.cycleId] : undefined;
  const activity = activityOf(data, lesson.activityId ?? cycle?.activityId ?? null)?.name ?? '';
  const level = klass?.level ?? lesson.classLevels[0] ?? '';
  const lycee = isLyceeLevel(level);

  const [spec, setSpec] = useState<EvalSheetSpec | null>(lesson.evalSheet);
  const [byHand, setByHand] = useState(false);
  const navigate = useNavigate();
  const [referential, setReferential] = useState('');
  const [showText, setShowText] = useState(false);
  // Référentiel joint (photos, PDF) : gardé le temps de la fenêtre, pour les demandes de modification qui suivent.
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(false);
  const addFiles = async (files: File[]) => {
    setError('');
    setReading(true);
    try {
      const added: Attachment[] = [];
      for (const f of files) added.push(await fileToAttachment(f));
      const next = [...docs, ...added];
      if (next.reduce((n, d) => n + attachmentBytes(d), 0) > MAX_TOTAL_BYTES) {
        setError('Documents trop lourds (20 Mo au plus en tout) : joignez moins de pages, ou le PDF seul.');
        return;
      }
      setDocs(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Document illisible.');
    } finally {
      setReading(false);
    }
  };
  const [instruction, setInstruction] = useState('');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const save = (s: EvalSheetSpec) => {
    setSpec(s);
    useData.getState().patch('lessons', lesson.id, { evalSheet: s });
  };

  const generate = async () => {
    setError('');
    setStep('Préparation…');
    try {
      const s = await aiEvalSheet(
        {
          className: klass?.name ?? '',
          level,
          students: klass?.students ?? null,
          activity,
          cycle: cycle ? { title: cycle.title, objectives: cycle.objectives, competences: cycle.competences, evaluation: cycle.evaluation } : null,
          lesson: {
            title: lesson.title,
            objective: lesson.objective,
            evalKind: lesson.evalKind,
            blocks: lesson.blocks.map((b) => ({ kind: b.kind, title: b.title, minutes: b.minutes, text: b.text })),
          },
          referential,
          attachments: docs,
          instruction: spec ? `${instruction}\nVersion précédente : ${JSON.stringify(spec)}` : instruction,
        },
        setStep,
      );
      save(s);
      setInstruction('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Claude est indisponible.');
    } finally {
      setStep('');
    }
  };

  const ready = () => {
    if (!spec) return null;
    const clean = cleanEvalSheet(spec);
    save(clean);
    setByHand(false);
    return clean;
  };

  const download = async () => {
    const clean = ready();
    if (!clean) return;
    const { workbook } = await buildEvalWorkbook(clean, {
      students: klass?.students ?? 30,
      className: klass?.name ?? 'Classe',
      activity,
      date: lesson.date ? formatLong(lesson.date) : undefined,
    });
    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Évaluation - ${klass?.name ?? 'classe'} - ${activity || clean.title}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const copyScript = async () => {
    const clean = ready();
    if (!clean) return;
    const { layout } = await buildEvalWorkbook(clean, { students: klass?.students ?? 30, className: '', activity });
    await navigator.clipboard.writeText(cumulativeScript(layout));
    toast('Script copié : Extensions > Apps Script dans Google Sheets, collez, enregistrez.', { tone: 'success', ms: 8000 });
  };

  const setPoints = (i: number, points: number) => spec && save({ ...spec, blocks: spec.blocks.map((b, j) => (j === i ? { ...b, points } : b)) });
  const total = spec?.blocks.reduce((s, b) => s + b.points, 0) ?? 0;

  return (
    <Modal
      title="Fiche d'évaluation"
      onClose={onClose}
      footer={
        <>
          <Button icon={<Download size={16} />} onClick={download} disabled={!spec || !!step}>
            Excel
          </Button>
          <Button
            variant="primary"
            icon={<ClipboardCheck size={16} />}
            disabled={!spec || !!step}
            onClick={() => {
              if (ready()) navigate(`/lessons/${lesson.id}/evaluation`);
            }}
          >
            Remplir dans l'application
          </Button>
        </>
      }
    >
      <p className="muted small">
        {klass?.name} · {activity || 'activité ?'} · {lycee ? 'attendus de fin de lycée (AFL)' : `attendus de fin de cycle ${level === '6e' ? '3' : '4'} (AFC)`}. Une ligne par élève, des cases à cocher, la note sur 20 se calcule seule.
      </p>

      {!aiReady() && <p className="error-text small">Il faut une clé d'API Claude : Réglages, onglet « Assistant IA ».</p>}

      <div className="field">
        <span className="field-label">Référentiel (facultatif)</span>
        <span className="field-hint">
          Joignez le référentiel en photos (une par page) ou en PDF : Claude le lit en entier. {lycee ? 'Sans référentiel, Claude cherche le référentiel officiel en ligne.' : ''}
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <label className="btn btn-secondary btn-sm">
            <Paperclip size={15} /> Joindre des photos ou un PDF
            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void addFiles(files);
              }}
            />
          </label>
          {!showText && (
            <Button size="sm" variant="ghost" onClick={() => setShowText(true)}>
              Ou coller le texte
            </Button>
          )}
        </div>
        {docs.length > 0 && (
          <ul className="attach-list">
            {docs.map((d, i) => (
              <li key={`${d.name}-${i}`}>
                {d.mediaType === 'application/pdf' ? <FileText size={15} /> : <Image size={15} />}
                <span className="grow">{d.name}</span>
                <span className="muted small">{Math.max(1, Math.round(attachmentBytes(d) / 1024))} Ko</span>
                <IconButton label={`Retirer ${d.name}`} onClick={() => setDocs((cur) => cur.filter((_, j) => j !== i))}>
                  <X size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        {reading && (
          <p className="muted small row" style={{ gap: 6 }}>
            <Loader size={14} className="spin" /> Préparation des documents…
          </p>
        )}
        {(showText || referential) && <TextArea value={referential} onChange={setReferential} minRows={3} placeholder="AFL1 : … / Repères : … / Barème : …" />}
      </div>

      {spec && (
        <div>
          <Button size="sm" icon={byHand ? <Eye size={15} /> : <Pencil size={15} />} onClick={() => (byHand ? ready() : setByHand(true))}>
            {byHand ? 'Voir la fiche' : 'Modifier à la main'}
          </Button>
        </div>
      )}
      {spec && byHand && <EvalSheetEditor spec={spec} onChange={save} />}
      {spec && !byHand && (
        <div className="stack eval-preview">
          <strong>{spec.title}</strong>
          {spec.blocks.map((b, i) => (
            <div key={i} className="card eval-block">
              <div className="row-between">
                <strong>{b.name}</strong>
                <span className="row" style={{ gap: 6 }}>
                  <NumberInput value={b.points} min={0} max={20} onChange={(v) => setPoints(i, v ?? 0)} aria-label={`Points du bloc ${b.name}`} />
                  <span className="muted small">pts</span>
                </span>
              </div>
              <ul className="eval-criteria">
                {b.criteria.map((c, j) => (
                  <li key={j}>
                    <span>{c.label}</span> <span className="muted small">{c.kind === 'levels' ? `4 cases (${LEVEL_NAMES.join(' → ')})` : '1 case'}</span>
                    {c.observe.length > 0 && <div className="muted small">{c.kind === 'levels' ? `Acquis : ${c.observe[2] ?? ''}` : c.observe[0]}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className={total === 20 ? 'muted small' : 'error-text small'}>Total : {total}/20</p>
          {spec.expectations.length > 0 && (
            <details>
              <summary className="small">Attendus visés ({spec.expectations.length})</summary>
              <ul className="small">
                {spec.expectations.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {spec.notes && <p className="muted small">{spec.notes}</p>}
          {spec.sources.length > 0 && <p className="muted small">Sources : {spec.sources.join(' · ')}</p>}
          <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={copyScript}>
            Copier le script Google Sheets (cocher Acquis coche aussi les cases d'avant)
          </Button>
        </div>
      )}

      {step && (
        <p className="muted row" style={{ gap: 8 }}>
          <Loader size={16} className="spin" /> {step}
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      {!spec && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil size={15} />}
            onClick={() => {
              save({ title: lesson.title || 'Évaluation', expectations: [], blocks: [{ name: 'Bloc 1', points: 20, criteria: [{ label: '', kind: 'levels', observe: [] }] }], bonus: [], sources: [], notes: '' });
              setByHand(true);
            }}
          >
            Créer la fiche à la main
          </Button>
        </div>
      )}

      <div className="voice-type">
        {spec && <span className="field-label">Demander une modification à Claude</span>}
        <TextArea
          value={instruction}
          onChange={setInstruction}
          minRows={2}
          placeholder={spec ? 'Ce qu\'il faut changer : « retire l\'arbitrage », « 3 blocs seulement », « ajoute un bonus progrès »…' : 'Précisions (facultatif) : barème voulu, critères à garder, ce que vous ne voulez pas évaluer…'}
        />
        <Button size="sm" variant={spec ? 'secondary' : 'primary'} icon={spec ? <RefreshCw size={15} /> : <Sparkles size={15} />} onClick={generate} disabled={!!step || !aiReady()}>
          {spec ? 'Refaire avec ces changements' : 'Préparer la fiche avec Claude'}
        </Button>
      </div>
    </Modal>
  );
}
