// Showdown-format team parser. Fails loudly on anything it does not understand.
const { Generations, toID } = require('@smogon/calc');

const STAT_KEYS = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' };

// ruleset 'champions': "EVs" line = stat points (max 32 per stat, 66 total), no IVs line, IVs fixed at 31.
// ruleset 'standard':  normal EVs (max 252 per stat, 510 total) and IVs allowed. Used for verification tests only.
function parseTeam(text, { gen = 9, ruleset = 'champions', strict = true } = {}) {
  const g = Generations.get(gen);
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) throw new Error('Team file is empty.');
  return blocks.map((block, idx) => parseSet(block, g, ruleset, strict, idx + 1));
}

function fail(n, label, msg) {
  throw new Error(`Pokemon #${n}${label ? ` (${label})` : ''}: ${msg}`);
}

function parseSet(block, g, ruleset, strict, n) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  let first = lines[0];
  let item;
  const at = first.split(' @ ');
  if (at.length > 1) { first = at[0].trim(); item = at.slice(1).join(' @ ').trim(); }
  first = first.replace(/\s+\((M|F)\)$/, '');
  let nickname;
  let species = first;
  const nick = first.match(/^(.*) \(([^()]+)\)$/);
  if (nick) { nickname = nick[1].trim(); species = nick[2].trim(); }

  const ALIAS = { aegislash: 'Aegislash-Shield' }; // Showdown base-forme names the calc stores under a forme
  const sp = g.species.get(toID(ALIAS[toID(species)] || species));
  if (!sp) fail(n, species, `species "${species}" not found in calc data.`);
  const set = {
    species: sp.name, label: nickname || sp.name, item, ability: undefined, nature: undefined,
    level: ruleset === 'champions' ? 50 : undefined, evs: {}, ivs: {}, teraType: undefined,
    assumed: false, hasEvs: false, moves: [],
  };

  for (const line of lines.slice(1)) {
    if (line.startsWith('- ')) { set.moves.push(line.slice(2).trim()); continue; }
    const m = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (m) {
      const key = m[1].trim().toLowerCase(); const val = m[2].trim();
      if (key === 'ability') set.ability = val;
      else if (key === 'level') set.level = parseInt(val, 10);
      else if (key === 'tera type') set.teraType = val;
      else if (['shiny', 'happiness', 'pokeball', 'gender', 'dynamax level', 'gigantamax', 'hidden power'].includes(key)) continue; // cosmetic or irrelevant here
      else if (key === 'assumed') set.assumed = /^(yes|true)$/i.test(val);
      else if (key === 'evs' || key === 'ivs') {
        if (key === 'evs') set.hasEvs = true;
        if (key === 'ivs' && ruleset === 'champions') fail(n, set.label, 'IVs lines are not allowed in the champions ruleset (IVs were removed).');
        const target = key === 'evs' ? set.evs : set.ivs;
        for (const part of val.split('/')) {
          const pm = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
          if (!pm) fail(n, set.label, `cannot read ${key.toUpperCase()} part "${part.trim()}".`);
          target[STAT_KEYS[pm[2].toLowerCase()]] = parseInt(pm[1], 10);
        }
      } else fail(n, set.label, `unknown line "${line}".`);
      continue;
    }
    const nm = line.match(/^(\w+) Nature$/);
    if (nm) { set.nature = nm[1]; continue; }
    fail(n, set.label, `cannot understand line "${line}".`);
  }

  // validation
  if (set.item && !g.items.get(toID(set.item))) fail(n, set.label, `item "${set.item}" not found in calc data.`);
  // Rule: a Pokemon holding its Mega Stone is always calculated as its Mega form.
  if (set.item) {
    const stone = g.items.get(toID(set.item)).megaStone;
    if (stone && stone[set.species]) {
      if (set.label === set.species) set.label = stone[set.species];
      set.species = stone[set.species];
      // The paste shows the ability BEFORE Mega Evolution; the Mega form has its own ability.
      const mega = g.species.get(toID(set.species));
      if (mega && mega.abilities && mega.abilities[0]) { set.preMegaAbility = set.ability; set.ability = mega.abilities[0]; }
    }
  }
  if (set.ability && !g.abilities.get(toID(set.ability))) fail(n, set.label, `ability "${set.ability}" not found in calc data.`);
  if (set.nature && !g.natures.get(toID(set.nature))) fail(n, set.label, `nature "${set.nature}" not found.`);
  if (set.teraType && !g.types.get(toID(set.teraType))) fail(n, set.label, `tera type "${set.teraType}" not found.`);
  for (const mv of set.moves) if (!g.moves.get(toID(mv))) fail(n, set.label, `move "${mv}" not found in calc data.`);
  if (set.moves.length === 0) fail(n, set.label, 'no moves.');
  if (strict) {
    if (!set.ability) fail(n, set.label, 'missing Ability line.');
    if (!set.nature) fail(n, set.label, 'missing Nature line.');
  }
  const warnings = [];
  const total = Object.values(set.evs).reduce((a, b) => a + b, 0);
  if (ruleset === 'champions') {
    for (const [k, v] of Object.entries(set.evs)) if (v > 32) fail(n, set.label, `${v} stat points in ${k}; max is 32.`);
    if (total > 66) fail(n, set.label, `${total} stat points total; max is 66.`);
    if (total === 0) warnings.push(`${set.label}: no stat points listed (all 0).`);
    else if (total < 66) warnings.push(`${set.label}: only ${total} of 66 stat points used.`);
  } else {
    for (const [k, v] of Object.entries(set.evs)) if (v > 252) fail(n, set.label, `${v} EVs in ${k}; max is 252.`);
    if (total > 510) fail(n, set.label, `${total} EVs total; max is 510.`);
  }
  set.warnings = warnings;
  return set;
}

module.exports = { parseTeam };
