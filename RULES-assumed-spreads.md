# Rule for missing spreads (LOCKED 2026-10-01)

A "spread" is a Pokemon's nature plus its stat points. Only the spread can be filled in. A missing ability, item or move is never guessed: the team file is rejected and the gap is reported as UNKNOWN.

1. If the team file gives the nature and the stat points, they are used exactly as written. Nothing is assumed.
2. If the nature or the stat points (or both) are missing, only the missing part is filled in. What the file already says is kept.
3. The fill-in comes only from usage data (saved in `data/usage/`, with its source URL and fetch date): the most-used spread for that Pokemon. If the file already gives the nature or the points, the tool takes the most-used spread that matches them. If two spreads are tied, the first one listed wins.
4. There are no default spreads. If there is no usage data, or none matches what the file already gives, the Pokemon is UNKNOWN and the tool stops with an error telling you what is missing.
5. Every filled-in part is marked ASSUMED in the Pokemon's name in every table, in a list at the top of each damage file, and in `run-info.json`, with the source URL, fetch date and usage %.
