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
      const sum = Object.values(s.points || {}).reduce((x, y) => x + y, 0);
      if (typeof s.usage_pct !== 'number' || (s.nature !== null && typeof s.nature !== 'string') || sum > 66 || Object.values(s.points).some(v => v > 32))
        throw new Error(`${f}: bad spread entry ${JSON.stringify(s)} (need usage_pct, nature or null, points with max 32 each and 66 total - are these old-style EVs?).`);
    }
    d.natures = d.natures || [];
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
  const best = arr => (arr.length ? arr.reduce((m, x) => (x.usage_pct > m.usage_pct ? x : m)) : null); // ties -> first listed
  let nature = set.nature, points = set.hasEvs ? set.evs : null, usagePct = null, how = '';
  if (usage) {
    if (needPoints) {
      // prefer spreads paired with the given nature; fall back to spreads whose nature the source does not pair
      const s1 = best(usage.spreads.filter(s => !nature || s.nature === nature)) || best(usage.spreads.filter(s => s.nature === null));
      if (s1) { points = { ...s1.points }; usagePct = s1.usage_pct; if (!nature) nature = s1.nature; how = s1.nature === null ? 'most common points spread (source does not pair it with a nature)' : 'most common spread'; }
    } else if (needNature) {
      const s1 = best(usage.spreads.filter(s => s.nature && samePoints(s.points, set.evs)));
      if (s1) { nature = s1.nature; usagePct = s1.usage_pct; how = 'most common nature for the given points'; }
    }
    if (!nature && needNature) { const n1 = best(usage.natures); if (n1) { nature = n1.nature; usagePct = usagePct ?? n1.usage_pct; how += (how ? '; ' : '') + 'nature = most common nature overall'; } }
  }
  if (usage && nature && points) {
    if (needNature) set.nature = nature;
    if (needPoints) { set.evs = { ...points }; set.hasEvs = true; }
    set.assumption = { parts, source: 'usage data', how, url: usage.source_url, fetched: usage.fetched, format: usage.format, month: usage.dataset_month, usagePct };
  } else {
    throw new Error(`${set.label}: spread (${parts.join(' and ')}) is UNKNOWN. No usage data${usage ? ' matches what the file already gives' : ' found'} for ${set.species} in ${usageDir}. Default spreads are never used: fetch usage data (Phase 3) or write the spread in the team file.`);
  }
  set.assumed = true;
  return set;
}

module.exports = { applyAssumptions, loadRule };
