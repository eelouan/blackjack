# Blackjack (argent fictif)

Jeu de blackjack dans le navigateur, sans dépendance. Tout tient dans un seul fichier : ouvrez `index.html` dans un navigateur pour jouer.

## Règles

- Sabot de 6 jeux, remélangé quand il reste moins de 25 % des cartes.
- **Blackjack naturel payé 3 pour 2** (mise de 10 € → 15 € de gain).
- Victoire normale payée 1 pour 1, égalité = mise rendue.
- Le croupier tire jusqu'à 16 et reste sur tous les 17 (y compris 17 souple).
- Si le croupier a un blackjack, la manche s'arrête tout de suite (il n'y a pas d'assurance).
- Doubler sur les deux premières cartes, **y compris après un split**.
- Split de deux cartes de même valeur, jusqu'à 4 mains. Split d'As : une seule carte par As.
- Un 21 obtenu après un split compte comme 21, pas comme un blackjack.

## Argent

- **Déposer** : ajoute de l'argent fictif à votre solde.
- **Récupérer mes gains** : retire un montant (ou tout le solde) entre deux manches.
- Le **bénéfice de chaque manche** est affiché à la fin de la manche, et le **bénéfice total**
  (solde + récupéré − déposé) est toujours visible dans la banque, avec l'historique des opérations.
- Le solde, les totaux et l'historique sont sauvegardés dans le navigateur (localStorage).

## Conseiller de stratégie de base

- La case **« Afficher le conseil de la stratégie de base »** met en évidence le bouton conseillé
  (Tirer, Rester, Doubler ou Séparer) pour chaque main.
- Quand vous jouez autrement que la stratégie, le jeu l'indique (« Écart à la stratégie : il fallait doubler »),
  et la banque affiche votre **taux de respect de la stratégie**.
- La table de stratégie est intégrée à `index.html` (`<script type="application/json" id="strategy">`),
  au même format que `strategie-blackjack.json` : il suffit de remplacer ce bloc pour changer de stratégie.
- Replis : « D » se transforme en tirer et « Ds » en rester quand on ne peut plus doubler ; une paire
  qu'on ne peut pas séparer se joue comme un total normal.

Raccourcis clavier : `T` tirer, `R` rester, `D` doubler, `S` séparer, `Entrée` distribuer.

## Tests

```bash
npm test
```
