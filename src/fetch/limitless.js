// Limitless: a player's submitted team list (open team sheet: item, ability, nature, moves; no stat points).
const { get } = require('./http');

async function teamlist(url) {
  const r = await get(url);
  if (r.status === 404) throw new Error(`team page not found: ${url}`);
  const m = r.text.match(/const teamlist = `([^`]*)`/);
  if (!m) throw new Error(`SITE CHANGED? no "const teamlist" block in ${url}`);
  const text = m[1].trim();
  if (!/Ability:/.test(text) || !/Nature/.test(text)) throw new Error(`SITE CHANGED? team list in ${url} lacks Ability/Nature lines`);
  return text;
}

module.exports = { teamlist };
