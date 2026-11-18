import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, CopyPlus, ChevronDown, ChevronRight, Copy, Film, GripVertical, Trash2 } from 'lucide-react';
import type { Block, BlockKind, CourtId, ID, Lesson } from '../types';
import { AiBlockTools } from './AiBlockTools';
import { IconButton, Menu, NumberInput, Select, TextArea, TextInput } from './ui';
import { AnimationField } from './AnimationField';
import { Markdown } from './Markdown';
import { MarkdownField } from './MarkdownField';
import { SheetLinks } from '../pages/Fiche';
import { FICHES, fichesOfActivity } from '../lib/fiches';
import { useData } from '../store/data';
import { BLOCK_KINDS, BLOCK_KIND_ORDER } from '../lib/defaults';
import { cls, uid } from '../lib/util';

/** Première ligne utile d'un texte, sans la mise en forme : résumé d'un bloc replié. */
function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.replace(/[*#_>]|^\s*(\d+\.|-)\s*/g, '').trim()).find(Boolean) ?? '';
  return line.length > 90 ? `${line.slice(0, 88)}…` : line;
}

export const DEFAULT_MINUTES: Record<BlockKind, number> = {
  warmup: 15,
  situation: 15,
  skill: 15,
  game: 25,
  evaluation: 30,
  theory: 10,
  cooldown: 10,
  free: 10,
};

export function BlockEditor({
  block,
  index,
  count,
  court,
  activityId,
  onChange,
  onMove,
  onDelete,
  onDuplicate,
  onSaveToLibrary,
  onCopyToNext,
  cycleId,
  lesson,
  dragProps,
  dragOver,
}: {
  block: Block;
  index: number;
  count: number;
  court: CourtId;
  activityId: ID | null;
  onChange: (p: Partial<Block>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveToLibrary: () => void;
  /** Copier le bloc dans la séance suivante de la classe (absent s'il n'y en a pas). */
  onCopyToNext?: { label: string; run: () => void };
  cycleId?: ID | null;
  /** Séance du bloc : donne à Claude le contexte de la classe. */
  lesson?: Lesson;
  /** Glisser-déposer (ordinateur) : attributs posés sur le bloc par la liste. */
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragOver?: boolean;
}) {
  // Replié par défaut : une ligne par bloc. Un bloc encore vide (tout juste ajouté) s'ouvre pour être rempli.
  const [open, setOpen] = useState(() => !block.text.trim());
  const kind = BLOCK_KINDS[block.kind];
  const activityName = useData((s) => s.data.settings.activities.find((a) => a.id === activityId)?.name ?? '');
  const sheetGroups = useMemo(() => {
    const mine = activityName ? fichesOfActivity(activityName) : [];
    const rest = FICHES.filter((f) => !mine.includes(f));
    return [
      ...(mine.length ? [{ label: `${activityName} et fiches communes`, fiches: mine }] : []),
      ...[...new Set(rest.map((f) => f.group))].map((g) => ({ label: mine.length ? `Autres : ${g}` : g, fiches: rest.filter((f) => f.group === g) })),
    ];
  }, [activityName]);

  return (
    <div className={cls('block', !open && 'block-closed', dragOver && 'block-dragover')} style={{ ['--kind' as string]: kind.color }} {...dragProps}>
      {!open && (
        <button type="button" className="block-summary" onClick={() => setOpen(true)} aria-expanded={false}>
          <span className="block-grip" aria-hidden title="Glisser pour déplacer">
            <GripVertical size={16} />
          </span>
          <span className="block-index">{index + 1}</span>
          <span className="block-summary-text">
            <strong>
              {kind.icon} {block.title || kind.label}
            </strong>
            {firstLine(block.text) && <span className="muted small"> · {firstLine(block.text)}</span>}
          </span>
          {block.animation && <Film size={15} className="muted" aria-label="Contient une animation" />}
          <span className="block-summary-min">{block.minutes} min</span>
          <ChevronRight size={18} className="muted" />
        </button>
      )}
      {open && (
      <div className="block-head">
        <button type="button" className="icon-btn block-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Replier' : 'Déplier'} aria-expanded={open}>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <span className="block-index">{index + 1}</span>
        <div className="block-kind">
          <Select<BlockKind>
            value={block.kind}
            onChange={(v) => v && onChange({ kind: v })}
            options={BLOCK_KIND_ORDER.map((k) => ({ value: k, label: `${BLOCK_KINDS[k].icon} ${BLOCK_KINDS[k].label}` }))}
          />
        </div>
        <TextInput className="block-title" value={block.title} placeholder="Titre de la situation" onChange={(v) => onChange({ title: v })} />
        <div className="block-minutes">
          <NumberInput value={block.minutes} min={0} max={240} onChange={(v) => onChange({ minutes: v ?? 0 })} aria-label="Durée en minutes" />
          <span className="muted small">min</span>
        </div>
        {block.animation && !open && <Film size={16} className="muted" aria-label="Contient une animation" />}
        <div className="block-actions">
          <IconButton label="Monter" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp size={17} />
          </IconButton>
          <IconButton label="Descendre" onClick={() => onMove(1)} disabled={index === count - 1}>
            <ArrowDown size={17} />
          </IconButton>
          <Menu
            items={[
              { label: 'Dupliquer', icon: <Copy size={16} />, onClick: onDuplicate },
              { label: onCopyToNext?.label ?? '', icon: <CopyPlus size={16} />, hidden: !onCopyToNext, onClick: () => onCopyToNext?.run() },
              { label: 'Enregistrer dans la bibliothèque', icon: <BookmarkPlus size={16} />, onClick: onSaveToLibrary },
              { label: 'Supprimer ce bloc', icon: <Trash2 size={16} />, danger: true, onClick: onDelete },
            ]}
          />
        </div>
      </div>

      )}

      {open && (
        <div className="block-body">
          <MarkdownField
            value={block.text}
            minRows={8}
            placeholder={'Organisation, consignes, critères de réussite, variables…\n- une ligne par idée\n**gras** pour insister'}
            onChange={(v) => onChange({ text: v })}
          />
          <span className="field-label">🧰 Matériel du bloc</span>
          <MarkdownField
            value={block.materials}
            minRows={2}
            placeholder={'🧰 Matériel pour ce bloc, une ligne par objet\n- 12 plots (couloirs de passe)\n- 6 ballons (1 par groupe)'}
            onChange={(v) => onChange({ materials: v })}
          />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <SheetLinks sheets={block.sheets ?? []} cycleId={cycleId} custom={block.customSheets} lessonId={lesson?.id} blockId={block.id} />
            <select
              className="input"
              style={{ width: 'auto', maxWidth: 260 }}
              value=""
              aria-label="Ajouter une fiche à imprimer"
              onChange={(e) => e.target.value && onChange({ sheets: [...new Set([...(block.sheets ?? []), e.target.value])] })}
            >
              <option value="">+ Fiche à imprimer…</option>
              {/* Les fiches de l'activité d'abord : les autres restent accessibles en dessous. */}
              {sheetGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.fiches.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <AiBlockTools lesson={lesson} block={block} onChange={onChange} />
          <AnimationField
            value={block.animation}
            onChange={(a) => onChange({ animation: a })}
            defaultCourt={court}
            title={block.title || 'Animation'}
          />
        </div>
      )}
    </div>
  );
}

export function cloneBlockWithNewId(b: Block): Block {
  return { ...structuredClone(b), id: uid() };
}

export function BlockPreview({ block }: { block: Block }) {
  return block.text ? <Markdown text={block.text} /> : null;
}
