import type { AppData, Cycle, ISODate, Klass, Lesson } from '../types';
import { cycleLessons, sortCycles } from '../store/selectors';
import { pendingProposals } from '../components/ProposalsPanel';
import { prepState } from '../pages/Preparation';
import { EVAL_KINDS } from './levels';
import { diffDays } from './dates';

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
export function tasksFor(data: AppData, l: Lesson, today: ISODate): Task[] {
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
    auto(`ed:${prev.id}`, `Saisir l'évaluation ${k} sur École Directe`, { detail: `« ${prev.title || 'Séance'} » (${prev.date ?? ''})`, to: `/lessons/${prev.id}` });
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
  if (cycle && OUTDOOR.test(cycle.title) && daysTo >= 0 && daysTo <= 2) auto('meteo', 'Regarder la météo et prévoir un plan B (salle ou gymnase)');

  // Tâches ajoutées à la main.
  for (const t of l.todos) out.push({ id: t.id, lessonId: l.id, text: t.text, manual: true, done: t.done, to: `/lessons/${l.id}` });
  return out;
}

/**
 * Tâches à faire avant les prochaines séances : les 2 prochaines de chaque classe (dans les 14 jours).
 * `lessons` : séances de l'année, déjà triées par date.
 */
export function taskGroups(data: AppData, lessons: Lesson[], today: ISODate): TaskGroup[] {
  const perClass = new Map<string, number>();
  const groups: TaskGroup[] = [];
  for (const l of lessons) {
    if (!l.classId || !l.date || l.date < today || l.status !== 'planned') continue;
    if (diffDays(today, l.date) > 14) continue;
    const n = perClass.get(l.classId) ?? 0;
    if (n >= 2) continue;
    perClass.set(l.classId, n + 1);
    const tasks = tasksFor(data, l, today);
    if (tasks.length) groups.push({ lesson: l, klass: data.classes[l.classId], tasks });
  }
  return groups;
}
