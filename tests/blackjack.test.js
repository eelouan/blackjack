const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Le moteur est dans index.html (<script id="engine">) : on l'extrait pour le tester.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const sandbox = {};
new Function('window', 'module', source)(sandbox, undefined);
const { BlackjackGame, handValue } = sandbox.Blackjack;

// Prépare un sabot truqué : les cartes sont tirées dans l'ordre donné.
// Ordre de distribution : joueur, croupier, joueur, croupier, puis tirages.
function rigged(ranks, balance = 1000) {
  const g = new BlackjackGame({ balance, shuffleEachRound: false });
  g.shoe = ranks.map((rank) => ({ rank, suit: '♠' })).reverse();
  g.shoeSize = 0; // empêche le remélange automatique
  return g;
}

test('valeur des mains avec As', () => {
  const c = (r) => ({ rank: r, suit: '♠' });
  assert.deepEqual(handValue([c('A'), c('6')]), { total: 17, soft: true });
  assert.deepEqual(handValue([c('A'), c('6'), c('K')]), { total: 17, soft: false });
  assert.equal(handValue([c('A'), c('A'), c('9')]).total, 21);
});

test('blackjack naturel payé 3 pour 2', () => {
  const g = rigged(['A', '9', 'K', '7']);
  g.deal(10);
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'blackjack');
  assert.equal(g.lastRound.profit, 15);
  assert.equal(g.balance, 1015);

  const g2 = rigged(['A', '9', 'K', '7']);
  g2.deal(5);
  assert.equal(g2.lastRound.profit, 7.5);
});

test('blackjack contre blackjack = égalité', () => {
  const g = rigged(['A', 'A', 'K', 'Q']);
  g.deal(10);
  assert.equal(g.hands[0].result, 'push');
  assert.equal(g.balance, 1000);
});

test('blackjack du croupier : perte immédiate', () => {
  const g = rigged(['9', 'A', '9', 'K']);
  g.deal(10);
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'lose');
  assert.equal(g.balance, 990);
});

test('victoire simple 1 pour 1, le croupier tire jusqu’à 17', () => {
  const g = rigged(['10', '10', '9', '6', '5']); // croupier 16 + 5 = 21
  g.deal(10);
  g.stand();
  assert.equal(handValue(g.dealer).total, 21);
  assert.equal(g.hands[0].result, 'lose');

  const g2 = rigged(['10', '10', '9', '6', 'K']); // croupier saute
  g2.deal(10);
  g2.stand();
  assert.equal(g2.hands[0].result, 'win');
  assert.equal(g2.balance, 1010);
});

test('le croupier reste sur 17 souple', () => {
  const g = rigged(['10', 'A', '8', '6']);
  g.deal(10);
  g.stand();
  assert.equal(g.dealer.length, 2);
  assert.equal(g.hands[0].result, 'win');
});

test('le joueur qui saute perd même si le croupier saute', () => {
  const g = rigged(['10', '10', '6', '6', 'K']);
  g.deal(10);
  g.hit();
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'bust');
  assert.equal(g.dealer.length, 2, 'le croupier ne tire pas si toutes les mains ont sauté');
  assert.equal(g.balance, 990);
});

test('doubler : mise x2 et une seule carte', () => {
  const g = rigged(['6', '10', '5', '7', 'K', '9']); // joueur 11 -> 21, croupier 17
  g.deal(10);
  assert.ok(g.canDouble());
  g.double();
  assert.equal(g.hands[0].bet, 20);
  assert.equal(g.hands[0].cards.length, 3);
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.balance, 1020);
});

test('split puis doubler sur chaque main', () => {
  // joueur 8,8 ; croupier 6 + 10 (=16)
  // main 1 : 8 + 3 = 11 -> double -> +K = 21
  // main 2 : 8 + 2 = 10 -> double -> +9 = 19
  // croupier 16 + 10 = 26 (saute)
  const g = rigged(['8', '6', '8', '10', '3', '2', 'K', '9', '10']);
  g.deal(10);
  assert.ok(g.canSplit());
  g.split();
  assert.equal(g.hands.length, 2);
  assert.equal(g.balance, 980);
  assert.ok(g.canDouble(), 'doublement autorisé après split');
  g.double();
  assert.equal(g.active, 1);
  assert.ok(g.canDouble());
  g.double();
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(g.lastRound.wagered, 40);
  assert.equal(g.lastRound.profit, 40);
  assert.equal(g.balance, 1040);
});

test('21 après split n’est pas un blackjack', () => {
  // joueur K,K ; croupier 9,8 = 17. main 1 : K + A = 21 (auto) ; main 2 : K + 7 = 17
  const g = rigged(['K', '9', 'K', '8', 'A', '7']);
  g.deal(10);
  g.split();
  assert.equal(g.active, 1);
  g.stand();
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.hands[0].payout, 20);
  assert.equal(g.hands[1].result, 'push');
});

test('split d’As : une carte chacun, pas de double', () => {
  const g = rigged(['A', '9', 'A', '8', '5', 'K']);
  g.deal(10);
  g.split();
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].cards.length, 2);
  assert.equal(g.hands[1].cards.length, 2);
  assert.deepEqual(g.hands.map((h) => h.result), ['lose', 'win']);
});

test('le sabot est entièrement remélangé avant chaque manche', () => {
  const g = new BlackjackGame({ balance: 1000 });
  for (let i = 0; i < 5; i++) {
    if (g.phase === 'player') g.stand();
    g.deal(10);
    assert.ok(g.reshuffled);
    // 6 jeux = 312 cartes, moins les cartes déjà tirées pendant cette manche
    const drawn = g.dealer.length + g.hands.reduce((n, h) => n + h.cards.length, 0);
    assert.equal(g.shoe.length, 312 - drawn);
  }
});

test('dépôt, mise et retrait', () => {
  const g = new BlackjackGame();
  assert.throws(() => g.deal(10), /Solde insuffisant/);
  g.deposit(100);
  assert.equal(g.balance, 100);
  assert.throws(() => g.withdraw(200), /Solde insuffisant/);
  assert.equal(g.withdraw(40), 40);
  assert.equal(g.balance, 60);
  assert.throws(() => g.deposit(-5), /Montant invalide/);
});

test('pas de double ni split sans solde suffisant', () => {
  const g = rigged(['8', '6', '8', '10'], 10);
  g.deal(10);
  assert.equal(g.canDouble(), false);
  assert.equal(g.canSplit(), false);
});

// ---- Stratégie de base -----------------------------------------------------

const strategy = JSON.parse(html.match(/<script type="application\/json" id="strategy">([\s\S]*?)<\/script>/)[1]);
const { recommend } = sandbox.Blackjack;
const cards = (...ranks) => ranks.map((rank) => ({ rank, suit: '♠' }));
const up = (rank) => ({ rank, suit: '♥' });
const all = { canDouble: true, canSplit: true };

test('stratégie : totaux durs', () => {
  assert.equal(recommend(strategy, cards('10', '2'), up('2'), all), 'H'); // 12 contre 2
  assert.equal(recommend(strategy, cards('10', '2'), up('4'), all), 'S'); // 12 contre 4
  assert.equal(recommend(strategy, cards('10', '6'), up('7'), all), 'H'); // 16 contre 7
  assert.equal(recommend(strategy, cards('10', '6'), up('6'), all), 'S');
  assert.equal(recommend(strategy, cards('6', '5'), up('K'), all), 'D'); // 11 contre 10
  assert.equal(recommend(strategy, cards('6', '5'), up('A'), all), 'H'); // 11 contre As (S17)
  assert.equal(recommend(strategy, cards('10', '7'), up('A'), all), 'S');
});

test('stratégie : mains souples et doubles impossibles', () => {
  assert.equal(recommend(strategy, cards('A', '2'), up('5'), all), 'D');
  assert.equal(recommend(strategy, cards('A', '7'), up('2'), all), 'S');
  assert.equal(recommend(strategy, cards('A', '7'), up('9'), all), 'H');
  // D impossible -> tirer ; Ds impossible -> rester
  assert.equal(recommend(strategy, cards('A', '2'), up('5'), { canDouble: false }), 'H');
  assert.equal(recommend(strategy, cards('A', '7'), up('4'), { canDouble: false }), 'S');
  // mains de 3 cartes : A,2,4 = 17 souple contre 6 -> D -> tirer ; A,2,5 = 18 souple -> Ds -> rester
  assert.equal(recommend(strategy, cards('A', '2', '4'), up('6'), { canDouble: false }), 'H');
  assert.equal(recommend(strategy, cards('A', '2', '5'), up('6'), { canDouble: false }), 'S');
});

test('stratégie : paires', () => {
  assert.equal(recommend(strategy, cards('A', 'A'), up('10'), all), 'P');
  assert.equal(recommend(strategy, cards('8', '8'), up('A'), all), 'P');
  assert.equal(recommend(strategy, cards('K', 'Q'), up('6'), all), 'S'); // jamais séparer les 10
  assert.equal(recommend(strategy, cards('5', '5'), up('9'), all), 'D'); // 5,5 = 10 dur
  assert.equal(recommend(strategy, cards('9', '9'), up('7'), all), 'S');
  // séparation impossible : 8,8 joué comme 16 dur, A,A comme 12 souple
  assert.equal(recommend(strategy, cards('8', '8'), up('10'), { canDouble: true }), 'H');
  assert.equal(recommend(strategy, cards('8', '8'), up('5'), { canDouble: true }), 'S');
  assert.equal(recommend(strategy, cards('A', 'A'), up('6'), { canDouble: true }), 'H');
});
