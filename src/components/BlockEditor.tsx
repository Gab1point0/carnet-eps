import { useState } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, ChevronDown, ChevronRight, Copy, Film, Trash2 } from 'lucide-react';
import type { Block, BlockKind, CourtId, ID } from '../types';
import { IconButton, Menu, NumberInput, Select, TextArea, TextInput } from './ui';
import { AnimationField } from './AnimationField';
import { Markdown } from './Markdown';
import { BLOCK_KINDS, BLOCK_KIND_ORDER } from '../lib/defaults';
import { cls, uid } from '../lib/util';

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
}) {
  const [open, setOpen] = useState(true);
  const kind = BLOCK_KINDS[block.kind];
  void activityId;

  return (
    <div className={cls('block', !open && 'block-closed')} style={{ ['--kind' as string]: kind.color }}>
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
              { label: 'Enregistrer dans la bibliothèque', icon: <BookmarkPlus size={16} />, onClick: onSaveToLibrary },
              { label: 'Supprimer ce bloc', icon: <Trash2 size={16} />, danger: true, onClick: onDelete },
            ]}
          />
        </div>
      </div>

      {open && (
        <div className="block-body">
          <TextArea
            value={block.text}
            minRows={4}
            placeholder={'Organisation, consignes, critères de réussite, variables…\n- une ligne par idée\n**gras** pour insister'}
            onChange={(v) => onChange({ text: v })}
          />
          <div className="grid grid-2">
            <TextInput value={block.materials} placeholder="Matériel pour ce bloc (ex. 12 plots, 6 ballons)" onChange={(v) => onChange({ materials: v })} />
          </div>
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
