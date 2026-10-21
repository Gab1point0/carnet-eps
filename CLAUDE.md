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
- Ne jamais mettre de noms d'élèves : l'application ne les gère pas volontairement (vie privée).
- Dates `YYYY-MM-DD`, heures `HH:MM`, `weekday` 1 = lundi … 7 = dimanche.
- Pour dater des séances en respectant l'emploi du temps et les vacances, imite `nextOccurrences` (`src/lib/schedule.ts`) : une séance par créneau de la classe, hors périodes de `years[].holidays`.

### Modèle (voir `src/types.ts`, source de vérité)

```
AppData { schemaVersion:1, settings, years{}, classes{}, cycles{}, lessons{}, exercises{}, deleted{} }
SchoolYear { id,label:"2026-2027",start,end,zone,holidays:[{id,label,start,end,kind}] }
Klass      { id,yearId,name,level,students,color,slots:[{id,weekday,start,end,place}],sharedWith,notes,order }
Cycle      { id,classId|null,title,activityId,slotIds,startDate,endDate,objectives,competences,evaluation,notes,order }
Lesson     { id,classId|null,cycleId|null,activityId,title,order,date,start,end,status:planned|done|cancelled,
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
