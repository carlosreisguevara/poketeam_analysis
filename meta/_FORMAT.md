# Opponent team file format

One file per team, named `<short-name>.txt`. Files starting with `_` are ignored.

```
# Name: <team name>
# Source: <URL the team came from>
# Fetched: <YYYY-MM-DD>
# Format: <optional, e.g. Regulation MC>
# Result: <optional, e.g. 1st place>

Pokemon @ Item
Ability: Ability
Level: 50
EVs: 32 HP / 32 Def / 2 SpD
Careful Nature
- Move 1
- Move 2
- Move 3
- Move 4
```

- The three header lines Name, Source and Fetched are required. The source must be a URL and the date must be YYYY-MM-DD.
- Same Showdown format as my team. `EVs:` means Champions stat points (max 32 each, 66 total). No IVs lines.
- 4 to 6 Pokemon.
- Item and Ability are required. If either is missing the file is rejected as UNKNOWN.
- Nature and `EVs:` may be left out. The tool then fills them in under `RULES-assumed-spreads.md` and marks them ASSUMED.
- A Pokemon holding its Mega Stone is calculated as its Mega form.
- Check all files with: `node src/meta-check.js`
