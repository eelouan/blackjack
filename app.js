(function () {
  'use strict';

  const { BlackjackGame, handValue } = window.Blackjack;
  const STORAGE_KEY = 'blackjack-fictif-v1';

  const $ = (id) => document.getElementById(id);
  const fmt = (n) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

  // ---- État persistant ---------------------------------------------------

  const saved = load();
  const bank = {
    deposited: saved.deposited || 0,
    withdrawn: saved.withdrawn || 0,
    history: saved.history || [],
  };
  const game = new BlackjackGame({ balance: saved.balance || 0 });
  let bet = 0;
  let lastBet = saved.lastBet || 0;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ balance: game.balance, deposited: bank.deposited, withdrawn: bank.withdrawn, history: bank.history, lastBet })
      );
    } catch (e) {
      /* stockage indisponible : on continue sans sauvegarde */
    }
  }

  function addHistory(type, text, amount) {
    bank.history.unshift({ type, text, amount });
    bank.history = bank.history.slice(0, 40);
  }

  // ---- Rendu ---------------------------------------------------------------

  // Mémorise les cartes déjà affichées pour n'animer que les nouvelles.
  let shown = {};
  let fresh = {};

  function cardEl(card, hidden, zone, index) {
    const el = document.createElement('div');
    const key = hidden ? 'back' : card.rank + card.suit;
    const isNew = (shown[zone] || [])[index] !== key;
    (fresh[zone] = fresh[zone] || [])[index] = key;
    const anim = isNew ? ' new' : '';
    if (hidden) {
      el.className = 'card back' + anim;
      return el;
    }
    const red = card.suit === '♥' || card.suit === '♦';
    el.className = 'card' + (red ? ' red' : '') + anim;
    el.innerHTML =
      `<span class="corner">${card.rank}<br>${card.suit}</span>` +
      `<span class="pip">${card.suit}</span>` +
      `<span class="corner bottom">${card.rank}<br>${card.suit}</span>`;
    return el;
  }

  function totalText(cards) {
    const v = handValue(cards);
    if (cards.length === 2 && v.total === 21) return '21';
    return v.soft && v.total < 21 ? `${v.total - 10} / ${v.total}` : String(v.total);
  }

  const RESULT_LABELS = {
    blackjack: 'Blackjack !',
    win: 'Gagné',
    push: 'Égalité',
    lose: 'Perdu',
    bust: 'Sauté',
  };

  function render() {
    const playing = game.phase === 'player';
    const hideHole = playing;
    fresh = {};

    // Croupier
    const dealerCards = $('dealer-cards');
    dealerCards.innerHTML = '';
    game.dealer.forEach((c, i) => dealerCards.appendChild(cardEl(c, hideHole && i === 1, 'dealer', i)));
    $('dealer-total').textContent = game.dealer.length
      ? hideHole
        ? totalText([game.dealer[0]])
        : totalText(game.dealer)
      : '';

    // Joueur
    const handsEl = $('player-hands');
    handsEl.innerHTML = '';
    game.hands.forEach((h, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'hand';
      if (playing && idx === game.active) wrap.classList.add('active');
      if (h.result) wrap.classList.add('r-' + h.result);

      const cards = document.createElement('div');
      cards.className = 'cards';
      h.cards.forEach((c, i) => cards.appendChild(cardEl(c, false, 'hand' + idx, i)));

      const info = document.createElement('div');
      info.className = 'hand-info';
      const label = game.hands.length > 1 ? `Main ${idx + 1} · ` : '';
      info.innerHTML =
        `<span class="total">${label}${totalText(h.cards)}</span>` +
        `<span class="hand-bet">${fmt(h.bet)}${h.doubled ? ' (doublé)' : ''}</span>`;

      wrap.appendChild(cards);
      wrap.appendChild(info);

      if (h.result) {
        const badge = document.createElement('div');
        badge.className = 'badge';
        const gain = h.payout - h.bet;
        badge.textContent = `${RESULT_LABELS[h.result]} ${signed(gain)}`;
        wrap.appendChild(badge);
      }
      handsEl.appendChild(wrap);
    });

    shown = fresh;

    // Contrôles
    $('betting-controls').hidden = playing;
    $('action-controls').hidden = !playing;
    $('bet-amount').textContent = fmt(bet);
    $('btn-deal').disabled = bet <= 0 || bet > game.balance;
    $('btn-hit').disabled = !game.canHit();
    $('btn-stand').disabled = !game.canStand();
    $('btn-double').disabled = !game.canDouble();
    $('btn-split').disabled = !game.canSplit();
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.disabled = bet + Number(chip.dataset.value) > game.balance;
    });
    $('withdraw-form').querySelectorAll('button, input').forEach((el) => (el.disabled = playing));

    // Banque
    const inPlay = playing ? game.hands.reduce((s, h) => s + h.bet, 0) : 0;
    const profit = round(game.balance + inPlay + bank.withdrawn - bank.deposited);
    $('stat-balance').textContent = fmt(game.balance);
    $('stat-deposited').textContent = fmt(bank.deposited);
    $('stat-withdrawn').textContent = fmt(bank.withdrawn);
    setSigned($('stat-profit'), profit);
    if (game.lastRound) setSigned($('stat-last'), game.lastRound.profit);
    else if (!playing) {
      const lastRound = bank.history.find((e) => e.type === 'round');
      if (lastRound) setSigned($('stat-last'), lastRound.amount);
    }

    // Historique
    const hist = $('history');
    hist.innerHTML = '';
    if (!bank.history.length) {
      hist.innerHTML = '<li class="empty">Aucune opération pour l’instant.</li>';
    }
    bank.history.forEach((e) => {
      const li = document.createElement('li');
      li.className = 'h-' + e.type;
      const amount = e.type === 'round' ? signed(e.amount) : fmt(e.amount);
      li.innerHTML = `<span>${e.text}</span><strong class="${cls(e.type === 'round' ? e.amount : 0)}">${amount}</strong>`;
      hist.appendChild(li);
    });
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  function cls(n) {
    return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
  }

  function setSigned(el, n) {
    el.textContent = signed(n);
    el.className = cls(n);
  }

  function message(text, tone) {
    const el = $('message');
    el.textContent = text;
    el.className = 'message' + (tone ? ' ' + tone : '');
  }

  // ---- Fin de manche ---------------------------------------------------------

  function afterAction() {
    if (game.phase === 'done' && game.lastRound) {
      const p = game.lastRound.profit;
      const results = game.hands.map((h) => RESULT_LABELS[h.result]).join(' · ');
      const tone = p > 0 ? 'win' : p < 0 ? 'lose' : '';
      message(`${results} — Bénéfice de la manche : ${signed(p)}`, tone);
      addHistory('round', results, p);
      bet = lastBet <= game.balance ? lastBet : 0;
      save();
    } else if (game.phase === 'player') {
      const multi = game.hands.length > 1 ? ` (main ${game.active + 1}/${game.hands.length})` : '';
      message('À vous de jouer' + multi + '.');
    }
    render();
  }

  // ---- Événements --------------------------------------------------------------

  $('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || game.phase === 'player') return;
    const v = Number(chip.dataset.value);
    if (bet + v <= game.balance) bet = round(bet + v);
    render();
  });

  $('btn-clear').addEventListener('click', () => {
    bet = 0;
    render();
  });

  $('btn-max').addEventListener('click', () => {
    bet = game.balance;
    render();
  });

  $('btn-deal').addEventListener('click', () => {
    try {
      lastBet = bet;
      game.deal(bet);
      if (game.reshuffled) message('Sabot remélangé.');
      save();
      afterAction();
    } catch (err) {
      message(err.message, 'lose');
    }
  });

  const actions = { 'btn-hit': 'hit', 'btn-stand': 'stand', 'btn-double': 'double', 'btn-split': 'split' };
  Object.entries(actions).forEach(([id, method]) => {
    $(id).addEventListener('click', () => {
      try {
        game[method]();
        save();
        afterAction();
      } catch (err) {
        message(err.message, 'lose');
      }
    });
  });

  $('deposit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = round(Number($('deposit-input').value));
    try {
      game.deposit(amount);
      bank.deposited = round(bank.deposited + amount);
      addHistory('deposit', 'Dépôt', amount);
      message(`${fmt(amount)} déposés. Placez votre mise.`);
      save();
      render();
    } catch (err) {
      message(err.message, 'lose');
    }
  });

  function withdraw(amount) {
    try {
      game.withdraw(amount);
      bank.withdrawn = round(bank.withdrawn + amount);
      addHistory('withdraw', 'Gains récupérés', amount);
      if (bet > game.balance) bet = 0;
      const profit = round(game.balance + bank.withdrawn - bank.deposited);
      message(`Vous avez récupéré ${fmt(amount)}. Bénéfice total : ${signed(profit)}`, profit >= 0 ? 'win' : 'lose');
      $('withdraw-input').value = '';
      save();
      render();
    } catch (err) {
      message(err.message, 'lose');
    }
  }

  $('withdraw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    withdraw(round(Number($('withdraw-input').value)));
  });

  $('btn-withdraw-all').addEventListener('click', () => {
    if (game.balance > 0) withdraw(game.balance);
    else message('Rien à récupérer.', 'lose');
  });

  $('btn-reset').addEventListener('click', () => {
    if (game.phase === 'player') return;
    if (!confirm('Remettre à zéro le solde, les totaux et l’historique ?')) return;
    game.balance = 0;
    game.lastRound = null;
    game.hands = [];
    game.dealer = [];
    game.phase = 'betting';
    bank.deposited = 0;
    bank.withdrawn = 0;
    bank.history = [];
    bet = 0;
    lastBet = 0;
    save();
    message("Déposez de l'argent puis placez une mise.");
    render();
  });

  // Raccourcis clavier : T tirer, R rester, D doubler, S séparer, Entrée distribuer
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    const map = { t: 'btn-hit', r: 'btn-stand', d: 'btn-double', s: 'btn-split', enter: 'btn-deal' };
    const btn = map[k] && $(map[k]);
    if (btn && !btn.disabled && !btn.closest('[hidden]')) {
      e.preventDefault();
      btn.click();
    }
  });

  if (game.balance > 0) {
    bet = lastBet && lastBet <= game.balance ? lastBet : 0;
    message('Bon retour ! Placez votre mise.');
  }
  render();
})();
