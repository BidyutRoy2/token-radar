# Token Radar — radar-2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/BidyutRoy2/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/BidyutRoy2/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Pre-token DeFi protocols, ranked by implied launch value, each with a concrete
farm plan. Entry for make.fun `token-radar-01` (free bounty, $1,325 pot).

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot
(`input/snapshot.json`, frozen 2026-11-14, 758 protocols, watchlist floor $50M),
scores every pre-token protocol with the model in `lib/model.ts`, and writes:

- `board.json` — 200 ranked rows: all 40 watchlist protocols + 160 early rows
  below the floor (pre-token, by TVL), each with an implied value and a 7-step
  farm plan
- `data.js` + `dashboard/` — a static, no-network dashboard (board, detail view
  for every protocol, filters, live-token view set aside at market cap)
- `screenshots/` — 3 real renders of the dashboard (board, detail, filtered)
- `dossier.json` — built with the vendored `vendor/makefun-board.ts` (unchanged)

## The model (radar-2)

One function scores every row, from the snapshot's figures only. No protocol
name is ever special-cased.

```
implied = round( TVL × 0.25
               × (1 + clamp(change_7d, -50, +100) / 100 × 0.6)
               × (0.55 + 0.45 × min(age_days, 1460) / 1460)
               × (0.95 + 0.025 × min(chains, 8)) )
```

- **Size — TVL × 0.25.** A launch is priced off value already locked in;
  0.25× TVL is deliberately conservative.
- **Growth — 7-day change, clamped −50…+100%, weight 0.6.** Watchlist median
  7d change is about −3%; the snapshot's extremes run to +4,448% for one
  protocol, so the +100 cap stops a single week's spike from deciding the
  board, and the −50 floor stops one bad week from erasing a large protocol.
- **Maturity — age with no token, 0.55–1.00.** Time since DefiLlama first
  listed the protocol (watchlist median ≈ 512 days, max ≈ 1,563). A longer
  no-token run means more pent-up launch value, capped at 4 years (1,460 days)
  so age alone cannot beat TVL. Unknown age uses 365 days.
- **Diversity — chains, 0.975–1.15.** Each extra chain is an extra
  distribution surface for a launch; capped at 8 chains so chain count alone
  cannot win.

The dashboard recomputes every row from the same formula and shows the
breakdown (base, each multiplier, implied value) in the detail view.

## Farm plans

7 steps per protocol, derived from its own category, chains, TVL and age:

1. fresh wallet + funding on its primary chain; 2. primary action
   (category-specific — e.g. supply for Lending, provide liquidity for DEXes,
   deposit into a vault for Risk Curators, mint a yield asset for RWA);
   3. a *different* secondary action (borrow, swap, second vault…);
   4. one qualifying action a week; 5. hold 30/45/60 days by age, on at
   least two chains where it runs on both; 6. eligibility check on the
   protocol's own page — never pay to claim; 7. log everything, exit in
   tranches. Each step carries its cost and time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
# then open out/dashboard/index.html (data.js sits beside dashboard/)
```

The program is deterministic: two runs on the same snapshot write the same
bytes. Data is the DefiLlama snapshot of 2026-11-14; it is frozen and is not
updated by re-running.

## Honest limits

Implied value is this entry's own claim, not a prediction and not make.fun's.
A protocol may never issue a token, and a token that launches may be worth
far less — or nothing. "Records no token" is DefiLlama's record, not proof a
token does not exist. Farming costs real money and gas; never pay to claim.

## License

MIT — see LICENSE.

---

<sub>Entered on [make.fun](https://make.fun/?ref=v36tdgxj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
