// Usage: node src/meta-check.js   -> validates every file in /meta (files starting with _ are skipped) and lists assumed spreads.
const fs = require('fs');
const path = require('path');
const { loadMetaTeam } = require('./meta');
const dir = path.join(__dirname, '..', 'meta');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt') && !f.startsWith('_'));
if (!files.length) { console.log('No opponent teams in /meta yet.'); process.exit(0); }
let bad = 0;
for (const f of files) {
  try {
    const t = loadMetaTeam(path.join(dir, f));
    const assumed = t.sets.filter(s => s.assumed);
    console.log(`OK    ${f}: ${t.meta.name} | ${t.sets.length} Pokemon | source ${t.meta.source} | fetched ${t.meta.fetched}${assumed.length ? ` | ASSUMED: ${assumed.map(s => s.label).join(', ')}` : ''}`);
  } catch (e) { bad++; console.log(`FAIL  ${f}: ${e.message}`); }
}
process.exit(bad ? 1 : 0);
