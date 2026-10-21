import type { Animation, Block, Exercise, Frame, ID, Token, TokenKind, TokenPos } from '../types';
import { useData } from './data';
import { newBlock, newExercise, newKlass, newSlot } from './model';
import { createCycleWithLessons, createYear } from './actions';
import { addDays, currentSchoolYearLabel, todayISO } from '../lib/dates';
import { publicHolidaysForSchoolYear } from '../lib/holidays';
import { deepClone, uid } from '../lib/util';
import { useUi } from './ui';

// ── Petits constructeurs d'animations ───────────────────────────────────────

const tok = (kind: TokenKind, label: string, color: string): Token => ({ id: uid(), kind, label, color, size: 1 });
const at = (x: number, y: number, extra: Partial<TokenPos> = {}): TokenPos => ({ x, y, ...extra });

function frame(pos: Array<[Token, TokenPos]>, caption: string, moveMs = 1100, holdMs = 600): Frame {
  const map: Record<ID, TokenPos> = {};
  for (const [t, p] of pos) map[t.id] = p;
  return { id: uid(), caption, holdMs, moveMs, pos: map, arrows: [] };
}

const BLUE = '#2563eb';
const RED = '#dc2626';
const BALL = '#f97316';

function volleyTriangle(): Animation {
  const a = tok('player', '1', BLUE);
  const b = tok('player', '2', BLUE);
  const c = tok('player', '3', BLUE);
  const ball = tok('ball', '', BALL);
  const base: Array<[Token, TokenPos]> = [
    [a, at(18, 50)],
    [b, at(42, 18)],
    [c, at(42, 82)],
  ];
  return {
    court: 'volley',
    tokens: [a, b, c, ball],
    frames: [
      frame([...base, [ball, at(0, 0, { carry: a.id, dx: 5, dy: 0 })]], 'Triangle de 3 joueurs. Le joueur 1 a le ballon.'),
      frame([...base, [ball, at(0, 0, { carry: b.id, dx: -5, dy: 0 })]], 'Passe haute vers le joueur 2 (doigts, regard sur le ballon).'),
      frame([...base, [ball, at(0, 0, { carry: c.id, dx: -5, dy: 0 })]], 'Le joueur 2 renvoie vers le joueur 3 : on joue en triangle.'),
      frame([...base, [ball, at(0, 0, { carry: a.id, dx: 5, dy: 0 })]], 'Le joueur 3 revient au joueur 1. On enchaîne 2 minutes sans faire tomber le ballon.'),
    ],
  };
}

function basket3v2(): Animation {
  const a1 = tok('player', '1', BLUE);
  const a2 = tok('player', '2', BLUE);
  const a3 = tok('player', '3', BLUE);
  const d1 = tok('player', '1', RED);
  const d2 = tok('player', '2', RED);
  const ball = tok('ball', '', BALL);
  const f0: Array<[Token, TokenPos]> = [
    [a1, at(88, 50)],
    [a2, at(78, 18)],
    [a3, at(78, 82)],
    [d1, at(52, 40)],
    [d2, at(52, 62)],
    [ball, at(0, 0, { carry: a1.id, dx: -4, dy: 0 })],
  ];
  const f1: Array<[Token, TokenPos]> = [
    [a1, at(68, 50)],
    [a2, at(55, 12)],
    [a3, at(55, 88)],
    [d1, at(40, 38)],
    [d2, at(40, 62)],
    [ball, at(0, 0, { carry: a1.id, dx: -4, dy: 0 })],
  ];
  const f2: Array<[Token, TokenPos]> = [
    [a1, at(60, 50)],
    [a2, at(34, 14)],
    [a3, at(42, 86)],
    [d1, at(30, 30)],
    [d2, at(32, 66)],
    [ball, at(0, 0, { carry: a2.id, dx: -3, dy: 0 })],
  ];
  const f3: Array<[Token, TokenPos]> = [
    [a1, at(52, 50)],
    [a2, at(18, 22)],
    [a3, at(40, 80)],
    [d1, at(26, 30)],
    [d2, at(28, 62)],
    [ball, at(8, 50)],
  ];
  return {
    court: 'basket-half',
    tokens: [a1, a2, a3, d1, d2, ball],
    frames: [
      frame(f0, '3 attaquants contre 2 défenseurs : le joueur 1 mène la montée de balle.'),
      frame(f1, 'Les ailiers 2 et 3 s’écartent pour étirer la défense.'),
      frame(f2, 'Passe à l’aile libre : la défense est en retard.'),
      frame(f3, 'Tir en course : 5 s maximum pour conclure.', 1000, 900),
    ],
  };
}

function badmintonRally(): Animation {
  const a = tok('player', 'A', BLUE);
  const b = tok('player', 'B', RED);
  const ball = tok('ball', '', '#ffffff');
  ball.size = 0.7;
  const pos = (ax: number, bx: number, bc: [Token, TokenPos]): Array<[Token, TokenPos]> => [[a, at(ax, 50)], [b, at(bx, 50)], bc];
  return {
    court: 'badminton',
    tokens: [a, b, ball],
    frames: [
      frame(pos(12, 88, [ball, at(0, 0, { carry: a.id, dx: 4, dy: -2 })]), 'A sert en diagonale.'),
      frame(pos(16, 84, [ball, at(0, 0, { carry: b.id, dx: -4, dy: 2 })]), 'B renvoie : l’objectif est de maintenir l’échange le plus longtemps possible.'),
      frame(pos(20, 80, [ball, at(0, 0, { carry: a.id, dx: 4, dy: -2 })]), 'A relance : on compte le nombre d’échanges consécutifs.'),
      frame(pos(12, 88, [ball, at(0, 0, { carry: b.id, dx: -4, dy: 2 })]), 'Chaque joueur revient au centre après sa frappe.'),
    ],
  };
}

function slalom(): Animation {
  const p = tok('player', '1', BLUE);
  const cones = [20, 35, 50, 65, 80].map((x) => ({ x, t: tok('cone', '', '#f97316') }));
  const base = cones.map<[Token, TokenPos]>((c) => [c.t, at(c.x, 50)]);
  const step = (x: number, y: number, cap: string, move = 700): Frame => frame([...base, [p, at(x, y)]], cap, move, 100);
  return {
    court: 'blank',
    tokens: [...cones.map((c) => c.t), p],
    frames: [
      step(6, 50, 'Départ derrière le premier plot.', 0),
      step(20, 30, 'On contourne chaque plot en alternant à gauche et à droite.'),
      step(35, 70, ''),
      step(50, 30, ''),
      step(65, 70, ''),
      step(80, 30, ''),
      step(94, 50, 'Arrivée : retour en marchant, puis le suivant part.', 800),
    ],
  };
}

function handTwoVsOne(): Animation {
  const a = tok('player', '1', BLUE);
  const b = tok('player', '2', BLUE);
  const d = tok('player', 'D', RED);
  const goal = tok('goal', '', '#ffffff');
  const ball = tok('ball', '', BALL);
  const g: [Token, TokenPos] = [goal, at(100, 50, { rot: 90 })];
  return {
    court: 'hand',
    tokens: [a, b, d, goal, ball],
    frames: [
      frame([[a, at(48, 62)], [b, at(48, 34)], [d, at(66, 50)], g, [ball, at(0, 0, { carry: a.id, dx: 3, dy: 0 })]], '2 attaquants contre 1 défenseur : 1 a le ballon.'),
      frame([[a, at(62, 66)], [b, at(62, 30)], [d, at(72, 54)], g, [ball, at(0, 0, { carry: b.id, dx: 3, dy: 0 })]], 'Passe vers 2, qui est démarqué : le défenseur doit choisir.'),
      frame([[a, at(76, 60)], [b, at(76, 28)], [d, at(80, 40)], g, [ball, at(0, 0, { carry: b.id, dx: 3, dy: 0 })]], '“Passe et va” : 1 se replace dans l’espace libre.'),
      frame([[a, at(84, 58)], [b, at(84, 30)], [d, at(86, 44)], g, [ball, at(97, 50)]], 'Tir au but dès que l’angle est ouvert.', 900, 900),
    ],
  };
}

// ── Données d'exemple ───────────────────────────────────────────────────────

function ex(title: string, activityId: string, kind: Exercise['kind'], minutes: number, text: string, animation: Animation | null, materials = ''): Exercise {
  return { ...newExercise(title), activityId, kind, minutes, text, animation, materials, tags: ['exemple'] };
}

const exerciseToBlock = (e: Exercise): Block => ({
  ...newBlock(e.kind, e.title, e.minutes),
  text: e.text,
  materials: e.materials,
  animation: e.animation ? deepClone(e.animation) : null,
});

export function loadSample(): void {
  const st = useData.getState();
  const label = currentSchoolYearLabel();
  const y0 = Number(label.slice(0, 4));
  const yearStart = `${y0}-09-01`;
  const yearEnd = `${y0 + 1}-07-03`;

  const existing = Object.values(st.data.years).find((y) => y.label === label);
  const yearId = existing?.id ?? createYear(label, yearStart, yearEnd);
  useUi.getState().setYear(yearId);
  if (!existing) {
    // Vacances « types » (à remplacer par l'import officiel dans les Réglages).
    st.transact((tx) => {
      const y = tx.get('years', yearId);
      if (!y) return;
      const hol = (label: string, start: string, end: string) => ({ id: uid(), label, start, end, kind: 'vacances' as const });
      tx.patch('years', yearId, {
        holidays: [
          hol('Vacances de la Toussaint', `${y0}-10-17`, `${y0}-11-01`),
          hol('Vacances de Noël', `${y0}-12-19`, `${y0 + 1}-01-03`),
          hol("Vacances d'hiver", `${y0 + 1}-02-13`, `${y0 + 1}-02-28`),
          hol('Vacances de printemps', `${y0 + 1}-04-10`, `${y0 + 1}-04-25`),
          ...publicHolidaysForSchoolYear(yearStart, yearEnd),
        ].sort((a, b) => a.start.localeCompare(b.start)),
      });
    });
  }

  // Bibliothèque de situations
  const exVolley = ex('Passes en triangle', 'volley', 'skill', 12, '## Organisation\nGroupes de 3 en triangle, un ballon par groupe.\n\n## Consignes\n- Passe haute, doigts souples\n- Se placer sous le ballon\n\n## Critères de réussite\n- 10 passes consécutives\n\n## Variables\n- Éloigner les joueurs\n- Alterner passe haute / manchette', volleyTriangle(), '1 ballon par groupe de 3');
  const exBasket = ex('3 contre 2 en transition', 'basket', 'game', 15, '## Organisation\n3 attaquants contre 2 défenseurs sur un demi-terrain. Après le tir, les 2 défenseurs deviennent attaquants avec le 3e joueur qui rentre.\n\n## Consignes\n- Écarter pour étirer la défense\n- Tir en moins de 5 secondes\n\n## Critère de réussite\n- Marquer ou obtenir un tir dégagé', basket3v2(), '2 ballons, chasubles');
  const exBad = ex("Échange en coopération", 'badminton', 'situation', 10, '## Organisation\nPar deux, de part et d’autre du filet.\n\n## But\nFaire durer l’échange le plus longtemps possible.\n\n## Critères de réussite\n- 8 échanges consécutifs\n\n## Variable\n- Jouer uniquement en dégagé', badmintonRally(), '1 raquette par élève, 1 volant par binôme');
  const exSlalom = ex('Slalom entre les plots', 'echauffement', 'warmup', 8, 'Parcours en slalom, **en trottinant** puis en augmentant la vitesse.\n- 2 passages en trottinant\n- 2 passages en pas chassés\n- 2 passages en vitesse', slalom(), '5 plots par atelier');
  const exHand = ex('Passe et va (2 contre 1)', 'hand', 'situation', 12, '## Organisation\nPar trois : 2 attaquants contre 1 défenseur, un gardien.\n\n## Consignes\n- Passer puis se replacer dans l’espace libre\n- Tirer dès que l’angle est ouvert\n\n## Variables\n- Défenseur passif puis actif', handTwoVsOne(), '1 ballon, 1 but');
  st.transact((tx) => {
    for (const e of [exVolley, exBasket, exBad, exSlalom, exHand]) tx.put('exercises', e);
  });

  // Classes
  const today = todayISO();
  const make = (name: string, level: string, students: number, slots: Array<[number, string, string, string]>) => {
    const k = newKlass(yearId, Object.values(useData.getState().data.classes).filter((c) => c.yearId === yearId).length, name, level);
    k.students = students;
    k.slots = slots.map(([d, s, e, p]) => newSlot(d, s, e, p));
    useData.getState().put('classes', k);
    return k;
  };
  const k6 = make('6e A', '6e', 27, [[2, '10:00', '12:00', 'Gymnase']]);
  const k5 = make('5e B', '5e', 25, [[1, '14:00', '16:00', 'Gymnase'], [4, '09:00', '10:00', 'Plateau extérieur']]);
  const k2 = make('2nde 3', '2nde', 30, [[3, '08:00', '10:00', 'Stade']]);

  const startFor = addDays(today, -10);
  const c6 = createCycleWithLessons(k6.id, { title: 'Badminton — jouer et gagner des points', activityId: 'badminton', startDate: startFor, count: 8 });
  const c5 = createCycleWithLessons(k5.id, { title: 'Volley-ball — construire l’attaque', activityId: 'volley', startDate: startFor, count: 8 });
  const c2 = createCycleWithLessons(k2.id, { title: 'Course en durée — se connaître pour s’entretenir', activityId: 'course-duree', startDate: startFor, count: 6 });

  // Contenu des deux premières séances de chaque cycle + objectifs
  const fill = (cycleId: ID, objectives: string, evaluation: string, firstBlocks: Block[][]) => {
    const s = useData.getState();
    s.patch('cycles', cycleId, { objectives, evaluation });
    const lessons = Object.values(s.data.lessons)
      .filter((l) => l.cycleId === cycleId)
      .sort((a, b) => a.order - b.order);
    firstBlocks.forEach((blocks, i) => {
      const l = lessons[i];
      if (!l) return;
      s.patch('lessons', l.id, {
        blocks,
        objective: i === 0 ? 'Découvrir l’activité et s’échauffer en sécurité.' : 'Gagner en précision sur les gestes de base.',
        materials: 'Chasubles, plots, ballons / volants selon les ateliers.',
        safety: 'Zones de jeu bien séparées, un seul ballon par groupe en circulation.',
      });
    });
    const done = lessons.filter((l) => l.date && l.date < todayISO());
    for (const l of done) s.patch('lessons', l.id, { status: 'done' });
  };
  const warm = () => exerciseToBlock(exSlalom);
  const cool = (): Block => ({ ...newBlock('cooldown', 'Retour au calme', 8), text: 'Étirements doux par binômes, **respiration** lente.\nBilan collectif : « Qu’est-ce que j’ai réussi aujourd’hui ? »' });
  fill(c6, 'Construire un échange et marquer un point en choisissant où placer le volant.', 'Tournoi en simple : points gagnés + choix de placement observé.', [
    [warm(), exerciseToBlock(exBad), { ...newBlock('game', 'Mini-matchs en simple', 30), text: 'Matchs de 3 minutes sur demi-terrain, rotation des adversaires.' }, cool()],
    [warm(), exerciseToBlock(exBad), cool()],
  ]);
  fill(c5, 'Passer de la manchette-passe à une attaque organisée à trois touches.', 'Match à 4 contre 4 : continuité du jeu et choix de l’attaque.', [
    [warm(), exerciseToBlock(exVolley), { ...newBlock('game', '4 contre 4', 30), text: 'Rotation à chaque service gagné. Arbitrage par les élèves.' }, cool()],
    [warm(), exerciseToBlock(exVolley), cool()],
  ]);
  fill(c2, 'Courir longtemps à une allure choisie et se connaître pour construire un projet de course.', 'Course de 20 minutes à allure régulière : estimation puis réalisation.', [
    [warm(), { ...newBlock('situation', 'Course à allure confortable', 20), text: 'Courir 3 × 6 minutes en pouvant parler.\n- Repérer sa fréquence cardiaque\n- Noter sa distance' }, cool()],
  ]);
}
