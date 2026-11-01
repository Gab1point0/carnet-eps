import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CopyPlus, Download, ExternalLink, FolderOpen, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { Activity, AppData, CourtId, Field as FieldT, SchoolYear, Venue } from '../types';
import { Button, Card, Field, IconButton, NumberInput, PageHeader, Section, Select, TagInput, Tabs, TextInput } from '../components/ui';
import { DateField } from '../components/forms';
import { DuplicateYearModal, HolidaysEditor, NewYearModal } from '../components/YearModals';
import { listBackups, readBackup, useData } from '../store/data';
import { useCurrentYear, useSettings, useYears } from '../store/selectors';
import { EMPTY_CONFIG, isConfigured, useSync } from '../store/sync';
import { loadSample } from '../store/sample';
import { normalizeData, serialize } from '../store/model';
import { mergeData } from '../lib/merge';
import { confirmDialog, toast, toastUndo, useUi, type Theme } from '../store/ui';
import { COURTS } from '../lib/defaults';
import { searchPlaces, type Place } from '../lib/weather';
import { AiSection } from '../components/AiSection';
import { uid } from '../lib/util';
import { plural } from '../lib/util';

export function SettingsPage() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  return (
    <>
      <PageHeader title="Réglages" subtitle="Années, vacances, activités, sauvegarde et synchronisation." />
      <ProfileSection />
      <AiSection />
      <YearsSection />
      <ListsSection />
      <VenuesSection />
      <ActivitiesSection />
      <AppearanceSection />
      <DataSection />
      <SyncSection />
      <AboutSection />
    </>
  );
}

// ── Profil ──────────────────────────────────────────────────────────────────

function ProfileSection() {
  const settings = useSettings();
  const patch = useData.getState().patchSettings;
  return (
    <Section title="Profil">
      <Card>
        <div className="grid grid-2">
          <Field label="Votre nom (affiché sur l'accueil)">
            <TextInput value={settings.teacher} onChange={(v) => patch({ teacher: v })} placeholder="Ex. M. Dupont" />
          </Field>
          <Field label="Durée habituelle d'une séance (min)">
            <NumberInput value={settings.defaultLessonMinutes} min={20} max={240} onChange={(v) => patch({ defaultLessonMinutes: v ?? 110 })} />
          </Field>
        </div>
        <WeatherField />
      </Card>
    </Section>
  );
}

/** Lieu des cours en plein air : sert aux alertes météo de l'accueil (2 jours à l'avance). */
function WeatherField() {
  const settings = useSettings();
  const patch = useData.getState().patchSettings;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await searchPlaces(q);
      setResults(r);
      if (r.length === 0) setError('Aucune commune trouvée.');
    } catch {
      setError('Recherche impossible : vérifiez votre connexion.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <Field label="Lieu des cours en plein air (alertes météo)">
        {settings.weather ? (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <strong>📍 {settings.weather.label}</strong>
            <Button size="sm" onClick={() => patch({ weather: null })}>
              Changer
            </Button>
          </div>
        ) : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <TextInput value={q} onChange={setQ} placeholder="Commune ou code postal" />
              <Button size="sm" onClick={search} disabled={busy || q.trim().length < 2}>
                Chercher
              </Button>
            </div>
            {error && <p className="error-text small">{error}</p>}
            {results.map((p) => (
              <div key={`${p.lat},${p.lon}`} style={{ marginTop: 6 }}>
                <Button
                  size="sm"
                  onClick={() => {
                    patch({ weather: p });
                    setResults([]);
                    toast(`Météo : ${p.label}`, { tone: 'success' });
                  }}
                >
                  📍 {p.label}
                </Button>
              </div>
            ))}
          </>
        )}
      </Field>
      <p className="muted small">Avec un lieu, l'accueil vous prévient 2 jours avant si de la pluie, un orage, du vent, de la chaleur ou du gel est annoncé pendant une séance de plein air.</p>
    </div>
  );
}

// ── Années scolaires ───────────────────────────────────────────────────────

function YearsSection() {
  const years = useYears();
  const current = useCurrentYear();
  const setYear = useUi((s) => s.setYear);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<SchoolYear | null>(null);

  return (
    <Section
      title="Années scolaires & vacances"
      actions={
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
          Nouvelle année
        </Button>
      }
    >
      {years.length === 0 ? (
        <Card>
          <p className="muted">Aucune année scolaire pour le moment.</p>
        </Card>
      ) : (
        <Card className="stack-lg">
          <Tabs value={current?.id ?? ''} onChange={(v) => setYear(v)} tabs={years.map((y) => ({ id: y.id, label: y.label }))} />
          {current && <YearEditor key={current.id} year={current} onDuplicate={() => setDuplicating(current)} />}
        </Card>
      )}
      {creating && <NewYearModal onClose={() => setCreating(false)} />}
      {duplicating && <DuplicateYearModal from={duplicating} onClose={() => setDuplicating(null)} />}
    </Section>
  );
}

function YearEditor({ year, onDuplicate }: { year: SchoolYear; onDuplicate: () => void }) {
  const patch = (p: Partial<SchoolYear>) => useData.getState().patch('years', year.id, p);
  const data = useData((s) => s.data);
  const classCount = Object.values(data.classes).filter((k) => k.yearId === year.id).length;
  return (
    <div className="stack-lg">
      <div className="grid grid-2">
        <Field label="Intitulé">
          <TextInput value={year.label} onChange={(v) => patch({ label: v })} />
        </Field>
        <div className="grid grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Rentrée">
            <DateField value={year.start} onChange={(v) => v && patch({ start: v })} />
          </Field>
          <Field label="Fin des cours">
            <DateField value={year.end} onChange={(v) => v && patch({ end: v })} />
          </Field>
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: 10 }}>Vacances et jours fériés</h3>
        <HolidaysEditor year={year} />
      </div>
      <div className="row">
        <Button size="sm" icon={<CopyPlus size={15} />} onClick={onDuplicate}>
          Reporter sur une nouvelle année
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 size={15} />}
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Supprimer l'année ${year.label} ?`,
              message: `${plural(classCount, 'classe')} avec leurs cycles et séances seront supprimés. Vous pourrez annuler juste après.`,
              confirmLabel: 'Supprimer l’année',
              danger: true,
            });
            if (!ok) return;
            const undo = useData.getState().remove('years', year.id);
            useUi.getState().setYear(null);
            toast(`Année ${year.label} supprimée`, { action: { label: 'Annuler', run: undo }, ms: 8000 });
          }}
        >
          Supprimer cette année
        </Button>
      </div>
    </div>
  );
}

// ── Niveaux & lieux ─────────────────────────────────────────────────────────

function ListsSection() {
  const settings = useSettings();
  const patch = useData.getState().patchSettings;
  return (
    <Section title="Niveaux et lieux">
      <Card>
        <div className="grid grid-2">
          <Field label="Niveaux proposés">
            <TagInput value={settings.levels} onChange={(levels) => patch({ levels })} />
          </Field>
          <Field label="Lieux proposés dans l'emploi du temps">
            <TagInput value={settings.places} onChange={(places) => patch({ places })} />
          </Field>
        </div>
      </Card>
    </Section>
  );
}

// ── Champs d'apprentissage & activités ─────────────────────────────────────

function VenuesSection() {
  const settings = useSettings();
  const patch = useData.getState().patchSettings;
  const setVenue = (id: string, p: Partial<Venue>) => patch({ venues: settings.venues.map((v) => (v.id === id ? { ...v, ...p } : v)) });
  const remove = (v: Venue) => {
    const before = settings.venues;
    patch({ venues: before.filter((x) => x.id !== v.id) });
    toastUndo(`Lieu « ${v.name} » supprimé`, () => patch({ venues: before }));
  };

  return (
    <Section title="Lieux des séances">
      <Card className="stack">
        <p className="muted small">Chaque séance peut indiquer son lieu : le trajet (compté à l'aller et au retour) et le vestiaire sont retirés du temps disponible. Laissez une case vide si vous ne connaissez pas encore la durée.</p>
        {settings.venues.map((v) => (
          <div key={v.id} className="venue-row">
            <Field label="Nom">
              <TextInput value={v.name} onChange={(name) => setVenue(v.id, { name })} />
            </Field>
            <Field label="Trajet (min)">
              <NumberInput min={0} value={v.travelMinutes} onChange={(travelMinutes) => setVenue(v.id, { travelMinutes })} />
            </Field>
            <Field label="Vestiaire (min)">
              <NumberInput min={0} value={v.lockerMinutes} onChange={(lockerMinutes) => setVenue(v.id, { lockerMinutes })} />
            </Field>
            <IconButton label={`Supprimer ${v.name}`} onClick={() => remove(v)}>
              <Trash2 size={17} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button size="sm" icon={<Plus size={15} />} onClick={() => patch({ venues: [...settings.venues, { id: uid(), name: 'Nouveau lieu', travelMinutes: null, lockerMinutes: null }] })}>
            Ajouter un lieu
          </Button>
        </div>
      </Card>
    </Section>
  );
}

function ActivitiesSection() {
  const settings = useSettings();
  const patch = useData.getState().patchSettings;
  const [open, setOpen] = useState(false);

  const setField = (id: string, p: Partial<FieldT>) => patch({ fields: settings.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const setAct = (id: string, p: Partial<Activity>) => patch({ activities: settings.activities.map((a) => (a.id === id ? { ...a, ...p } : a)) });

  return (
    <Section
      title="Activités (APSA) et champs d'apprentissage"
      actions={
        <Button size="sm" onClick={() => setOpen(!open)}>
          {open ? 'Replier' : `Modifier (${settings.activities.length} activités)`}
        </Button>
      }
    >
      {open && (
        <Card className="stack-lg">
          <div className="stack">
            <h3>Champs d'apprentissage</h3>
            {settings.fields.map((f) => (
              <div key={f.id} className="act-row">
                <input type="color" value={f.color} onChange={(e) => setField(f.id, { color: e.target.value })} aria-label="Couleur" className="color-input" />
                <TextInput value={f.short} onChange={(v) => setField(f.id, { short: v })} style={{ maxWidth: 80 }} aria-label="Abréviation" />
                <TextInput value={f.label} onChange={(v) => setField(f.id, { label: v })} aria-label="Intitulé" />
              </div>
            ))}
          </div>
          <div className="stack">
            <h3>Activités</h3>
            {settings.activities.map((a) => (
              <div key={a.id} className="act-row act-row-wide">
                <TextInput value={a.emoji} onChange={(v) => setAct(a.id, { emoji: v })} style={{ maxWidth: 64, textAlign: 'center' }} aria-label="Icône" />
                <TextInput value={a.name} onChange={(v) => setAct(a.id, { name: v })} aria-label="Nom" />
                <Select<string>
                  value={a.fieldId}
                  onChange={(v) => v && setAct(a.id, { fieldId: v })}
                  options={settings.fields.map((f) => ({ value: f.id, label: f.short }))}
                />
                <Select<CourtId>
                  value={a.court}
                  onChange={(v) => v && setAct(a.id, { court: v })}
                  options={COURTS.map((c) => ({ value: c.id, label: c.label }))}
                />
                <IconButton label={`Supprimer ${a.name}`} onClick={() => patch({ activities: settings.activities.filter((x) => x.id !== a.id) })}>
                  <Trash2 size={17} />
                </IconButton>
              </div>
            ))}
            <div>
              <Button
                size="sm"
                icon={<Plus size={15} />}
                onClick={() => patch({ activities: [...settings.activities, { id: uid(), name: 'Nouvelle activité', fieldId: settings.fields[0]?.id ?? 'ca1', emoji: '🏅', court: 'blank' }] })}
              >
                Ajouter une activité
              </Button>
            </div>
          </div>
        </Card>
      )}
    </Section>
  );
}

// ── Apparence ───────────────────────────────────────────────────────────────

function AppearanceSection() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <Section title="Apparence">
      <Card>
        <Field label="Thème (propre à cet appareil)">
          <Tabs<Theme>
            value={theme}
            onChange={setTheme}
            tabs={[
              { id: 'auto', label: 'Automatique' },
              { id: 'light', label: 'Clair' },
              { id: 'dark', label: 'Sombre' },
            ]}
          />
        </Field>
      </Card>
    </Section>
  );
}

// ── Données : export, import, sauvegardes ──────────────────────────────────

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backups, setBackups] = useState<Array<{ key: string; date: string }>>([]);

  useEffect(() => {
    void listBackups().then(setBackups);
  }, []);

  const importFile = async (file: File) => {
    let incoming: AppData;
    try {
      incoming = normalizeData(JSON.parse(await file.text()));
    } catch {
      toast("Ce fichier n'est pas une sauvegarde valide.", { tone: 'error' });
      return;
    }
    const count = Object.keys(incoming.classes).length + Object.keys(incoming.lessons).length + Object.keys(incoming.exercises).length;
    const merge = await confirmDialog({
      title: 'Importer cette sauvegarde',
      message: `Le fichier contient ${plural(Object.keys(incoming.classes).length, 'classe')}, ${plural(Object.keys(incoming.lessons).length, 'séance')} et ${plural(Object.keys(incoming.exercises).length, 'situation')} (${count} éléments). « Fusionner » conserve aussi vos données actuelles (la version la plus récente de chaque élément l'emporte).`,
      confirmLabel: 'Fusionner',
    });
    if (!merge) {
      const replace = await confirmDialog({
        title: 'Remplacer toutes les données ?',
        message: 'Les données actuelles seront remplacées par celles du fichier. Une copie de secours du jour reste disponible.',
        confirmLabel: 'Remplacer',
        danger: true,
      });
      if (!replace) return;
      useData.getState().applyData(incoming, { local: true });
      toast('Données remplacées', { tone: 'success' });
      return;
    }
    useData.getState().applyData(mergeData(useData.getState().data, incoming), { local: true });
    toast('Sauvegarde fusionnée', { tone: 'success' });
  };

  return (
    <Section title="Données et sauvegardes">
      <Card className="stack-lg">
        <div className="row">
          <Button
            icon={<Download size={17} />}
            onClick={() => {
              download(`carnet-eps-${new Date().toISOString().slice(0, 10)}.json`, serialize(useData.getState().data));
              toast('Sauvegarde téléchargée', { tone: 'success' });
            }}
          >
            Télécharger une sauvegarde
          </Button>
          <Button icon={<Upload size={17} />} onClick={() => fileRef.current?.click()}>
            Importer une sauvegarde
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
          <Button
            icon={<FolderOpen size={17} />}
            onClick={async () => {
              if (Object.keys(useData.getState().data.years).length) {
                toast('Un exemple ne se charge que sur un carnet vide ou en plus de vos données : les éléments existants ne sont pas modifiés.', { ms: 5000 });
              }
              loadSample();
              toast('Données d’exemple ajoutées', { tone: 'success' });
            }}
          >
            Ajouter des données d'exemple
          </Button>
        </div>
        <p className="muted small">
          Vos données sont enregistrées dans ce navigateur et sauvegardées automatiquement chaque jour (7 jours conservés). Pour les retrouver sur un autre appareil, activez la synchronisation GitHub ci-dessous.
        </p>
        {backups.length > 0 && (
          <div className="stack">
            <h3>Copies de secours automatiques</h3>
            <div className="row">
              {backups.map((b) => (
                <Button
                  key={b.key}
                  size="sm"
                  onClick={async () => {
                    const d = await readBackup(b.key);
                    if (!d) return;
                    const ok = await confirmDialog({
                      title: `Restaurer la copie du ${b.date} ?`,
                      message: 'Elle sera fusionnée avec vos données actuelles : les éléments supprimés depuis réapparaîtront seulement s’ils sont plus récents que leur suppression.',
                      confirmLabel: 'Restaurer (fusion)',
                    });
                    if (!ok) return;
                    // On annule les suppressions postérieures en repartant d'une fusion sans pierres tombales de la copie.
                    const current = useData.getState().data;
                    const merged = mergeData(current, { ...d, deleted: {} });
                    const revived: AppData = { ...merged, deleted: { ...merged.deleted } };
                    for (const col of ['years', 'classes', 'cycles', 'lessons', 'exercises'] as const) {
                      for (const id of Object.keys(d[col])) delete revived.deleted[id];
                    }
                    const now = Date.now();
                    for (const col of ['years', 'classes', 'cycles', 'lessons', 'exercises'] as const) {
                      const dest = revived[col] as Record<string, { updatedAt: number }>;
                      const src = d[col] as Record<string, { updatedAt: number }>;
                      for (const id of Object.keys(src)) if (!dest[id]) dest[id] = { ...src[id], updatedAt: now };
                    }
                    useData.getState().applyData(revived, { local: true });
                    toast('Copie restaurée', { tone: 'success' });
                  }}
                >
                  {b.date}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 size={15} />}
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Tout effacer ?',
                message: 'Toutes les données de ce carnet seront supprimées (et sur GitHub à la prochaine synchronisation). Téléchargez une sauvegarde avant si vous avez un doute.',
                confirmLabel: 'Tout effacer',
                danger: true,
              });
              if (ok) {
                useData.getState().reset();
                useUi.getState().setYear(null);
                toast('Carnet vidé');
              }
            }}
          >
            Tout effacer
          </Button>
        </div>
      </Card>
    </Section>
  );
}

// ── Synchronisation GitHub ─────────────────────────────────────────────────

function SyncSection() {
  const { config, status, error, lastSync, setConfig, syncNow } = useSync();
  const [draft, setDraft] = useState(config);
  const [showToken, setShowToken] = useState(false);
  const configured = isConfigured(config);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <Section title="Synchronisation GitHub (PC ↔ téléphone)">
      <div id="sync" />
      <Card className="stack-lg">
        <p className="muted">
          Le carnet est enregistré dans <strong>un fichier JSON d'un dépôt GitHub privé</strong> à vous. Chaque appareil le lit et le met à jour : vos modifications sur le PC arrivent sur le téléphone (et inversement), et les modifications faites par Claude dans ce fichier apparaissent aussi.
        </p>
        <div className="callout">
          <strong>Mise en place (une fois) :</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            <li>Sur GitHub, créez un dépôt <strong>privé</strong> (ex. <code>carnet-eps-donnees</code>).</li>
            <li>
              Créez un <em>fine-grained personal access token</em> limité à ce seul dépôt, avec la permission <strong>Contents : Read and write</strong>{' '}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                (créer un jeton <ExternalLink size={12} style={{ verticalAlign: '-1px' }} />)
              </a>
              .
            </li>
            <li>Saisissez ci-dessous votre nom d'utilisateur, le dépôt et le jeton, sur chaque appareil.</li>
          </ol>
        </div>
        <div className="grid grid-2">
          <Field label="Compte GitHub (propriétaire)">
            <TextInput value={draft.owner} onChange={(v) => patch({ owner: v.trim() })} placeholder="mon-compte" autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label="Dépôt de données">
            <TextInput value={draft.repo} onChange={(v) => patch({ repo: v.trim() })} placeholder="carnet-eps-donnees" autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label="Fichier">
            <TextInput value={draft.path} onChange={(v) => patch({ path: v.trim() })} />
          </Field>
          <Field label="Branche">
            <TextInput value={draft.branch} onChange={(v) => patch({ branch: v.trim() })} />
          </Field>
        </div>
        <Field label="Jeton d'accès (stocké uniquement sur cet appareil)">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <TextInput
              type={showToken ? 'text' : 'password'}
              value={draft.token}
              onChange={(v) => patch({ token: v.trim() })}
              placeholder="github_pat_…"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <Button size="sm" onClick={() => setShowToken(!showToken)}>
              {showToken ? 'Masquer' : 'Afficher'}
            </Button>
          </div>
        </Field>
        <div className="row">
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => {
              setConfig(draft);
              toast('Réglages enregistrés', { tone: 'success' });
              setTimeout(() => void useSync.getState().syncNow(), 50);
            }}
          >
            Enregistrer et synchroniser
          </Button>
          {configured && (
            <Button icon={<RefreshCw size={16} className={status === 'syncing' ? 'spin' : undefined} />} onClick={() => void syncNow()} disabled={status === 'syncing'}>
              Synchroniser maintenant
            </Button>
          )}
          {configured && (
            <Button
              variant="ghost"
              onClick={() => {
                setConfig({ ...EMPTY_CONFIG });
                setDraft({ ...EMPTY_CONFIG });
                toast('Synchronisation désactivée sur cet appareil');
              }}
            >
              Déconnecter cet appareil
            </Button>
          )}
        </div>
        {configured && (
          <p className={status === 'error' ? 'error-text' : 'muted small'}>
            {status === 'error'
              ? `❌ ${error}`
              : status === 'syncing'
                ? 'Synchronisation en cours…'
                : lastSync
                  ? `✅ Dernière synchronisation à ${new Date(lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Pas encore synchronisé depuis l’ouverture.'}
          </p>
        )}
      </Card>
    </Section>
  );
}

// ── À propos ────────────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <Section title="Installer l'application">
      <Card className="stack">
        <p>
          <strong>Sur téléphone :</strong> ouvrez le site dans Chrome ou Safari, puis « Ajouter à l'écran d'accueil ». L'app s'ouvre alors en plein écran et fonctionne <strong>même sans réseau</strong> dans le gymnase.
        </p>
        <p>
          <strong>Sur ordinateur :</strong> dans Chrome ou Edge, cliquez sur l'icône « Installer » de la barre d'adresse.
        </p>
        <p className="muted small">Carnet EPS · données stockées localement dans votre navigateur · synchronisation facultative via votre propre dépôt GitHub.</p>
      </Card>
    </Section>
  );
}
