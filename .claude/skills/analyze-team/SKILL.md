---
name: analyze-team
description: Analyze a Pokemon Champions VGC doubles team against the meta teams in /meta using the calc engine. Use when the user says "analyze my team", "test this team", "/analyze-team", or pastes a new team to evaluate.
---

# Analyze a team

Read CLAUDE.md first: its HARD RULES apply. Never calculate or recall numbers yourself; every number comes from the scripts.

1. **First run only.** If `node_modules` is missing, run `npm run setup` (it installs the calculator and runs the tests). If Node.js is missing, install it for the user (Windows: `winget install OpenJS.NodeJS.LTS --source winget`) and explain in plain words.
2. **Get the team.** If the user pasted a team, save it to `teams/<name>.txt` exactly as pasted (Showdown format; `EVs:` means Champions stat points, max 32 each and 66 total). If anything is missing (nature, spread, ability, item) or ambiguous, ask ONE question at a time. Never guess.
3. **Run:** `node src/analyze.js teams/<name>.txt` (add `--scenario src/scenarios/<file>.json` for weather, Tailwind, screens, etc.).
4. **Read the result.** The command prints OK/FAIL per opponent team and writes `output/<team>/INDEX.md` plus damage, speed and stats tables per matchup. Report failures plainly (UNKNOWN spread, missing source, etc.) and what is needed to fix them.
5. **Summarize** in short plain language. Label each statement CALC (from the tables, with file name) or JUDGMENT (your reasoning). Any Pokemon marked `[ASSUMED]` must stay marked.
6. If `/meta` is empty or usage data is missing, say so and offer the data-fetching phase. Never fill gaps from memory.

Stop after the requested step. Do not start the next phase unless asked.
