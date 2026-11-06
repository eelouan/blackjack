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

Raccourcis clavier : `T` tirer, `R` rester, `D` doubler, `S` séparer, `Entrée` distribuer.

## Tests

```bash
npm test
```
