# Mes placements — suivi de portefeuille et signaux d'achat / vente

Une appli pour téléphone (comme Objectif 990) qui :

- suit **ton portefeuille** : valeur, plus-value, variation du jour, en euros ;
- analyse le **graphique de chaque titre** (moyennes mobiles 20/50/200 jours, RSI,
  MACD, bandes de Bollinger, supports et résistances, stop suiveur) et donne un avis :
  *Achat fort · Achat · Neutre · Vente · Vente forte*, avec l'explication ;
- t'envoie une **notification sur le téléphone** à chaque nouveau signal, même appli fermée ;
- montre, pour chaque titre, **si ces signaux ont vraiment marché** ces 5 dernières années.

> ⚠️ C'est une aide à la décision fondée uniquement sur les graphiques, pas un conseil
> en investissement. L'onglet « Ces signaux ont-ils marché ? » montre que beaucoup de
> signaux tombent juste à peu près une fois sur deux : ne décide jamais sur un seul signal.

## Comment ça marche

```
GitHub Actions (toutes les 30 min, en semaine)
   ├─ lit bourse/watchlist.json         ← la liste des titres suivis
   ├─ télécharge les cours (Yahoo Finance)
   ├─ calcule les signaux (bourse/indicators.js)
   ├─ envoie les notifications (ntfy)
   └─ enregistre bourse/data/*.json     ← l'appli lit ces fichiers
```

Tes **positions** (quantités, prix d'achat) restent dans le navigateur de ton
téléphone : elles ne sont jamais envoyées sur GitHub. Seule la liste des titres suivis
est dans le dépôt (public).

## Mise en route

1. **Fusionne cette branche dans `main`** (Pull request → Merge).
2. **Active le robot** : onglet **Actions** du dépôt → si GitHub le demande, *I understand
   my workflows, go ahead and enable them*. Puis **Bourse — cours et alertes** →
   **Run workflow** pour un premier passage.
3. **Ouvre l'appli** : `https://TON-PSEUDO.github.io/toic/bourse/`
   (même adresse que l'appli TOEIC, avec `/bourse/` à la fin). Installe-la sur l'écran
   d'accueil comme Objectif 990.

### Recevoir les notifications

1. Installe l'appli gratuite **ntfy** (Android ou iPhone).
2. Choisis un nom de canal difficile à deviner (ex. `bourse-k3x9q2m7`) et abonne-toi
   dans ntfy (**+** → le nom → *S'abonner*).
3. Dans le dépôt : **Settings → Secrets and variables → Actions → New repository secret**
   - Name : `NTFY_TOPIC`
   - Secret : le nom du canal

Tu reçois alors un message à chaque nouveau signal d'achat ou de vente, et quand un
seuil de prix que tu as fixé est franchi. Pendant la séance, le signal est marqué
« à confirmer à la clôture » : un signal sur graphique journalier n'est sûr qu'en fin
de journée.

## Ajouter ou retirer des titres

**Depuis l'appli** (le plus simple) : Réglages → crée un jeton GitHub *fine-grained*
limité à ce dépôt avec **Contents : Read and write**, colle-le, puis
Signaux → **+ Suivre un titre**.

**À la main** : modifie `bourse/watchlist.json` sur GitHub.

```json
{ "symbole": "SAN.PA", "nom": "Sanofi", "alerte_haut": 110, "alerte_bas": 85 }
```

Les codes sont ceux de Yahoo Finance : `.PA` pour Paris (`AIR.PA`, `CW8.PA`),
rien pour les États-Unis (`AAPL`), `.DE` Francfort, `.AS` Amsterdam, `BTC-EUR` pour
le bitcoin, `^FCHI` pour le CAC 40. `alerte_haut` et `alerte_bas` sont facultatifs.

## Les signaux

| Signal | Sens | Ce que ça veut dire |
|---|---|---|
| Croisement doré / de la mort | ▲ / ▼ | La MM50 croise la MM200 : changement de tendance de fond |
| Passage de la MM200 | ▲ / ▼ | Le cours franchit sa moyenne 200 jours |
| Sortie de survente / surachat (RSI) | ▲ / ▼ | Le RSI repasse au-dessus de 30 / sous 70 |
| MACD | ▲ / ▼ | La ligne MACD croise sa ligne de signal |
| Bandes de Bollinger | ▲ / ▼ | Retour dans les bandes après un excès |
| Cassure de résistance / support | ▲ / ▼ | Plus haut (avec volume) ou plus bas des 55 dernières séances franchi |
| Stop suiveur touché | ▼ | Le cours passe sous « plus haut récent − 3 × volatilité » |

L'avis global additionne l'état du graphique (tendance, RSI, MACD) et les signaux des
5 dernières séances, les plus récents comptant davantage.

## Bon à savoir

- Le robot enregistre les cours dans le dépôt à chaque passage : l'historique des
  commits grossit (environ 30 par jour de semaine). C'est sans conséquence.
- Les cours Yahoo peuvent avoir jusqu'à 15 minutes de décalage selon la place.
- Pour mettre l'appli à jour sur le téléphone, change `bourse-v1` en `bourse-v2`
  dans `bourse/sw.js`.
- Graphiques : TradingView Lightweight Charts (licence Apache 2.0, `vendor/`).
