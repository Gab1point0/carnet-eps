// Base de connaissances EPS donnée à l'IA de l'application (dictée, séances générées, plans de cycle, fiches, évaluations).
// Condensé de recherches faites en novembre 2026 : programmes officiels (textes relus) et publications scientifiques
// de 2000 ou après, chacune retrouvée en ligne (liste `EPS_SOURCES`). Les repères didactiques par champ viennent de la
// culture professionnelle de l'EPS (formes de pratique scolaire, rôles) : ils ne citent pas de source précise.
// Pour l'IA, on n'envoie que ce qui concerne la classe et l'activité (`epsKnowledgeFor`).

import { useData } from '../store/data';
import { DEFAULT_ACTIVITIES } from './defaults';
import { ACTIVITY_KNOWLEDGE } from './epsActivities';

export interface EpsSource {
  ref: string;
  url: string;
  /** Ce qu'on en retient, en une phrase. */
  gist: string;
}

// ── Principes généraux (toujours envoyés) ──────────────────────────────────

const GENERAL = `Repères scientifiques et professionnels à appliquer (sources de 2000 ou après) :
- Temps d'engagement moteur : au collège et au lycée, les élèves ne passent en moyenne qu'environ 40 % du cours en activité modérée à vigoureuse, en dessous des 50 % recommandés (Hollis et al., 2017). Consignes courtes, groupes et matériel prêts d'avance, rotations rapides, peu d'élèves qui attendent (files de 3 au plus), observateurs qui tournent vite.
- Jeux réduits : en sports collectifs, réduire le nombre de joueurs et la taille du terrain multiplie les touches de balle et les actions de chaque élève (Fernández-Espínola et al., 2020). Les approches par le jeu (jeu modifié, questions, exercice, retour au jeu) améliorent nettement la prise de décision, autant que l'approche technique pour l'exécution (Ortiz et al., 2023).
- Consignes et retours : orienter l'attention de l'élève vers l'effet du geste (le ballon, la cible, la trajectoire) plutôt que vers son corps (« vise le haut du filet » plutôt que « tends le bras ») : meilleur apprentissage et meilleure performance (méta-analyse de Chua et al., 2021). Peu de consignes à la fois, une démonstration, des critères de réussite observables.
- Organisation de la pratique : varier les situations et alterner les tâches favorise la rétention chez l'adulte, mais l'effet est faible chez les jeunes et en situation réelle (Czyż et al., 2024) : chez les élèves, commencer par une pratique plus stable, puis varier quand la tâche est comprise.
- Motivation : nourrir le sentiment de compétence, l'autonomie (choix de niveau, de rôle, de défi) et l'appartenance au groupe (théorie de l'autodétermination). Un climat de maîtrise (progrès personnel valorisé, groupes souples, évaluation sur les progrès, temps laissé pour apprendre ; cadre TARGET) est associé à plus de motivation autonome (Weeldenburg et al., 2022). Les modèles pédagogiques (éducation sportive, apprentissage coopératif, approches par le jeu) augmentent la motivation autonome (Alonso-Vargas et al., 2026).
- Apprentissage coopératif : effet positif moyen sur les apprentissages moteurs, cognitifs, sociaux et affectifs (méta-analyse de Boke et al., 2025). Rôles sociaux à faire tenir (arbitre, observateur, coach, juge, pareur, chronométreur) avec une fiche simple.
- Éducation sportive (saison, équipes stables, rôles, compétition finale) : effet positif sur les apprentissages, surtout au secondaire, avec des séances d'au moins 60 min (Yao et al., 2025) et sur la motivation (Tendinha et al., 2021).
- Adolescentes : leur activité physique baisse fortement à l'adolescence ; freins principaux : manque de soutien des camarades et des enseignants, regard des autres, sentiment de manquer d'habileté (Duffey et al., 2021). En cours : groupes affinitaires possibles, rôles valorisés, pas d'exposition humiliante (démonstrations volontaires, pas de classement public des plus faibles), activités et objectifs variés.
- Inclusion : adapter la tâche, le matériel, l'espace, les règles et le rôle plutôt que dispenser ; l'élève à besoins particuliers participe à la même situation quand c'est possible (Wilhelmsen & Sørensen, 2017). Une inaptitude partielle se traduit par une adaptation, pas par une exclusion.
- Échauffement : progressif, dynamique et spécifique à l'activité (mobilisations, courses, gammes, gestes de l'activité). Les programmes neuromusculaires (équilibre, appuis, réceptions de sauts, renforcement) réduisent fortement les blessures chez les jeunes : −48 % avec « 11+ Kids » en football (Rössler et al., 2018). Les étirements statiques longs ne sont pas nécessaires avant l'effort.
- Retour au calme : utile pour revenir au calme, faire le bilan et récupérer un peu, mais il ne prévient pas les blessures (Van Hooren & Peake, 2018) ; les étirements après l'effort n'accélèrent pas la récupération (Afonso et al., 2021). Préférer un retour au calme court et un bilan des apprentissages.
- Santé : l'OMS recommande aux 5-17 ans en moyenne 60 min par jour d'activité modérée à vigoureuse, avec des activités intenses et de renforcement musculaire et osseux au moins 3 jours par semaine, et moins de sédentarité (Bull et al., 2020). L'activité physique ne nuit pas aux résultats scolaires et peut les améliorer (Barbosa et al., 2020).
- Renforcement musculaire des jeunes : sûr et utile s'il est encadré, technique avant charge, progressif (Faigenbaum & Myer, 2010).
- Sécurité : parade et consignes de sécurité explicites en gymnastique et acrosport, vérification croisée des nœuds et de l'assurage en escalade, zones et sens de lancer en athlétisme, distances entre terrains de raquettes ; adapter l'intensité par forte chaleur (hydratation, ombre, horaires) ; tenir compte des PAI (asthme : médicament et échauffement progressif ; diabète : collation). Choc à la tête : arrêt de l'activité et reprise progressive (consensus d'Amsterdam 2022).`;

// ── Par niveau ────────────────────────────────────────────────────────────

const CYCLE3 = `Programme du cycle 3 (CM1-6e ; programme de 2020 en 6e en 2026-2027, nouveau programme de 2026 à partir du CM1 en 2026-2027 puis en 6e en 2027-2028).
Attendus de fin de cycle 3 :
- Produire une performance optimale, mesurable à une échéance donnée : réaliser des efforts et enchaîner plusieurs actions motrices dans différentes familles pour aller plus vite, plus longtemps, plus haut, plus loin ; combiner une course, un saut, un lancer pour faire la meilleure performance cumulée ; mesurer, enregistrer, comparer, classer les performances ; assumer les rôles de chronométreur et d'observateur.
- Adapter ses déplacements à des environnements variés : réaliser, seul ou à plusieurs, un parcours dans plusieurs environnements inhabituels ; connaître et respecter les règles de sécurité ; identifier la personne à alerter ; valider l'attestation scolaire du savoir nager (ASSN). La natation, dans la mesure du possible, chaque année du cycle.
- S'exprimer devant les autres par une prestation artistique et/ou acrobatique : réaliser en petits groupes une séquence acrobatique destinée à être jugée et une séquence artistique destinée à émouvoir ; savoir filmer une prestation pour la revoir ; respecter les prestations des autres et accepter de se produire devant eux.
- Conduire et maîtriser un affrontement collectif ou interindividuel : en situation aménagée ou à effectif réduit, s'organiser tactiquement pour gagner en identifiant les situations favorables de marque ; maintenir un engagement moteur efficace sur tout le temps de jeu ; respecter partenaires, adversaires et arbitre ; assurer les rôles de joueur, arbitre, observateur ; accepter le résultat et le commenter.
Âge (10-12 ans) : avant ou au tout début de la puberté chez la plupart (le pic de croissance arrive vers 10-12 ans chez les filles, vers 12-14 ans chez les garçons) ; apprentissage moteur rapide, besoin de jeu, de variété et de réussites fréquentes, consignes très courtes, situations ludiques et effectifs réduits.`;

const CYCLE4 = `Programme du cycle 4 (5e-3e, programme de 2020 ; un nouveau programme est en préparation).
Compétences générales : développer sa motricité et apprendre à s'exprimer en utilisant son corps ; s'approprier, par la pratique, des méthodes et outils ; partager des règles, assumer des rôles et responsabilités ; apprendre à entretenir sa santé par une activité physique régulière ; s'approprier une culture physique sportive et artistique.
Attendus de fin de cycle 4 :
- Produire une performance optimale, mesurable à une échéance donnée : gérer son effort, faire des choix pour réaliser la meilleure performance dans au moins deux familles athlétiques et/ou deux styles de nage ; s'engager dans un programme de préparation individuel ou collectif ; planifier et réaliser une épreuve combinée ; s'échauffer avant un effort ; aider ses camarades et assumer différents rôles sociaux (juge, chronométreur, organisateur…).
- Adapter ses déplacements à des environnements variés : réussir un déplacement planifié dans un milieu naturel aménagé ou artificiellement recréé ; gérer ses ressources pour réaliser en totalité un parcours sécurisé ; assurer la sécurité de son camarade ; respecter et faire respecter les règles de sécurité.
- S'exprimer devant les autres par une prestation artistique et/ou acrobatique : mobiliser les capacités expressives du corps pour imaginer, composer et interpréter une séquence artistique ou acrobatique ; participer activement, au sein d'un groupe, à l'élaboration et à la formalisation d'un projet artistique ; apprécier des prestations en utilisant différents supports d'observation et d'analyse.
- Conduire et maîtriser un affrontement collectif ou interindividuel : en situation d'opposition réelle et équilibrée, réaliser des actions décisives en situation favorable afin de faire basculer le rapport de force ; adapter son engagement moteur à son état physique et au rapport de force ; être solidaire de ses partenaires et respectueux des adversaires et de l'arbitre ; observer et co-arbitrer ; accepter le résultat et l'analyser avec objectivité.
Âge (12-15 ans) : période de la puberté, avec de grands écarts entre élèves du même âge ; pendant la poussée de croissance, une maladresse passagère est possible (équilibre, coordination), d'où l'intérêt de différencier et de ne pas juger trop tôt ; les écarts de performance entre filles et garçons augmentent ; la baisse d'engagement des adolescentes commence : climat de maîtrise, choix et rôles valorisés.`;

const LYCEE = `Programme du lycée général et technologique (2019). Objectifs généraux : développer sa motricité ; savoir se préparer et s'entraîner ; exercer sa responsabilité individuelle et au sein d'un collectif ; construire durablement sa santé ; accéder au patrimoine culturel.
Attendus de fin de lycée (AFL), par champ d'apprentissage :
- CA1 « Réaliser une performance motrice maximale mesurable à une échéance donnée » (courses, sauts, lancers, natation vitesse) : AFL1 s'engager pour produire une performance maximale à l'aide de techniques efficaces, en gérant les efforts musculaires et respiratoires nécessaires et en faisant le meilleur compromis entre l'accroissement de vitesse d'exécution et de précision ; AFL2 s'entraîner, individuellement et collectivement, pour réaliser une performance ; AFL3 choisir et assumer les rôles qui permettent un fonctionnement collectif solidaire.
- CA2 « Adapter son déplacement à des environnements variés et/ou incertains » (escalade, course d'orientation, sauvetage aquatique, VTT) : AFL1 s'engager à l'aide d'une motricité spécifique pour réaliser en sécurité et à son meilleur niveau un itinéraire dans un contexte incertain ; AFL2 s'entraîner individuellement et collectivement pour se déplacer de manière efficiente et en toute sécurité ; AFL3 coopérer pour réaliser un projet de déplacement, en toute sécurité.
- CA3 « Réaliser une prestation corporelle destinée à être vue et appréciée » (danse(s), arts du cirque, acrosport, gymnastique) : AFL1 s'engager pour composer et réaliser un enchaînement à visée esthétique ou acrobatique destiné à être jugé, en combinant des formes corporelles codifiées (ou, en danse : composer et interpréter une chorégraphie collective selon un projet artistique en mobilisant une motricité expressive et des procédés de composition) ; AFL2 se préparer et s'engager, individuellement et collectivement, pour s'exprimer devant un public et susciter des émotions ; AFL3 choisir et assumer des rôles au service de la prestation collective.
- CA4 « Conduire et maîtriser un affrontement collectif ou interindividuel pour gagner » (badminton, tennis de table, boxe française, judo, basket-ball, football, handball, rugby, volley-ball) : AFL1 s'engager pour gagner une rencontre en faisant des choix techniques et tactiques pertinents au regard de l'analyse du rapport de force ; AFL2 se préparer et s'entraîner, individuellement ou collectivement, pour conduire et maîtriser un affrontement ; AFL3 choisir et assumer les rôles qui permettent un fonctionnement collectif solidaire.
- CA5 « Réaliser et orienter son activité physique pour développer ses ressources et s'entretenir » (course en durée, musculation, natation en durée, step, yoga) : AFL1 s'engager pour obtenir les effets recherchés selon son projet personnel, en faisant des choix de paramètres d'entraînement cohérents avec le thème retenu ; AFL2 s'entraîner, individuellement ou collectivement, pour développer ses ressources et s'entretenir en fonction des effets recherchés ; AFL3 coopérer pour faire progresser.
Au baccalauréat, l'évaluation porte sur les trois AFL de chaque activité, avec un référentiel par activité. En lycée professionnel, les attendus s'appellent AFLP et se déclinent en connaissances, capacités et attitudes.
Âge (15-18 ans) : croissance presque terminée chez les filles, encore en cours chez certains garçons ; on peut travailler l'entraînement (paramètres, projet personnel), la responsabilité et l'autonomie ; l'engagement des adolescentes reste un enjeu (choix, rôles, climat de maîtrise).`;

// ── Par champ d'apprentissage (repères didactiques professionnels) ─────────

const FIELDS: Record<string, string> = {
  ca1: `Repères pour ce champ (CA1, performance) : faire mesurer et enregistrer les performances (temps, distances) pour objectiver les progrès ; alterner effort et récupération ; travailler la vitesse au début de la séance, quand les élèves sont frais ; formes scolaires : relais (gain du relais = temps du relais comparé à la somme des temps individuels), courses à contrat (temps annoncé puis réalisé), épreuves combinées, comparaison avec et sans élan ; rôles : chronométreur, starter, juge de mesure, secrétaire ; sécurité des lancers (zones, signal, sens unique, ramassage commun).`,
  ca2: `Repères pour ce champ (CA2, environnements) : la sécurité est un contenu à part entière (vérifications croisées, règles, alerte) ; progression du milieu connu au milieu moins connu ; projet de déplacement annoncé puis réalisé, comparé ; escalade : nœud de huit et assurage vérifiés par un camarade et par l'enseignant avant chaque montée, contre-assureur pour les débutants, voies de difficulté croissante ; course d'orientation : du plan de la salle au parc, balises en étoile puis en circuit, binômes au début ; natation et sauvetage : savoir nager d'abord (ASSN), surveillance permanente.`,
  ca3: `Repères pour ce champ (CA3, prestation artistique ou acrobatique) : alterner exploration, composition, répétition et présentation ; faire observer et apprécier avec une grille simple (rôle de juge ou de spectateur) ; filmer pour revoir et améliorer ; gymnastique et acrosport : parade apprise et exigée, éléments de difficulté croissante, sécurité des portés (prises, montées et descentes contrôlées), tapis ; danse et cirque : inducteurs, procédés de composition (unisson, canon, répétition, contraste), rapport au public.`,
  ca4: `Repères pour ce champ (CA4, affrontement) : partir du jeu (match à effectif réduit, terrain adapté) pour faire surgir les problèmes, puis des situations ciblées, puis retour au jeu ; rapport de force équilibré (groupes de niveau proches pour les rencontres, ou handicaps et bonus) ; situations de supériorité numérique pour apprendre à attaquer ; observation chiffrée simple (balles gagnées, tirs, points marqués selon la zone) ; rôles : arbitre ou co-arbitre, observateur, coach, marqueur ; raquettes : montée et descente (ronde italienne) pour équilibrer les matchs.`,
  ca5: `Repères pour ce champ (CA5, entretien de soi) : l'élève choisit un projet ou un mobile (endurance, renforcement, bien-être, affinement) et des paramètres (intensité, durée, séries, répétitions, récupération) ; relevés de fréquence cardiaque et de ressenti (échelle de difficulté perçue) dans un carnet d'entraînement ; technique et placement avant la charge en musculation, travail avec un partenaire qui observe et sécurise ; bilan en fin de séance pour ajuster la suivante.`,
};

// ── Sources (toutes relues en ligne) ──────────────────────────────────────

export const EPS_SOURCES: EpsSource[] = [
  { ref: 'Programme d’EPS du lycée général et technologique, BO spécial n°1 du 22 janvier 2019', url: 'https://cache.media.education.gouv.fr/file/SP1-MEN-22-1-2019/91/9/spe574_annexe1_1062919.pdf', gist: 'Objectifs généraux, 5 champs, 3 AFL par champ, liste nationale des activités.' },
  { ref: 'Programme du cycle 4, d’après le BO n°31 du 30 juillet 2020 (Eduscol)', url: 'https://eduscol.education.gouv.fr/sites/default/files/document/programme-d-enseignement-du-cycle-4-67722.pdf', gist: 'Compétences générales et attendus de fin de cycle 4.' },
  { ref: 'Programme d’EPS des cycles 2 et 3, BO n°31 du 30 juillet 2020 (copie académique de Strasbourg)', url: 'https://circ-ien-eurometropole-nord.site.ac-strasbourg.fr/wp-content/uploads/2022/03/2022-03-14-Programmes-EPS-2020-C2C3.pdf', gist: 'Attendus de fin de cycle 3, repères de progressivité, savoir nager.' },
  { ref: 'Académie de Bordeaux, nouveau programme du cycle 3 (BO n°22 du 28 mai 2026), mai 2026', url: 'https://ent2d.ac-bordeaux.fr/disciplines/eps/?p=10111', gist: 'Calendrier : CM1 en 2026-2027, CM2 et 6e en 2027-2028.' },
  { ref: 'Hollis et al. (2017), Int J Behav Nutr Phys Act, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5402678/', gist: 'Au secondaire, 40,5 % du cours en activité modérée à vigoureuse (recommandation : 50 %).' },
  { ref: 'Fernández-Espínola et al. (2020), IJERPH, revue systématique', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7143077/', gist: 'Les jeux réduits augmentent les touches de balle et les actions techniques.' },
  { ref: 'Ortiz et al. (2023), Children, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10047062/', gist: 'L’approche par le jeu (TGfU) améliore nettement la prise de décision.' },
  { ref: 'Chua, Jimenez-Diaz, Lewthwaite, Kim & Wulf (2021), Psychological Bulletin, méta-analyses', url: 'https://doi.org/10.1037/bul0000335', gist: 'Une attention tournée vers l’effet du geste (focus externe) améliore performance et apprentissage.' },
  { ref: 'Czyż et al. (2024), Scientific Reports, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11237090/', gist: 'La pratique variée aide la rétention chez l’adulte, effet négligeable chez les jeunes et en situation réelle.' },
  { ref: 'Weeldenburg et al. (2022), PLOS ONE', url: 'https://doi.org/10.1371/journal.pone.0274964', gist: 'Les stratégies de climat de maîtrise (TARGET) vont avec plus de motivation autonome (3 150 élèves).' },
  { ref: 'Alonso-Vargas et al. (2026), Frontiers in Psychology, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13472835/', gist: 'Les modèles pédagogiques augmentent la motivation autonome et l’intention d’être actif.' },
  { ref: 'Boke et al. (2025), Frontiers in Psychology, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12106316/', gist: 'L’apprentissage coopératif améliore les apprentissages moteurs, cognitifs, sociaux et affectifs.' },
  { ref: 'Yao et al. (2025), PLOS ONE, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12530615/', gist: 'Le modèle d’éducation sportive améliore les apprentissages, surtout au secondaire.' },
  { ref: 'Tendinha et al. (2021), Children, revue systématique', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8306659/', gist: 'L’éducation sportive augmente la motivation et le plaisir en EPS.' },
  { ref: 'Duffey et al. (2021), Frontiers in Public Health, revue de revues', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8553996/', gist: 'Freins et leviers de l’activité physique des adolescentes.' },
  { ref: 'Wilhelmsen & Sørensen (2017), Adapted Physical Activity Quarterly, revue systématique', url: 'https://doi.org/10.1123/apaq.2016-0017', gist: 'Inclusion des élèves en situation de handicap en EPS (2009-2015).' },
  { ref: 'Rössler et al. (2018), Sports Medicine, essai randomisé', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5948238/', gist: 'L’échauffement « 11+ Kids » réduit de 48 % les blessures chez les 7-13 ans.' },
  { ref: 'Van Hooren & Peake (2018), Sports Medicine, revue', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5999142/', gist: 'Le retour au calme actif ne prévient pas les blessures et aide peu la récupération.' },
  { ref: 'Afonso et al. (2021), Frontiers in Physiology, méta-analyse', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8133317/', gist: 'Les étirements après l’effort n’accélèrent pas la récupération.' },
  { ref: 'Bull et al. (2020), British Journal of Sports Medicine, lignes directrices de l’OMS', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/', gist: '5-17 ans : 60 min par jour en moyenne d’activité modérée à vigoureuse, renforcement 3 jours par semaine.' },
  { ref: 'Barbosa et al. (2020), IJERPH, revue de revues', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7460146/', gist: 'L’activité physique ne nuit pas aux résultats scolaires et peut les améliorer.' },
  { ref: 'Faigenbaum & Myer (2010), British Journal of Sports Medicine', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3483033/', gist: 'Le renforcement musculaire encadré est sûr et utile chez les jeunes.' },
  { ref: 'Solum, Lorås & Pedersen (2020), Frontiers in Psychology', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7109330/', gist: 'Pas de preuve d’un « âge d’or » de l’apprentissage moteur vers 10 ans.' },
  { ref: 'Otoo et al. (2025), Cureus, revue sur la commotion (consensus d’Amsterdam 2022)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12738976/', gist: 'Retrait immédiat, reprise de l’école puis du sport par étapes.' },
  { ref: 'Coston & Ubaldi, « La double boucle » (EPS Régal)', url: 'https://www.epsregal.fr/la-double-boucle-pour-donner-du-sens-a-notre-enseignement-en-eps/', gist: 'Format petite boucle / grande boucle.' },
];

// ── Choix de ce qui est envoyé ────────────────────────────────────────────

type Stage = 'cycle3' | 'cycle4' | 'lycee';

/** Étape scolaire d'après le niveau de la classe (« 6e », « 4e », « 1re », « Bac Pro »…). */
export function stageOf(level: string): Stage | null {
  const l = level.toLowerCase();
  if (/6e|6ème|sixi|cm1|cm2/.test(l)) return 'cycle3';
  if (/5e|5ème|4e|4ème|3e|3ème|cinqui|quatri|troisi|segpa/.test(l)) return 'cycle4';
  if (/2nde|seconde|1re|1ère|premi|terminale|tle|bac|cap|lyc/.test(l)) return 'lycee';
  return null;
}

const STAGE_TEXT: Record<Stage, string> = { cycle3: CYCLE3, cycle4: CYCLE4, lycee: LYCEE };

/**
 * Connaissances à joindre aux consignes de Claude : principes généraux, programme et repères d'âge de la classe,
 * repères du champ d'apprentissage de l'activité. `fieldId` : « ca1 »… « ca5 » (champ de l'activité).
 */
export function epsKnowledgeFor(level: string, fieldId: string | null | undefined, activityId?: string | null): string {
  const stage = stageOf(level);
  const parts = [GENERAL];
  if (stage) parts.push(STAGE_TEXT[stage]);
  else parts.push('Niveau de classe non précisé : adapte au collège par défaut.');
  if (fieldId && FIELDS[fieldId]) parts.push(FIELDS[fieldId]);
  const act = activityId ? ACTIVITY_KNOWLEDGE[activityId] : undefined;
  if (act) parts.push(`Fiche de l'activité (${act.title}) :
${act.text}`);
  return `\n\n<connaissances_eps>\nCe qui suit est une base de connaissances vérifiée (programmes officiels, recherche de 2000 ou après). Appuie-toi dessus pour choisir les situations, l'organisation, les consignes et l'adaptation à l'âge, sans la recopier ni la citer, sauf si l'enseignant le demande.\n\n${parts.join('\n\n')}\n</connaissances_eps>`;
}

/** Tout le contenu, pour la page « Ce que sait l'IA ». */
export const EPS_KNOWLEDGE_SECTIONS: Array<{ title: string; text: string }> = [
  { title: 'Principes généraux', text: GENERAL },
  { title: 'Cycle 3 (CM1-6e)', text: CYCLE3 },
  { title: 'Cycle 4 (5e-3e)', text: CYCLE4 },
  { title: 'Lycée', text: LYCEE },
  ...Object.entries(FIELDS).map(([id, text]) => ({ title: `Champ ${id.toUpperCase()}`, text })),
];

/** Activité (identifiant et champ d'apprentissage) d'après son nom : activités des réglages, sinon activités par défaut. */
function activityByName(name: string): { id: string; fieldId: string } | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const list = [...(useData.getState().data.settings.activities ?? []), ...DEFAULT_ACTIVITIES];
  return list.find((a) => a.name.trim().toLowerCase() === n) ?? null;
}

/** Connaissances EPS pour une classe et une activité (nom), à ajouter aux consignes de Claude. */
export const knowledge = (level: string, activity: string) => {
  const a = activityByName(activity);
  return epsKnowledgeFor(level, a?.fieldId, a?.id);
};
