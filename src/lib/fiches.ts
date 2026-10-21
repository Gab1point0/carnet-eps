// Bibliothèque de fiches imprimables. Chaque fiche est décrite par des sections (tableaux, cases à cocher,
// lignes à remplir) : la page `/fiches/:id` les met en forme pour l'impression. Aucun nom d'élève n'est stocké.
export type FicheSection =
  | { type: 'table'; title?: string; cols: string[]; rows: string[] | number; head?: string; tall?: boolean; cells?: string[][] }
  | { type: 'levels'; title?: string; items: string[]; levels?: string[] }
  | { type: 'checks'; title?: string; items: string[] }
  | { type: 'lines'; title?: string; n?: number }
  | { type: 'fields'; fields: string[] }
  | { type: 'text'; text: string };

export interface FicheCtx {
  /** Critères d'évaluation du cycle (champ « Évaluation »), s'il y en a. */
  criteria: string[];
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
