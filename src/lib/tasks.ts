import type { AppData, Cycle, ISODate, Klass, Lesson } from '../types';
import { cycleLessons, sortCycles } from '../store/selectors';
import { pendingProposals } from '../components/ProposalsPanel';
import { prepState } from '../pages/Preparation';
import { EVAL_KINDS } from './levels';
import { FICHE_BY_ID } from './fiches';
import { diffDays, formatShort } from './dates';
import { risksFor, type Hour } from './weather';

export interface Task {
  /** `auto:<clé>` pour une tâche calculée, identifiant de la tâche pour une tâche ajoutée à la main. */
  id: string;
  lessonId: string;
  text: string;
  detail?: string;
  /** Page à ouvrir (la séance, les fiches…). */
  to?: string;
  manual: boolean;
  done: boolean;
}

export interface TaskGroup {
  lesson: Lesson;
  klass?: Klass;
  tasks: Task[];
}

/** Séance qui précède `l` : la précédente du cycle, ou la dernière du cycle précédent de la classe. */
export function previousLesson(data: AppData, l: Lesson): Lesson | undefined {
  if (!l.cycleId) return undefined;
  const mine = cycleLessons(data, l.cycleId).filter((x) => x.status !== 'cancelled');
  const idx = mine.findIndex((x) => x.id === l.id);
  if (idx > 0) return mine[idx - 1];
  const cycle = data.cycles[l.cycleId];
  if (!cycle?.classId) return undefined;
  const shares = (c: Cycle) => !c.slotIds.length || !cycle.slotIds.length || c.slotIds.some((s) => cycle.slotIds.includes(s));
  const before = sortCycles(Object.values(data.cycles).filter((c) => c.classId === cycle.classId && c.id !== cycle.id && shares(c) && (c.startDate ?? '') < (cycle.startDate ?? '9999')));
  const last = before[before.length - 1];
  if (!last) return undefined;
  return cycleLessons(data, last.id).filter((x) => x.status !== 'cancelled').pop();
}

const OUTDOOR = /demi-fond|baseball|biathlon|orientation|athl[ée]|course/i;
const FACILITY: Array<[RegExp, string]> = [
  [/natation/i, 'Vérifier la réservation du bassin, le taux d\'encadrement et les maillots / autorisations.'],
  [/escalade/i, 'Vérifier l\'accès à la SAE, les baudriers et les cordes, et la présence du 2e adulte si nécessaire.'],
];

/** Tâches à faire avant la séance `l` : calculées d'après l'état du cycle, plus celles ajoutées à la main. */
export interface WeatherEnv {
  /** Lieu des cours renseigné dans les réglages. */
  place: boolean;
  /** Prévisions heure par heure ; `null` si indisponibles. */
  forecast: Hour[] | null;
}

export function tasksFor(data: AppData, l: Lesson, today: ISODate, weather: WeatherEnv = { place: false, forecast: null }): Task[] {
  const out: Task[] = [];
  const cycle = l.cycleId ? data.cycles[l.cycleId] : undefined;
  const lessons = l.cycleId ? cycleLessons(data, l.cycleId) : [];
  const prev = previousLesson(data, l);
  const daysTo = l.date ? diffDays(today, l.date) : 99;
  const auto = (key: string, text: string, extra: Partial<Task> = {}) =>
    out.push({ id: `auto:${key}`, lessonId: l.id, text, manual: false, done: l.tasksDone.includes(`auto:${key}`), to: `/lessons/${l.id}`, ...extra });

  // Séance précédente passée sans bilan.
  if (prev && prev.date && prev.date <= today && prev.status !== 'cancelled' && !prev.bilan.trim() && prev.rating === null) {
    auto(`bilan:${prev.id}`, `Faire le bilan de « ${prev.title || 'la séance précédente'} »`, { detail: 'Une minute à l\'oral suffit : les ajustements seront proposés pour cette séance.', to: `/lessons/${prev.id}` });
  }
  // Évaluation passée : saisie dans École Directe, niveau relevé.
  if (prev?.evalKind && prev.status === 'done') {
    const k = EVAL_KINDS[prev.evalKind].label.toLowerCase();
    // Une évaluation diagnostique n'est jamais notée : rien à saisir sur École Directe.
    if (prev.evalKind !== 'diagnostic') auto(`ed:${prev.id}`, `Saisir l'évaluation ${k} sur École Directe`, { detail: `« ${prev.title || 'Séance'} » (${prev.date ?? ''})`, to: `/lessons/${prev.id}` });
    if (!prev.levels) auto(`levels:${prev.id}`, `Relever le niveau de la classe (évaluation ${k})`, { detail: 'Ouvrez le bilan et dictez les effectifs par degré.', to: `/lessons/${prev.id}` });
  }
  // Propositions d'ajustement en attente.
  const pending = pendingProposals(lessons, l).list.length;
  if (pending > 0) auto('proposals', `Accepter ou refuser ${pending} proposition${pending > 1 ? 's' : ''} d'ajustement`);
  // Préparation.
  const prep = prepState(l);
  if (prep !== 'ready') auto('prepare', prep === 'empty' ? 'Préparer la séance (aucun bloc pour l\'instant)' : 'Compléter la séance (objectif ou blocs manquants)');
  // Début de cycle : groupes, installations, fiches.
  // Les groupes ne sont proposés que si l'organisation du cycle est prévue (cycles repris en cours : déjà constitués).
  const org = /^👥 Effectif[^:]*: (.+)$/m.exec(l.safety)?.[1];
  if (cycle && l.order === 0) {
    if (org) auto('groups', 'Constituer les groupes', { detail: org.slice(0, 220) });
    const fac = FACILITY.find(([re]) => re.test(cycle.title));
    if (fac) auto('facility', fac[1]);
  }
  // Fiches à imprimer.
  if (cycle && ((l.order === 0 && org) || l.evalKind === 'summative' || l.evalKind === 'diagnostic')) {
    const what = l.evalKind === 'summative' ? 'les grilles d\'évaluation' : l.order === 0 ? 'les fiches élèves (contrat, observation)' : 'la fiche d\'observation';
    auto('print', `Imprimer ${what}`, { to: `/cycles/${cycle.id}/fiches` });
  }
  // Séance juste avant l'évaluation finale.
  const summative = lessons.find((x) => x.evalKind === 'summative');
  if (summative && summative.order - l.order === 1) auto('announce', 'Annoncer l\'évaluation de la prochaine séance : critères, tenue, ordre de passage');
  // Météo pour les activités de plein air, dans les 2 jours.
  if (cycle && OUTDOOR.test(cycle.title) && l.date && daysTo >= 0 && daysTo <= 2) {
    if (weather.forecast) {
      // Prévisions connues : on n'alerte que si quelque chose de gênant est annoncé pendant la séance.
      const risks = risksFor(weather.forecast, l.date, l.start, l.end);
      if (risks.length) {
        const icon = risks[0].kind === 'rain' ? '☔' : risks[0].kind === 'storm' ? '⛈' : risks[0].kind === 'snow' ? '❄' : risks[0].kind === 'wind' ? '💨' : risks[0].kind === 'heat' ? '🥵' : '🥶';
        auto('meteo', `${icon} ${formatShort(l.date)} ${l.start}–${l.end} : ${risks.map((r) => r.text).join(', ')}`, { detail: 'Prévoir un plan B (gymnase, salle) ou adapter la séance.' });
      }
    } else {
      auto('meteo', 'Regarder la météo et prévoir un plan B (salle ou gymnase)', {
        detail: weather.place ? 'Prévisions indisponibles pour le moment.' : 'Renseignez le lieu des cours dans Réglages pour être prévenu automatiquement.',
      });
    }
  }

  // Fiches à imprimer pour cette séance (d'après les blocs), avec le nombre d'exemplaires pour la classe.
  const n = l.classId ? data.classes[l.classId]?.students ?? null : null;
  const seen = new Set<string>();
  l.blocks.forEach((b, i) => {
    for (const sid of b.sheets ?? []) {
      const def = FICHE_BY_ID.get(sid);
      if (!def || seen.has(sid)) continue;
      seen.add(sid);
      const copies = ficheCopies(sid, def.who, n);
      const q = new URLSearchParams({ ...(cycle ? { cycle: cycle.id } : {}), ...(copies ? { copies: String(copies) } : {}) }).toString();
      auto(`sheet:${sid}`, `Imprimer ${copies ? `${copies} × ` : ''}« ${def.title} »`, {
        detail: `Bloc ${i + 1} : ${b.title}${def.size === 'half' ? ' · 2 fiches par page A4' : ''}`,
        to: `/fiches/${sid}${q ? `?${q}` : ''}`,
      });
    }
  });

  l.blocks.forEach((b, i) => {
    for (const s of b.customSheets ?? []) {
      const copies = ficheCopies(s.id, s.who, n);
      auto(`sheet:${s.id}`, `Imprimer ${copies ? `${copies} × ` : ''}« ${s.title} »`, {
        detail: `Bloc ${i + 1} : ${b.title} · fiche sur mesure${s.size === 'half' ? ' · 2 fiches par page A4' : ''}`,
        to: `/fiches/custom?lesson=${l.id}&block=${b.id}&sheet=${s.id}${copies ? `&copies=${copies}` : ''}`,
      });
    }
  });

  // Tâches ajoutées à la main.
  for (const t of l.todos) out.push({ id: t.id, lessonId: l.id, text: t.text, manual: true, done: t.done, to: `/lessons/${l.id}` });
  return out;
}

/** Nombre d'exemplaires à imprimer : un par élève, un par observateur (la moitié de la classe), un par groupe… */
function ficheCopies(id: string, who: string, n: number | null): number | null {
  if (!n) return null;
  if (id === 'releve-niveau') return 1;
  if (id === 'grille-evaluation' || who === 'élève') return n;
  if (who === 'observateur') return Math.ceil(n / 2);
  if (who === 'groupe') return Math.max(1, Math.round(n / 4));
  return 1;
}

/** Fenêtre des tâches : les séances des 10 prochains jours (3 par classe au plus). */
export const TASK_WINDOW_DAYS = 10;

/**
 * Tâches à faire avant les prochaines séances (10 prochains jours), fiches à imprimer comprises.
 * `lessons` : séances de l'année, déjà triées par date.
 */
export function taskGroups(data: AppData, lessons: Lesson[], today: ISODate, weather?: WeatherEnv): TaskGroup[] {
  const perClass = new Map<string, number>();
  const groups: TaskGroup[] = [];
  for (const l of lessons) {
    if (!l.classId || !l.date || l.date < today || l.status !== 'planned') continue;
    if (diffDays(today, l.date) > TASK_WINDOW_DAYS) continue;
    const n = perClass.get(l.classId) ?? 0;
    if (n >= 3) continue;
    perClass.set(l.classId, n + 1);
    const tasks = tasksFor(data, l, today, weather);
    if (tasks.length) groups.push({ lesson: l, klass: data.classes[l.classId], tasks });
  }
  return groups;
}
