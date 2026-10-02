# poketeam_analysis

Evaluate a Pokemon Champions VGC (doubles) team with a real damage calculator (@smogon/calc). All numbers come from code. Nothing is estimated or invented, and missing data is reported as UNKNOWN.

## Use it (no coding needed)

1. Install **Node.js LTS** from https://nodejs.org (Claude can also do this for you).
2. Download this repository (green **Code** button, then **Download ZIP**, or `git clone`) and open the folder in **Claude Code**.
3. Tell Claude: `/analyze-team` and paste your team (Showdown export format). Claude sets everything up on the first run.

Prefer the terminal?

```bash
npm run setup      # first time only: installs the calculator and runs the tests
npm run analyze    # analyzes teams/my-team.txt against every team in /meta
```

To test another team, change the file in `teams/` (or pass a different file: `node src/analyze.js teams/other.txt`) and run it again. Nothing else needs to be redone.

## Team format

Showdown export format. In Champions, the `EVs:` line holds **stat points** (max 32 per stat, 66 total) and there are no IVs. A Pokemon holding its Mega Stone is calculated as its Mega form. See `meta/_FORMAT.md` for opponent teams.

## Rules the tool follows

See `CLAUDE.md` (hard rules and phases) and `RULES-assumed-spreads.md`. In short: numbers only from the calculator, every external fact saved with source URL and date, spreads that are not in the file come only from real usage data and are marked ASSUMED, never from defaults.

## Status

| Phase | What | State |
|---|---|---|
| 0 | Setup | done |
| 1 | Calc engine (damage, KO, speed, doubles mechanics) | done, tested against the official calc test suite |
| 2 | Opponent team format and missing-spread rule | done |
| 3 | Fetch top teams and most common spreads (VGCPastes sheet + Pokepaste) | done: `node src/fetch-data.js fetch`, review `data/staging/SUMMARY.md`, then `promote` |
| 4 | Matchup runner and key-threat summary | done: `npm run analyze` writes tables per matchup and `output/<team>/THREATS.md` |
| 5 | Written report (agent `vgc-analyst`) | not built |

Known limits: the calculator's data is Scarlet/Violet data, so Champions-specific changes to moves, abilities or Pokemon are UNKNOWN unless the calculator already has them. Weather and terrain from abilities are not applied automatically (set them in a scenario file).

## Fetching data

The sheet and the events counted as the current regulation are set in `config.json` (`teams_sheet`, `regulation_events`). The sheet has no regulation column, so you name the events. Spreads are the most common ones among team lists of those events only. `src/fetch/` holds optional Pikalytics and Limitless readers (Pikalytics has no spreads for M-C).

```bash
node src/fetch-data.js fetch     # downloads, caches with source and date, stages for review
node src/fetch-data.js promote   # after you reviewed data/staging/SUMMARY.md
```

## Tests

```bash
npm test
```
