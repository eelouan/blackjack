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
  const g = new BlackjackGame({ balance });
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
