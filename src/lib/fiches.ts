// Bibliothèque de fiches imprimables. Chaque fiche est décrite par des sections (tableaux, cases à cocher,
// lignes à remplir) : la page `/fiches/:id` les met en forme pour l'impression. Aucun nom d'élève n'est stocké.
export type FicheSection =
  | { type: 'table'; title?: string; cols: string[]; rows: string[] | number; head?: string; tall?: boolean; cells?: string[][] }
  | { type: 'levels'; title?: string; items: string[]; levels?: string[] }
  | { type: 'checks'; title?: string; items: string[] }
  | { type: 'lines'; title?: string; n?: number }
  | { type: 'fields'; fields: string[] }
  | { type: 'text'; text: string };

export type LevelKey = '6e' | '5e' | '4e' | '3e' | '2nde' | '1re' | 'Tle';

export interface FicheCtx {
  /** Critères d'évaluation du cycle (champ « Évaluation »), s'il y en a. */
  criteria: string[];
  /** Niveau de la classe : adapte le vocabulaire, le nombre de critères et d'essais, les attendus. `undefined` = version générale. */
  level?: LevelKey;
}

export interface FicheDef {
  id: string;
  title: string;
  /** Activité ou « Toutes activités ». */
  group: string;
  who: 'élève' | 'observateur' | 'groupe' | 'enseignant';
  hint: string;
  /** `half` : 2 exemplaires par page A4. */
  size: 'full' | 'half';
  ident: string[];
  build: (ctx: FicheCtx) => FicheSection[];
}

const DEG4 = ['Débutant', 'En cours', 'Acquis', 'Avancé'];
const crit = (c: FicheCtx, fallback: string[]) => (c.criteria.length ? c.criteria : fallback);
const ESSAIS = ['Essai 1', 'Essai 2', 'Essai 3', 'Essai 4', 'Essai 5', 'Essai 6'];

const ID_ELEVE = ['Nom', 'Prénom', 'Classe', 'Date'];
const ID_OBS = ['Observateur', 'Joueur observé', 'Classe', 'Date'];
const ID_GROUPE = ['Groupe / équipe', 'Classe', 'Date'];
const ID_ENS = ['Classe', 'Date', 'Séance'];

export const FICHES: FicheDef[] = [
  // ── Toutes activités ────────────────────────────────────────────────────
  {
    id: 'releve-niveau', title: 'Relevé du niveau de la classe', group: 'Toutes activités', who: 'enseignant', size: 'full', ident: ID_ENS,
    hint: 'Pointer, pour chaque critère, combien d\'élèves sont à chaque degré (diagnostic, formative, finale). Dicter ensuite le total dans l\'application.',
    build: (c) => [
      { type: 'fields', fields: ['Évaluation (diagnostique / formative / finale)'] },
      { type: 'table', title: 'Effectifs par degré (un trait par élève)', head: 'Critère', cols: DEG4, rows: crit(c, ['Réalisation motrice', 'Choix et projet', 'Sécurité et rôles']), tall: true },
      { type: 'table', head: 'Total', cols: DEG4, rows: ['Nombre d\'élèves'] },
      { type: 'lines', title: 'Points à reprendre à la prochaine séance', n: 4 },
    ],
  },
  {
    id: 'contrat-individuel', title: 'Mon contrat', group: 'Toutes activités', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'L\'élève annonce ce qu\'il vise, puis compare avec ce qu\'il a réalisé.',
    build: (c) => [
      { type: 'table', head: 'Ce que je m\'engage à réaliser', cols: ['Mon objectif', 'Ce que j\'ai réalisé', 'Écart / validé ?'], rows: crit(c, ['Objectif 1', 'Objectif 2', 'Objectif 3']), tall: true },
      { type: 'lines', title: 'Ce qui m\'a aidé à réussir', n: 2 },
      { type: 'lines', title: 'Ce que je dois améliorer', n: 2 },
    ],
  },
  {
    id: 'observation-binome', title: 'J\'observe mon partenaire', group: 'Toutes activités', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'Un observateur coche, à chaque essai, si le critère est réussi (✔) ou non (✘).',
    build: (c) => [
      { type: 'table', head: 'Ce que j\'observe', cols: ESSAIS, rows: crit(c, ['Critère 1 : ……', 'Critère 2 : ……', 'Critère 3 : ……']) },
      { type: 'lines', title: 'Un conseil pour mon partenaire', n: 2 },
    ],
  },
  {
    id: 'grille-evaluation', title: 'Grille d\'évaluation', group: 'Toutes activités', who: 'enseignant', size: 'full', ident: ['Nom', 'Prénom', 'Classe', 'Date'],
    hint: 'Critères du cycle × 4 degrés de maîtrise, à remplir par l\'enseignant.',
    build: (c) => [
      { type: 'levels', items: crit(c, ['Réalisation motrice', 'Choix et projet', 'Sécurité et rôles']), levels: ['Objectifs non atteints', 'Partiellement atteints', 'Atteints', 'Dépassés'] },
      { type: 'fields', fields: ['Total / 20'] },
      { type: 'lines', title: 'Commentaire de l\'enseignant', n: 3 },
    ],
  },
  {
    id: 'rotations-roles', title: 'Rôles et rotations du groupe', group: 'Toutes activités', who: 'groupe', size: 'half', ident: ID_GROUPE,
    hint: 'Qui tient quel rôle à chaque rotation : le groupe note les prénoms et coche au fur et à mesure.',
    build: () => [
      { type: 'table', head: 'Rôle', cols: ['Rotation 1', 'Rotation 2', 'Rotation 3', 'Rotation 4'], rows: ['Pratiquant 1', 'Pratiquant 2', 'Observateur', 'Arbitre / juge', 'Secrétaire / chrono'], tall: true },
    ],
  },

  // ── Basket-ball ─────────────────────────────────────────────────────────
  {
    id: 'marque-basket', title: 'Feuille de marque (basket)', group: 'Basket-ball', who: 'groupe', size: 'half', ident: ['Équipe A', 'Équipe B', 'Terrain', 'Date'],
    hint: 'Table de marque : points par période et fautes sifflées. Tenue par le marqueur.',
    build: () => [
      { type: 'table', head: 'Période', cols: ['Points équipe A', 'Points équipe B'], rows: ['Période 1', 'Période 2', 'Période 3', 'Période 4'] },
      { type: 'table', head: 'Fautes sifflées (un trait chacune)', cols: ['Équipe A', 'Équipe B'], rows: ['Marcher', 'Reprise de dribble', 'Faute de contact', 'Sortie'] },
      { type: 'fields', fields: ['Score final', 'Arbitre', 'Marqueur'] },
    ],
  },
  {
    id: 'observation-basket', title: 'Observation d\'un joueur (basket)', group: 'Basket-ball', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'L\'observateur compte, match après match, passes, dribbles, tirs et fautes d\'un joueur.',
    build: () => [
      { type: 'table', head: 'Ce que je compte (un trait par action)', cols: ['Match 1', 'Match 2', 'Match 3'], rows: ['Passes réussies', 'Balles perdues', 'Dribbles', 'Tirs tentés', 'Tirs réussis', 'Tirs en zone favorable', 'Fautes (marcher, contact)'] },
      { type: 'lines', title: 'Ce que ce joueur peut améliorer', n: 2 },
    ],
  },
  {
    id: 'equipe-basket', title: 'Fiche d\'équipe (basket)', group: 'Basket-ball', who: 'groupe', size: 'half', ident: ['Équipe', 'Classe', 'Date'],
    hint: 'Composition de l\'équipe, rôles de jeu et d\'arbitrage, choix tactique annoncé avant le match.',
    build: () => [
      { type: 'table', head: 'Joueur', cols: ['Rôle offensif', 'Rôle défensif', 'Rôle social (arbitre / marqueur / observateur)'], rows: 4, tall: true },
      { type: 'checks', title: 'Notre choix de jeu', items: ['Jeu rapide', 'Attaque placée avec passe et va', 'Défense individuelle', 'Autre : ……'] },
      { type: 'lines', title: 'Notre engagement', n: 2 },
    ],
  },

  // ── Baseball ────────────────────────────────────────────────────────────
  {
    id: 'score-baseball', title: 'Feuille de score (baseball)', group: 'Baseball', who: 'groupe', size: 'half', ident: ['Équipe A', 'Équipe B', 'Diamant', 'Date'],
    hint: 'Points par manche et retraits. Tenue par l\'équipe qui arbitre et marque.',
    build: () => [
      { type: 'table', head: 'Manche', cols: ['Points A', 'Points B', 'Retraits (1 2 3)'], rows: ['Manche 1', 'Manche 2', 'Manche 3', 'Manche 4'] },
      { type: 'fields', fields: ['Score final', 'Arbitre', 'Scoreur'] },
    ],
  },
  {
    id: 'observation-baseball', title: 'Observation d\'une équipe (baseball)', group: 'Baseball', who: 'observateur', size: 'half', ident: ['Observateur', 'Équipe observée', 'Classe', 'Date'],
    hint: 'Compter frappes orientées, courses, relais et communication pendant une manche.',
    build: () => [
      { type: 'table', head: 'Ce que je compte', cols: ['Manche 1', 'Manche 2', 'Manche 3'], rows: ['Frappes dans une zone libre', 'Courses réussies (base atteinte)', 'Relais rapides (< 5 s)', 'Annonces « J\'ai ! »', 'Batte non posée (sécurité)'] },
      { type: 'lines', title: 'Ce que cette équipe doit améliorer', n: 2 },
    ],
  },
  {
    id: 'equipe-baseball', title: 'Fiche d\'équipe (baseball)', group: 'Baseball', who: 'groupe', size: 'half', ident: ['Équipe', 'Classe', 'Date'],
    hint: 'Ordre des batteurs et postes défensifs, rôles d\'arbitre et de scoreur.',
    build: () => [
      { type: 'table', head: 'Ordre de frappe', cols: ['Joueur', 'Poste défensif'], rows: ['1', '2', '3', '4', '5', '6', '7'] },
      { type: 'fields', fields: ['Arbitre de base', 'Scoreur', 'Capitaine'] },
    ],
  },

  // ── Tennis de table ─────────────────────────────────────────────────────
  {
    id: 'score-tt', title: 'Feuille de match (tennis de table)', group: 'Tennis de table', who: 'groupe', size: 'half', ident: ['Joueur A', 'Joueur B', 'Table', 'Date'],
    hint: 'Score des sets, tenu par l\'arbitre.',
    build: () => [
      { type: 'table', head: 'Set', cols: ['Points A', 'Points B', 'Vainqueur'], rows: ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5'] },
      { type: 'fields', fields: ['Vainqueur du match', 'Arbitre'] },
    ],
  },
  {
    id: 'observation-tt', title: 'Observation d\'un joueur (tennis de table)', group: 'Tennis de table', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'Points gagnants, fautes directes, variété et zones de jeu.',
    build: () => [
      { type: 'table', head: 'Ce que je compte', cols: ['Set 1', 'Set 2', 'Set 3'], rows: ['Points gagnants', 'Fautes directes', 'Services gagnants', 'Balles courtes', 'Balles longues', 'Point construit en 3 frappes'] },
      { type: 'lines', title: 'Conseil tactique', n: 2 },
    ],
  },
  {
    id: 'contrat-tt', title: 'Mon option tactique (tennis de table)', group: 'Tennis de table', who: 'élève', size: 'half', ident: ID_ELEVE,
    hint: 'L\'élève choisit et signe son option tactique pour la compétition.',
    build: () => [
      { type: 'checks', title: 'Mon option', items: ['Service court puis attaque', 'Alterner court / long', 'Jouer coupé / tendu pour casser le rythme', 'Autre : ……'] },
      { type: 'lines', title: 'Pourquoi ce choix ?', n: 2 },
      { type: 'fields', fields: ['Signature'] },
    ],
  },

  // ── Badminton ───────────────────────────────────────────────────────────
  {
    id: 'score-badminton', title: 'Feuille de match (badminton)', group: 'Badminton', who: 'groupe', size: 'half', ident: ['Joueur A', 'Joueur B', 'Terrain', 'Date'],
    hint: 'Score par set, tenu par l\'arbitre.',
    build: () => [
      { type: 'table', head: 'Set', cols: ['Points A', 'Points B', 'Vainqueur'], rows: ['Set 1', 'Set 2', 'Set 3'] },
      { type: 'fields', fields: ['Vainqueur du match', 'Arbitre'] },
    ],
  },
  {
    id: 'observation-badminton', title: 'Observation d\'un joueur (badminton)', group: 'Badminton', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'Points gagnants, fautes directes, zones jouées et variété des frappes.',
    build: () => [
      { type: 'table', head: 'Ce que je compte', cols: ['Match 1', 'Match 2'], rows: ['Points gagnants', 'Fautes directes', 'Dégagés hauts et longs', 'Amortis', 'Smashs', 'Services courts / longs'] },
      { type: 'table', head: 'Zones où il joue le volant', cols: ['Fond gauche', 'Fond droit', 'Filet gauche', 'Filet droit'], rows: ['Nombre de volants'] },
      { type: 'lines', title: 'Ce qu\'il pourrait changer', n: 2 },
    ],
  },
  {
    id: 'projet-jeu-badminton', title: 'Mon projet de jeu (badminton)', group: 'Badminton', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'Points forts, plan de jeu, choix de poule : à écrire avant la compétition.',
    build: () => [
      { type: 'lines', title: 'Mes points forts', n: 2 },
      { type: 'lines', title: 'Mon point faible à travailler', n: 2 },
      { type: 'lines', title: 'Mon plan de jeu (ce que je vais faire pour gagner le point)', n: 3 },
      { type: 'lines', title: 'Si mon plan ne marche pas (plan B)', n: 2 },
      { type: 'fields', fields: ['Poule choisie'] },
    ],
  },

  // ── Acrosport ───────────────────────────────────────────────────────────
  {
    id: 'composition-acro', title: 'Fiche de composition (acrosport)', group: 'Acrosport', who: 'groupe', size: 'full', ident: ID_GROUPE,
    hint: 'Les figures, les liaisons et les rôles de l\'enchaînement, dans l\'ordre de passage.',
    build: () => [
      { type: 'table', head: 'Étape', cols: ['Schéma / description', 'Porteur(s) · voltigeur · pareur', 'Durée'], rows: ['Entrée', 'Pyramide 1', 'Liaison 1', 'Pyramide 2', 'Liaison 2', 'Pyramide 3', 'Sortie et salut'], tall: true },
      { type: 'fields', fields: ['Musique', 'Durée totale'] },
    ],
  },
  {
    id: 'jugement-acro', title: 'Fiche de jugement (acrosport)', group: 'Acrosport', who: 'observateur', size: 'half', ident: ['Juge', 'Groupe jugé', 'Classe', 'Date'],
    hint: 'Les élèves-juges évaluent la stabilité, les liaisons, la sécurité et l\'expression.',
    build: () => [
      { type: 'levels', items: ['Pyramides tenues 3 s et alignées', 'Difficulté des figures', 'Qualité des liaisons', 'Expression et regard vers le public', 'Sécurité et parade'], levels: ['À revoir', 'Correct', 'Bien', 'Très bien'] },
      { type: 'lines', title: 'Un point fort / un conseil', n: 2 },
    ],
  },

  // ── Gymnastique ─────────────────────────────────────────────────────────
  {
    id: 'contrat-gym', title: 'Contrat d\'enchaînement (gymnastique)', group: 'Gymnastique', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'Les éléments choisis, leur famille et leur valeur (A, B, C), dans l\'ordre du passage.',
    build: () => [
      { type: 'table', head: 'N°', cols: ['Élément', 'Famille (rouler / se renverser / s\'équilibrer / sauter)', 'Valeur (A / B / C)', 'Liaison avec le suivant'], rows: ['1', '2', '3', '4', '5', '6'], tall: true },
      { type: 'fields', fields: ['Valeur totale de difficulté', 'Signature'] },
    ],
  },
  {
    id: 'jugement-gym', title: 'Fiche de jugement (gymnastique)', group: 'Gymnastique', who: 'observateur', size: 'half', ident: ['Juge', 'Gymnaste', 'Classe', 'Date'],
    hint: 'Pour chaque élément : réalisé ? qualité ? arrêts non prévus ? Deux élèves-juges par passage.',
    build: () => [
      { type: 'table', head: 'Élément', cols: ['Réalisé', 'Qualité (1 à 3)', 'Arrêt ou jambes fléchies'], rows: ['1', '2', '3', '4', '5', '6'] },
      { type: 'levels', items: ['Fluidité de l\'enchaînement', 'Tenue du corps (tension, alignement)'], levels: ['À revoir', 'Correct', 'Bien', 'Très bien'] },
    ],
  },
  {
    id: 'parade-gym', title: 'Aide-mémoire du pareur', group: 'Gymnastique', who: 'observateur', size: 'half', ident: ['Pareur', 'Gymnaste', 'Élément', 'Date'],
    hint: 'Les placements de parade, à vérifier avant chaque passage.',
    build: () => [
      { type: 'checks', title: 'Avant de commencer', items: ['Tapis bien placés, espace dégagé', 'Je sais où mettre mes mains (bassin, épaule, cheville)', 'Je préviens mon camarade : « prêt ? »'] },
      { type: 'checks', title: 'Pendant', items: ['Je suis actif, mains près du gymnaste', 'J\'accompagne sans porter', 'Je m\'arrête dès qu\'il y a doute'] },
    ],
  },

  // ── Step / Danse ────────────────────────────────────────────────────────
  {
    id: 'composition-step', title: 'Fiche de composition (step)', group: 'Step', who: 'groupe', size: 'full', ident: ID_GROUPE,
    hint: 'Les 4 blocs de 32 temps du groupe, écrits pas par pas.',
    build: () => [
      { type: 'table', head: 'Bloc (32 temps)', cols: ['Temps 1 à 8', 'Temps 9 à 16', 'Temps 17 à 24', 'Temps 25 à 32'], rows: ['Bloc 1', 'Bloc 2', 'Bloc 3', 'Bloc 4'], tall: true },
      { type: 'fields', fields: ['Entrée', 'Sortie', 'Musique'] },
    ],
  },
  {
    id: 'intention-danse', title: 'Fiche d\'intention (danse)', group: 'Danse', who: 'groupe', size: 'full', ident: ID_GROUPE,
    hint: 'Le thème, les verbes d\'action et la structure A / B / C, remis avant le passage.',
    build: () => [
      { type: 'fields', fields: ['Inducteur (thème)', 'Verbe 1', 'Verbe 2', 'Verbe 3'] },
      { type: 'table', head: 'Partie', cols: ['Ce que le spectateur verra', 'Énergie / niveau / espace'], rows: ['A — entrée', 'B — développement et rupture', 'C — fin'], tall: true },
      { type: 'lines', title: 'Notre intention en une phrase', n: 2 },
    ],
  },
  {
    id: 'spectateur-danse', title: 'Fiche du spectateur (danse, step)', group: 'Danse', who: 'observateur', size: 'half', ident: ['Spectateur', 'Groupe regardé', 'Classe', 'Date'],
    hint: 'Les spectateurs repèrent ce qui est réussi et donnent un conseil.',
    build: () => [
      { type: 'levels', items: ['Précision et synchronisation', 'Richesse des mouvements', 'Présence et regard', 'Intention comprise'], levels: ['À revoir', 'Correct', 'Bien', 'Très bien'] },
      { type: 'lines', title: 'Ce que j\'ai vu de plus fort / un conseil', n: 2 },
    ],
  },

  // ── Crossfit / Renforcement ─────────────────────────────────────────────
  {
    id: 'carnet-wod', title: 'Carnet de WOD', group: 'Crossfit', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'Format, exercices, variantes, charges et résultats de chaque série. Fréquence cardiaque et effort perçu.',
    build: () => [
      { type: 'fields', fields: ['Format (AMRAP / EMOM / For time)', 'Durée'] },
      { type: 'table', head: 'Exercice', cols: ['Répétitions', 'Variante / charge', 'Série 1', 'Série 2', 'Série 3'], rows: 4, tall: true },
      { type: 'table', head: 'Ressenti', cols: ['Avant', 'Après', 'Après 2 min de récupération'], rows: ['Fréquence cardiaque (ou pouls sur 10 s × 6)', 'Effort perçu (1 à 10)'] },
      { type: 'lines', title: 'Ce que je change la prochaine fois', n: 2 },
    ],
  },
  {
    id: 'validation-technique', title: 'Validation technique (observateur)', group: 'Crossfit', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'L\'observateur ne compte que les répétitions valides et coche la qualité de la posture.',
    build: () => [
      { type: 'table', head: 'Exercice', cols: ['Dos neutre', 'Amplitude complète', 'Alignement genoux / hanches', 'Répétitions valides'], rows: ['Air squat', 'Fente', 'Pompe', 'Gainage', 'Swing / charnière de hanche', 'Wall ball'] },
      { type: 'lines', title: 'Conseil donné à mon partenaire', n: 2 },
    ],
  },
  {
    id: 'carte-projet-renfo', title: 'Ma carte de projet (renforcement)', group: 'Renforcement musculaire', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'Mobile choisi, niveau retenu à chaque atelier et ressenti après la séance.',
    build: () => [
      { type: 'checks', title: 'Mon mobile', items: ['Gagner en tonicité', 'Gagner en force', 'Améliorer mon endurance musculaire', 'Me préparer à un autre sport'] },
      { type: 'table', head: 'Atelier', cols: ['Niveau (N1 / N2 / N3)', 'Répétitions ou durée', 'Ressenti (1 à 10)'], rows: ['Jambes', 'Poussée', 'Tirage', 'Gainage', 'Cardio-moteur'], tall: true },
      { type: 'lines', title: 'Mon bilan', n: 2 },
    ],
  },

  // ── Escalade ────────────────────────────────────────────────────────────
  {
    id: 'passeport-securite', title: 'Passeport sécurité (escalade)', group: 'Escalade', who: 'élève', size: 'half', ident: ID_ELEVE,
    hint: 'Validé par l\'enseignant : sans passeport, pas de grimpe ni d\'assurage.',
    build: () => [
      { type: 'checks', title: 'Je sais…', items: ['faire mon nœud d\'encordement (en 8) et vérifier celui de mon partenaire', 'installer le dispositif d\'assurage et le mousqueton à vis', 'assurer sans jamais lâcher le brin libre', 'faire l\'appel avec mon partenaire (« prêt ? — prêt ! »)', 'effectuer le partenaire-check (baudrier, nœud, assureur)'] },
      { type: 'fields', fields: ['Validé le', 'Visa de l\'enseignant'] },
    ],
  },
  {
    id: 'contrat-escalade', title: 'Mon contrat (escalade)', group: 'Escalade', who: 'élève', size: 'half', ident: ID_ELEVE,
    hint: 'Les deux voies annoncées avant l\'évaluation.',
    build: () => [
      { type: 'table', head: 'Voie', cols: ['Couleur / numéro', 'Cotation', 'Réussite (✔ / ✘)'], rows: ['Voie 1', 'Voie 2'], tall: true },
      { type: 'lines', title: 'Ma stratégie (zones de repos, passages clés)', n: 2 },
      { type: 'fields', fields: ['Signature'] },
    ],
  },
  {
    id: 'observation-escalade', title: 'Observation de cordée (escalade)', group: 'Escalade', who: 'observateur', size: 'half', ident: ['Observateur', 'Grimpeur', 'Classe', 'Date'],
    hint: 'L\'observateur remplit la grille : performance, maîtrise, assurage.',
    build: () => [
      { type: 'levels', items: ['Performance (voie réalisée)', 'Pieds précis et bras tendus', 'Utilisation des zones de repos', 'Mousquetonnage (si en tête)', 'Assurage : appel, mou, brin libre'], levels: ['À revoir', 'Correct', 'Bien', 'Très bien'] },
      { type: 'lines', title: 'Un conseil', n: 2 },
    ],
  },

  // ── Course / Demi-fond ──────────────────────────────────────────────────
  {
    id: 'contrat-course', title: 'Mon contrat de course', group: 'Demi-fond', who: 'élève', size: 'half', ident: ID_ELEVE,
    hint: 'Distance ou temps annoncé avant la course, puis réalisé, puis écart.',
    build: () => [
      { type: 'table', head: 'Course', cols: ['Annoncé (distance ou temps)', 'Réalisé', 'Écart'], rows: ['Course 1', 'Course 2', 'Course 3'], tall: true },
      { type: 'lines', title: 'Ce que j\'ai ressenti (respiration, jambes)', n: 2 },
    ],
  },
  {
    id: 'suivi-course', title: 'Suivi du coureur (plots ou tours)', group: 'Demi-fond', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'Le partenaire coche chaque plot (50 m) ou chaque tour passé et note le temps de passage.',
    build: () => [
      { type: 'table', head: 'Passage', cols: ['Temps', 'Plot atteint ? (✔ / avance / retard)'], rows: ['1', '2', '3', '4', '5', '6', '7', '8'] },
      { type: 'fields', fields: ['Distance totale', 'Régularité (écart entre le 1er et le dernier tour)'] },
    ],
  },
  {
    id: 'tableau-allures', title: 'Tableau d\'allures (temps au 100 m)', group: 'Demi-fond', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'Pour chaque VMA, le temps à viser aux 100 m à 80, 85 et 90 % : aucun calcul à faire pour l\'élève.',
    build: () => {
      const fmt = (sec: number) => `${Math.floor(sec / 60) ? `${Math.floor(sec / 60)} min ` : ''}${(sec % 60).toFixed(0).padStart(2, '0')} s`;
      const per100 = (vma: number, pct: number) => 100 / ((vma * pct) / 3.6);
      const rows: string[] = [];
      for (let v = 9; v <= 17; v += 0.5) rows.push(`${v.toString().replace('.', ',')} km/h`);
      return [
        { type: 'text', text: 'VMA estimée = distance du demi-Cooper (en mètres) ÷ 100. Exemple : 1 200 m en 6 min → VMA ≈ 12 km/h.' },
        { type: 'table', head: 'Ma VMA', cols: ['80 % (aisance)', '85 % (soutenue)', '90 % (très soutenue)'], rows, cells: rows.map((_, i) => [0.8, 0.85, 0.9].map((p) => fmt(per100(9 + i * 0.5, p)))) },
        { type: 'fields', fields: ['Ma VMA', 'Mes temps aux 100 m'] },
      ];
    },
  },

  // ── Natation ────────────────────────────────────────────────────────────
  {
    id: 'suivi-nage', title: 'Suivi de nage (longueurs et coups de bras)', group: 'Natation', who: 'observateur', size: 'half', ident: ID_OBS,
    hint: 'Le partenaire, au bord du bassin, note le temps ou les coups de bras de chaque longueur (feutre sur fiche plastifiée).',
    build: () => [
      { type: 'table', head: 'Longueur', cols: ['Temps de passage', 'Coups de bras'], rows: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
      { type: 'fields', fields: ['Total de longueurs', 'Distance annoncée'] },
    ],
  },
  {
    id: 'savoir-nager', title: 'Parcours savoir-nager', group: 'Natation', who: 'enseignant', size: 'half', ident: ID_ELEVE,
    hint: 'Entrée dans l\'eau, nage continue, immersion, surplace : à cocher pendant le parcours.',
    build: () => [
      { type: 'levels', items: ['Entrée dans l\'eau (saut ou chute contrôlée)', 'Nage continue sans reprise d\'appui', 'Immersion et passage sous une ligne', 'Surplace de 5 s sans appui'], levels: ['Non réalisé', 'Partiel', 'Réalisé', 'Réussi avec aisance'] },
      { type: 'fields', fields: ['Distance nagée', 'Temps'] },
    ],
  },

  // ── Biathlon ────────────────────────────────────────────────────────────
  {
    id: 'penalites-biathlon', title: 'Fiche de pénalités (biathlon)', group: 'Biathlon', who: 'observateur', size: 'half', ident: ['Juge de lancer', 'Concurrent', 'Classe', 'Date'],
    hint: 'Course de 250 m → 3 lancers de vortex → course de 250 m… Le juge note les lancers manqués ; le chronométreur note le temps.',
    build: () => [
      { type: 'table', head: 'Passage', cols: ['Temps de course', 'Lancers manqués (sur 3)', 'Pénalité'], rows: ['Passage 1', 'Passage 2', 'Passage 3'] },
      { type: 'fields', fields: ['Temps total', 'Total des pénalités', 'Score final (temps + pénalités)'] },
    ],
  },

  // ── Combiné athlétique ──────────────────────────────────────────────────
  {
    id: 'cotation-combine', title: 'Fiche de cotation (combiné athlétique)', group: 'Combiné athlétique', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'Essais et performances de chaque épreuve, points d\'après la table de cotation.',
    build: () => [
      { type: 'table', head: 'Épreuve', cols: ['Essai 1', 'Essai 2', 'Essai 3', 'Meilleure performance', 'Points'], rows: ['Saut en longueur', 'Lancer de poids', 'Course (sprint ou haies)'], tall: true },
      { type: 'fields', fields: ['Total des points', 'Contrat visé'] },
    ],
  },
  {
    id: 'jury-athle', title: 'Fiche de jury (athlétisme)', group: 'Combiné athlétique', who: 'observateur', size: 'half', ident: ['Juge', 'Rôle', 'Classe', 'Date'],
    hint: 'Starter, chronométreur, mesureur, secrétaire : ce qu\'il faut faire et vérifier.',
    build: () => [
      { type: 'checks', title: 'Avant l\'épreuve', items: ['Zone de saut ou de lancer libre et sécurisée', 'Décamètre ou chronomètre prêt', 'Annonce claire : « prêt — essai valide / mordu »'] },
      { type: 'table', head: 'Essai', cols: ['Concurrent', 'Mesure ou temps', 'Valide ? (✔ / mordu)'], rows: ['1', '2', '3', '4', '5', '6'] },
    ],
  },

  // ── Yoga ────────────────────────────────────────────────────────────────
  {
    id: 'trame-yoga', title: 'Mon enchaînement de yoga', group: 'Yoga', who: 'élève', size: 'full', ident: ID_ELEVE,
    hint: 'La trame : ancrage, debout, équilibre, flexion / extension, sol, relaxation ; avec respiration et durée.',
    build: () => [
      { type: 'table', head: 'Étape', cols: ['Posture choisie', 'Respiration (inspire / expire)', 'Durée'], rows: ['Ancrage', 'Debout et équilibre', 'Flexion / extension', 'Au sol', 'Relaxation'], tall: true },
      { type: 'lines', title: 'Mon mobile (ce que je cherche : calme, souplesse, force…)', n: 2 },
    ],
  },
  {
    id: 'observation-yoga', title: 'J\'observe un enchaînement de yoga', group: 'Yoga', who: 'observateur', size: 'half', ident: ['Observateur', 'Élève observé', 'Classe', 'Date'],
    hint: 'Alignement, respiration et fluidité des transitions.',
    build: () => [
      { type: 'levels', items: ['Alignement (bassin, colonne)', 'Respiration synchronisée au mouvement', 'Transitions fluides', 'Équilibre tenu avec regard fixe'], levels: ['À revoir', 'Correct', 'Bien', 'Très bien'] },
      { type: 'lines', title: 'Un conseil', n: 2 },
    ],
  },
];

// ── Différenciation par niveau de classe ─────────────────────────────────────
// Du cycle 3 (6e) aux attendus de fin de lycée (AFL) : la même fiche devient plus guidée en 6e et en 5e,
// puis demande de plus en plus d'analyse, de justification et de régulation.

export const LEVEL_KEYS: LevelKey[] = ['6e', '5e', '4e', '3e', '2nde', '1re', 'Tle'];
export const LEVEL_LABELS: Record<LevelKey, string> = {
  '6e': '6e (cycle 3)',
  '5e': '5e (cycle 4, découverte)',
  '4e': '4e (cycle 4, approfondissement)',
  '3e': '3e (attendus de fin de cycle 4)',
  '2nde': '2nde (lycée, AFL)',
  '1re': '1re (lycée, AFL)',
  Tle: 'Terminale (lycée, AFL)',
};

/** « 1re », « Terminale », « 2nde »… → clé de niveau ; `undefined` si ce n'est pas un niveau scolaire (UNSS…). */
export function levelKeyOf(level: string | undefined | null): LevelKey | undefined {
  const s = (level ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/^6/.test(s)) return '6e';
  if (/^5/.test(s)) return '5e';
  if (/^4/.test(s)) return '4e';
  if (/^3/.test(s)) return '3e';
  if (/^(2|seconde)/.test(s)) return '2nde';
  if (/^(1|premiere)/.test(s)) return '1re';
  if (/^(t|terminale)/.test(s)) return 'Tle';
  return undefined;
}

const PROFILE: Record<LevelKey, { maxRows: number; trials: number; lines: number; kid: boolean; degrees: string[] }> = {
  '6e': { maxRows: 3, trials: 3, lines: 0.5, kid: true, degrees: ['Pas encore', 'Presque', 'Oui !'] },
  '5e': { maxRows: 4, trials: 4, lines: 0.75, kid: true, degrees: ['À revoir', 'En progrès', 'Réussi'] },
  '4e': { maxRows: 5, trials: 5, lines: 1, kid: false, degrees: ['Insuffisant', 'Fragile', 'Satisfaisant', 'Très satisfaisant'] },
  '3e': { maxRows: 7, trials: 6, lines: 1, kid: false, degrees: ['Objectif non atteint', 'Partiellement atteint', 'Atteint', 'Dépassé'] },
  '2nde': { maxRows: 8, trials: 6, lines: 1, kid: false, degrees: ['Niveau 1 : non atteint', 'Niveau 2 : en cours', 'Niveau 3 : atteint', 'Niveau 4 : maîtrisé'] },
  '1re': { maxRows: 8, trials: 6, lines: 1, kid: false, degrees: ['Niveau 1 : non atteint', 'Niveau 2 : en cours', 'Niveau 3 : atteint', 'Niveau 4 : maîtrisé'] },
  Tle: { maxRows: 8, trials: 6, lines: 1, kid: false, degrees: ['Niveau 1 : non atteint', 'Niveau 2 : en cours', 'Niveau 3 : atteint', 'Niveau 4 : maîtrisé'] },
};

/** Fiches dont les listes de critères sont raccourcies pour les plus jeunes. */
const TRIM_ROWS = new Set(['observation-binome', 'observation-basket', 'observation-baseball', 'observation-tt', 'observation-badminton', 'validation-technique', 'contrat-individuel', 'carte-projet-renfo']);

type Champ = 'CA1' | 'CA2' | 'CA3' | 'CA4' | 'CA5';

const CHAMP_OF_GROUP: Record<string, Champ> = {
  'Basket-ball': 'CA4', Baseball: 'CA4', 'Tennis de table': 'CA4', Badminton: 'CA4',
  Gymnastique: 'CA3', Acrosport: 'CA3', Danse: 'CA3', Step: 'CA3',
  Escalade: 'CA2',
  'Demi-fond': 'CA1', Natation: 'CA1', Biathlon: 'CA1', 'Combiné athlétique': 'CA1',
  Crossfit: 'CA5', 'Renforcement musculaire': 'CA5', Yoga: 'CA5',
};

const CHAMP_NAME: Record<'college' | 'lycee', Record<Champ, string>> = {
  college: {
    CA1: 'Produire une performance optimale',
    CA2: 'Adapter ses déplacements à des environnements variés',
    CA3: 'S\'exprimer devant les autres par une prestation artistique ou acrobatique',
    CA4: 'Conduire et maîtriser un affrontement collectif ou interindividuel',
    CA5: 'Produire une performance optimale (se préparer, s\'entretenir)',
  },
  lycee: {
    CA1: 'Réaliser une performance mesurée à une échéance donnée',
    CA2: 'Adapter ses déplacements à des environnements variés',
    CA3: 'S\'exprimer devant les autres par une prestation artistique ou acrobatique',
    CA4: 'Conduire et maîtriser un affrontement individuel ou collectif',
    CA5: 'Réaliser une activité physique pour développer ses ressources et s\'entretenir',
  },
};

/** Attendu travaillé, à ce niveau, dans ce champ d'apprentissage (AFC au collège, AFL au lycée). */
const ATTENDU: Record<LevelKey, Record<Champ, string>> = {
  '6e': {
    CA1: 'Réaliser une performance mesurée (distance ou durée) en choisissant un objectif réaliste et en le tenant.',
    CA2: 'Se déplacer en sécurité dans un milieu inhabituel, en respectant les règles et le matériel.',
    CA3: 'Présenter un enchaînement devant les autres en tenant bien son rôle (acteur, spectateur, juge).',
    CA4: 'Jouer en respectant les règles, coopérer avec ses partenaires et s\'opposer sans contact violent.',
    CA5: 'Se préparer à l\'effort, bien placer son corps et respirer pour s\'entretenir en sécurité.',
  },
  '5e': {
    CA1: 'Gérer son effort pour tenir un objectif ; commencer à comparer son projet et sa réalisation.',
    CA2: 'S\'engager en sécurité dans un milieu incertain en vérifiant son matériel et celui de son partenaire.',
    CA3: 'Composer une courte prestation à plusieurs ; repérer ce qui rend une prestation lisible pour le public.',
    CA4: 'Faire des choix simples (passer, tirer, se placer), tenir un rôle d\'arbitre ou d\'observateur.',
    CA5: 'Choisir des exercices adaptés à soi et les réaliser avec une posture correcte.',
  },
  '4e': {
    CA1: 'Construire et tenir un projet de performance ; analyser ses résultats pour progresser.',
    CA2: 'S\'engager en sécurité en lisant l\'environnement, en prenant des risques maîtrisés.',
    CA3: 'Composer et présenter une prestation en choisissant des procédés ; juger celle des autres sur des critères.',
    CA4: 'Lire le rapport de force et adapter ses choix ; assumer des rôles (arbitre, observateur, coach).',
    CA5: 'Choisir un mobile de pratique et construire une séance cohérente avec ce mobile.',
  },
  '3e': {
    CA1: 'AFC cycle 4 : planifier et réguler son effort pour réaliser une performance, analyser ses résultats et les mettre en relation avec ses ressources.',
    CA2: 'AFC cycle 4 : choisir un itinéraire ou une voie adaptée à ses ressources et s\'engager en sécurité, en assumant les rôles de partenaire.',
    CA3: 'AFC cycle 4 : composer et présenter seul ou à plusieurs une prestation en justifiant ses choix ; apprécier celle des autres.',
    CA4: 'AFC cycle 4 : choisir et mettre en œuvre une stratégie adaptée à l\'adversaire ; arbitrer, observer, coacher.',
    CA5: 'AFC cycle 4 : construire un projet d\'entretien de soi en justifiant ses choix d\'exercices, de charges et de récupération.',
  },
  '2nde': {
    CA1: 'AFL 1-2-3 : se préparer et s\'engager pour produire une performance, planifier et réguler son projet, analyser ses résultats.',
    CA2: 'AFL 1-2-3 : s\'engager en sécurité dans un milieu incertain, choisir et planifier son parcours, analyser ses prises de risque.',
    CA3: 'AFL 1-2-3 : composer et réaliser une prestation, la réguler après avis, apprécier celle des autres.',
    CA4: 'AFL 1-2-3 : réaliser des actions efficaces, choisir et ajuster une stratégie, arbitrer et coacher.',
    CA5: 'AFL 1-2-3 : réaliser une pratique d\'entretien de soi, choisir et planifier un projet, analyser les effets de la pratique.',
  },
  '1re': {
    CA1: 'AFL : optimiser sa performance en affinant son projet d\'entraînement et en s\'appuyant sur des indicateurs précis.',
    CA2: 'AFL : maîtriser l\'engagement dans un milieu incertain en gérant les risques et les rôles de cordée.',
    CA3: 'AFL : composer une prestation originale, la réguler grâce aux retours et juger selon des critères explicites.',
    CA4: 'AFL : réaliser des choix tactiques construits, les réguler en cours de jeu, assumer un coaching argumenté.',
    CA5: 'AFL : conduire un projet d\'entretien personnel en reliant les effets observés aux principes d\'entraînement.',
  },
  Tle: {
    CA1: 'AFL : conduire de façon autonome un projet de performance et le justifier par l\'analyse de ses résultats.',
    CA2: 'AFL : s\'engager de façon autonome et responsable, en choisissant un projet adapté à ses ressources.',
    CA3: 'AFL : concevoir, réaliser et apprécier une prestation en assumant ses choix artistiques ou acrobatiques.',
    CA4: 'AFL : maîtriser l\'affrontement en adaptant sa stratégie à l\'adversaire et en jouant les rôles de coach et d\'arbitre.',
    CA5: 'AFL : construire et conduire en autonomie un projet d\'entretien de soi, évaluer ses effets et le transférer hors de l\'école.',
  },
};

const SOCLE: Record<LevelKey, string> = {
  '6e': 'Socle commun : D2 « apprendre seul ou avec les autres » · D3 « respecter les règles et assumer des rôles ».',
  '5e': 'Socle commun : D2 « s\'organiser, coopérer » · D3 « respecter les autres, être solidaire ».',
  '4e': 'Socle commun : D2 « mener un projet, analyser ses résultats » · D3 « assumer des responsabilités ».',
  '3e': 'Socle commun (validation fin de cycle 4) : D2 « mener une démarche réflexive » · D3 « exercer son jugement, s\'engager ».',
  '2nde': 'Compétences travaillées : s\'engager, planifier, réguler, analyser · AFL 1, 2 et 3.',
  '1re': 'Compétences travaillées : s\'engager, planifier, réguler, analyser, coopérer · AFL 1, 2 et 3.',
  Tle: 'Compétences travaillées : autonomie, projet personnel, analyse, transfert · AFL 1, 2 et 3.',
};

/** Phrase « attendu » + socle à reproduire en tête de fiche. */
export function attendu(def: FicheDef, level: LevelKey): string {
  const champ = CHAMP_OF_GROUP[def.group];
  const lycee = level === '2nde' || level === '1re' || level === 'Tle';
  const head = champ ? `${champ === 'CA5' && lycee ? 'CP5' : champ === 'CA5' ? 'Champ 1' : lycee ? `CP${champ.slice(2)}` : `Champ ${champ.slice(2)}`} — ${CHAMP_NAME[lycee ? 'lycee' : 'college'][champ]}. ${ATTENDU[level][champ]}` : '';
  return [head, SOCLE[level]].filter(Boolean).join(' ');
}

const KID_EXTRAS_TEXT = 'Mon ressenti (j\'entoure) : 😕   🙂   😀';

/** Construit les sections d'une fiche, adaptées au niveau de la classe. */
export function buildFiche(def: FicheDef, ctx: FicheCtx): FicheSection[] {
  const base = def.build(ctx);
  const level = ctx.level;
  if (!level) return base;
  const p = PROFILE[level];
  const teacher = def.who === 'enseignant';
  const out: FicheSection[] = [];

  out.push({ type: 'text', text: `Niveau ${LEVEL_LABELS[level]}. ${attendu(def, level)}` });

  for (const s of base) {
    if (s.type === 'table') {
      let rows = s.rows;
      if (Array.isArray(rows) && TRIM_ROWS.has(def.id) && rows.length > p.maxRows) rows = rows.slice(0, p.maxRows);
      const cols = TRIM_ROWS.has(def.id) || def.id.startsWith('score') ? s.cols.filter((c) => {
        const m = /^(Essai|Match|Série|Set|Manche) (\d+)$/.exec(c);
        return !m || Number(m[2]) <= p.trials;
      }) : s.cols;
      const kidCols = cols.map((c) => (p.kid && c === 'Écart / validé ?' ? 'Réussi ? (😕 🙂 😀)' : c));
      out.push({ ...s, rows, cols: kidCols });
    } else if (s.type === 'levels') {
      if (teacher) out.push(level === '2nde' || level === '1re' || level === 'Tle' ? { ...s, levels: p.degrees } : s);
      else out.push({ ...s, levels: p.degrees });
    } else if (s.type === 'lines') {
      out.push({ ...s, n: Math.max(1, Math.round((s.n ?? 2) * p.lines)) });
    } else out.push(s);
  }

  if (teacher) return out;

  // Compléments propres au niveau : plus on avance, plus on analyse, on justifie et on régule.
  const half = def.size === 'half';
  if (level === '6e') out.push({ type: 'text', text: KID_EXTRAS_TEXT });
  else if (level === '5e') {
    out.push({ type: 'text', text: KID_EXTRAS_TEXT });
    if (!half) out.push({ type: 'lines', title: 'Un conseil que j\'ai reçu ou donné', n: 1 });
  } else if (half) {
    out.push({ type: 'lines', title: level === '4e' ? 'Ce que je constate / ce que je change' : 'Ce que je constate (chiffre) → ce que je change et pourquoi', n: 1 });
  } else if (level === '4e') {
    out.push({ type: 'lines', title: 'Ce que je constate', n: 1 }, { type: 'lines', title: 'Ce que je change à la prochaine séance', n: 1 });
  } else if (level === '3e') {
    out.push({ type: 'lines', title: 'Ce que je constate (avec un chiffre ou un exemple)', n: 1 }, { type: 'lines', title: 'Ce que je change et pourquoi', n: 2 }, { type: 'fields', fields: ['Attendu de fin de cycle que ce travail me permet de valider'] });
  } else {
    out.push({ type: 'table', head: 'Régulation', cols: ['Mon résultat', 'Ce que j\'en déduis', 'Ce que je modifie'], rows: ['Indicateur 1', 'Indicateur 2'], tall: true });
    if (level === '1re') out.push({ type: 'lines', title: 'Principe d\'action ou d\'entraînement utilisé, et pourquoi', n: 1 });
    if (level === 'Tle') out.push({ type: 'lines', title: 'Transfert : comment réutiliser ce projet en dehors du cours (autonomie)', n: 1 });
  }
  return out;
}

export const FICHE_BY_ID = new Map(FICHES.map((f) => [f.id, f]));
export const FICHE_GROUPS = [...new Set(FICHES.map((f) => f.group))];

/** Fiches de l'activité d'un cycle (par le début du titre du cycle) + fiches communes. */
export function fichesOfActivity(title: string): FicheDef[] {
  const a = title.replace(/ — .*/, '');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const same = (g: string) => norm(g) === norm(a) || (norm(a) === 'danse' && g === 'Danse') || (norm(a) === 'step' && g === 'Step');
  const groupFor = (act: string) => {
    const x = norm(act);
    if (/crossfit|cross/.test(x)) return 'Crossfit';
    if (/renforcement|musculation/.test(x)) return 'Renforcement musculaire';
    if (/step|danse/.test(x)) return x.includes('step') ? 'Step' : 'Danse';
    return FICHE_GROUPS.find(same) ?? '';
  };
  const g = groupFor(a);
  const extra = g === 'Crossfit' || g === 'Renforcement musculaire' ? FICHES.filter((f) => f.group === 'Crossfit' || f.group === 'Renforcement musculaire') : g === 'Step' || g === 'Danse' ? FICHES.filter((f) => f.group === 'Step' || f.group === 'Danse') : FICHES.filter((f) => f.group === g);
  return [...extra, ...FICHES.filter((f) => f.group === 'Toutes activités')];
}
