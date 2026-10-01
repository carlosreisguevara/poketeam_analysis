// Loads team files. A file with a "# Source:" header is an opponent (meta) team; anything else is treated as my own team.
const fs = require('fs');
const path = require('path');
const { parseTeam } = require('./parse');
const { applyAssumptions, loadRule } = require('./assume');

const REQUIRED = ['name', 'source', 'fetched'];

function splitHeader(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const meta = {}; let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === '' ) { if (Object.keys(meta).length) break; else continue; }
    const m = l.match(/^#\s*([A-Za-z ]+):\s*(.*)$/);
    if (!m) break;
    meta[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return { meta, body: lines.slice(i).join('\n') };
}

function loadMetaTeam(file, { gen = 9, ruleset = 'champions', usageDir, rule } = {}) {
  const { meta, body } = splitHeader(fs.readFileSync(file, 'utf8'));
  for (const k of REQUIRED) if (!meta[k]) throw new Error(`${file}: header is missing "# ${k[0].toUpperCase() + k.slice(1)}:" (source URL and fetch date are mandatory).`);
  if (!/^https?:\/\//.test(meta.source)) throw new Error(`${file}: "# Source:" must be a URL, got "${meta.source}".`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.fetched)) throw new Error(`${file}: "# Fetched:" must be YYYY-MM-DD, got "${meta.fetched}".`);
  let sets;
  try { sets = parseTeam(body, { gen, ruleset, strict: false }); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  if (sets.length < 4 || sets.length > 6) throw new Error(`${file}: a team must have 4 to 6 Pokemon, found ${sets.length}.`);
  const r = rule || loadRule();
  for (const s of sets) {
    if (!s.ability) throw new Error(`${file}: ${s.label} has no Ability - UNKNOWN (abilities are never assumed).`);
    if (!s.item) throw new Error(`${file}: ${s.label} has no Item - UNKNOWN (items are never assumed).`);
    try { applyAssumptions(s, gen, { usageDir, rule: r }); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  return { kind: 'meta', meta, sets, ruleStatus: r.status };
}

function loadTeamFile(file, opts = {}) {
  const text = fs.readFileSync(file, 'utf8');
  if (/^\s*#\s*Source:/mi.test(text)) return loadMetaTeam(file, opts);
  const { gen = 9, ruleset = 'champions' } = opts;
  return { kind: 'own', meta: { name: path.basename(file, path.extname(file)) }, sets: parseTeam(text, { gen, ruleset, strict: true }) };
}

module.exports = { loadMetaTeam, loadTeamFile, splitHeader };
