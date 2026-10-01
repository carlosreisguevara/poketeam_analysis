PROJECT GOAL
Given my team (full spreads), the tool: (a) reviews team composition, (b) simulates matchups against meta teams, (c) writes 3 to 4 plans per matchup for choosing 4 of my 6 Pokemon (leads and backline). Final output is one structured report.

HARD RULES (apply to every phase)
1. All numbers (stats, damage, KO chances, speed order) come only from code using @smogon/calc and Pokemon Showdown data. Never calculate, estimate or recall numbers yourself.
2. Never invent data. No made-up spreads, moves, usage percentages, teams or results. If data is missing, write "UNKNOWN" and tell me.
3. Every external fact (usage, teams, spreads) is saved with its source URL and fetch date. If a fetch fails, say so plainly. Never fill the gap from memory.
4. Any assumed spread is flagged "ASSUMED" in every table and report where it appears.
5. In the final report, label each statement as CALC (from tables) or JUDGMENT (my reasoning). Every number in the report must trace to a file in /output.
6. Work ONLY on the phase I name. When it is done: show test evidence, summarize what exists, state what the next phase needs from me, and stop. Do not start the next phase.
7. If something is ambiguous, ask me. Do not guess.

FOLDER STRUCTURE
/teams (my team, Showdown export format)
/meta (opponent teams, one file each, with source and date)
/data (cached usage data)
/output (calc tables, reports)
/src (scripts)
/tests (verification cases)

PHASES
Phase 0 - Setup: ask me game, format and regulation (decides legal Pokemon pool). Create folders, install @smogon/calc, confirm it runs.

Phase 1 - Calc engine: script that takes two teams in Showdown format and outputs, for every Pokemon vs every Pokemon in both directions: damage range (% HP) per move, KO chance (OHKO/2HKO etc.), speed order (normal, Tailwind, Trick Room). Support doubles mechanics: spread reduction, weather, terrain, Tera, items, abilities (incl. Intimidate), Helping Hand, screens, field flags. Verify with 5 test cases against known Showdown calc results and show me they match.

Phase 2 - Meta library and assumption rule: standard format for opponent team files. Fixed, documented rule for missing spreads (most common spread from usage data, else a clearly defined default). Rule applied automatically, flagged ASSUMED. Show me the rule in plain language and get my approval before locking it.

Phase 3 - Public data fetching: pull usage and common teams from public sources (Pikalytics, Limitless VGC, Smogon stats). Cache with source and date. Build to fail loudly if a site changes. Show me what was fetched before saving it into /meta.

Phase 4 - Matchup runner: run my full team against every team in /meta. Output one table per matchup plus a summary file of key threats (what outspeeds me, what OHKOs/2HKOs me, what I KO) in /output.

Phase 5 - Report: from /output tables only, write the structured report: (1) team composition review (type coverage, speed control, weaknesses, win conditions), (2) per matchup: likely opposing 4 with reasoning and confidence level, (3) 3 to 4 gameplans per matchup (leads, backline, what to avoid, key calcs), (4) overall summary of which meta teams are my worst matchups. Keep it short and sharp, tables where they help.

DECISIONS MADE BY THE USER (these override the phase text above)
- 2026-10-01: Pokemon Champions, VGC doubles, level 50, Regulation MC. Stats use stat points (max 32 per stat, 66 total, no IVs).
- 2026-10-01: A Pokemon holding its Mega Stone is always calculated as its Mega form.
- 2026-10-01: Phase 2 rule locked: missing spreads come only from the most common spread in usage data. Default spreads are never used; no usage data means UNKNOWN. See RULES-assumed-spreads.md.
- 2026-10-01: The project must be reusable for any team and shareable on GitHub, so a friend can use it in their own Claude workspace.
