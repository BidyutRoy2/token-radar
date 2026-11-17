// Token Radar dashboard (radar-2). Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, and a per-protocol detail drawer with
// the model's own inputs and the protocol's farm plan. No network: every byte shown is
// in data.js. The model and the farm plan below are the same derivation main.ts writes
// to board.json — category, chains, TVL and age decide them, no name is special-cased.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  // radar-2, exactly as lib/model.ts: base TVL x 0.25, growth clamp -50..100 x 0.6,
  // maturity 0.55 + 0.45 x min(age,1460)/1460, diversity 0.95 + 0.025 x min(chains,8).
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var diversity = model.diversity_base + model.diversity_per_chain * Math.min(Math.max((row.chains || []).length, 0), model.diversity_max_chains);
    return { implied: Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * diversity)), growth: growth, growthMult: growthMult, maturity: maturity, diversity: diversity, age: age };
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  // ---- farm plan: the same derivation as lib/model.ts farmSteps ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) { if (p.tvl_usd >= 5e9) return 250; if (p.tvl_usd >= 1e9) return 150; if (p.tvl_usd >= 1e8) return 100; return 50; }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function familyOf(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'lending';
    if (c.indexOf('dex') >= 0) return 'dex';
    if (c.indexOf('yield aggregator') >= 0) return 'yield-agg';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'yield';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'curator';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('basis trad') >= 0) return 'basis';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'perps';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0 || c.indexOf('staking pool') >= 0) return 'staking';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('payment') >= 0) return 'payments';
    if (c.indexOf('stable') >= 0) return 'stable';
    if (c.indexOf('governance') >= 0) return 'governance';
    if (c.indexOf('chain') >= 0) return 'chain';
    if (c.indexOf('prediction') >= 0) return 'prediction';
    return 'generic';
  }
  function actionsFor(p, capital, chain, second) {
    var name = p.name, f = familyOf(p), other = second || chain, small = Math.max(10, Math.round(capital / 5));
    switch (f) {
      case 'lending': return { primary: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the position open.', secondary: 'Borrow a small amount (about $' + small + ') against that collateral on ' + name + ', then repay it — borrowing is a second, distinct use of the protocol.', weekly: 'a small supply top-up, a borrow, or a repayment' };
      case 'dex': return { primary: 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.', secondary: 'Swap a small amount (about $10) through ' + name + ' on ' + chain + ' so the wallet records trading volume as well as liquidity.', weekly: 'a small swap, or adding a little more liquidity' };
      case 'yield-agg': return { primary: 'Deposit $' + capital + ' of USDC into ' + name + "'s main vault on " + chain + ' and keep the shares.', secondary: 'Deposit a smaller amount (about $' + small + ') into a second ' + name + ' vault or strategy' + (second ? ' on ' + other : '') + ' to show use of more than one strategy.', weekly: 'a deposit into a vault, or a rebalance between strategies' };
      case 'yield': return { primary: 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL yield position on " + chain + ' and keep it open.', secondary: 'Claim or compound the yield once, in a small amount, so the wallet shows an active harvest as well as a deposit.', weekly: 'a small deposit, or a yield claim' };
      case 'curator': return { primary: 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.', secondary: 'Deposit a smaller amount (about $' + small + ') into a second ' + name + ' vault' + (second ? ' on ' + other : '') + ' — curators reward vault diversity, not one vault.', weekly: 'a deposit into a vault, or moving a small amount between vaults' };
      case 'rwa': return { primary: 'Mint or buy $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' and hold it.', secondary: 'Hold the asset for a full yield cycle and check the accrued yield on ' + name + "'s own page, then keep holding — do not flip it in the same week.", weekly: 'checking accrued yield, or a small top-up of the position' };
      case 'basis': return { primary: 'Deposit $' + capital + ' of USDC into ' + name + "'s basis-trading vault on " + chain + ' and keep the shares.', secondary: "Read the vault's funding-rate and position report on " + name + "'s own page once a week and keep the position through at least one full funding cycle.", weekly: "a small deposit, or reviewing the vault's funding report" };
      case 'perps': return { primary: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' (' + chain + ') and open one small hedged position — small, never the full deposit.', secondary: 'Close that position and open one small position in the opposite direction, so the wallet shows two-sided use without large exposure.', weekly: 'one small hedged trade, then closing it' };
      case 'bridge': return { primary: 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and keep the bridged funds on the destination chain.', secondary: 'Use the bridged funds in a dApp on ' + chain + ' (a swap or a deposit) instead of bridging straight back — a round trip alone is not use.', weekly: 'a bridge, or using bridged funds in a dApp' };
      case 'staking': return { primary: 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.', secondary: 'Check the staking rewards on ' + name + "'s own page and, if it offers restaking, restake a small part of the rewards rather than withdrawing them.", weekly: 'checking rewards, or a small additional stake' };
      case 'insurance': return { primary: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for a protocol you already use, and keep the policy active.', secondary: "Read the policy's claim window and covered events on " + name + "'s own page so you know exactly what the cover pays for.", weekly: 'checking the policy, or renewing cover before it lapses' };
      case 'payments': return { primary: 'Fund a ' + name + ' wallet with $' + capital + ' on ' + chain + ' and make one real payment through it.', secondary: 'Make a second, smaller payment to a different recipient the following week — repeat payments, not one transfer, are the pattern.', weekly: 'one real payment through the app' };
      case 'stable': return { primary: 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.', secondary: 'Use a small part of the stable balance (about $10) in a swap or a deposit on ' + chain + ' so the wallet shows the stablecoin in use, not parked.', weekly: 'a small swap or deposit with the stable asset' };
      case 'governance': return { primary: 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' to qualify for its governance programme and keep the position open.', secondary: 'Vote in one live governance proposal on ' + name + ' — voting is the qualifying action this family is built around.', weekly: 'voting in a proposal, or a small top-up' };
      case 'chain': return { primary: 'Bridge $' + capital + ' of USDC to ' + chain + " and use " + name + "'s flagship dApp there with a small deposit.", secondary: 'Stake a small amount of ' + chain + "'s native asset through " + name + ' if it offers staking, and keep it staked.', weekly: 'using a dApp on the chain, or a small stake' };
      case 'prediction': return { primary: 'Fund $' + capital + ' on ' + name + ' (' + chain + ') and place one small position in a market that closes after at least a week.', secondary: 'Place a second small position in a different market — two markets, not one large bet, and never more than the funded amount.', weekly: 'one small market position' };
      default: return { primary: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.', secondary: 'Use ' + name + "'s second main feature once — a swap, a second deposit type, or a vote — so the wallet shows more than a single deposit.", weekly: 'a deposit, a swap, or a vote' };
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p), second = (p.chains && p.chains.length > 1) ? p.chains[1] : null;
    var capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    var a = actionsFor(p, capital, chain, second);
    var multi = second ? ' Keep activity on at least two chains (' + chain + ' and ' + second + ') where the protocol runs on both.' : '';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with $' + capital + ' plus gas on ' + chain + '.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: a.primary, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: a.secondary, cost: 'about $' + Math.max(10, Math.round(capital / 5)) + ' of capital and about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as ' + a.weekly + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.' + multi, cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open " + p.name + "'s own points or rewards page and claim only from the link it publishes. Never pay to claim, and ignore claim links sent by message.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log. When you exit, unwind in tranches and keep a small position until any claim window has passed.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = parseInt(params.get('minTvl'), 10) || 0;
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.on_watchlist) return false;
      if (state.scope === 'early' && r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    return list.slice().sort(function (a, b) {
      var av, bv, key = state.sort;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', text: 'R' }),
        el('div', null, el('b', { text: 'Token Radar' }), el('span', { text: 'Pre-token protocols, ranked by implied value' }))),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { class: 'pill', html: 'DefiLlama protocol index' }),
        el('span', { class: 'pill hot', html: 'Model <b>' + DATA.model_version + '</b>' }),
        el('span', { class: 'pill', html: '<b>' + DATA.board_size + '</b> rows scored' })));
  }
  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what a launch could be worth' }),
      el('p', { html: 'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> and no token on record. The early radar adds <b>' + DATA.early_size + ' pre-token protocols below that floor</b>, found by TVL — the point of a radar is to find the next one early. Implied value is a model, not a promise: no token may ever launch.' }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist slug is on the board' })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early rows below the floor' })),
        el('div', { class: 'stat' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) }), el('small', { text: 'sum of all 200 rows' })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown at market cap, never ranked' }))));
  }
  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    return el('section', { class: 'spot', 'aria-label': 'Top 3 by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rk', text: 'RANK #' + r.rank }),
          el('h3', { text: r.name }),
          el('div', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains || []).slice(0, 3).join(', ') + (r.on_watchlist ? ' · Watchlist' : ' · Early find') }),
          el('div', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'meta', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) + ' · ' + fmtAge(r.age_days) + ' old' }));
      }));
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search protocols…', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function sel(id, label, opts, val, onChange) {
      var s = el('select', { id: id, 'aria-label': label }, opts.map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: String(o[0]) === String(val) ? 'selected' : null }); }));
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var catSel = sel('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
    var chainSel = sel('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; });
    var tvlSel = sel('minTvl', 'Min TVL', [[0, 'Any TVL'], [50000000, '$50M+'], [100000000, '$100M+'], [500000000, '$500M+'], [1000000000, '$1B+']], state.minTvl, function (v) { state.minTvl = parseInt(v, 10) || 0; });
    var sortSel = sel('sort', 'Sort by', [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d growth'], ['age', 'Age'], ['chains', 'Chain count'], ['name', 'Name']], state.sort, function (v) { state.sort = v; });
    var scopeSel = sel('scope', 'Scope', [['all', 'All 200 rows'], ['watchlist', 'Watchlist only'], ['early', 'Early finds only']], state.scope, function (v) { state.scope = v; });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      catSel, chainSel, tvlSel, sortSel, scopeSel,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }
  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or TVL floor to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.scope = 'all'; writeHash(); render(); } })));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('div', { class: 'chips' }, el('span', { class: 'chip', text: r.category || 'Other' }), (r.chains || []).slice(0, 2).map(function (c) { return el('span', { class: 'chip', text: c }); })))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'badge' + (r.on_watchlist ? '' : ' early'), text: r.on_watchlist ? 'Watchlist' : 'Early find' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
        el('thead', null, el('tr', null, sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('chains', 'Chains'), sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Set' }))),
        tbody)));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: '●' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('div', { class: 'chips' }, el('span', { class: 'chip', text: r.category || 'Other' }), (r.chains || []).slice(0, 2).map(function (c) { return el('span', { class: 'chip', text: c }); })))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
        tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl_usd × ' + m.base_multiple + ' × (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × (' + m.diversity_base + ' + ' + m.diversity_per_chain + ' × min(chains, ' + m.diversity_max_chains + ')) )' }),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' }, el('b', { text: '1 · Size — TVL × 0.25' }), el('span', { text: 'A launch is priced off value already locked in. 0.25× TVL is deliberately conservative.' }), el('code', { text: 'base = TVL × 0.25' })),
        el('div', { class: 'factor' }, el('b', { text: '2 · Growth — 7d change' }), el('span', { text: 'Clamped to −50…+100% so one week cannot decide the board; weight 0.6 because a week is a signal, not a verdict.' }), el('code', { text: '× (1 + growth × 0.6)' })),
        el('div', { class: 'factor' }, el('b', { text: '3 · Maturity — age, no token' }), el('span', { text: 'Time since first listing (median ≈ 512 days on the watchlist). Longer with no token, more pent-up value — capped at 4 years.' }), el('code', { text: '0.55 + 0.45 × age / 1460' })),
        el('div', { class: 'factor' }, el('b', { text: '4 · Diversity — chains' }), el('span', { text: 'Each extra chain is an extra distribution surface for a launch. Capped at 8 chains, so chain count alone cannot win.' }), el('code', { text: '0.95 + 0.025 × chains' }))),
      el('div', { class: 'disclaimer', text: 'Implied value is this entry’s own claim, not a prediction and not make.fun’s. A protocol may never issue a token, and a token that launches may be worth far less — or nothing. Farming costs real money and gas; never farm with funds you cannot afford to lose, and never pay anyone to claim an airdrop.' }));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug; writeHash();
    dialog.textContent = '';
    var calc = impliedOf(row, DATA.model);
    var steps = farmSteps(row);
    var base = row.tvl_usd * DATA.model.base_multiple;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.on_watchlist ? 'Watchlist' : 'Early find') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close ✕', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — every input shown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL × 0.25 (base)' }), el('b', { class: 'num', text: fmtUsd(base) })),
        el('div', null, el('span', { text: 'Seven-day growth (' + fmtPct(row.change_7d) + ', clamped ' + calc.growth + '%)' }), el('b', { class: 'num', text: '× ' + calc.growthMult.toFixed(3) })),
        el('div', null, el('span', { text: 'Maturity (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { class: 'num', text: '× ' + calc.maturity.toFixed(3) })),
        el('div', null, el('span', { text: 'Diversity (' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: '× ' + calc.diversity.toFixed(3) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('div', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((row.implied_value_usd / (DATA.rows[0].implied_value_usd || 1)) * 100)) + '%' })),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(calc.implied) + (calc.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and not a prediction that a token launches.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 7 steps, built for this protocol' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
      })),
      el('p', { class: 'sub', text: 'Steps are derived from this protocol’s category, chains, TVL and age — the same derivation board.json carries. Never pay to claim; claim only from the protocol’s own page.' })));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }
  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Data: frozen DefiLlama protocol snapshot, as of ' + DATA.as_of + ' (' + DATA.rows.length + ' pre-token rows scored; ' + DATA.live_size + ' live-token protocols set aside at market cap). The snapshot does not move and is not updated — re-running the program on it reproduces this board exactly. ' }),
      el('p', { text: 'Implied value is the entry’s own model claim. It is not financial advice, not a prediction that any token launches, and not a price. Protocols record no token in this snapshot; that is DefiLlama’s record, not proof a token does not exist.' }));
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }
  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
