import type { Block, Lesson } from '../types';
import { normalize } from './util';
import { EVAL_KINDS, highShare, latestMeasured, lowShare, total } from './levels';

/** Modification concrète qu'une proposition applique à la séance suivante. */
export type Change =
  | { type: 'minutes'; blockId: string; minutes: number }
  | { type: 'add-block'; at: number; kind: Block['kind']; title: string; minutes: number; text: string; takeFrom?: { blockId: string; minutes: number } }
  | { type: 'append'; field: 'objective' | 'materials' | 'safety'; text: string };

export interface Proposal {
  /** Stable pour un même bilan : sert à mémoriser « accepté » / « refusé ». */
  id: string;
  title: string;
  /** Pourquoi : ce que le bilan a dit, et le calcul éventuel. */
  why: string;
  changes: Change[];
}

type Theme = 'hetero' | 'time' | 'easy' | 'hard' | 'noise' | 'wait' | 'safety' | 'material' | 'absent';

/** Mots-clés (sans accents, en minuscules) → thème. Le bilan est dicté : on reste tolérant. */
const THEMES: Record<Theme, RegExp> = {
  time: /(manque de temps|pas (eu )?le temps|pas assez de temps|trop long|trop charge|pas fini|pas termine|pas pu (finir|terminer)|deborde|en retard|trop de choses|trop dense|couru|precipit)/,
  easy: /(trop facile|trop simple|facile pour|ennuy|maitris|acquis|s'ennuient|sans difficulte|reussi tres vite|a l'aise|pas assez difficile|manque de defi)/,
  hard: /(trop difficile|trop dur|trop complique|pas compris|perdus|incompris|n'ont pas su|n'arrivent pas|bloqu|echec|decroch|consigne.*(pas|trop)|pas acquis|pas maitris)/,
  noise: /(bruit|chahut|agite|dissipe|desordre|bavard|difficile a canaliser|pas ecout|indiscipline|tension|conflit|dispute)/,
  wait: /(attente|file d|files d|inactif|regardent|temps mort|peu d'activite|peu actifs|trop d'eleves|trop nombreux|attendent)/,
  safety: /(blessure|blesse|chute|danger|accident|glissant|mal au|entorse|collision)/,
  material: /(manque de (materiel|ballon|plot|raquette|volant|chasuble|tapis|filet)|pas assez de (materiel|ballon|plot|raquette|volant|chasuble|tapis|filet)|materiel (insuffisant|casse|manquant))/,
  hetero: /(heterogene|ecart de niveau|ecarts de niveau|niveaux? (tres )?(differents|varies|disparates)|groupes? de niveau|disparite)/,
  absent: /(absent|dispense|inapte|sans tenue|oubli de tenue|pas de tenue|retard)/,
};

export function themesOf(text: string): Set<Theme> {
  const t = normalize(text);
  const out = new Set<Theme>();
  for (const k of Object.keys(THEMES) as Theme[]) if (THEMES[k].test(t)) out.add(k);
  return out;
}

const POSITIVE = /(tres bien|super|excellent|genial|parfait|top|reussi|ca a marche|bonne seance|motiv|investis)/;
const NEGATIVE = /(difficile|rate|decevant|catastroph|mauvais|pas bien|compliqu|problem|galere|chaotique|a revoir)/;

/** Ressenti deviné d'après ce qui a été dit (3 = très bien, 1 = à revoir), `null` si rien de net. */
export function sentimentOf(text: string): number | null {
  const t = normalize(text);
  const pos = POSITIVE.test(t);
  const neg = NEGATIVE.test(t);
  if (pos && !neg) return 3;
  if (neg && !pos) return 1;
  return null;
}

const sum = (blocks: Block[]) => blocks.reduce((a, b) => a + (b.minutes || 0), 0);
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const WORK: Block['kind'][] = ['situation', 'skill', 'game', 'evaluation'];

/** Le bloc de travail le plus long : celui qu'on raccourcit ou à qui on prend du temps. */
function longestWork(blocks: Block[]): Block | undefined {
  return blocks.filter((b) => WORK.includes(b.kind)).sort((a, b) => b.minutes - a.minutes)[0];
}

function minutesOf(l: Lesson): number {
  return l.start && l.end ? Math.max(0, toMin(l.end) - toMin(l.start)) : 0;
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Propose des modifications de la séance `next` d'après le bilan de la séance `prev`.
 * Règles simples et explicables ; l'enseignant accepte ou refuse chacune.
 */
export function proposalsFor(prev: Lesson, next: Lesson): Proposal[] {
  const text = prev.bilan.trim();
  const themes = themesOf(text);
  const out: Proposal[] = [];
  const tag = (k: string) => `${prev.id}:${k}`;
  const quote = text ? `Vous avez dit : « ${text.length > 160 ? text.slice(0, 157) + '…' : text} »` : '';
  const longest = longestWork(next.blocks);

  if (themes.has('time')) {
    const planned = minutesOf(next);
    const total = sum(next.blocks);
    if (longest && longest.minutes > 5) {
      // Retire 20 % du bloc le plus long (au moins 5 min) ; si la séance dépasse déjà, retire l'excédent.
      const over = planned > 0 && total > planned ? total - planned : 0;
      const cut = Math.min(longest.minutes - 5, Math.max(5, round5(longest.minutes * 0.2), over));
      out.push({
        id: tag('time'),
        title: `Raccourcir « ${longest.title || 'la situation principale'} » de ${cut} min`,
        why: `${quote} La séance précédente manquait de temps. Le bloc le plus long dure ${longest.minutes} min : on passe à ${longest.minutes - cut} min${over ? ` (la séance dépasse de ${over} min le créneau)` : ''}.`,
        changes: [{ type: 'minutes', blockId: longest.id, minutes: longest.minutes - cut }],
      });
    } else {
      out.push({
        id: tag('time-note'),
        title: 'Prévoir un déroulé plus léger',
        why: `${quote} La séance précédente manquait de temps.`,
        changes: [{ type: 'append', field: 'objective', text: '⏱ Déroulé à alléger : garder une seule situation principale, consignes courtes.' }],
      });
    }
  }

  if (themes.has('hard') || (prev.rating === 1 && !themes.has('easy') && !themes.has('noise') && !themes.has('time'))) {
    const first = next.blocks.findIndex((b) => WORK.includes(b.kind));
    const give = longest && longest.minutes > 10 ? { blockId: longest.id, minutes: 5 } : undefined;
    out.push({
      id: tag('hard'),
      title: 'Ajouter 5 min de rappel / démonstration avant la situation',
      why: `${quote || 'La séance précédente est notée « à revoir ».'} Un temps de reprise avec démonstration et consigne simplifiée évite de repartir sur des acquis fragiles${give ? `, pris sur « ${longest!.title || 'le bloc le plus long'} » (${longest!.minutes} → ${longest!.minutes - 5} min) pour garder la durée totale` : ''}.`,
      changes: [
        {
          type: 'add-block',
          at: Math.max(0, first),
          kind: 'skill',
          title: 'Rappel de la séance précédente',
          minutes: 5,
          text: 'Démonstration par un élève ou par moi, 2 critères de réussite seulement, puis départ de la situation simplifiée.',
          takeFrom: give,
        },
      ],
    });
  }

  if (themes.has('easy') || (prev.rating === 3 && !themes.has('hard') && !themes.has('time'))) {
    out.push({
      id: tag('easy'),
      title: 'Compliquer la situation (niveau suivant)',
      why: themes.has('easy')
        ? `${quote} Les élèves semblent à l'aise : on ajoute une variante plus exigeante pour garder du défi.`
        : 'La séance précédente est notée « très bien » : on peut monter d\'un cran.',
      changes: [{ type: 'append', field: 'objective', text: '⬆ Niveau supérieur : ajouter une contrainte (temps, espace réduit, opposition ou précision) dans la situation principale.' }],
    });
  }

  if (themes.has('noise')) {
    out.push({
      id: tag('noise'),
      title: 'Cadrer le début de séance',
      why: `${quote} Le groupe était agité : consignes courtes, rassemblement et signal d'arrêt à rappeler.`,
      changes: [{ type: 'append', field: 'safety', text: '🔔 Rappeler le signal d\'arrêt et les règles dès l\'entrée ; consignes en moins de 1 min ; démonstration plutôt qu\'explication.' }],
    });
  }

  if (themes.has('wait')) {
    out.push({
      id: tag('wait'),
      title: 'Réduire les temps d\'attente',
      why: `${quote} Trop d'élèves attendaient : groupes plus petits ou plus d'ateliers.`,
      changes: [{ type: 'append', field: 'safety', text: '🔁 Limiter les files : groupes de 4 maximum, un atelier de plus ou un rôle (observateur, arbitre) pour ceux qui attendent.' }],
    });
  }

  if (themes.has('safety')) {
    out.push({
      id: tag('safety'),
      title: 'Renforcer la sécurité',
      why: `${quote} Un incident ou un danger a été signalé.`,
      changes: [{ type: 'append', field: 'safety', text: '⚠ Point sécurité à reprendre en début de séance (incident de la séance précédente) : zones, distances, matériel vérifié.' }],
    });
  }

  if (themes.has('material')) {
    out.push({
      id: tag('material'),
      title: 'Prévoir plus de matériel',
      why: `${quote} Le matériel manquait.`,
      changes: [{ type: 'append', field: 'materials', text: '➕ Vérifier / compléter le matériel avant la séance (il en manquait la fois précédente).' }],
    });
  }

  if (themes.has('hetero') && !prev.levels) {
    out.push({
      id: tag('hetero-text'),
      title: 'Organiser des groupes de niveau',
      why: `${quote} La classe est hétérogène : une même situation en trois variantes (aide, standard, défi).`,
      changes: [{ type: 'append', field: 'safety', text: '👥 Groupes de niveau : situation aidée / standard / défi ; les élèves avancés peuvent tutorer. Groupes à ajuster à chaque séance.' }],
    });
  }

  if (themes.has('absent')) {
    out.push({
      id: tag('absent'),
      title: 'Prévoir un rôle pour les élèves dispensés',
      why: `${quote} Des élèves ne pratiquaient pas.`,
      changes: [{ type: 'append', field: 'safety', text: '🧑‍⚖️ Rôle pour les dispensés : arbitre, observateur avec la fiche d\'observation, chronométreur.' }],
    });
  }

  // Un bilan rédigé sans mot-clé reconnu : on le rappelle tout de même en tête de la séance suivante.
  if (text && out.length === 0 && prev.adjust) {
    out.push({
      id: tag('recall'),
      title: 'Garder la remarque du bilan sous les yeux',
      why: quote,
      changes: [{ type: 'append', field: 'objective', text: `📝 À retenir de la dernière séance : ${text}` }],
    });
  }

  return out;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Propositions pour `next` d'après le niveau de la classe relevé lors de la dernière évaluation
 * du cycle (diagnostique ou formative) : groupes de niveau, fondamentaux, défi, remédiation,
 * entraînement avant l'évaluation finale. Concerne les 3 séances qui suivent l'évaluation.
 */
export function levelProposals(cycleLessons: Lesson[], next: Lesson): Proposal[] {
  if (next.evalKind === 'summative' || next.evalKind === 'diagnostic') return [];
  const ref = latestMeasured(cycleLessons, next.order);
  if (!ref || !ref.levels) return [];
  const L = ref.levels;
  const T = total(L);
  const low = lowShare(L);
  const high = highShare(L);
  const kind = ref.evalKind ? EVAL_KINDS[ref.evalKind].label.toLowerCase() : 'précédente';
  const where = `évaluation ${kind} « ${ref.title || 'séance'} »`;
  const counts = `${L[0]} débutant${L[0] > 1 ? 's' : ''}, ${L[1]} en cours, ${L[2]} acquis, ${L[3]} avancé${L[3] > 1 ? 's' : ''} (sur ${T})`;
  const tag = (k: string) => `${ref.id}:lvl-${k}`;
  const out: Proposal[] = [];
  const longest = longestWork(next.blocks);
  const firstWork = Math.max(0, next.blocks.findIndex((b) => WORK.includes(b.kind)));
  const give = (m: number) => (longest && longest.minutes >= m + 10 ? { blockId: longest.id, minutes: m } : undefined);

  // Profil : seulement pour les séances qui suivent directement l'évaluation.
  const nearby = next.order - ref.order <= 3;

  if (nearby && T > 0) {
    if (low >= 0.35 && high >= 0.35) {
      const socle = L[0] + L[1];
      const appro = L[2] + L[3];
      out.push({
        id: tag('hetero'),
        title: 'Organiser des groupes de niveau',
        why: `${where} : ${counts}. La classe est hétérogène (${pct(low)} sans les bases, ${pct(high)} qui maîtrisent) : une même situation en trois variantes évite d'ennuyer les uns et de perdre les autres.`,
        changes: [
          { type: 'append', field: 'safety', text: `👥 Groupes de niveau (d'après l'évaluation ${kind}) : « socle » ≈ ${socle} élèves (situation aidée, critères réduits), « approfondissement » ≈ ${appro} élèves (situation standard puis défi). Les avancés peuvent tutorer. Groupes modifiables à chaque séance.` },
          { type: 'append', field: 'objective', text: '🎚 Prévoir 3 variantes de la situation principale : aide / standard / défi.' },
        ],
      });
    } else if (low >= 0.6) {
      out.push({
        id: tag('low'),
        title: 'Recentrer sur les fondamentaux',
        why: `${where} : ${counts}. ${pct(low)} de la classe n'a pas encore les bases : on consolide avant de complexifier.`,
        changes: [
          {
            type: 'add-block', at: firstWork, kind: 'skill', title: 'Reprise des fondamentaux', minutes: 10,
            text: 'Démonstration + 2 critères de réussite, travail en binômes ou petits groupes, situation simplifiée (espace réduit, sans opposition).',
            takeFrom: give(10),
          },
          { type: 'append', field: 'objective', text: `🎯 Priorité aux fondamentaux : ${pct(low)} des élèves n'ont pas encore acquis les bases.` },
        ],
      });
    } else if (high >= 0.6) {
      out.push({
        id: tag('high'),
        title: 'Monter le niveau d\'exigence',
        why: `${where} : ${counts}. ${pct(high)} de la classe maîtrise déjà l'essentiel : on peut aller plus vite vers des situations plus complexes.`,
        changes: [{ type: 'append', field: 'objective', text: `⬆ Classe plutôt à l'aise (${pct(high)} acquis ou avancés) : réduire le temps de rappel et ajouter une contrainte (opposition, vitesse, précision ou enchaînement).` }],
      });
    }
  }

  // Progression entre le diagnostic et l'évaluation formative.
  if (nearby && ref.evalKind === 'formative') {
    const diag = cycleLessons.filter((l) => l.evalKind === 'diagnostic' && l.levels && total(l.levels) > 0 && l.order < ref.order).sort((a, b) => b.order - a.order)[0];
    if (diag?.levels) {
      const delta = Math.round((high - highShare(diag.levels)) * 100);
      if (delta < 10) {
        out.push({
          id: tag('stagnation'),
          title: `Remédiation ciblée (progression de ${delta >= 0 ? '+' : ''}${delta} pts)`,
          why: `Entre le diagnostic (${pct(highShare(diag.levels))} acquis ou avancés) et l'évaluation formative (${pct(high)}), la progression est faible : les situations actuelles ne font peut-être pas progresser assez. 10 min ciblées sur le critère le moins réussi, avec un retour individuel.`,
          changes: [
            {
              type: 'add-block', at: firstWork, kind: 'skill', title: 'Remédiation ciblée', minutes: 10,
              text: 'Reprendre le critère le moins réussi à l\'évaluation formative : démonstration, 2 essais avec un camarade observateur, conseil ciblé.',
              takeFrom: give(10),
            },
          ],
        });
      } else if (delta >= 25) {
        out.push({
          id: tag('progress'),
          title: `Belle progression (+${delta} pts) : relever la difficulté`,
          why: `Les élèves qui maîtrisent sont passés de ${pct(highShare(diag.levels))} à ${pct(high)} depuis le diagnostic : vous pouvez augmenter l'exigence pour les prochaines séances.`,
          changes: [{ type: 'append', field: 'objective', text: `⬆ Progression nette depuis le diagnostic (+${delta} pts) : proposer des variantes plus exigeantes aux élèves acquis.` }],
        });
      }
    }
  }

  // Séance juste avant l'évaluation finale : s'entraîner dans les conditions de l'évaluation.
  const summative = cycleLessons.find((l) => l.evalKind === 'summative');
  if (summative && summative.order - next.order === 1 && ref.order < next.order) {
    out.push({
      id: tag('pre-summative'),
      title: 'S\'entraîner dans les conditions de l\'évaluation finale',
      why: `La séance suivante est l'évaluation sommative : 10 min en conditions réelles (mêmes règles, même durée, même espace) rassurent les élèves et permettent de corriger les derniers points.`,
      changes: [
        {
          type: 'add-block', at: Math.max(firstWork, next.blocks.length - 1), kind: 'evaluation', title: 'Essai dans les conditions de l\'évaluation', minutes: 10,
          text: 'Mêmes règles et même organisation que l\'évaluation finale, sans note. Chaque élève repère le critère à retravailler.',
          takeFrom: give(10),
        },
      ],
    });
  }

  return out;
}

/** Applique les changements d'une proposition à une séance et renvoie le correctif à enregistrer. */
export function applyChanges(lesson: Lesson, changes: Change[], newId: () => string): Partial<Lesson> {
  let blocks = lesson.blocks.map((b) => ({ ...b }));
  const text: Record<'objective' | 'materials' | 'safety', string> = { objective: lesson.objective, materials: lesson.materials, safety: lesson.safety };
  for (const c of changes) {
    if (c.type === 'minutes') {
      blocks = blocks.map((b) => (b.id === c.blockId ? { ...b, minutes: c.minutes } : b));
    } else if (c.type === 'add-block') {
      if (c.takeFrom) blocks = blocks.map((b) => (b.id === c.takeFrom!.blockId ? { ...b, minutes: Math.max(5, b.minutes - c.takeFrom!.minutes) } : b));
      const nb: Block = { id: newId(), kind: c.kind, title: c.title, minutes: c.minutes, text: c.text, materials: '', animation: null, sheets: [] };
      blocks.splice(Math.min(c.at, blocks.length), 0, nb);
    } else {
      text[c.field] = text[c.field].trim() ? `${text[c.field].trim()}\n${c.text}` : c.text;
    }
  }
  return { blocks, ...text };
}
