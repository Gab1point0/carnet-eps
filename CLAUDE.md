# Carnet EPS — guide pour Claude

Application web (PWA) pour un enseignant d'EPS : classes, emplois du temps, cycles, séances, bibliothèque de situations et **animations de schémas**. Elle fonctionne sur PC et téléphone, hors ligne, et se déploie sur **GitHub Pages**. L'utilisateur parle français : interface, commentaires et messages de commit en français.

## Deux choses à ne pas confondre

1. **Le code** (ce dépôt) : l'application. Publique, sans donnée personnelle. Se modifie ici, se déploie via GitHub Actions à chaque push sur `main`.
2. **Les données** de l'enseignant : un fichier JSON (`carnet-eps-data.json`) dans un **dépôt privé séparé** (ex. `carnet-eps-donnees`). L'application le lit/écrit via l'API GitHub (synchronisation, réglages → « Synchronisation GitHub »). C'est aussi ce fichier que **tu modifies** quand l'utilisateur demande « ajoute une séance », « décale le cycle de volley », « crée 5 exercices de badminton »…

## Modifier les données (cas le plus fréquent)

1. Mets-toi dans le clone local du dépôt de données (`git pull` d'abord).
2. Regarde l'état : `node <chemin>/carnet-eps/scripts/data-tool.mjs summary carnet-eps-data.json`
3. Édite le JSON (voir le modèle ci-dessous). Les champs facultatifs peuvent être omis : l'application les complète (`normalizeData`).
4. **Toujours** lancer ensuite :
   - `node scripts/data-tool.mjs stamp carnet-eps-data.json` → met `updatedAt` à jour sur ce qui a changé et crée les pierres tombales des suppressions (sans cela, la fusion avec le téléphone peut écraser ta modification) ;
   - `node scripts/data-tool.mjs validate carnet-eps-data.json` → vérifie les références.
5. `git add -A; git commit -m "…"; git push`. L'application récupère le changement à l'ouverture / toutes les minutes en avant-plan / via « Synchroniser maintenant ».

Règles :
- Identifiants : chaînes uniques (ex. 9 caractères base 36). La **clé** de l'objet = `id`.
- Ne jamais écrire dans `deleted` à la main : utilise `stamp`.
- Ne jamais mettre de noms d'élèves dans ce fichier. Les élèves (noms, résultats des fiches d'évaluation) vivent uniquement dans le **coffre chiffré** de l'application (`src/store/vault.ts`, AES-GCM, mot de passe de l'enseignant), synchronisé à part dans `carnet-eps-eleves.chiffre.json` : ne jamais tenter de le lire, le déchiffrer ou le modifier, ni l'envoyer à Claude.
- Dates `YYYY-MM-DD`, heures `HH:MM`, `weekday` 1 = lundi … 7 = dimanche.
- Pour dater des séances en respectant l'emploi du temps et les vacances, imite `nextOccurrences` (`src/lib/schedule.ts`) : une séance par créneau de la classe, hors périodes de `years[].holidays`.

### Modèle (voir `src/types.ts`, source de vérité)

```
AppData { schemaVersion:1, settings, years{}, classes{}, cycles{}, lessons{}, exercises{}, deleted{} }
SchoolYear { id,label:"2026-2027",start,end,zone,holidays:[{id,label,start,end,kind}] }
Klass      { id,yearId,name,level,students,color,slots:[{id,weekday,start,end,place}],sharedWith,notes,order }
Cycle      { id,classId|null,title,activityId,slotIds,startDate,endDate,objectives,competences,evaluation,notes,order }
Lesson     { id,classId|null,cycleId|null,activityId,title,order,date,start,end,venueId|null,status:planned|done|cancelled,
             objective,materials,safety,blocks:[Block],bilan,tags }
Block      { id,kind:warmup|situation|skill|game|evaluation|theory|cooldown|free,title,minutes,text,materials,animation|null }
Exercise   { id,title,activityId,kind,minutes,tags,text,materials,animation|null }   // bibliothèque
Animation  { court,tokens:[{id,kind,label,color,size}],frames:[{id,caption,holdMs,moveMs,pos{tokenId:{x,y,hidden?,carry?,dx?,dy?,rot?}},arrows:[]}] }
```

- `classId: null` = élément **modèle** de la bibliothèque (cycle ou séance réutilisable).
- `Cycle.slotIds` : créneaux de la classe utilisés par le cycle (vide = tous). Sert à mener deux cycles en parallèle dans une même classe (ex. un bloc de 2 h et un bloc de 1 h par semaine, chacun avec son activité). Les séances du cycle doivent tomber sur ces créneaux.
- `Klass.sharedWith` : texte libre si la classe fait cours en commun avec un collègue ; vide sinon.
- `activityId` renvoie à `settings.activities[].id` (ex. `badminton`, `volley`, `basket`, `hand`, `course-duree`…).
- Positions d'animation en **% du terrain** (0–100). Terrains : `blank basket basket-half volley badminton hand foot rugby ultimate tennis tt track`. Jetons : `player coach ball cone hoop goal mat bench text`.
- Un ballon « porté » : `carry:<id du joueur>` + `dx,dy` (décalage en %) → il suit ce joueur et voyage avec lui entre les étapes.
- Chaque étape doit avoir une position pour **chaque** jeton (`validate` le vérifie ; l'appli répare sinon).
- **Matériel** : Block.materials = une ligne `- 12 plots (usage)` par objet ; Lesson.materials = ligne `🏟 Installation : …` puis `- 15 ballons — bloc 2 (passes) ; bloc 3 (match)` (quantité max sur la séance, blocs où l'objet sert). L'application ne totalise que ces lignes (lessonMaterialTexts). Le générateur est outils/materiel-par-bloc.mjs du dépôt de données (effectif de la classe → quantités).
- **Fiches sur mesure** (`Block.customSheets`, sections `FicheSection` de `src/lib/fiches.ts`) : mise en page libre. `span` (full/half/third/two-thirds) place des parties côte à côte ; tableau : `widths` (% par colonne affichée) pour aligner des tableaux, `cells` pré-remplies, première colonne absente si `head` et libellés vides ; parties `heading` et `box` (cadre à dessiner) ; `text` en mini-Markdown. `tidySection` (`src/lib/aiTasks.ts`) vérifie tout ce qui vient de Claude ou de l'éditeur (`src/components/FicheEditor.tsx`).
- **Fiches** : Block.sheets = identifiants de fiches imprimables (src/lib/fiches.ts, ~40 fiches : observation, score, contrat, composition…). Page /fiches (liste), /fiches/:id?cycle=&copies= (impression). Les blocs affichent des boutons « Fiches à imprimer ». Les textes des situations suivent le plan **Organisation / Déroulé / Rotations et rôles / Séries et durée / Critères de réussite / Pour adapter** (générés par outils/contextualiser-situations.mjs du dépôt de données).
- **Assistant IA** : `src/lib/ai.ts` (clé d'API et modèles dans localStorage `carnet-eps:ia`, jamais synchronisés ; appel direct depuis le navigateur) et `src/lib/aiTasks.ts` (consignes, schémas, conversions) : dictée (`aiIngest`), séance construite à partir d'un objectif (`aiFromObjective`, onglet « À partir d'un objectif » de la dictée), fiche sur mesure (`Block.customSheets`), schéma animé (`aiAnimation`), « Mettre en forme avec Claude » à côté de « Terminer » dans le texte d'un bloc (`aiFormatBlockText` : rédige ce qui a été écrit à la main, mêmes règles de mise en forme que la dictée, `BLOCK_TEXT_FORMAT` ; annulable par « Revenir à mon texte »). Sans clé ou en cas d'erreur, la dictée retombe sur les mots-clés (`src/lib/voiceLesson.ts`).
- **Parler à Claude** : toute zone où l'on donne une consigne à Claude (création, « demander une modification », consignes de cycle…) utilise `VoiceTextArea` (`src/components/VoiceTextArea.tsx` : texte + bouton « Parler » ; appeler `finish()` avant l'envoi pour garder les derniers mots). Règle demandée par l'enseignant pour toute nouvelle fonction IA.
- **Dictée** : `useDictation` (`src/lib/dictation.ts`) prend la reconnaissance du navigateur (Chrome, Edge, Safari, téléphones), sauf dans Opera, Brave et Vivaldi qui ne transcrivent rien : là, moteur intégré Whisper (`src/lib/localDictation.ts` + `whisper.worker.ts`, transformers.js ; whisper-small sur carte graphique WebGPU, whisper-base sinon ; modèle téléchargé depuis Hugging Face puis gardé en cache). Le micro est découpé à chaque pause ; `flush()` attend la fin des transcriptions.
- **Fiche d'évaluation (tableur)** : bouton « Fiche d'évaluation » des séances d'évaluation (`src/components/EvalSheetModal.tsx`). Claude (`aiEvalSheet`, `src/lib/aiTasks.ts`) prépare blocs, critères (4 degrés ou case unique), barème /20, AFC (collège) ou AFL (lycée) ; référentiel joint en photos ou PDF (`src/lib/attachments.ts`, envoyés comme blocs image/document), ou collé ; au lycée sans référentiel, Claude le cherche d'abord en ligne (`callClaudeResearch`, outil de recherche web). `src/lib/evalSheet.ts` produit le fichier Excel (exceljs) : une ligne par élève, cases FAUX à transformer en cases à cocher, couleurs et notes par formules, onglet « Barème », ligne « Moyenne de la classe ». Gardée dans `Lesson.evalSheet`.
- **Fiche d'évaluation comme un tableur** : types de critères `levels` (4 cases), `single` (1 case), `number` (valeur saisie : `unit`, `format` decimal/time en secondes/count), `computed` (`expr`, formule entre les `ref` des autres critères : + - * / ^, comparaisons, SI, ET, OU, ABS, MIN, MAX, MOYENNE, SOMME, ARRONDI…, CLASSE_MOY/MIN/MAX, RANG, tables BAREME et PALIERS ; `editable` : valeur remplaçable à la main pour un élève, gardée dans les résultats), `choice` (liste, `options` {label,pct}), `text` (observation, dans `StudentMarks.txt`). Points d'une valeur : `scoring` table (`points` {at,pct}, linéaire ou `steps`) ou rank (`best` high/low). `weight` par critère, `rounding` et `cap` pour la note finale. Calcul dans `src/lib/evalCalc.ts` (application et traduction en formules Excel, mêmes résultats) et `evaluateSheet` (toute la classe d'un coup : rangs, statistiques). Valeurs reprises d'une autre fiche de la classe depuis la fenêtre d'un critère.
- **Élèves et fiches remplies** : liste par classe (`StudentsSection`), fiche d'évaluation remplie dans l'application (`/lessons/:id/evaluation`, `src/pages/EvalFill.tsx`), export Excel avec les résultats. Groupes (`src/components/GroupsTools.tsx`, `src/lib/grouping.ts`) : formés sur la fiche, automatiques (hasard, homogènes, hétérogènes d'après une fiche remplie), repris d'une autre fiche ou enregistrés pour la classe ; « Groupes au hasard » sur l'accueil et bouton « Groupes » de chaque séance (`RandomGroupsModal.tsx` : tirage par nombre de groupes ou d'élèves par groupe, absents retirés ; les groupes de la séance sont `PrivateDoc.groups[lessonId]`, les mêmes que ceux de sa fiche d'évaluation) ; dans le coffre (`PrivateDoc.groups`, `savedGroups`). Synchronisation du coffre : fusion **élève par élève** pour les groupes (`Grouping.at`, `mergeGrouping`/`stampGrouping`) et **case par case** pour les résultats (`StudentMarks.at`, `mergeMarks`/`stampMarks`), pour qu'un appareil en retard n'efface jamais le travail fait ailleurs ; un nouvel appareil cherche le coffre en ligne avant de proposer d'en créer un (`checked`), deux coffres à mots de passe différents se réunissent (`conflict`, `VaultConflict`) ; « Retrouver une ancienne version » (`VaultHistory.tsx`) relit l'historique GitHub du fichier chiffré, le déchiffre sur l'appareil et remet ce qui a disparu (`restorePrivate`). Sexe des élèves (`Student.sex` « F » / « G », cases dans `StudentsSection`) : dans les formules des fiches, `fille` et `garcon` valent 1 ou 0 (vide si pas renseigné) pour les barèmes différenciés (`SI(fille; BAREME(…); BAREME(…))`), colonne « F / G » à l'export. Classement filles et garçons séparés : `scoring.bySex` (barème par rang) et `RANG_SEXE(v)` (formule), traduits en `COUNTIFS` sur la colonne « F / G » dans le tableur. Fiche déjà remplie refaite par Claude : les noms des blocs, critères et bonus qui ont des résultats (`filledKeys` ; tous si le coffre est fermé) sont donnés à Claude à garder mot pour mot, puis remis par `keepFilledNames` s'il les a renommés à la même place (les résultats sont rangés sous « bloc::critère »). Menu d'un bloc de séance : « Copier ce bloc dans la séance suivante » (prochaine séance datée de la même classe **dans la même activité**, sinon suivante du cycle ; ajouté à la fin, annulable). Données personnelles : coffre chiffré seulement (voir plus haut). Les appels à Claude n'en contiennent jamais.
- **Générer les séances d'un cycle** (`src/components/CycleGenerate.tsx`) : avertissement « proposition indicative », mode « Plan de la séquence » (`aiCyclePlan` : titre, objectif, moment d'évaluation par séance) ou « Séances complètes » (plan, puis `aiFromObjective` séance par séance). Remplit les séances vides (ou toutes si demandé), annulable d'un coup.
- **Lieux** : `Lesson.venueId`, sinon `Cycle.venueId` (lieu de pratique du cycle), sinon `Slot.venueId` (créneau) ; renvoient à `settings.venues[]` `{ id,name,travelMinutes,lockerMinutes }` (`null` = inconnu). Trajet et vestiaire comptés chacun avant et après la séance, retirés du créneau et affichés dans le déroulé (`src/lib/venues.ts`) ; ce ne sont pas des `Block`. À ne pas confondre avec `settings.places`, simples suggestions de l'emploi du temps.
- **Impression** : les boutons passent par `printPage` (`src/lib/printPdf.ts`) : `window.print()` sur ordinateur ; sur téléphone ou application installée, où il ne fait rien, un vrai fichier PDF (html2canvas-pro + jsPDF, chargés à la demande).
- Les textes (`text`, `objective`…) acceptent un mini-Markdown : `**gras**`, `*italique*`, `- liste`, `## titre`.

## Modifier l'application

```
npm run dev        # serveur local (http://localhost:5173)
npm run typecheck  # tsc
npm test           # vitest (logique : fusion, dates, emploi du temps, GitHub, animation)
npm run build      # tsc + vite build → dist/
```

Pile : Vite 8 · React 19 · TypeScript · Zustand · react-router (HashRouter, compatible GitHub Pages) · idb-keyval (IndexedDB) · lucide-react. Aucune dépendance de style : tout est dans `src/styles.css` et `src/pages.css` (variables CSS, thème clair/sombre, mobile d'abord).

```
src/types.ts            modèle de données
src/store/              data.ts (store + transactions + persistance IndexedDB), actions.ts (opérations métier),
                        selectors.ts, sync.ts (GitHub), ui.ts (toasts, confirmations, préférences), sample.ts, model.ts
src/lib/                dates, jours fériés + calendrier officiel (API data.education.gouv.fr), emploi du temps, fusion, client GitHub
src/animation/          engine.ts (temps, interpolation), courts.tsx (terrains SVG), Stage.tsx, Player.tsx, Editor.tsx
src/pages/              un fichier par écran ; src/components/ : composants partagés
public/sw.js            service worker (hors ligne) ; public/manifest.webmanifest
scripts/                make-icons.mjs, data-tool.mjs
```

Conventions :
- Toute modification de données passe par `useData.getState().transact(...)` / `put` / `patch` / `remove` (jamais en mutant le state) : cela met à jour `updatedAt`, ce dont dépend la synchronisation.
- Suppression : `remove()` retourne une fonction d'annulation ; affiche `toastUndo(...)` plutôt qu'une confirmation quand c'est possible.
- Les schémas d'animation sont du JSON pur (aucune dépendance vers React) : on peut les générer par programme.
- Après une série de modifications rapides de fichiers, le serveur Vite de Windows peut manquer un événement : si l'affichage semble périmé, redémarrer `npm run dev`.

## Déploiement

Push sur `main` → `.github/workflows/deploy.yml` (tests + build + Pages). `vite.config.ts` utilise `base: './'` : l'application fonctionne sous `https://<compte>.github.io/<depot>/`.
