---
name: analyze-team
description: Analyze a Pokemon Champions VGC doubles team against recent top teams using the calc engine and write the matchup report. Use when the user says "analyze my team", "test this team", "/analyze-team", or pastes a new team to evaluate.
---

# Analyze a team

Read CLAUDE.md first: its HARD RULES apply. Never calculate or recall numbers yourself; every number comes from the scripts.

1. **First run only.** If `node_modules` is missing, run `npm run setup` (installs the calculator and runs the tests). If Node.js is missing, install it for the user (Windows: `winget install OpenJS.NodeJS.LTS --source winget`) and explain in plain words.
2. **Get the team.** If the user pasted a team, save it to `teams/<name>.txt` exactly as pasted (Showdown format; `EVs:` means Champions stat points, max 32 each and 66 total). If anything is missing (nature, spread, ability, item) or ambiguous, ask ONE question at a time. Never guess.
3. **Opponent data.** If `/meta` is empty or the user wants fresh data: `node src/fetch-data.js fetch`, show `data/staging/SUMMARY.md`, and only after the user agrees `node src/fetch-data.js promote`. The events counted as the current regulation are in `config.json` (`regulation_events`); ask the user if they changed.
4. **Calculate:** `node src/analyze.js teams/<name>.txt` (add `--scenario src/scenarios/<file>.json` for weather, Tailwind, screens). Report failures plainly (UNKNOWN spread, missing source) and what is needed to fix them.
5. **Report:** use the `vgc-analyst` agent, or follow its steps: write `output/<team>/REPORT-plans.json` (plans as data, no typed numbers), then `npm run report`. Tell the user to open `output/<team>/REPORT.html` (double-click) or run `npm run open`.
6. **Summarize** in short plain language. Any Pokemon marked `[ASSUMED]` stays marked. If data is missing, say so; never fill gaps from memory.

Stop after the requested step. Do not start the next one unless asked.
