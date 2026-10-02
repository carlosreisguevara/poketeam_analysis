# poketeam_analysis

Test a **Pokemon Champions VGC (doubles)** team against the best recent teams, and get a written report with a game plan for each matchup.

It uses a real damage calculator, so the numbers are exact. It never makes up data: anything it cannot find is shown as **UNKNOWN**, and any spread it had to fill in is marked **ASSUMED**.

## What you get

For your team, a folder `output/<team name>/` with:

| File | What it tells you |
|---|---|
| `REPORT.md` | **Start here.** Team review, the likely four Pokemon the opponent brings, 3 to 4 game plans per matchup, and your worst matchups. Every statement is marked **CALC** (from the calculator) or **JUDGMENT** (reasoning). |
| `REPORT-sources.md` | Where every number in the report comes from. |
| `THREATS.md` | What outspeeds you, what knocks out your Pokemon, and what you knock out, overall and per opposing team. |
| `TEAM-REVIEW.md` | Type weaknesses, coverage, speed and support moves. |
| one folder per opposing team | Full damage, speed and stat tables for that matchup. |

## Set up (once)

1. Install **Node.js** (the "LTS" version) from https://nodejs.org.
2. Download this project: green **Code** button, then **Download ZIP**, and unzip it. (Or use `git clone`.)
3. Open the folder in **Claude Code**. Setup runs the first time you ask for an analysis. To do it yourself:

```bash
npm run setup
```

## Use it

Put your team in `teams/my-team.txt` in Pokemon Showdown export format. In Champions the `EVs:` line holds **stat points** (at most 32 per stat, 66 in total) and there are no IVs. A Pokemon holding its Mega Stone is calculated as its Mega form.

The easy way: open Claude Code in this folder and say **`/analyze-team`**, then paste your team.

The manual way:

| I want to... | Run |
|---|---|
| Get the latest top teams and spreads | `node src/fetch-data.js fetch`, read `data/staging/SUMMARY.md`, then `node src/fetch-data.js promote` |
| Calculate my team against all of them | `npm run analyze` |
| Rebuild the report after changing the team | `npm run analyze`, then `npm run report` |
| Check that everything works | `npm test` |
| Use another team file | `node src/analyze.js teams/other.txt` |
| Add weather, Tailwind, screens or Intimidate | `node src/analyze.js --scenario src/scenarios/example-sun-tailwind.json` |

Changing your team never means starting over: fetched data is saved, and each command only redoes its own step.

## Which teams count as "recent"

The data comes from the VGCPastes team sheet (a public Google Sheet) and Pokepaste. The sheet does not say which regulation a team was played under, so you name the events in `config.json` under `regulation_events`. When the regulation changes, change that list and fetch again.

Spreads that a team's paste does not show are filled in with the **most common spread** for that Pokemon among those events. If an event has no data for a Pokemon, it falls back to older events, clearly labelled. If there is no data at all, the Pokemon is UNKNOWN and that team is not used. Default spreads are never used. Details: `RULES-assumed-spreads.md`.

## The rules it follows

1. Every number comes from the calculator (`@smogon/calc`), never from guessing.
2. No made-up data. Missing means UNKNOWN.
3. Every outside fact is saved with its source link and fetch date.
4. Assumed spreads are marked ASSUMED everywhere.
5. In the report, each statement is CALC or JUDGMENT, and each number is filled in by code from a file in `output/`. A number typed by hand makes the report fail to build.

The full list is in `CLAUDE.md`.

## Limits you should know

- The calculator uses Scarlet/Violet data. Changes made in Champions are UNKNOWN unless the calculator already has them.
- Damage assumes a neutral field, full HP and no boosts. Weather and terrain from abilities, Intimidate, Sand Rush, screens and Focus Sash are not applied unless you pass a scenario, and Focus Sash is never applied.
- Speed order ignores move priority.
- "Likely four" Pokemon for each opponent is a guess. Open team sheets show six Pokemon, not which four are brought.

## Folders

| Folder | Contents |
|---|---|
| `teams/` | Your team files (not uploaded to GitHub) |
| `meta/` | Opponent teams, one file each, with source and date (not uploaded) |
| `data/` | Cached downloads and spread statistics (not uploaded) |
| `output/` | Everything the tool produces (not uploaded) |
| `src/` | The scripts |
| `tests/` | Automatic checks against the official calculator test suite |
| `.claude/` | The `/analyze-team` command and the `vgc-analyst` report agent |

## Progress

| Step | State |
|---|---|
| Calculator engine, doubles mechanics, Champions stat points | done |
| Opponent team format and missing-spread rule | done |
| Fetching teams and spreads | done |
| Matchup tables and threat summary | done |
| Written report with traceable numbers | done |

## Troubleshooting

- **"Calculator not installed"**: run `npm run setup`.
- **"No opponent teams in /meta"**: run the fetch step above.
- **A team is skipped as UNKNOWN**: one of its Pokemon has no spread data in any source. Add its spread to the team file by hand, or wait for more data.
- **The report will not build**: the message names the line. It is either a number typed by hand, a statement without CALC or JUDGMENT, or a source that cannot be found.
