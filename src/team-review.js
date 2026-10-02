// Team composition data for the report (Phase 5, part 1). All figures come from @smogon/calc data and the matchup tables.
// Usage: node src/team-review.js [teams/my-team.txt]   -> output/<team>/team-review.json and TEAM-REVIEW.md
// Type effectiveness here is by TYPE ONLY: abilities (Levitate, Flash Fire, Lightning Rod ...) and items are not applied.
const fs = require('fs');
const path = require('path');
const { Generations, toID } = require('@smogon/calc');
const { loadTeamFile } = require('./meta');
const E = require('./engine');

const teamFile = process.argv[2] || path.join('teams', 'my-team.txt');
const gen = Generations.get(9);
const team = loadTeamFile(teamFile);
const name = team.meta.name;
const outDir = path.join('output', name);
if (!fs.existsSync(outDir)) throw new Error(`${outDir} not found. Run: npm run analyze`);

const TYPES = gen.types ? [...gen.types].map(t => t.name).filter(n => n !== '???' && n !== 'Stellar') : [];
const eff = (atk, defTypes) => defTypes.reduce((m, d) => m * (gen.types.get(toID(atk)).effectiveness[d] ?? 1), 1);

// Move groups are lists of NAMES taken from the team file (what the set contains), not calculated.
const GROUPS = {
  speedControl: ['Trick Room', 'Tailwind', 'Icy Wind', 'Electroweb', 'Thunder Wave', 'Bulldoze', 'Rock Tomb', 'Snarl', 'Scary Face', 'String Shot', 'Sticky Web'],
  redirection: ['Follow Me', 'Rage Powder', 'Spotlight'],
  priorityAndPrevention: ['Fake Out', 'Extreme Speed', 'Sucker Punch', 'Quick Attack', 'Aqua Jet', 'Mach Punch', 'Bullet Punch', 'Ice Shard', 'Shadow Sneak', 'Jet Punch', 'Grassy Glide'],
  protection: ['Protect', 'Detect', 'Wide Guard', 'Quick Guard', 'Spiky Shield', 'King\'s Shield', 'Baneful Bunker', 'Obstruct', 'Silk Trap'],
  support: ['Helping Hand', 'Coaching', 'Decorate', 'Life Dew', 'Pollen Puff', 'After You', 'Ally Switch', 'Taunt', 'Encore', 'Haze', 'Reflect', 'Light Screen', 'Aurora Veil'],
  setup: ['Swords Dance', 'Nasty Plot', 'Dragon Dance', 'Calm Mind', 'Bulk Up', 'Clangorous Soul', 'Iron Defense', 'Quiver Dance', 'Shell Smash', 'Belly Drum'],
};
const FIELD_ABILITIES = ['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Grassy Surge', 'Psychic Surge', 'Electric Surge', 'Misty Surge', 'Orichalcum Pulse', 'Hadron Engine', 'Intimidate'];

const mons = team.sets.map(s => {
  const sp = gen.species.get(toID(s.species));
  const stats = E.finalStats(gen, s, 'champions');
  const moves = s.moves.map(m => { const mv = gen.moves.get(toID(m)); return { name: mv.name, type: mv.type, category: mv.category, bp: mv.basePower || 0 }; });
  return { name: s.label, species: s.species, types: sp.types, item: s.item, ability: s.ability, nature: s.nature, stats, moves, teraType: s.teraType || null,
    groups: Object.fromEntries(Object.entries(GROUPS).map(([g, list]) => [g, s.moves.filter(m => list.includes(m))])),
    fieldAbility: FIELD_ABILITIES.includes(s.ability) ? s.ability : null };
});

// Defensive: for each attacking type, who is weak / resists / immune (type only)
const defensive = {};
for (const t of TYPES) {
  const weak = [], resist = [], immune = [], double = [];
  for (const m of mons) { const x = eff(t, m.types); if (x === 0) immune.push(m.name); else if (x >= 4) double.push(m.name); else if (x > 1) weak.push(m.name); else if (x < 1) resist.push(m.name); }
  defensive[t] = { weak: [...double, ...weak], doubleWeak: double, resist, immune, weakCount: double.length + weak.length, resistCount: resist.length + immune.length };
}
// Offensive: single defending types hit super effectively by at least one damaging move
const offensive = {};
for (const d of TYPES) {
  const hits = [];
  for (const m of mons) for (const mv of m.moves) if (mv.category !== 'Status' && mv.bp > 0 && eff(mv.type, [d]) > 1) hits.push(`${m.name} (${mv.name})`);
  offensive[d] = { superEffective: hits, covered: hits.length > 0 };
}
const moveTypes = [...new Set(mons.flatMap(m => m.moves.filter(v => v.category !== 'Status' && v.bp > 0).map(v => v.type)))];

// Speed tiers vs the opposing teams already calculated (from the speed tables)
const threats = fs.existsSync(path.join(outDir, 'threats.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'threats.json'), 'utf8')) : null;
const speed = mons.map(m => {
  let faster = 0, slower = 0, tie = 0;
  if (threats) for (const mu of threats.matchups) { const s = mu.speed.find(x => x.pokemon.replace(/ \[ASSUMED\]$/, '') === m.name); if (s) { faster += s.outspeedsMe.length; tie += s.tiesMe.length; slower += s.iOutspeed.length; } }
  return { name: m.name, speed: m.stats.spe, opposingFaster: faster, opposingTie: tie, opposingSlower: slower };
});

const review = { team: name, generated: new Date().toISOString(), note: 'Type-only effectiveness; abilities and items are not applied. Move groups are names found in the team file.', pokemon: mons, defensive, offensive, moveTypes, speed, matchupsCounted: threats ? threats.matchups.length : 0 };
fs.writeFileSync(path.join(outDir, 'team-review.json'), JSON.stringify(review, null, 2));

let md = `# Team composition data: ${name}\n\nGenerated ${review.generated}. Source: @smogon/calc type chart and stats, team file ${teamFile}. ${review.note}\n\n## Pokemon\n\n| Pokemon | Types | Item | Ability | HP/Atk/Def/SpA/SpD/Spe | Moves |\n|---|---|---|---|---|---|\n`;
for (const m of mons) md += `| ${m.name} | ${m.types.join('/')} | ${m.item} | ${m.ability} | ${m.stats.hp}/${m.stats.atk}/${m.stats.def}/${m.stats.spa}/${m.stats.spd}/${m.stats.spe} | ${m.moves.map(v => `${v.name} (${v.type})`).join(', ')} |\n`;
md += `\n## Defensive: which of my Pokemon are weak to each type\n\n| Attacking type | Weak (x2 or x4) | Resist or immune | Weak count | Resist/immune count |\n|---|---|---|---|---|\n`;
for (const t of TYPES) { const d = defensive[t]; md += `| ${t} | ${d.weak.map(n => n + (d.doubleWeak.includes(n) ? ' (x4)' : '')).join(', ') || '-'} | ${[...d.resist, ...d.immune.map(n => n + ' (immune)')].join(', ') || '-'} | ${d.weakCount} | ${d.resistCount} |\n`; }
md += `\n## Offensive: defending types hit super effectively by my damaging moves\n\n| Defending type | Covered | By |\n|---|---|---|\n`;
for (const t of TYPES) md += `| ${t} | ${offensive[t].covered ? 'yes' : '**NO**'} | ${offensive[t].superEffective.join(', ') || '-'} |\n`;
md += `\n## Support and speed control found in the team file\n\n| Pokemon | Speed control | Redirection | Priority / Fake Out | Protection | Support | Setup | Field ability |\n|---|---|---|---|---|---|---|---|\n`;
for (const m of mons) md += `| ${m.name} | ${m.groups.speedControl.join(', ') || '-'} | ${m.groups.redirection.join(', ') || '-'} | ${m.groups.priorityAndPrevention.join(', ') || '-'} | ${m.groups.protection.join(', ') || '-'} | ${m.groups.support.join(', ') || '-'} | ${m.groups.setup.join(', ') || '-'} | ${m.fieldAbility || '-'} |\n`;
md += `\n## Speed against the ${review.matchupsCounted} opposing teams (counts of opposing Pokemon, normal speed)\n\n| Pokemon | Speed | Opposing faster | Tie | Opposing slower |\n|---|---|---|---|---|\n`;
for (const s of speed) md += `| ${s.name} | ${s.speed} | ${s.opposingFaster} | ${s.opposingTie} | ${s.opposingSlower} |\n`;
fs.writeFileSync(path.join(outDir, 'TEAM-REVIEW.md'), md);
console.log(`Wrote ${path.join(outDir, 'TEAM-REVIEW.md')}`);
