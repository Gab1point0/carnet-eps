# 🏐 Carnet EPS

Votre carnet de cours d'EPS, **sur ordinateur et sur téléphone** :

- **Classes** avec emploi du temps hebdomadaire, par année scolaire ;
- **Cycles** (une activité sur plusieurs séances) : les séances sont **datées automatiquement** sur vos créneaux, en évitant vacances et jours fériés (calendrier officiel importable, zones A/B/C) ;
- **Séances** modulables bloc par bloc (échauffement, situations, jeu, retour au calme…) avec durées, matériel, sécurité, bilan ;
- **Animations de situations** : schémas sur terrain de basket, volley, badminton, hand, foot, rugby, tennis, piste… avec joueurs, ballons, plots, flèches, étapes et lecture animée ;
- **Bibliothèque** de situations, de séances et de cycles réutilisables d'une classe et d'une année à l'autre ;
- **Planning** semaine / mois / année, **mode cours** plein écran avec minuteur, **fiche imprimable** (PDF) ;
- **Reporter l'année** : préparez 2027-2028 à partir de 2026-2027 en un clic ;
- Fonctionne **hors ligne** (gymnase sans réseau) et s'installe sur l'écran d'accueil ;
- Données **synchronisées entre vos appareils** via un dépôt GitHub privé à vous.

## Lancer en local

```bash
npm install
npm run dev
```

## Publier sur GitHub Pages

1. Poussez ce dépôt sur GitHub (branche `main`).
2. *Settings → Pages → Build and deployment → Source : GitHub Actions*.
3. Chaque push redéploie le site (`.github/workflows/deploy.yml`).

## Synchroniser vos données (PC ↔ téléphone ↔ Claude)

1. Créez un dépôt **privé** (ex. `carnet-eps-donnees`).
2. Créez un jeton GitHub *fine-grained* limité à ce dépôt, permission **Contents : Read and write**.
3. Dans l'application : *Réglages → Synchronisation GitHub*, saisissez compte, dépôt et jeton (sur chaque appareil).

Le jeton reste uniquement dans le navigateur de chaque appareil. Le fichier de données est du JSON lisible : Claude peut y ajouter ou modifier des séances directement (voir `CLAUDE.md`).

## Sauvegardes

Réglages → *Données et sauvegardes* : export / import JSON, copies de secours automatiques quotidiennes (7 jours).
