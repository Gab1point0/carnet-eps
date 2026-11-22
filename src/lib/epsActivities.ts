// Fiches didactiques par activité, données à l'IA quand la séance ou le cycle porte sur cette activité.
// Condensé de documents ouverts et relus (référentiels académiques et du baccalauréat, ressources Eduscol, documents
// fédéraux), tous publiés en 2000 ou après. Les documents académiques sont des propositions, pas des prescriptions.
// Quelques rappels de sécurité d'usage courant (tapis, surveillance, distances) complètent les documents quand ils n'en disaient rien.
// Clé = identifiant d'activité des réglages (`DEFAULT_ACTIVITIES`). Année « (en ligne) » = date de mise en ligne.

import type { EpsSource } from './epsKnowledge';

export interface ActivityKnowledge {
  /** Nom affiché dans « Ce que sait l'IA ». */
  title: string;
  text: string;
  sources: EpsSource[];
}

const src = (ref: string, url: string, gist = ''): EpsSource => ({ ref, url, gist });

const K: Record<string, ActivityKnowledge> = {
  // ── CA4 : sports collectifs ─────────────────────────────────────────────
  volley: {
    title: 'Volley-ball',
    text: `Enjeu : sortir du duel service-réception des « éternels débutants » pour construire une vraie opposition entre collectifs ; aux premiers niveaux, pas de service frappé, contacts hauts à deux mains, jeu en triangle.
Niveaux : N1 2 contre 2 aménagé, contacts aménagés (rebond accompagné, attraper-relancer), renvoyer chez l'adversaire. N2 attaque intentionnelle de la cible (balle accélérée ou placée), communication, rôle de passeur. N3 3 contre 3 puis 4 contre 4 (3+1), alternance relayeur / attaquant. N4 4 contre 4 organisé, attaque placée ou smashée, mises en jeu variées.
Situations : 2 contre 2 sur 4,5 × 9 m, filet à 2,10 m, trois touches obligatoires, engagement lancé par le bas ; 3 contre 3 sur 7 × 14 m (N3) ; épreuve de fin de cycle 4 : 2 contre 2 avec un observateur-arbitre, 7 × 14 m, 2 sets de 15 points.
Rôles : joueur, arbitre, observateur, coach, en rotation.`,
    sources: [src(`FFvolley, « Éduc'volley » (2012, mis à jour en 2017)`, 'https://www.ffvb.org/data/Files/2018_DIVERS/2017_EDUCVOLLEY_BD.pdf', 'Niveaux 1 à 4 de la 6e à la terminale.')],
  },
  basket: {
    title: 'Basket-ball',
    text: `Enjeu : le règlement (s'arrêter après le dribble, tirer en équilibre, non-contact) est le moteur des apprentissages ; sans arbitre, pas de jeu.
Niveaux : N1 choix passe / dribble flou, tirs lointains en déséquilibre, peu de paniers. N2 jeu sans ballon (démarquages), transition attaque-défense, double pas. N3 jeu rapide et contre-attaque, difficulté à changer vite de statut. N4 jeu placé, espaces clés, joueurs sans ballon à activer, sélection du tir.
Situations : N1 4 contre 4 (deux binômes en 2 contre 2 avec retard défensif), 20 × 12 m, paniers à 2,60 m ; N2 4 contre 4 avec deux passeurs latéraux, défense individuelle ; N3 3 contre 3 avec retard défensif et « extra-balle » sur contre-attaque réussie ; N4 3 contre 3 sur demi-terrain, panier à 3,05 m.
Rôles : arbitre (4 règles au N1), observateur-coach, table de marque.
Sécurité : non-contact (pénalité au N1), porteur protégé sur son double pas.`,
    sources: [src(`Académie de Normandie, situations de référence en basket-ball (2019)`, 'https://eps.ac-normandie.fr/IMG/pdf/situations_de_reference_basket_2019.pdf')],
  },
  hand: {
    title: 'Handball',
    text: `Enjeu : entrer dans le jeu (passe, dribble, déplacement), puis créer et exploiter le surnombre : repli défensif, écartement, profondeur.
Niveaux : N1 peine à enchaîner attraper-courir selon le règlement, choix flous. N2 jeu sans ballon presque absent, réception à l'arrêt, pertes sur passes longues. N3 jeu dans l'axe, largeur et ailes inutilisées, intervalle à 6 m non reconnu. N4 face à des défenses qui occupent les couloirs, lecture du jeu et duels difficiles.
Situations : N1 3 contre 3 avec gardien en surnombre, mini-hand, 6 min ; N2 5 contre 5, buts 3 × 2 m, plots à 9 m qui imposent un retard de repli, extra-balle ; N3 6 contre 6 avec secteurs et ailiers jokers, tir après circulation dans 2 secteurs ; N4 6 contre 6, règlement complet.
Rôles : joueur, arbitre, observateur-coach.
Sécurité : contacts interdits au N1, maîtrisés aux N2-N3 (pas d'action sur un joueur en suspension).`,
    sources: [src(`Académie de Normandie, situations de référence en handball (juillet 2019)`, 'https://eps.ac-normandie.fr/IMG/pdf/sr_handball_juillet_2019.pdf')],
  },
  foot: {
    title: 'Football',
    text: `Enjeu : choisir passe ou dribble pour atteindre la zone de marque, puis construire des montées de balle collectives sans précipitation.
Niveaux (collège) : d'abord jeu en grappe, ballon repoussé plutôt que conduit ; puis élèves plus écartés, passe à 10 m dans les pieds, début d'attaque placée ; puis début d'organisation et démarquage vers le but. Au niveau 2, l'obstacle principal est la précipitation vers le but, qui fait perdre le ballon.
Situations : N1 tournois de 3 équipes de 4, terrain 30 × 40 m, 3 cibles de 3 m, match arrêté au premier but ; N2 5 contre 5 (4 + gardien), 45 × 40 m, gagne l'équipe qui garde le plus longtemps le ballon (au moins 3 touches) ; « jeu du chrono » 5 contre 5 sur 40 × 40 m.
Rôles : arbitre central et juges de touche, chronométreurs, observateur-coach.`,
    sources: [src(`Académie de Créteil, groupe football, tome 1 collège (2014)`, 'https://eps.ac-creteil.fr/IMG/pdf/2014-groupecp4-foot-tome1.pdf')],
  },
  rugby: {
    title: 'Rugby',
    text: `Enjeu : agir en tenant compte du but à atteindre et à défendre, avec passes vers l'arrière et droit de charge sur le porteur.
Niveaux (documents du cycle 3) : joueur « satellite » qui reste loin du ballon, puis joueur actif, puis joueur acteur qui choisit.
Situations : « toucher + 2 secondes » à 8 contre 8 sur 30 × 20 m (toucher à deux mains entre ceinture et épaules, 2 s pour passer) ; « jeu à ceinturer » qui prépare au plaquage ; 5 contre 5 sur 25 × 15 m.
Rôles : joueur, arbitre, observateur.
Sécurité : sans lunettes ni bijoux, cheveux attachés, pas de crampons ; au début pas de jeu au pied, pas d'arrachage ni de poussée ; entrer progressivement dans le contact.`,
    sources: [
      src(`DSDEN de la Gironde, document pédagogique rugby (2019)`, 'https://blogacabdx.ac-bordeaux.fr/eps33/wp-content/uploads/sites/27/2019/05/doc-p%C3%A9da-rugby-corrig%C3%A9.pdf'),
      src(`DSDEN de la Meuse, module rugby « toucher » (2023, en ligne)`, 'https://sites.ac-nancy-metz.fr/dsden55/wp-content/uploads/2023/07/Module-pedagogique-Rugby-Toucher.pdf'),
    ],
  },
  ultimate: {
    title: 'Ultimate',
    text: `Enjeu : alterner montée rapide et conservation du disque pour marquer face à une défense organisée, en auto-arbitrage (esprit du jeu).
Étapes : 1 précipitation, pas de pied de pivot, défenseur qui ne compte pas ; 2 progression régulière, passes courtes en revers, défense centrée sur le porteur ; 3 démarquage en appui à distance de passe, passes plus longues, défense individuelle ; 4 attaque adaptée au rapport de force, changements de rythme et de direction.
Situations : 4 contre 4 sur 20 × 40 m, en-buts de 6-7 m, terrain en 3 zones (franchir une zone rapporte des points) ; 4 contre 4 où l'en-but marqué en contre-attaque compte triple ; 3 contre 3 avec 2 capitaines dans l'en-but.
Rôles : joueur auto-arbitre, observateur, marqueur.
Sécurité : éviter les contacts, adapter l'engagement physique.`,
    sources: [src(`Eduscol, ressource cycle 4 ultimate (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsultimateca4nd575978pdf-78366.pdf')],
  },

  // ── CA2 ─────────────────────────────────────────────────────────────────
  escalade: {
    title: 'Escalade',
    text: `Enjeu : grimper en sécurité en cordée (grimpeur, assureur) et choisir une voie adaptée à son niveau.
Niveaux (référentiel du baccalauréat) : définis par la cotation et la modalité (moulinette, mouli-tête, tête) ; en moulinette, degré 1 vers 4b-4c+ (filles) ou 5a-5b (garçons), degré 4 vers 5c+-6a (filles) ou 6a-6b (garçons) ; la tête est plus exigeante.
Situations : voie tirée au sort dans le niveau choisi, puis assurage d'un camarade ; reprise après une première chute, arrêt à la seconde.
Rôles : cordées de 3 en semi-autonomie (grimpeur, assureur, contre-assureur ou observateur).
Sécurité : vérifications croisées dans la cordée (nœud de huit, baudrier, système d'assurage) puis contrôle de l'enseignant, seul décideur ; assurage en 5 temps, corde sans mou excessif ; la tête seulement avec l'accord de l'enseignant et un assureur capable de retenir une chute, deux premières dégaines pré-mousquetonnées.`,
    sources: [src(`Académie de Toulouse, exemple de référentiel bac escalade (2021, session 2022)`, 'https://pedagogie.ac-toulouse.fr/education-physique-et-sportive/system/files/2021-10/CA2%20ESCALADE%20Ref%20Bac%20exemple%20%283%29.pdf')],
  },
  orientation: {
    title: "Course d'orientation",
    text: `Enjeu : choisir un parcours adapté à son niveau, planifier un itinéraire, gérer sa sécurité de façon autonome.
Étapes : 1 parcours inadapté, réussit seulement les postes près des lignes directrices, sans stratégie ; 2 parcours adapté, erreurs sur les postes qui demandent des indices fins (végétation, relief) ; 3 se déplace grâce à des éléments variés du terrain, stratégie de course, outils de sécurité utilisés seul ; 4 parcours proche de ses limites, compare plusieurs itinéraires, participe à l'organisation.
Situations : « la cible » (3 niveaux de parcours, 2 min obligatoires au départ pour planifier, se situer selon le temps et le niveau) ; « cartes de niveau » (apprenti, débrouillé, expert ; 1 balise par sortie, 15 min au plus).
Rôles : tuteur d'un binôme, gestion du tableau de départ, organisation.
Sécurité : tableau de départ (qui part, où, quand), temps limite, zones interdites, savoir renoncer, tenue adaptée, respect du milieu ; binômes au début.`,
    sources: [src(`Eduscol, ressource cycle 4 course d'orientation (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsca2courseorientnd567453pdf-78327.pdf')],
  },
  sauvetage: {
    title: 'Sauvetage aquatique et savoir nager',
    text: `Enjeu : planifier un déplacement adapté au milieu pour assurer la sécurité d'un camarade, en gérant son énergie ; le savoir-nager en sécurité est une compétence distincte de la natation sportive.
Étapes : 1 se déplace sans anticiper, s'essouffle, subit le sauvetage ; 2 anticipe en partie, dépense trop d'énergie ; 3 planifie son déplacement et applique les principes de propulsion efficace ; 4 prend des informations pertinentes et surveille les nageurs pour agir vite.
Test du savoir-nager (arrêté de 2022), en continu, sans appui ni lunettes : entrée en chute arrière, franchissement d'un obstacle en immersion complète, 20 m sur le ventre avec surplace vertical de 15 s, demi-tour, 20 m sur le dos avec surplace de 15 s, nouveau franchissement, ancrage sur un élément fixe ; connaître le responsable de la surveillance et les règles d'hygiène et de sécurité. Acquisition visée dès le cycle 3.
Situations : récupérer en groupe tous les objets flottants et immergés après un plan collectif ; trinôme avec obstacles, récupération d'une « victime » au fond puis remorquage.
Rôles : sauveteur, victime, observateur, en rotation.
Sécurité : saisie qui garde les voies aériennes hors de l'eau, surveillance permanente du bassin.`,
    sources: [
      src(`Eduscol, ressource cycle 4 sauvetage (mars 2016)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsca2sauvetagend567457pdf-78330.pdf'),
      src(`Arrêté du 28 février 2022 sur l'attestation du savoir-nager en sécurité`, 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045269090/'),
    ],
  },

  // ── CA3 ─────────────────────────────────────────────────────────────────
  gym: {
    title: 'Gymnastique (sol et agrès)',
    text: `Enjeu : s'engager dans des actions acrobatiques (tourner, se renverser, voler) avec une prise de risque adaptée et mesurée.
Étapes du gymnaste : 1 actions globales, dissociation et coordination fragiles, peu d'impulsion ; 2 actions plus précises mais peu contrôlées dès qu'il y a envol, enchaînement élément par élément ; 3 figures maîtrisées, impulsion visible, enchaînement structuré et mémorisé ; 4 actions enchaînées selon les codes gymniques, amplitude, risque adapté.
Situations : roulade avant élevée sur mini-trampoline avec 2 aides, groupes de 4 à 6, retour vidéo ; « les défis » (un élève en défie un autre sur un élément, 2 juges valident) ; « le 1 + 1 » (combiner 2 éléments sur 3 et classer les 6 combinaisons du plus facile au plus difficile).
Rôles : gymnaste, juge, aide-pareur, observateur (vidéo).
Sécurité : aide placé perpendiculairement au déplacement, une main sur le support et l'autre au bassin ; matériel vérifié ; tapis ; plans inclinés ou suppression de l'élan pour simplifier ; savoir renoncer ou se réchapper.`,
    sources: [src(`Eduscol, ressource cycle 4 gymnastique (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsca3gymnd570203pdf-78345.pdf')],
  },
  acrosport: {
    title: 'Acrosport',
    text: `Enjeu : composer et réaliser des figures collectives stables, avec des montages et démontages en sécurité.
Niveaux (lycée) : niveau 3 chorégraphie d'au moins 4 figures différentes avec des liaisons, montages et démontages stables et sûrs, chaque élève porteur et voltigeur ; niveau 4 chorégraphie structurée sur un support sonore, dans un espace orienté, liaisons fluides, formations variées (duo, trio, quatuor).
Situations : « deux et deux font quatre » (fusion de deux duos en quatuor, immobilité 3 s) ; « 12 figures à l'essai » ; « jamais deux sans trois » ; routines dynamiques.
Rôles : porteur, voltigeur, pareur, juge.
Sécurité (principes VEGA) : verrouillages, enroulements, gainages, amortissements ; prises et appuis sur les zones solides (bassin, épaules), jamais sur le dos creux ; montées et descentes contrôlées ; tapis, distance entre les groupes ; l'enseignant surveille depuis l'extérieur de l'espace de pratique.`,
    sources: [src(`Académie de Grenoble, séance d'acrosport au lycée (2019, en ligne)`, 'https://eps-pedagogie.web.ac-grenoble.fr/sites/default/files/media-d7/media-fichiers/2019-07/seance.pdf')],
  },
  danse: {
    title: 'Danse',
    text: `Enjeu : composer et danser à plusieurs, avec des formes corporelles variées et un propos, devant des spectateurs.
Étapes du danseur : 1 motricité usuelle, formes étriquées ; 2 formes diversifiées, contrastes ; 3 modulation des énergies, relation à l'autre ; 4 formes précises porteuses d'intentions, écoute (interprète). Du chorégraphe : 1 contraintes non respectées ; 2 séquences mises bout à bout ; 3 séquences liées au service du propos ; 4 fil conducteur lisible, tous contribuent. Du spectateur : 1 juge la personne ; 2 reconnaît des éléments simples ; 3 s'exprime dans plusieurs registres ; 4 apprécie les effets au regard du propos et propose des améliorations.
Situations : « l'individu et le groupe » (groupes de 4 à 6 : entrée, 3 tableaux, sortie) ; « les bouts de scotch » (solo de 3 à 5 actions initiées par des parties du corps différentes, puis composition à deux : unisson, décalage, répétition, question-réponse) ; « duplicata » (copier ou être copié).
Rôles : danseur, chorégraphe, spectateur.
Sécurité : occupation de l'espace, acceptation progressive du contact.`,
    sources: [src(`Eduscol, ressource cycle 4 danse (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsca3dansend570200pdf-78351.pdf')],
  },
  cirque: {
    title: 'Arts du cirque',
    text: `Enjeu : composer et présenter un numéro collectif qui combine jonglage, acrobatie et équilibre, en maîtrisant ses émotions et en acceptant le regard des autres.
Niveaux : 1 numéro collectif autour d'un thème, jeu d'acteur, éléments simples d'au moins 2 des 3 familles ; 2 démarche de création avec les 3 familles et une mise en scène qui évoque un univers ; 3 création collective concise et originale, engagement affectif et technique.
Situations (cycle de 10 séances) : entrée en piste, manipuler, acrobatie, équilibre, relation, composition ; créer à partir de l'objet, de la chute, du contact, du risque, du message ; savoir chuter, se porter, équilibre sur objet instable, lancers-rattrapés.
Rôles : interprète, metteur en piste, spectateur-conseiller, pareur.
Sécurité : parade et réchappes intégrées au jeu d'acteur ; équilibre sur objet instable par paliers (seul au sol, debout avec pareur aux hanches, puis zone de chute aménagée) ; pieds nus, espace autour dégagé.`,
    sources: [src(`Académie de Bordeaux, dossier pédagogique arts du cirque (2015)`, 'https://ent2d.ac-bordeaux.fr/disciplines/eps/wp-content/uploads/sites/33/2015/11/dossier_pedagogique_-_les_arts_du_cirque.pdf')],
  },

  // ── CA5 ─────────────────────────────────────────────────────────────────
  'course-duree': {
    title: 'Course en durée',
    text: `Enjeu : trois mobiles au choix de l'élève : préparer une échéance (cross, 3 × 500 m, 1 500 m), entretenir sa forme, ou santé et dépense énergétique.
Progression de cycle : estimer sa VMA, vivre une séance par mobile, concevoir une séance en groupe, puis concevoir et réaliser seul une séance de 30 min (hors échauffement).
Paramètres (en % de VMA) : préparer une échéance : 100-120 % (3 à 6 × 1 à 6 min), 85-100 % (2 à 4 × 3 à 12 min), 75-85 % (1 à 2 × 6 à 24 min) ; entretien : 90-100 % (5 à 10 × 1 min / 1 min), 70-80 % (1 à 3 × 10 à 20 min) ; santé : 80-90 % (5 à 10 × 1 min / 1 min), 70-80 % (1 à 3 × 5 à 20 min). Exemple santé : 3 min à 80 %, 4 min à 75 %, 6 min à 70 %, 8 min à 60 %, 1 min de récupération entre les blocs.
Outils : carnet d'entraînement, pouls, échelle de ressentis (respiration, muscles, motivation) ; allure contrôlée par balises sans montre.
Rôles : observateur qui rappelle le projet et note avances et retards à chaque balise.
Sécurité : échauffement progressif, hydratation, pas de changement brutal d'allure, arrêt en cas de douleur.`,
    sources: [
      src(`Académie de Grenoble, cycle course en durée au lycée (2013)`, 'https://eps-pedagogie.web.ac-grenoble.fr/sites/default/files/media-d7/media-fichiers/2019-07/cycle_cedn4_lgt_rex2013.pdf'),
      src(`Académie de Dijon, connaissances en course en durée (2024, en ligne)`, 'https://eps.wp.ac-dijon.fr/wp-content/uploads/sites/20/2024/12/connaissances_course_en_duree_pontus_1_.pdf'),
    ],
  },
  musculation: {
    title: 'Musculation',
    text: `Enjeu : trois mobiles : puissance (3 à 5 séries de 4 à 8 répétitions, récupération 3 min), tonification et aide à l'affinement (4 séries de 15 à 20 répétitions à 55-65 % de la charge maximale, récupération 1 min à 1 min 30), volume (séries de 10 à 12 répétitions à 75-80 %, récupération 1 min 30 à 2 min).
Progression : mobiliser ses segments sous une charge personnalisée, puis réaliser une séance selon des paramètres prévus, puis concevoir et mener son propre projet sur le cycle.
Formes de séance : même exercice en séries pour tous ; enchaînement de plusieurs exercices sur 3 à 4 séries ; circuit (5 exercices au plus) ; travail localisé (3 à 4 exercices de 3 à 5 séries).
Outils : carnet, échelle de ressenti, tables de conversion des charges.
Rôles : pareur, observateur, coach qui corrige trajets et postures.
Sécurité : échauffement complet ; technique et placement avant la charge ; jamais de charge maximale, pas moins de 6 répétitions au collège-lycée ; pas d'excentrique lourd ; barres posées au sol, charges symétriques, ateliers espacés ; matériel vérifié.`,
    sources: [src(`Académie de Lyon, « La musculation au lycée » (2008)`, 'https://eps.enseigne.ac-lyon.fr/spip/IMG/pdf/La_musculation_au_lycee.pdf')],
  },
  step: {
    title: 'Step',
    text: `Enjeu : trois thèmes : puissance aérobie (plus de 85 % de la FC de réserve, séries de 2 à 4 min, 16 min d'effort au moins), capacité aérobie (70-85 %, séries de 5 à 8 min, 20 min au moins), endurance fondamentale (au moins 50 %, séries de 8 à 14 min, 24 min au moins).
Degrés (baccalauréat) : continuité des pas, de nombreux arrêts et erreurs de chorégraphie au degré 1 à un enchaînement solide au degré 4 ; création, de l'imitation de pas simples marchés aux bras dissociés et à l'originalité ; autonomie, de dépendant à leader qui tient compte des autres.
Forme de séance : 30 min hors échauffement, 4 à 6 blocs bouclés, dont au moins un composé par l'élève ; musique de 125 à 145 battements par minute au plus.
Variables d'intensité : hauteur du step, bras au-dessus des épaules, lests, sursauts, tempo, pas complexes, changements de direction.
Outils : fréquence cardiaque (formule de Karvonen), ressentis (aisance respiratoire, fatigue musculaire, état psychologique), carnet. Rôle : coach qui relève les fréquences et observe la continuité.
Sécurité : repartir quand la fréquence cardiaque a baissé de 20 pulsations.`,
    sources: [src(`Académie de Grenoble, fiche bac step (2022, en ligne)`, 'https://eps-pedagogie.web.ac-grenoble.fr/sites/default/files/media-d7/media-fichiers/2022-07/bgt_fca_ca5_step_1.pdf')],
  },
  yoga: {
    title: 'Yoga',
    text: `Enjeu : trois thèmes : s'apaiser (se détendre, récupérer), se stimuler (se tonifier, retrouver de l'énergie), se stabiliser (équilibrer ses émotions, gérer son stress).
Degrés : 1 engagement faible, postures imprécises, respiration inadaptée, carnet irrégulier ; 2 ordre des postures respecté, respiration irrégulière, bilan général ; 3 choix cohérents (postures et contre-postures), postures et respiration coordonnées, ressenti renseigné ; 4 choix personnels justifiés, entrées et sorties précises, ressenti fin.
Forme de séance : 30 min hors échauffement, au moins 8 postures et un exercice de respiration (pranayama) ; modalité statique, enchaînée ou dynamique (thème « se stimuler ») ; au moins 5 respirations par posture, des deux côtés ; familles : ouverture, fermeture, torsion, ouverture latérale, équilibre.
Paramètres : ordre et nature des postures, nombre de respirations, contre-postures, temps de repos, contrôle du souffle.
Outils : carnet, échelle de ressenti. Rôles : observateur, guide.
Sécurité : postures sans douleur, entrées et sorties lentes, appuis précis.`,
    sources: [src(`AEEPS, référentiel yoga (juin 2021)`, 'https://www.aeeps.org/file/download?fileId=6741')],
  },
  'cross-training': {
    title: 'Cross-training',
    text: `Enjeu : apprendre à s'entraîner à haute intensité de façon lucide et autonome, avec un projet personnel ; binôme pratiquant-juge.
Étapes : 1 postures qui se dégradent vite, échauffement minimal, niveau optimal inconnu ; 2 postures tenues aux niveaux faciles, dégradées au niveau optimal ; 3 projet selon ses forces et faiblesses ; 4 ateliers choisis pour travailler ses faiblesses, ordre des groupes musculaires optimisé.
Formes : séances de 16 à 24 min en équipe de 3 ; 4 à 6 exercices en 4 catégories (haut du corps, bas du corps, cardio, gainage), chacun à 2 ou 3 niveaux ; AMRAP (le plus de tours possible en un temps donné), relais, EMOM (une tâche au début de chaque minute), Tabata (8 × 20 s / 10 s), rapports travail / repos de 30/30, 15/15, 20/10, 45/15.
Outils : carnet, passeport technique (pas de niveau d'exercice sans validation de la posture), pouls sur 15 s. Rôles : pratiquant, coach, chronométreur, juge.
Sécurité : dos droit, genoux alignés, amplitudes respectées, gainage ; le juge arrête l'exercice si la posture devient dangereuse.`,
    sources: [
      src(`Eduscol, ressource lycée professionnel cross-training (2019, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra19lyceepcapepsca5cross-training1211541pdf-85170.pdf'),
      src(`Académie de Besançon, formation cross-training (2020)`, 'https://eps.ac-besancon.fr/wp-content/uploads/sites/36/2020/04/Formation-Cross-training.pdf'),
    ],
  },
  'nat-duree': {
    title: 'Natation en durée',
    text: `Enjeu : trois mobiles : préparer une échéance, entretenir sa forme, se tonifier ou s'affiner ; « savoir s'entraîner » pour s'entretenir.
Niveaux : séquence de 20 min proposée par l'enseignant en modulant intensité, durée et nage ; puis construire seul une séance de 30 min en 3 ou 4 séquences ; puis projet personnel sur la durée.
Progression de cycle : test 6 × 50 m crawl (1 min 30 de récupération) à 4 allures (souple, modérée, soutenue, maximale), puis séances imposées, puis séances conçues par l'élève, puis séance de 30 min.
Paramètres : intermittent court (5 à 10 × 1 min / 1 min) ou continu (1 à 3 × 10 à 20 min) selon le mobile.
Outils : échelle de difficulté perçue, cardiofréquencemètre ou pouls, chronomètre mural, carnet ; pull-buoy, palmes. Rôles : nageur, observateur, coach.
Sécurité : surveillance permanente du bassin, lignes d'eau par niveau, sens de circulation.`,
    sources: [
      src(`Académie de Grenoble, cycle natation en durée au lycée (2013)`, 'https://eps-pedagogie.web.ac-grenoble.fr/sites/default/files/media-d7/media-fichiers/2019-07/cycle_nedn4_lgt_rex2013.pdf'),
      src(`Vice-rectorat de Nouvelle-Calédonie, natation en durée (2015)`, 'https://eps.ac-noumea.nc/sites/eps.ac-noumea.nc/IMG/pdf/natation_en_duree.pdf'),
    ],
  },
};

// ── CA1 ─────────────────────────────────────────────────────────────────
const CA1_K: Record<string, ActivityKnowledge> = {
  'demi-fond': {
    title: 'Demi-fond',
    text: `Enjeu : gérer son effort (tenir et ajuster une allure), programmer un entraînement (VMA, allures, récupération), s'échauffer de façon autonome.
Étapes : 1 change d'allure sans raison ; 2 tient une allure grâce à des repères extérieurs ; 3 tient et ajuste son allure avec des repères intérieurs (sensations) ; 4 persévère malgré la fatigue à intensité élevée.
Situations : boucle avec plots tous les 10 m, élèves de même VMA groupés (chasubles), projet choisi (par exemple 9 min entre 70 et 110 % de VMA, ou 3 min entre 80 et 120 %), récupération de 2 à 5 min ; mesure : vitesse réalisée comparée à la vitesse visée, échelle de ressentis, fréquence cardiaque.
Rôles : coureur, observateur de l'allure, conseiller.
Sécurité : échauffement complet et progressif, adapté aux ressentis.`,
    sources: [src(`Eduscol, ressource cycle 4 demi-fond (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsdemifondnd565118pdf-78294.pdf')],
  },
  relais: {
    title: 'Vitesse et relais',
    text: `Enjeu (relais) : le receveur part à fond sur une marque et reçoit le témoin à pleine vitesse dans une zone limitée ; le relais est réussi quand il va plus vite que les coureurs seuls.
Étapes : 1 transmission à l'arrêt, les relayeurs se tamponnent ; 2 en mouvement, mais le donneur ralentit ; 3 zone d'élan utilisée, transmission souvent rapide ; 4 pleine vitesse à chaque fois, receveur qui anticipe.
Situations : groupes de 3 de niveau proche (2 coureurs, 1 chronométreur), marque de départ à 4 m de l'entrée de zone puis réglée de 0,5 m en 0,5 m, zone de 10 à 20 m ; défi : un relais 2 × 30 m doit battre un coureur seul sur 60 m, 3 fois sur 4 ; au niveau 2, 2 à 4 × 40-50 m, départ commandé, projet tactique.
Rôles : donneur, receveur, chronométreur, juge de zone, starter.`,
    sources: [
      src(`Eduscol, ressource cycle 4 relais (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsrelaisnd565128pdf-78300.pdf'),
      src(`Académie de la Martinique, relais-vitesse au collège (2014)`, 'https://site.ac-martinique.fr/eps/wp-content/uploads/sites/13/2014/06/relais_vitesse_coll%C3%A8ge1.pdf'),
    ],
  },
  haies: {
    title: 'Course de haies',
    text: `Enjeu : courir vite en franchissant sans perdre de vitesse, avec un nombre d'appuis régulier entre les haies.
Étapes : 1 piétine devant la haie, s'écrase derrière, franchissement en cloche ; 2 intention de vitesse mais perte de vitesse, jambe de retour en dessous ; 3 nombre d'appuis constant, franchissement plus rasant sur sa jambe préférée ; 4 très peu de perte de vitesse, franchissement rasant quelle que soit la jambe d'attaque.
Situations : 40 m avec 3 haies espacées de 10 m (haies basses, 55 à 70 cm) ; 50 m avec 4 haies et intervalles au choix de 8, 10 ou 12 m (65 à 76 cm) ; mesures : temps, nombre d'appuis, jambe d'attaque (repère de couleur à la cheville).
Rôles : coureur, observateur des appuis, chronométreur, juge.
Sécurité : haies qui basculent dans le bon sens, échauffement spécifique.`,
    sources: [src(`Eduscol, ressource cycle 4 haies (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epshaiend565122pdf-78303.pdf')],
  },
  longueur: {
    title: 'Saut en longueur',
    text: `Enjeu : course d'élan accélérée et étalonnée, impulsion d'un pied dans la zone d'appel, saut orienté vers l'avant et le haut.
Étapes (document de l'école primaire, à adapter) : d'abord élan trop long ou trop court, appel imprécis, saut rasant, réception sur un pied ; puis course étalonnée, toujours le même pied d'appel, poussée complète de la jambe, réception à deux pieds.
Situations : « les 3 essais » (élan de 10 à 15 m, moyenne des meilleurs essais) ; « atteindre la latte » ; « la grille » (repères tous les 20 cm pour viser une distance).
Rôles : sauteur, juge d'appel, mesureur, secrétaire.
Sécurité : zone d'appel dans l'axe du bac, sable retourné, sens de circulation, sol non glissant.`,
    sources: [src(`DSDEN de Loire-Atlantique, sauts aux cycles 2 et 3 (2005)`, 'https://www.pedagogie1d.ac-nantes.fr/medias/fichier/sauts2005_1132218015656.pdf')],
  },
  hauteur: {
    title: 'Saut en hauteur',
    text: `Enjeu : relier l'élan et l'impulsion pour franchir la barre avec une vitesse optimale.
Niveaux (collège) : 1 élan étalonné de 4 à 6 appuis, trois derniers appuis alignés, impulsion face au premier tiers du tapis ; 2 élan de 6 à 8 appuis, droit puis courbe, saut dorsal (Fosbury), chute sur les épaules, gestion du nombre d'essais.
Situations : concours à nombre d'essais limité, l'élève choisit ses hauteurs ; comparer son record selon la longueur d'élan.
Rôles : sauteur, observateur, juge, replaceur de barre.
Sécurité : tapis de réception suffisant, barre souple ou élastique au début, un sauteur à la fois, zone d'impulsion respectée.`,
    sources: [src(`Académie de la Martinique, saut en hauteur au collège (2014)`, 'https://site.ac-martinique.fr/eps/wp-content/uploads/sites/13/2014/06/saut_hauteur_coll%C3%A8ge1.pdf')],
  },
  javelot: {
    title: 'Lancer de javelot',
    text: `Enjeu : lancer beaucoup malgré les contraintes de sécurité ; lancer « bras cassé » dans l'axe, engin tiré loin derrière.
Situations : 4 aires, équipes de 4 lanceurs ; engins de plus en plus proches du javelot (vortex sans élan, balle lestée dans une chaussette, vortex avec élan réduit, javelot) ; 3 essais par aire, points selon la zone atteinte, score moyen d'équipe.
Rôles : lanceur, juge d'aire, juge de zone de réception, secrétaire.
Sécurité (valable pour tous les lancers, poids compris) : on lance seulement sur ordre du juge ou de l'enseignant ; zones de lancer, d'attente (derrière le lanceur), de réception et de sécurité entre ateliers ; le lanceur est seul devant ; on ne récupère les engins que lorsque tous sont lancés ; les juges ne tournent jamais le dos au lanceur ; regarder avant de lancer.`,
    sources: [
      src(`Académie de Bordeaux, situation complexe en javelot, niveau 1 (2017)`, 'https://ent2d.ac-bordeaux.fr/disciplines/eps/wp-content/uploads/sites/33/2017/08/Exemple-de-situation-complexe-en-Javelot-Niveau-1_a518.pdf'),
      src(`DSDEN de l'Ain, lancers en EPS : les incontournables de sécurité (2023)`, 'https://eps01.enseigne.ac-lyon.fr/spip/IMG/pdf/lancers_eps_securite_incontournables.pdf'),
    ],
  },
  'nat-vitesse': {
    title: 'Natation de vitesse',
    text: `Enjeu : garder une vitesse optimale sur la distance, en crawl et en dos, avec un départ et un virage efficaces et un bon compromis entre amplitude et fréquence de nage.
Étapes : 1 plongeon et virage sans vitesse, forte baisse de vitesse en dos ; 2 plongeon correct mais peu exploité, reprise de nage trop tôt, écart entre crawl et dos ; 3 plongeon à vitesse optimale, virage qui relance, respiration adaptée ; 4 corps profilé, virage plus rapide que la nage.
Situations : 25 m crawl + 25 m dos avec indice de nage (amplitude × vitesse) ; critères : moins de 10 s d'écart entre les deux 25 m, amplitude d'environ 1,4 m ou plus ; allers-retours d'échauffement de 6 à 8 min.
Rôles : starter, chronométreur, compteur de coups de bras, observateur.
Sécurité : surveillance permanente, plongeon seulement en eau assez profonde.`,
    sources: [src(`Eduscol, ressource cycle 4 natation (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epsnatationnd565124pdf-78306.pdf')],
  },
};

// ── CA4 : raquettes et combat ───────────────────────────────────────────
const RAQ_K: Record<string, ActivityKnowledge> = {
  badminton: {
    title: 'Badminton',
    text: `Enjeu : gagner le match en variant direction, longueur et hauteur des frappes pour faire évoluer le rapport de force ; problèmes à traiter dans l'ordre : mettre en jeu, retourner le service, rompre l'échange par l'espace, puis par la vitesse, enfin exploiter la situation favorable.
Niveaux : 1 nombreuses fautes, pas de coup préférentiel, service irrégulier, peu de déplacements ; 2 un coup préférentiel (dégagement, amorti), service réglementaire, déplacements réactifs mais déséquilibrés ; 3 panel de coups en situation favorable, système de jeu préférentiel (smash, amorti, drive), services variés, pas chassés et recentrage ; 4 coups variés même sous pression, feintes, avantage pris dès le service, adaptation en cours de match.
Situations : « Morpion » (services visés dans 9 cases) ; « Retour gagnant » (2 joueurs et 1 arbitre, service court ou long au choix) ; « Banco » (on annonce la situation favorable pour marquer plus) ; « Carré magique » (zones interdites) ; tournoi : 3 binômes par terrain, matchs en 15 points, coaching de 1 min 30 à 8 points.
Rôles : joueur, coach, partenaire d'entraînement, arbitre, observateur.
Sécurité : poteaux de filet fixés, distance entre terrains, volant tenu par la jupe au service.`,
    sources: [
      src(`LIEP, badminton (2020)`, 'https://liep.fr/wp-content/uploads/2020/08/Badminton.pdf'),
      src(`FFBaD, livret EPS (2026)`, 'https://frontwebservice.ffbad.org/storage/documents/pages/Impacter/Education/Badminton_scolaire_et_universitaire/Livret_EPS_2026_VF.pdf'),
    ],
  },
  tt: {
    title: 'Tennis de table',
    text: `Enjeu : choisir un projet de jeu d'après le rapport de force (exploiter ses coups forts, les faiblesses de l'adversaire, ou contrer ses coups forts) et le réajuster pendant le set.
Degrés : 1 nombreuses fautes en coup droit et en revers, pas de coup préférentiel efficace ; 2 un coup préférentiel efficace ; 3 coups organisés en système de jeu préférentiel (smash, lift, services rapides), services variés, déplacements adaptés ; 4 large panel de coups, services qui créent des occasions de marquer, replacements variés. Projet de jeu : du degré 1 (aucun élément exploité) au degré 4 (deux éléments et adaptation en cours de set).
Situations : équipes de 2, 5 matchs en 2 sets gagnants (4 simples, 1 double), coaching entre les sets ; score cumulé en 3 phases (simple jusqu'à 7, simple jusqu'à 14, double jusqu'à 21) avec un temps d'entraînement avant chaque phase ; montée-descente entre les tables pour des matchs équilibrés.
Rôles : joueur, coach, partenaire d'entraînement, arbitre, observateur ; carnet d'entraînement.`,
    sources: [
      src(`Eduscol, illustration bac tennis de table, lycée général (août 2019)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra19lyceegtepsterillustrationca4tennisdetable1185807pdf-84897.pdf'),
      src(`Eduscol, tennis de table, lycée professionnel (novembre 2019)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra19lyceepcapepsca4tennisdetable1211537pdf-85164.pdf'),
    ],
  },
  tennis: {
    title: 'Tennis',
    text: `Enjeu : produire des frappes variées (longueur, direction, vitesse) pour faire évoluer le rapport de force, puis varier précision, effets et hauteurs.
Niveaux : 1 joue de face, trajectoires aléatoires, nombreuses fautes directes, service à la cuillère ; 2 soutient l'échange, varie volontairement les trajectoires, service frappé mais irrégulier ; 3 placements en largeur et en profondeur, frappes accélérées ou avec effet, construction du point, services placés.
Situations : poules de 4 à 6 joueurs de niveau proche, jeux décisifs en 7 points ; après le premier set, le joueur analyse et annonce sa stratégie pour le suivant.`,
    sources: [src(`Académie de la Martinique, référentiel tennis (2014)`, 'https://site.ac-martinique.fr/wp-content/uploads/sites/13/2014/06/TENNIS.pdf')],
  },
  judo: {
    title: 'Judo et lutte',
    text: `Enjeu (lutte) : gagner un combat debout dans le respect des règles, en saisissant les occasions avec des attaques variées, et collaborer pour arbitrer, observer et conseiller. Judo : « faire contre » (combat) et « faire avec » (partenaire).
Niveaux (lutte) : 1 se protège en s'éloignant ou agit en force dans un seul sens ; 2 une action offensive opportune, sans varier les contrôles ; 3 au moins 2 contrôles ou formes de corps opportuns ; 4 au moins 2 contrôles enchaînés de façon fluide et rapide. Judo : apprendre d'abord à chuter et à combattre debout, puis éventuellement au sol.
Situations : « la porte » (poules de 3 ou 4 selon le poids, surface ronde de 4 m, 1 point par sortie contrôlée, 10 pour une mise en danger, 100 pour un tombé de 2 s ; rôles qui tournent à chaque point) ; « travail par 4 » (3 partenaires offrent des occasions, l'attaquant enchaîne les prises pendant 30 s). Judo : couples ou groupes de 3-4 avec arbitre, environ 4 m² par couple.
Rôles : combattant, partenaire, arbitre, juge, secrétaire, observateur-coach.
Sécurité : apprendre à chuter avant tout combat debout ; savoir arrêter le combat ; règles d'or : ne pas faire mal, le plus fort s'adapte à son partenaire ; groupes de poids proches.`,
    sources: [
      src(`Eduscol, ressource cycle 4 lutte (2016, d'après le nom du fichier)`, 'https://eduscol.education.gouv.fr/sites/default/files/document/ra16c4epslutteca4nd575974pdf-78369.pdf'),
      src(`Le judo en établissement scolaire, HAL (2002)`, 'https://hal.science/hal-02502052v1/file/JUDO_en_etablissement_scolaire.pdf'),
    ],
  },
  boxe: {
    title: 'Boxe française',
    text: `Enjeu : toucher plus que l'autre et toucher sans se faire toucher, en contrôlant la force de la touche.
Niveaux : 1 apprécie les distances, garde maintenue, fouettés armés, touches surtout en ligne basse et médiane, enchaînements simples, quelques ripostes ; 2 combine distances courtes et longues, enchaîne pieds et poings sur 2 hauteurs, se déplace dans tous les sens, feinte, contre-riposte.
Situations : 2 tireurs et 1 arbitre, aire de 4 × 4 m au collège, assauts de 1 à 2 min avec un nombre limité d'attaques et des enchaînements à 2 coups ; au niveau 1 : fouetté, chassé latéral, direct, revers ; au niveau 2 s'ajoutent le chassé frontal et le crochet.
Rôles : arbitre (« en garde », « allez », « stop »), juge, second (conseiller), partenaire.
Sécurité : touches contrôlées (assaut, pas de puissance), trajectoires montantes vers le visage sanctionnées, arbitre qui contrôle distance et puissance ; en début de cycle, cibles en ligne médiane et ripostes imposées.`,
    sources: [src(`Académie de Grenoble, savate boxe française au collège (2013)`, 'https://eps-pedagogie.web.ac-grenoble.fr/sites/default/files/media-d7/media-fichiers/2019-07/sbf_enseignement_au_college_2013-3.pdf')],
  },
};
Object.assign(K, CA1_K, RAQ_K);

// Activités proches qui partagent une fiche.
K.vitesse = K.relais;
K.natation = K['nat-vitesse'];
K.poids = { ...K.javelot, title: 'Lancer de poids (sécurité des lancers)', text: K.javelot.text.split('\n').filter((l) => l.startsWith('Sécurité')).join('\n') };
K['gym-sol'] = K.gym;
K['gym-agres'] = K.gym;

export const ACTIVITY_KNOWLEDGE: Record<string, ActivityKnowledge> = K;
