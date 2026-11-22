// Formats de séance qu'on peut imposer à Claude pour tout un cycle (« Générer les séances »).
// Chaque format : un nom pour l'enseignant, les champs d'apprentissage où il convient le mieux, et la consigne donnée à Claude.
// Sources : double boucle (Coston et Ubaldi ; epsregal.fr, « La double boucle ») ; situation de référence
// (eps.ac-normandie.fr, Eduscol, ressources cycle 4 « module d'apprentissage ») ; débat d'idées (Gréhaigne ; Poggi 2023,
// Éducation et didactique) ; jeu modifié – exercice – jeu (Teaching Games for Understanding, Bunker et Thorpe) ;
// projet d'entraînement en CA5 (référentiels certificatifs lycée).

export interface LessonFormat {
  id: string;
  label: string;
  /** Champs d'apprentissage où le format convient le mieux. */
  fits: string;
  /** Une phrase pour l'enseignant. */
  hint: string;
  /** Consigne donnée à Claude pour construire chaque séance. */
  prompt: string;
}

export const LESSON_FORMATS: LessonFormat[] = [
  {
    id: 'double-boucle',
    label: 'Petite boucle / grande boucle',
    fits: 'CA4, CA1',
    hint: 'Situation complexe d’affrontement, petite boucle d’apprentissage sur les problèmes rencontrés, retour à la grande boucle pour attester les progrès. Pensé pour les séances de 2 h.',
    prompt: `Format « petite boucle / grande boucle » (double boucle, Coston et Ubaldi), pensé pour les séances longues (2 h et plus) ; sur un créneau plus court, garde les trois temps en les raccourcissant.
Après l'échauffement :
1. Grande boucle d'entrée : une situation complexe et authentique d'affrontement (match à effectif réduit, rencontre, épreuve), proche de l'activité de référence, qui fait surgir les problèmes liés à l'objectif de la séance. Indique ce que l'enseignant et les observateurs relèvent (indicateurs chiffrés si possible).
2. Petite boucle : une ou plusieurs situations d'apprentissage plus ciblées et plus répétitives (moins d'incertitude, plus de répétitions), chacune répondant à un des problèmes relevés, avec ses critères de réussite.
3. Retour à la grande boucle : la même situation complexe qu'au début (mêmes règles et mêmes indicateurs) pour constater les améliorations, en comparant aux relevés du début.
Puis le retour au calme avec un bilan sur ce qui a progressé.`,
  },
  {
    id: 'reference',
    label: 'Situation de référence → apprentissages → retour',
    fits: 'tous les CA',
    hint: 'La situation de référence du cycle (souvent celle de l’évaluation) au début, des situations pour progresser, puis la même situation pour mesurer le progrès.',
    prompt: `Format « situation de référence » : après l'échauffement, les élèves passent dans la situation de référence du cycle (celle qui sert à l'évaluation, ou une forme proche) avec un relevé simple de leur résultat ; puis des situations d'apprentissage progressives qui travaillent l'objectif de la séance ; enfin retour à la même situation de référence, avec le même relevé, pour mesurer le progrès. Retour au calme avec comparaison des deux relevés.`,
  },
  {
    id: 'debat',
    label: 'Jeu → débat d’idées → jeu',
    fits: 'CA4, sports collectifs',
    hint: 'Les équipes jouent, analysent ensemble ce qui marche ou non, se donnent un projet, puis rejouent pour le tester.',
    prompt: `Format « jeu – débat d'idées – jeu » (Gréhaigne) : après l'échauffement, un match à effectif réduit avec des observateurs qui relèvent des indicateurs simples ; puis un temps court de débat d'idées par équipe (3 à 5 min, questions de l'enseignant) pour comprendre ce qui a réussi ou échoué et se fixer un projet d'action collectif ; puis un nouveau match pour tester ce projet. On peut répéter le cycle jeu – débat – jeu, et insérer une courte situation d'apprentissage si un problème le demande. Bilan final sur les projets qui ont marché.`,
  },
  {
    id: 'jeu-exercice-jeu',
    label: 'Jeu modifié → exercice → jeu',
    fits: 'CA4',
    hint: 'Un jeu simplifié qui pose un problème tactique, une question aux élèves, un exercice pour la technique utile, puis retour au jeu (démarche TGfU).',
    prompt: `Format « jeu modifié – exercice – jeu » (Teaching Games for Understanding) : après l'échauffement, un jeu modifié (terrain, effectif ou règles adaptés) qui fait apparaître un problème tactique lié à l'objectif ; des questions aux élèves pour faire émerger la solution ; un exercice ciblé sur l'habileté nécessaire ; puis retour au jeu modifié pour l'appliquer, éventuellement avec une contrainte de plus.`,
  },
  {
    id: 'ateliers',
    label: 'Ateliers en rotation',
    fits: 'CA2, CA1',
    hint: 'Groupes qui tournent sur 3 à 5 ateliers, chacun avec ses critères de réussite et ses rôles (pareur, observateur, juge).',
    prompt: `Format « ateliers en rotation » : après l'échauffement, la classe se répartit en groupes qui tournent sur 3 à 5 ateliers (même durée chacun, signal de rotation), tous au service de l'objectif de la séance, du plus simple au plus exigeant. Pour chaque atelier : installation, consigne, critères de réussite, rôle des élèves qui ne pratiquent pas (pareur, observateur, juge) et une variante plus facile ou plus difficile. Terminer par un temps où chacun montre ou mesure ce qu'il a réussi, puis le retour au calme.`,
  },
  {
    id: 'contrat',
    label: 'Contrats ou défis par niveau',
    fits: 'CA2, CA1, CA5',
    hint: 'Chaque élève choisit un contrat à sa mesure (voie, enchaînement, performance visée), s’entraîne, puis le valide devant un observateur.',
    prompt: `Format « contrats » : après l'échauffement, présentation de contrats ou défis de difficulté croissante liés à l'objectif (par exemple trois niveaux) ; chaque élève (ou binôme) choisit le sien, s'entraîne en autonomie avec des critères de réussite clairs, puis tente de le valider devant un observateur qui note la réussite ; un élève qui valide passe au niveau suivant. Bilan : contrats validés et choix pour la séance suivante.`,
  },
  {
    id: 'creation',
    label: 'Explorer → composer → présenter',
    fits: 'CA3',
    hint: 'Exploration d’inducteurs, composition en groupe, répétition, puis présentation devant des spectateurs qui font un retour.',
    prompt: `Format « création » : après un échauffement corporel et expressif, une phase d'exploration guidée à partir d'inducteurs (consignes, musiques, images, contraintes de temps, d'espace, d'énergie) ; puis une phase de composition en groupe pour intégrer les trouvailles dans l'enchaînement ; une répétition ; enfin la présentation devant les autres élèves, spectateurs avec une grille simple qui font un retour argumenté. Retour au calme avec ce qui sera gardé pour la suite.`,
  },
  {
    id: 'entrainement',
    label: 'Séance d’entraînement (projet personnel)',
    fits: 'CA5',
    hint: 'Échauffement, travail planifié selon le projet de chacun (charges, séries, récupération), relevé des ressentis, bilan pour ajuster.',
    prompt: `Format « séance d'entraînement » (CA5) : un échauffement adapté au travail du jour ; un rappel du mobile ou projet de chaque élève ; des séquences de travail planifiées (charges, intensités, séries, répétitions, récupérations) avec plusieurs options selon les projets ; un relevé des ressentis et indicateurs (fréquence cardiaque, difficulté perçue, essoufflement) sur le carnet d'entraînement ; un bilan pour ajuster la séance suivante ; retour au calme et récupération.`,
  },
];

export const lessonFormatOf = (id: string | null | undefined) => LESSON_FORMATS.find((f) => f.id === id);
