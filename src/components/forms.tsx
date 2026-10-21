import { Plus, Trash2 } from 'lucide-react';
import type { Slot, ID } from '../types';
import { Button, IconButton, Select, TextInput } from './ui';
import { useData } from '../store/data';
import { useSettings } from '../store/selectors';
import { newSlot } from '../store/model';
import { WEEKDAYS_LONG } from '../lib/dates';

export function DateField({ value, onChange, min, max, className }: { value: string | null; onChange: (v: string | null) => void; min?: string; max?: string; className?: string }) {
  return (
    <input
      className={`input ${className ?? ''}`}
      type="date"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="input" type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

/** Sélecteur d'activité (APSA) groupé par champ d'apprentissage. */
export function ActivitySelect({
  value,
  onChange,
  placeholder = '— Choisir une activité —',
}: {
  value: ID | null;
  onChange: (id: ID | null) => void;
  placeholder?: string;
}) {
  const settings = useSettings();
  const options = settings.activities.map((a) => {
    const f = settings.fields.find((x) => x.id === a.fieldId);
    return { value: a.id, label: `${a.emoji} ${a.name}`, group: f ? `${f.short} — ${f.label}` : 'Autres' };
  });
  return <Select<string> value={value ?? ''} onChange={(v) => onChange(v || null)} options={options} placeholder={placeholder} />;
}

export function slotLabel(s: Slot): string {
  const day = WEEKDAYS_LONG[s.weekday - 1] ?? '';
  return `${day[0]?.toUpperCase() ?? ''}${day.slice(1)} ${s.start}–${s.end}${s.place ? ` · ${s.place}` : ''}`;
}

/**
 * Choix des créneaux d'une classe qu'utilise un cycle.
 * `value` vide = tous les créneaux (comportement par défaut).
 */
export function SlotPicker({ slots, value, onChange }: { slots: Slot[]; value: ID[]; onChange: (ids: ID[]) => void }) {
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  const all = value.length === 0 || value.length >= sorted.length;
  const toggle = (id: ID) => {
    const current = all ? sorted.map((s) => s.id) : value;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // Tout décocher n'a pas de sens : on revient à « tous les créneaux ».
    onChange(next.length === 0 || next.length === sorted.length ? [] : next);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {sorted.map((s) => (
        <label key={s.id} className="check">
          <input type="checkbox" checked={all || value.includes(s.id)} onChange={() => toggle(s.id)} />
          {slotLabel(s)}
        </label>
      ))}
    </div>
  );
}

/** Édition de l'emploi du temps hebdomadaire d'une classe. */
export function SlotsEditor({ slots, onChange }: { slots: Slot[]; onChange: (s: Slot[]) => void }) {
  const places = useData((s) => s.data.settings.places);
  const patch = (id: ID, p: Partial<Slot>) => onChange(slots.map((s) => (s.id === id ? { ...s, ...p } : s)));
  return (
    <div className="stack">
      {slots.length === 0 && <p className="muted small">Aucun créneau pour l'instant.</p>}
      {slots.map((s) => (
        <div key={s.id} className="slot-row">
          <Select<string>
            value={String(s.weekday)}
            onChange={(v) => v && patch(s.id, { weekday: Number(v) })}
            options={WEEKDAYS_LONG.slice(0, 6).map((d, i) => ({ value: String(i + 1), label: d[0].toUpperCase() + d.slice(1) }))}
          />
          <input className="input" type="time" value={s.start} onChange={(e) => e.target.value && patch(s.id, { start: e.target.value })} aria-label="Début" />
          <input className="input" type="time" value={s.end} onChange={(e) => e.target.value && patch(s.id, { end: e.target.value })} aria-label="Fin" />
          <TextInput value={s.place} list="places-list" placeholder="Lieu" onChange={(v) => patch(s.id, { place: v })} />
          <IconButton label="Supprimer ce créneau" onClick={() => onChange(slots.filter((x) => x.id !== s.id))}>
            <Trash2 size={18} />
          </IconButton>
        </div>
      ))}
      <datalist id="places-list">
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div>
        <Button
          size="sm"
          icon={<Plus size={15} />}
          onClick={() => {
            const last = slots[slots.length - 1];
            onChange([...slots, newSlot(last ? last.weekday : 1, last?.start ?? '08:00', last?.end ?? '10:00', last?.place ?? '')]);
          }}
        >
          Ajouter un créneau
        </Button>
      </div>
    </div>
  );
}
