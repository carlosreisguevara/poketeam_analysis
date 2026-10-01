// Missing-spread rule (Phase 2). See data/assumption-rule.json and RULES-assumed-spreads.md.
// Only the SPREAD (nature + stat points) can be filled in, and only from real usage data. No default spreads, ever.
// Missing ability, item or moves are never guessed.
const fs = require('fs');
const path = require('path');
const { Generations, toID } = require('@smogon/calc');

const RULE_FILE = path.join(__dirname, '..', 'data', 'assumption-rule.json');
const POINT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function loadRule(file = RULE_FILE) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function readUsage(usageDir, g, species) {
  const sp = g.species.get(toID(species));
  const candidates = [toID(species), sp && toID(sp.baseSpecies)].filter(Boolean);
  for (const id of candidates) {
    const f = path.join(usageDir, `${id}.json`);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!d.source_url || !d.fetched || !Array.isArray(d.spreads)) throw new Error(`${f}: usage file must have source_url, fetched and spreads[].`);
    for (const s of d.spreads) {
      const sum = Object.values(s.points || {}).reduce((a, b) => a + b, 0);
      if (!s.nature || typeof s.usage_pct !== 'number' || sum > 66 || Object.values(s.points).some(v => v > 32))
        throw new Error(`${f}: bad spread entry ${JSON.stringify(s)} (need nature, usage_pct, points with max 32 each and 66 total - are these old-style EVs?).`);
    }
    return { file: f, ...d };
  }
  return null;
}

function samePoints(a, b) { return POINT_KEYS.every(k => (a[k] || 0) === (b[k] || 0)); }

// Mutates and returns the set. Sets set.assumed / set.assumption when anything was filled in.
function applyAssumptions(set, gen, { usageDir = path.join(__dirname, '..', 'data', 'usage'), rule = loadRule() } = {}) {
  const needNature = !set.nature; const needPoints = !set.hasEvs;
  set.warnings = [];
  if (!needNature && !needPoints) return set;
  const g = Generations.get(gen);
  const parts = [...(needNature ? ['nature'] : []), ...(needPoints ? ['stat points'] : [])];

  const usage = readUsage(usageDir, g, set.species);
  let pick = null;
  if (usage) {
    const matching = usage.spreads.filter(s => (needNature || s.nature === set.nature) && (needPoints || samePoints(s.points, set.evs)));
    if (matching.length) pick = matching.reduce((best, s) => (s.usage_pct > best.usage_pct ? s : best)); // ties -> first listed
  }
  if (pick) {
    if (needNature) set.nature = pick.nature;
    if (needPoints) { set.evs = { ...pick.points }; set.hasEvs = true; }
    set.assumption = { parts, source: 'usage data', url: usage.source_url, fetched: usage.fetched, usagePct: pick.usage_pct };
  } else {
    throw new Error(`${set.label}: spread (${parts.join(' and ')}) is UNKNOWN. No usage data${usage ? ' matches what the file already gives' : ' found'} for ${set.species} in ${usageDir}. Default spreads are never used: fetch usage data (Phase 3) or write the spread in the team file.`);
  }
  set.assumed = true;
  return set;
}

module.exports = { applyAssumptions, loadRule };
