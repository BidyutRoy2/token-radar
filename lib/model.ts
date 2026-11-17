// Token Radar — model radar-2.
//
// One snapshot of the protocol universe in, one ranked board out. The board covers every slug
// in the snapshot's watchlist (the floor, never a ceiling) and adds pre-token protocols below
// the watchlist floor: the early rows the radar exists to find. A protocol is pre-token when
// its record carries no token (no market cap, no CoinGecko id, no symbol); live-token
// protocols are kept apart and shown with the market's own values, never mixed into the board.
//
// Implied value follows ONLY from the snapshot's own figures — TVL, 7-day growth, age with
// no token, and chain count. No protocol name is ever special-cased: the same function
// scores every row, and the dashboard recomputes every row from the same formula.
//
//   base         = tvl_usd x 0.25
//                    A token launch is priced off the value already locked in the protocol:
//                    0.25x TVL is a conservative launch multiple for a pre-token protocol
//                    (a live token's FDV/TVL is usually far higher, so this understates
//                    rather than inflates).
//   growth       = clamp(change_7d, -50, +100) per cent
//   growthMult   = 1 + (growth / 100) x 0.6
//                    Watchlist median 7d change is about -3%; the snapshot's extremes run
//                    to +4,448% for one protocol, so the +100 cap stops a single week's
//                    spike from deciding the board, and the -50 floor stops one bad week
//                    from erasing a large protocol. Weight 0.6 (not 1.0) because a week
//                    of TVL flow is a signal, not a verdict.
//   maturity     = 0.55 + 0.45 x min(age_days, 1460) / 1460   (age unknown: 365)
//                    Age is time since DefiLlama first listed the protocol — the best
//                    record of how long it has run with no token. A longer no-token run
//                    means more pent-up launch value, but the 4-year cap (1460 days;
//                    watchlist median age is ~512 days, max ~1,563) stops age alone
//                    from beating TVL. Range 0.55–1.00.
//   diversity    = 0.95 + 0.025 x min(chains, 8)
//                    Each extra chain is an extra distribution surface for a launch:
//                    more chains, more wallets that can receive and trade the token.
//                    Capped at 8 chains (0.975–1.15) so chain-count alone cannot win.
//   implied      = max(1, round(base x growthMult x maturityMult x diversityMult))
//
// Farm plans are derived the same way — from the protocol's own category, chains, TVL
// and age, never from a hand-written list of names. Each plan has 7 steps: a primary
// action and a DIFFERENT secondary action (two kinds of real use, not one deposit),
// a weekly cadence, a hold window, an eligibility check, and a log/exit step.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  diversity_base: number;
  diversity_per_chain: number;
  diversity_max_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  diversity_base: 0.95,
  diversity_per_chain: 0.025,
  diversity_max_chains: 8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    diversity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  diversity_multiplier: number;
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; diversityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const diversityMult = model.diversity_base + model.diversity_per_chain * Math.min(Math.max(protocol.chains.length, 0), model.diversity_max_chains);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * diversityMult));
  return { implied, growthPct, growthMult, maturityMult, diversityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, diversityMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, diversityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      diversity_multiplier: round4(s.diversityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A second chain when the protocol runs on more than one, else null. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * Category family, from DefiLlama's category string only. Families share one
 * primary + secondary action pair, so two protocols in one family farm alike
 * while a protocol in another family farms differently — and no name is
 * ever looked up.
 */
function familyOf(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('dex')) return 'dex';
  if (c.includes('yield aggregator')) return 'yield-agg';
  if (c.includes('yield') || c.includes('leveraged farm')) return 'yield';
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return 'curator';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('basis trad')) return 'basis';
  if (c.includes('perpetual') || c.includes('derivative')) return 'perps';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('restak') || c.includes('staking') || c.includes('staking pool')) return 'staking';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('payment')) return 'payments';
  if (c.includes('stable')) return 'stable';
  if (c.includes('governance')) return 'governance';
  if (c.includes('chain')) return 'chain';
  if (c.includes('prediction')) return 'prediction';
  return 'generic';
}

/** Primary + secondary action for one family. Both name the protocol and its chain(s). */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string, second: string | null): { primary: string; secondary: string; weekly: string } {
  const name = p.name;
  const f = familyOf(p);
  const other = second ?? chain;
  switch (f) {
    case 'lending':
      return {
        primary: `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the position open.`,
        secondary: `Borrow a small amount (about $${Math.max(10, Math.round(capital / 5))}) against that collateral on ${name}, then repay it — borrowing is a second, distinct use of the protocol.`,
        weekly: `a small supply top-up, a borrow, or a repayment`,
      };
    case 'dex':
      return {
        primary: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
        secondary: `Swap a small amount (about $10) through ${name} on ${chain} so the wallet records trading volume as well as liquidity.`,
        weekly: `a small swap, or adding a little more liquidity`,
      };
    case 'yield-agg':
      return {
        primary: `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the shares.`,
        secondary: `Deposit a smaller amount (about $${Math.max(10, Math.round(capital / 5))}) into a second ${name} vault or strategy${second ? ` on ${other}` : ''} to show use of more than one strategy.`,
        weekly: `a deposit into a vault, or a rebalance between strategies`,
      };
    case 'yield':
      return {
        primary: `Deposit $${capital} of USDC into ${name}'s highest-TVL yield position on ${chain} and keep it open.`,
        secondary: `Claim or compound the yield once, in a small amount, so the wallet shows an active harvest as well as a deposit.`,
        weekly: `a small deposit, or a yield claim`,
      };
    case 'curator':
      return {
        primary: `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`,
        secondary: `Deposit a smaller amount (about $${Math.max(10, Math.round(capital / 5))}) into a second ${name} vault${second ? ` on ${other}` : ''} — curators reward vault diversity, not one vault.`,
        weekly: `a deposit into a vault, or moving a small amount between vaults`,
      };
    case 'rwa':
      return {
        primary: `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`,
        secondary: `Hold the asset for a full yield cycle and check the accrued yield on ${name}'s own page, then keep holding — do not flip it in the same week.`,
        weekly: `checking accrued yield, or a small top-up of the position`,
      };
    case 'basis':
      return {
        primary: `Deposit $${capital} of USDC into ${name}'s basis-trading vault on ${chain} and keep the shares.`,
        secondary: `Read the vault's funding-rate and position report on ${name}'s own page once a week and keep the position through at least one full funding cycle.`,
        weekly: `a small deposit, or reviewing the vault's funding report`,
      };
    case 'perps':
      return {
        primary: `Deposit $${capital} of USDC as margin on ${name} (${chain}) and open one small hedged position — small, never the full deposit.`,
        secondary: `Close that position and open one small position in the opposite direction, so the wallet shows two-sided use without large exposure.`,
        weekly: `one small hedged trade, then closing it`,
      };
    case 'bridge':
      return {
        primary: `Bridge $${capital} of USDC to ${chain} through ${name} and keep the bridged funds on the destination chain.`,
        secondary: `Use the bridged funds in a dApp on ${chain} (a swap or a deposit) instead of bridging straight back — a round trip alone is not use.`,
        weekly: `a bridge, or using bridged funds in a dApp`,
      };
    case 'staking':
      return {
        primary: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
        secondary: `Check the staking rewards on ${name}'s own page and, if it offers restaking, restake a small part of the rewards rather than withdrawing them.`,
        weekly: `checking rewards, or a small additional stake`,
      };
    case 'insurance':
      return {
        primary: `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy active.`,
        secondary: `Read the policy's claim window and covered events on ${name}'s own page so you know exactly what the cover pays for.`,
        weekly: `checking the policy, or renewing cover before it lapses`,
      };
    case 'payments':
      return {
        primary: `Fund a ${name} wallet with $${capital} on ${chain} and make one real payment through it.`,
        secondary: `Make a second, smaller payment to a different recipient the following week — repeat payments, not one transfer, are the pattern.`,
        weekly: `one real payment through the app`,
      };
    case 'stable':
      return {
        primary: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`,
        secondary: `Use a small part of the stable balance (about $10) in a swap or a deposit on ${chain} so the wallet shows the stablecoin in use, not parked.`,
        weekly: `a small swap or deposit with the stable asset`,
      };
    case 'governance':
      return {
        primary: `Deposit $${capital} into ${name} on ${chain} to qualify for its governance programme and keep the position open.`,
        secondary: `Vote in one live governance proposal on ${name} — voting is the qualifying action this family is built around.`,
        weekly: `voting in a proposal, or a small top-up`,
      };
    case 'chain':
      return {
        primary: `Bridge $${capital} of USDC to ${chain} and use ${name}'s flagship dApp there with a small deposit.`,
        secondary: `Stake a small amount of ${chain}'s native asset through ${name} if it offers staking, and keep it staked.`,
        weekly: `using a dApp on the chain, or a small stake`,
      };
    case 'prediction':
      return {
        primary: `Fund $${capital} on ${name} (${chain}) and place one small position in a market that closes after at least a week.`,
        secondary: `Place a second small position in a different market — two markets, not one large bet, and never more than the funded amount.`,
        weekly: `one small market position`,
      };
    default:
      return {
        primary: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
        secondary: `Use ${name}'s second main feature once — a swap, a second deposit type, or a vote — so the wallet shows more than a single deposit.`,
        weekly: `a deposit, a swap, or a vote`,
      };
  }
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * Derived from the protocol's own record (category, chains, TVL, age), never
 * from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { primary, secondary, weekly } = actionsFor(p, capital, chain, second);
  const multi = second ? ` Keep activity on at least two chains (${chain} and ${second}) where the protocol runs on both.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with $${capital} plus gas on ${chain}.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: primary, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: secondary, cost: `about $${Math.max(10, Math.round(capital / 5))} of capital and about $2 of gas`, time: '10 minutes' },
    {
      text: `Make one qualifying action each week, such as ${weekly}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.${multi}`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes. Never pay to claim, and ignore claim links sent by message.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log. When you exit, unwind in tranches and keep a small position until any claim window has passed.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    diversity_multiplier: row.model.diversity_multiplier,
    on_watchlist: onWatchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
