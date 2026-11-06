/*
 * Moteur de blackjack (sans interface).
 *
 * Règles :
 *  - Sabot de 6 jeux, remélangé quand il reste moins de 25 % des cartes.
 *  - Le croupier reste sur tous les 17 (y compris 17 souple).
 *  - Le croupier vérifie s'il a un blackjack quand sa carte visible est un As ou une figure/10.
 *  - Blackjack naturel payé 3 pour 2.
 *  - Victoire normale payée 1 pour 1, égalité = mise rendue.
 *  - Doublement autorisé sur les deux premières cartes, Y COMPRIS après un split.
 *  - Split de deux cartes de même valeur, jusqu'à 4 mains.
 *  - Split d'As : une seule carte par As. Un 21 après split n'est pas un blackjack.
 */
(function (global) {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const BLACKJACK_PAYOUT = 1.5; // 3 pour 2
  const MAX_HANDS = 4;

  function cardValue(card) {
    if (card.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    return Number(card.rank);
  }

  function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      total += cardValue(c);
      if (c.rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return { total, soft: aces > 0 };
  }

  function isBlackjack(cards) {
    return cards.length === 2 && handValue(cards).total === 21;
  }

  function createShoe(decks, rng) {
    const cards = [];
    for (let d = 0; d < decks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) cards.push({ rank, suit });
      }
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function roundMoney(n) {
    return Math.round(n * 100) / 100;
  }

  class BlackjackGame {
    constructor(options = {}) {
      this.decks = options.decks || 6;
      this.rng = options.rng || Math.random;
      this.balance = options.balance || 0;
      this.shoe = [];
      this.shoeSize = 0;
      this.phase = 'betting'; // betting | player | done
      this.dealer = [];
      this.hands = [];
      this.active = 0;
      this.lastRound = null;
      this.reshuffled = false;
      this.reshuffle();
    }

    reshuffle() {
      this.shoe = createShoe(this.decks, this.rng);
      this.shoeSize = this.shoe.length;
      this.reshuffled = true;
    }

    draw() {
      if (this.shoe.length === 0) this.reshuffle();
      return this.shoe.pop();
    }

    // ---- Argent -------------------------------------------------------

    deposit(amount) {
      amount = roundMoney(Number(amount));
      if (!(amount > 0)) throw new Error('Montant invalide');
      this.balance = roundMoney(this.balance + amount);
      return this.balance;
    }

    withdraw(amount) {
      if (this.phase === 'player') throw new Error('Impossible pendant une manche');
      amount = roundMoney(Number(amount));
      if (!(amount > 0)) throw new Error('Montant invalide');
      if (amount > this.balance) throw new Error('Solde insuffisant');
      this.balance = roundMoney(this.balance - amount);
      return amount;
    }

    // ---- Déroulement d'une manche -------------------------------------

    deal(bet) {
      if (this.phase === 'player') throw new Error('Manche déjà en cours');
      bet = roundMoney(Number(bet));
      if (!(bet > 0)) throw new Error('Mise invalide');
      if (bet > this.balance) throw new Error('Solde insuffisant');

      this.reshuffled = false;
      if (this.shoe.length < this.shoeSize * 0.25) this.reshuffle();

      this.balance = roundMoney(this.balance - bet);
      this.hands = [this._newHand([], bet, false)];
      this.dealer = [];
      this.active = 0;
      this.lastRound = null;

      this.hands[0].cards.push(this.draw());
      this.dealer.push(this.draw());
      this.hands[0].cards.push(this.draw());
      this.dealer.push(this.draw());

      this.phase = 'player';

      const playerBJ = isBlackjack(this.hands[0].cards);
      const dealerBJ = isBlackjack(this.dealer);
      if (playerBJ || dealerBJ) {
        this.hands[0].done = true;
        this._settle();
      }
      return this.state();
    }

    _newHand(cards, bet, fromSplit) {
      return { cards, bet, fromSplit, splitAces: false, doubled: false, done: false, result: null, payout: 0 };
    }

    get currentHand() {
      return this.phase === 'player' ? this.hands[this.active] : null;
    }

    canHit() {
      const h = this.currentHand;
      return !!h && !h.done && !h.splitAces;
    }

    canStand() {
      const h = this.currentHand;
      return !!h && !h.done;
    }

    canDouble() {
      const h = this.currentHand;
      return !!h && !h.done && !h.splitAces && h.cards.length === 2 && this.balance >= h.bet;
    }

    canSplit() {
      const h = this.currentHand;
      return (
        !!h &&
        !h.done &&
        h.cards.length === 2 &&
        cardValue(h.cards[0]) === cardValue(h.cards[1]) &&
        this.hands.length < MAX_HANDS &&
        !h.splitAces &&
        this.balance >= h.bet
      );
    }

    hit() {
      if (!this.canHit()) throw new Error('Action impossible');
      const h = this.currentHand;
      h.cards.push(this.draw());
      const v = handValue(h.cards).total;
      if (v >= 21) {
        h.done = true;
        this._advance();
      }
      return this.state();
    }

    stand() {
      if (!this.canStand()) throw new Error('Action impossible');
      this.currentHand.done = true;
      this._advance();
      return this.state();
    }

    double() {
      if (!this.canDouble()) throw new Error('Action impossible');
      const h = this.currentHand;
      this.balance = roundMoney(this.balance - h.bet);
      h.bet = roundMoney(h.bet * 2);
      h.doubled = true;
      h.cards.push(this.draw());
      h.done = true;
      this._advance();
      return this.state();
    }

    split() {
      if (!this.canSplit()) throw new Error('Action impossible');
      const h = this.currentHand;
      this.balance = roundMoney(this.balance - h.bet);
      const aces = h.cards[0].rank === 'A';
      const second = this._newHand([h.cards.pop()], h.bet, true);
      h.fromSplit = true;
      h.cards.push(this.draw());
      second.cards.push(this.draw());
      this.hands.splice(this.active + 1, 0, second);

      for (const hand of [h, second]) {
        if (aces) {
          hand.splitAces = true;
          hand.done = true;
        } else if (handValue(hand.cards).total === 21) {
          hand.done = true;
        }
      }
      if (h.done) this._advance();
      return this.state();
    }

    _advance() {
      while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
      if (this.active >= this.hands.length) this._dealerPlay();
    }

    _dealerPlay() {
      const anyAlive = this.hands.some((h) => handValue(h.cards).total <= 21);
      if (anyAlive) {
        while (handValue(this.dealer).total < 17) this.dealer.push(this.draw());
      }
      this._settle();
    }

    _settle() {
      const dealerTotal = handValue(this.dealer).total;
      const dealerBJ = isBlackjack(this.dealer);
      let wagered = 0;
      let returned = 0;

      for (const h of this.hands) {
        const total = handValue(h.cards).total;
        const playerBJ = !h.fromSplit && isBlackjack(h.cards);
        wagered += h.bet;

        if (playerBJ && dealerBJ) {
          h.result = 'push';
          h.payout = h.bet;
        } else if (playerBJ) {
          h.result = 'blackjack';
          h.payout = h.bet + h.bet * BLACKJACK_PAYOUT;
        } else if (dealerBJ) {
          h.result = 'lose';
          h.payout = 0;
        } else if (total > 21) {
          h.result = 'bust';
          h.payout = 0;
        } else if (dealerTotal > 21 || total > dealerTotal) {
          h.result = 'win';
          h.payout = h.bet * 2;
        } else if (total === dealerTotal) {
          h.result = 'push';
          h.payout = h.bet;
        } else {
          h.result = 'lose';
          h.payout = 0;
        }
        h.payout = roundMoney(h.payout);
        returned += h.payout;
      }

      this.balance = roundMoney(this.balance + returned);
      this.phase = 'done';
      this.lastRound = {
        wagered: roundMoney(wagered),
        returned: roundMoney(returned),
        profit: roundMoney(returned - wagered),
      };
    }

    state() {
      return {
        phase: this.phase,
        balance: this.balance,
        dealer: this.dealer.slice(),
        hands: this.hands,
        active: this.active,
        lastRound: this.lastRound,
      };
    }
  }

  const api = { BlackjackGame, handValue, isBlackjack, cardValue, BLACKJACK_PAYOUT, MAX_HANDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Blackjack = api;
})(typeof window !== 'undefined' ? window : globalThis);
