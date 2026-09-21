# Objectif 990 — dossier prêt à héberger

Ce dossier contient l'appli complète (3 800 questions). Une fois en ligne, elle s'installe
sur le téléphone comme une vraie application : icône sur l'écran d'accueil, plein écran,
et elle fonctionne **sans connexion** après la première ouverture.

## Les fichiers (à mettre tous au même endroit)

- `index.html` — l'appli
- `manifest.webmanifest` — nom, icône et mode plein écran
- `sw.js` — le mode hors connexion
- `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — les icônes

## Mettre en ligne avec GitHub Pages (gratuit)

1. Crée un compte gratuit sur **github.com**.
2. Bouton **+** en haut à droite → **New repository**.
   - Nom : `toeic` (ou ce que tu veux)
   - Coche **Public** (obligatoire pour l'hébergement gratuit)
   - **Create repository**
3. Sur la page du dépôt : **uploading an existing file** → glisse les **7 fichiers**
   (les fichiers eux-mêmes, pas le dossier ni le zip) → **Commit changes**.
4. Onglet **Settings** → menu de gauche **Pages** →
   *Source* : **Deploy from a branch** — *Branch* : **main** / **/ (root)** → **Save**.
5. Attends 1 à 2 minutes, recharge la page : l'adresse s'affiche, du type
   `https://TON-PSEUDO.github.io/toeic/`

## Installer sur le téléphone

1. Ouvre cette adresse dans **Chrome** sur le téléphone.
2. Menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
3. L'icône « objectif 990 » apparaît sur l'écran d'accueil. Ouverte une fois,
   l'appli fonctionne ensuite sans réseau.

Sur iPhone : ouvre l'adresse dans **Safari** → bouton Partager → **Sur l'écran d'accueil**.

## Bon à savoir

- Le dépôt est public : n'importe qui ayant l'adresse peut ouvrir l'appli. Il n'y a
  aucune donnée personnelle dedans ; ta progression reste sur ton téléphone.
- Ta progression est enregistrée par le navigateur, pour cette adresse. Pour la reprendre
  d'une version à l'autre, utilise **Exporter mes données** / **Importer un code**
  sur la page d'accueil de l'appli.
- **Pour mettre l'appli à jour plus tard** : remplace `index.html` sur GitHub, et dans
  `sw.js` change `objectif990-v1` en `objectif990-v2`. Sans ça, le téléphone continue
  d'afficher la version gardée en mémoire.
