import { useState } from 'react';
import { CalendarDays, Download, Plus, Trash2 } from 'lucide-react';
import type { Holiday, SchoolYear } from '../types';
import { Button, Field, IconButton, Modal, Select, TextInput } from './ui';
import { DateField } from './forms';
import { createYear, duplicateYear } from '../store/actions';
import { useData } from '../store/data';
import { toast, useUi } from '../store/ui';
import { currentSchoolYearLabel, formatDM, shiftYear } from '../lib/dates';
import { fetchOfficialCalendar, publicHolidaysForSchoolYear } from '../lib/holidays';
import { uid } from '../lib/util';

type Zone = 'A' | 'B' | 'C' | '';

/** Propose les dates d'une année scolaire à partir de son libellé « 2026-2027 ». */
export function defaultYearDates(label: string): { start: string; end: string } {
  const y = Number(label.slice(0, 4)) || new Date().getFullYear();
  return { start: `${y}-09-01`, end: `${y + 1}-07-03` };
}

export function nextYearLabel(label: string): string {
  const y = Number(label.slice(0, 4));
  return y ? `${y + 1}-${y + 2}` : currentSchoolYearLabel();
}

/** Création d'une année scolaire vierge. */
export function NewYearModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const initialLabel = currentSchoolYearLabel();
  const [label, setLabel] = useState(initialLabel);
  const [zone, setZone] = useState<Zone>('');
  const [dates, setDates] = useState(defaultYearDates(initialLabel));
  const [busy, setBusy] = useState(false);
  const setYear = useUi((s) => s.setYear);

  const create = async () => {
    setBusy(true);
    const id = createYear(label.trim() || initialLabel, dates.start, dates.end, zone || null);
    if (zone) {
      try {
        const cal = await fetchOfficialCalendar(label.trim(), zone);
        useData.getState().transact((tx) => {
          const y = tx.get('years', id);
          if (!y) return;
          const fixed = y.holidays.filter((h) => h.kind === 'ferie');
          tx.patch('years', id, {
            holidays: [...cal.holidays, ...fixed].sort((a, b) => a.start.localeCompare(b.start)),
            start: cal.rentree ?? y.start,
            end: cal.fin ?? y.end,
          });
        });
        toast('Vacances scolaires officielles importées', { tone: 'success' });
      } catch {
        toast('Calendrier officiel indisponible : vous pourrez saisir les vacances à la main dans les Réglages.', { tone: 'error', ms: 6000 });
      }
    }
    setYear(id);
    onCreated?.(id);
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title="Nouvelle année scolaire"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            Créer l'année
          </Button>
        </>
      }
    >
      <Field label="Année scolaire">
        <TextInput
          value={label}
          onChange={(v) => {
            setLabel(v);
            if (/^\d{4}-\d{4}$/.test(v)) setDates(defaultYearDates(v));
          }}
          placeholder="2026-2027"
        />
      </Field>
      <div className="grid grid-2">
        <Field label="Rentrée">
          <DateField value={dates.start} onChange={(v) => v && setDates({ ...dates, start: v })} />
        </Field>
        <Field label="Fin des cours">
          <DateField value={dates.end} onChange={(v) => v && setDates({ ...dates, end: v })} />
        </Field>
      </div>
      <Field label="Zone académique (pour importer les vacances officielles)" hint="Nécessite une connexion Internet. Vous pourrez toujours modifier les dates ensuite.">
        <Select<Zone>
          value={zone}
          onChange={(v) => setZone(v as Zone)}
          options={[
            { value: 'A', label: 'Zone A' },
            { value: 'B', label: 'Zone B' },
            { value: 'C', label: 'Zone C' },
          ]}
          placeholder="Ne pas importer (saisie manuelle)"
        />
      </Field>
    </Modal>
  );
}

/** Reporte une année : copie des classes, cycles et séances vers l'année suivante. */
export function DuplicateYearModal({ from, onClose }: { from: SchoolYear; onClose: () => void }) {
  const initialLabel = nextYearLabel(from.label);
  const [label, setLabel] = useState(initialLabel);
  const [dates, setDates] = useState({ start: shiftYear(from.start, 1), end: shiftYear(from.end, 1) });
  const [zone, setZone] = useState<Zone>(from.zone ?? '');
  const [keepDates, setKeepDates] = useState(true);
  const [withLessons, setWithLessons] = useState(true);
  const [busy, setBusy] = useState(false);
  const setYear = useUi((s) => s.setYear);

  const run = async () => {
    setBusy(true);
    const id = duplicateYear(from.id, { label, start: dates.start, end: dates.end, zone: zone || null, keepDates, withLessons });
    if (zone) {
      try {
        const cal = await fetchOfficialCalendar(label, zone);
        useData.getState().transact((tx) => {
          const y = tx.get('years', id);
          if (!y) return;
          const fixed = y.holidays.filter((h) => h.kind === 'ferie');
          tx.patch('years', id, { holidays: [...cal.holidays, ...fixed].sort((a, b) => a.start.localeCompare(b.start)) });
        });
      } catch {
        toast('Calendrier officiel indisponible : ajoutez les vacances dans les Réglages.', { tone: 'error', ms: 6000 });
      }
    }
    setYear(id);
    toast(`Année ${label} préparée à partir de ${from.label}`, { tone: 'success' });
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title={`Reporter ${from.label} sur une nouvelle année`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={run} disabled={busy || !label.trim()}>
            Créer la nouvelle année
          </Button>
        </>
      }
    >
      <p className="muted">
        Les classes, cycles et séances sont <strong>copiés</strong> : l'année {from.label} reste intacte et vous gardez tout le contenu pédagogique à retoucher.
      </p>
      <Field label="Nouvelle année scolaire">
        <TextInput value={label} onChange={setLabel} />
      </Field>
      <div className="grid grid-2">
        <Field label="Rentrée">
          <DateField value={dates.start} onChange={(v) => v && setDates({ ...dates, start: v })} />
        </Field>
        <Field label="Fin des cours">
          <DateField value={dates.end} onChange={(v) => v && setDates({ ...dates, end: v })} />
        </Field>
      </div>
      <Field label="Zone académique (importe les vacances officielles)">
        <Select<Zone>
          value={zone}
          onChange={(v) => setZone(v as Zone)}
          options={[
            { value: 'A', label: 'Zone A' },
            { value: 'B', label: 'Zone B' },
            { value: 'C', label: 'Zone C' },
          ]}
          placeholder="Saisie manuelle"
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={withLessons} onChange={(e) => setWithLessons(e.target.checked)} />
        Copier aussi le contenu des séances (sinon : classes et cycles seulement)
      </label>
      <label className="check">
        <input type="checkbox" checked={keepDates} onChange={(e) => setKeepDates(e.target.checked)} />
        Décaler les dates d'un an (mêmes jours de semaine) ; sinon elles sont effacées
      </label>
    </Modal>
  );
}

/** Édition des vacances et jours fériés d'une année. */
export function HolidaysEditor({ year }: { year: SchoolYear }) {
  const [busy, setBusy] = useState(false);
  const [zone, setZone] = useState<Zone>(year.zone ?? '');
  const patchYear = (p: Partial<SchoolYear>) => useData.getState().patch('years', year.id, p);
  const patchHoliday = (id: string, p: Partial<Holiday>) =>
    patchYear({ holidays: year.holidays.map((h) => (h.id === id ? { ...h, ...p } : h)) });

  const importOfficial = async () => {
    if (!zone) return;
    setBusy(true);
    try {
      const cal = await fetchOfficialCalendar(year.label, zone);
      const fixed = year.holidays.filter((h) => h.kind === 'ferie');
      patchYear({
        zone,
        holidays: [...cal.holidays, ...fixed].sort((a, b) => a.start.localeCompare(b.start)),
        ...(cal.rentree ? { start: cal.rentree } : {}),
        ...(cal.fin ? { end: cal.fin } : {}),
      });
      toast(`${cal.holidays.length} périodes de vacances importées (zone ${zone})`, { tone: 'success' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import impossible', { tone: 'error' });
    }
    setBusy(false);
  };

  const sorted = [...year.holidays].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="stack">
      <div className="row">
        <div style={{ minWidth: 160 }}>
          <Select<Zone>
            value={zone}
            onChange={(v) => setZone(v as Zone)}
            options={[
              { value: 'A', label: 'Zone A' },
              { value: 'B', label: 'Zone B' },
              { value: 'C', label: 'Zone C' },
            ]}
            placeholder="Zone…"
          />
        </div>
        <Button size="sm" icon={<Download size={15} />} disabled={!zone || busy} onClick={importOfficial}>
          Importer les vacances officielles
        </Button>
        <Button
          size="sm"
          icon={<CalendarDays size={15} />}
          onClick={() => {
            const fixed = publicHolidaysForSchoolYear(year.start, year.end);
            const others = year.holidays.filter((h) => h.kind !== 'ferie');
            patchYear({ holidays: [...others, ...fixed].sort((a, b) => a.start.localeCompare(b.start)) });
            toast('Jours fériés recalculés', { tone: 'success' });
          }}
        >
          Recalculer les jours fériés
        </Button>
      </div>
      {sorted.length === 0 && <p className="muted small">Aucune période : les séances seront datées sans tenir compte des vacances.</p>}
      <div className="holiday-list">
        {sorted.map((h) => (
          <div key={h.id} className="holiday-row">
            <TextInput value={h.label} onChange={(v) => patchHoliday(h.id, { label: v })} aria-label="Intitulé" />
            <DateField value={h.start} onChange={(v) => v && patchHoliday(h.id, { start: v, end: h.end < v ? v : h.end })} />
            <DateField value={h.end} min={h.start} onChange={(v) => v && patchHoliday(h.id, { end: v })} />
            <IconButton label={`Supprimer ${h.label}`} onClick={() => patchYear({ holidays: year.holidays.filter((x) => x.id !== h.id) })}>
              <Trash2 size={17} />
            </IconButton>
          </div>
        ))}
      </div>
      <div>
        <Button
          size="sm"
          icon={<Plus size={15} />}
          onClick={() =>
            patchYear({
              holidays: [...year.holidays, { id: uid(), label: 'Congé', start: year.start, end: year.start, kind: 'autre' }],
            })
          }
        >
          Ajouter une période (stage, sortie, pont…)
        </Button>
      </div>
      {sorted.length > 0 && (
        <p className="muted small">
          Prochaine coupure : {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const n = sorted.find((h) => h.end >= today && h.kind === 'vacances');
            return n ? `${n.label} (${formatDM(n.start)} → ${formatDM(n.end)})` : 'aucune';
          })()}
        </p>
      )}
    </div>
  );
}
