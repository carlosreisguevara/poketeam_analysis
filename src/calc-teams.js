// Usage: node src/calc-teams.js <teamA.txt> <teamB.txt> [--scenario file.json] [--ruleset champions|standard] [--out dir]
const fs = require('fs');
const path = require('path');
const { Generations } = require('@smogon/calc');
const { loadTeamFile } = require('./meta');
const E = require('./engine');

function arg(name, def) { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; }
const [fileA, fileB] = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && !(arr[i - 1] || '').startsWith('--'));
if (!fileA || !fileB) { console.error('Usage: node src/calc-teams.js <teamA.txt> <teamB.txt> [--scenario f.json] [--ruleset champions|standard] [--out dir]'); process.exit(1); }

const ruleset = arg('--ruleset', 'champions');
const scenario = E.loadScenario(arg('--scenario') ? JSON.parse(fs.readFileSync(arg('--scenario'), 'utf8')) : null);
const GEN = 9;
const gen = Generations.get(GEN);
const nameA = path.basename(fileA, path.extname(fileA));
const nameB = path.basename(fileB, path.extname(fileB));
const outDir = arg('--out', path.join('output', `${nameA}-vs-${nameB}`));
fs.mkdirSync(outDir, { recursive: true });

const { loadRule } = require('./assume');
const loadOpts = { gen: GEN, ruleset, ...(arg('--usage-dir') ? { usageDir: arg('--usage-dir') } : {}), ...(arg('--rule') ? { rule: loadRule(arg('--rule')) } : {}) };
const loadedA = loadTeamFile(fileA, loadOpts);
const loadedB = loadTeamFile(fileB, loadOpts);
const teamA = loadedA.sets;
const teamB = loadedB.sets;
for (const [team, key] of [[teamA, 'A'], [teamB, 'B']]) {
  for (const lbl of scenario.tera[key]) if (!team.some(s => s.label === lbl)) throw new Error(`Scenario Tera list names "${lbl}" which is not on team ${key}.`);
}
const tag = s => (s.assumed ? `${s.label} [ASSUMED]` : s.label);
const warnings = [...teamA, ...teamB].flatMap(s => s.warnings);
const assumptions = [...teamA, ...teamB].filter(s => s.assumed).map(s => ({ pokemon: s.label, spread: `${s.nature}, ${Object.entries(s.evs).map(([k, v]) => `${v} ${k}`).join(' / ') || '0 points'}`, filled: s.assumption.parts, basis: s.assumption.source, url: s.assumption.url, fetched: s.assumption.fetched, usagePct: s.assumption.usagePct }));
for (const l of [loadedA, loadedB]) if (l.ruleStatus && l.ruleStatus !== 'LOCKED' && assumptions.length) warnings.push(`Assumption rule status is ${l.ruleStatus}, not LOCKED.`);
if (scenario.intimidate.A || scenario.intimidate.B) {
  for (const [team, key] of [[teamA, 'A'], [teamB, 'B']]) if (scenario.intimidate[key])
    for (const s of team) if (E.INTIMIDATE_CHECK.includes(s.ability)) warnings.push(`Intimidate on side ${key}: ${s.label} has ${s.ability}; the flat -1 Atk applied here may be WRONG for this ability. Check manually.`);
}

// ---- stats ----
const statsRows = [];
for (const [team, side] of [[teamA, nameA], [teamB, nameB]]) for (const s of team) {
  statsRows.push({ team: side, pokemon: tag(s), item: s.item || '', ability: s.ability || '', nature: s.nature || '',
    spread: ruleset === 'champions' ? s.evs : s.evs, final: E.finalStats(gen, s, ruleset) });
}

// ---- damage ----
const matchups = [];
for (const a of teamA) for (const b of teamB) {
  const dirs = [];
  for (const [atk, def, key] of [[a, b, 'A'], [b, a, 'B']]) {
    const rows = [];
    for (const mv of atk.moves) rows.push(E.calcMove(gen, atk, def, mv, scenario, key, ruleset));
    dirs.push({ attacker: tag(atk), defender: tag(def), attackerSide: key === 'A' ? nameA : nameB, rows });
  }
  matchups.push({ a: tag(a), b: tag(b), directions: dirs });
}

// ---- speed ----
const states = [
  { id: 'normal', title: 'Normal (no Tailwind, no Trick Room)', twA: false, twB: false, tr: false },
  { id: 'tailwind_A', title: `Tailwind on ${nameA}`, twA: true, twB: false, tr: false },
  { id: 'tailwind_B', title: `Tailwind on ${nameB}`, twA: false, twB: true, tr: false },
  { id: 'trick_room', title: 'Trick Room (no Tailwind)', twA: false, twB: false, tr: true },
];
const speedMons = [];
for (const [team, key, side] of [[teamA, 'A', nameA], [teamB, 'B', nameB]]) for (const s of team) {
  const n = E.speedOf(gen, s, scenario, key, ruleset, false); const t = E.speedOf(gen, s, scenario, key, ruleset, true);
  speedMons.push({ team: side, pokemon: tag(s), item: s.item || '', rawSpeedStat: n.raw, speedNormal: n.final, speedTailwind: t.final });
}
const speedMatrix = states.map(st => ({
  ...st, cells: teamA.map(a => teamB.map(b => {
    const r = E.speedOrder(gen, a, b, scenario, ruleset, st);
    return { a: tag(a), b: tag(b), first: r.first === 'A' ? nameA : r.first === 'B' ? nameB : 'TIE', speedA: r.speedA, speedB: r.speedB };
  })),
}));

// ---- write JSON ----
const info = {
  generated: new Date().toISOString(), calcPackage: '@smogon/calc ' + require('@smogon/calc/package.json').version,
  generation: GEN, ruleset, teamA: { name: nameA, file: fileA }, teamB: { name: nameB, file: fileB }, scenario, warnings, assumptions, sources: { A: loadedA.meta, B: loadedB.meta },
  notes: [
    'All Pokemon assumed at full HP, no stat boosts other than Intimidate flag in scenario.',
    'Spread-move reduction (0.75x) is applied by the calc whenever the move hits multiple targets in doubles (both foes assumed present).',
    'Calc data is the Pokemon Showdown / Scarlet-Violet data bundled with @smogon/calc. Any Champions-specific change to moves, abilities or Pokemon is UNKNOWN to this tool unless the calc already contains it.',
    'Speed order ignores move priority and speed ties are shown as TIE.',
    'Weather/terrain from abilities (Drought, etc.) is NOT automatic; set it in the scenario.',
  ],
};
fs.writeFileSync(path.join(outDir, 'run-info.json'), JSON.stringify(info, null, 2));
fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify(statsRows, null, 2));
fs.writeFileSync(path.join(outDir, 'damage.json'), JSON.stringify(matchups, null, 2));
fs.writeFileSync(path.join(outDir, 'speed.json'), JSON.stringify({ pokemon: speedMons, matrices: speedMatrix }, null, 2));

// ---- write Markdown ----
const stat = x => `${x.hp}/${x.atk}/${x.def}/${x.spa}/${x.spd}/${x.spe}`;
let md = `# Stats (HP/Atk/Def/SpA/SpD/Spe) - ruleset: ${ruleset}\n\nSource: @smogon/calc via src/calc-teams.js, generated ${info.generated}\n\n| Team | Pokemon | Item | Ability | Nature | ${ruleset === 'champions' ? 'Stat points' : 'EVs'} | Final stats |\n|---|---|---|---|---|---|---|\n`;
for (const r of statsRows) md += `| ${r.team} | ${r.pokemon} | ${r.item} | ${r.ability} | ${r.nature} | ${Object.entries(r.spread).map(([k, v]) => `${v} ${k}`).join(' / ') || 'none'} | ${stat(r.final)} |\n`;
fs.writeFileSync(path.join(outDir, 'stats.md'), md);

md = `# Damage tables: ${nameA} vs ${nameB}\n\nScenario: ${scenario.name}\n\`${JSON.stringify({ field: scenario.field, sideA: scenario.sideA, sideB: scenario.sideB, intimidate: scenario.intimidate, tera: scenario.tera })}\` (side A = ${nameA}, side B = ${nameB})\n\nDamage is % of the defender's max HP (min-max over the 16 rolls). Status moves are skipped. Generated ${info.generated}.\n`;
if (assumptions.length) md += `\n**ASSUMED spreads (not from the source team)**\n${assumptions.map(a => `- ${a.pokemon} [ASSUMED]: ${a.spread} (filled: ${a.filled.join(', ')}; basis: ${a.basis}${a.url ? `, ${a.url}, fetched ${a.fetched}, ${a.usagePct}% usage` : ''})`).join('\n')}\n`;
if (warnings.length) md += `\n**Warnings**\n${warnings.map(w => `- ${w}`).join('\n')}\n`;
for (const m of matchups) {
  md += `\n## ${m.a} vs ${m.b}\n`;
  for (const d of m.directions) {
    md += `\n**${d.attacker} -> ${d.defender}**\n\n| Move | Type | BP | Prio | Damage (HP) | Damage (%) | KO chance |\n|---|---|---|---|---|---|---|\n`;
    for (const r of d.rows) {
      if (r.status) continue;
      md += `| ${r.move} | ${r.type} | ${r.bp} | ${r.priority} | ${r.minDamage}-${r.maxDamage} | ${r.minPct}-${r.maxPct}% | ${r.ko} |\n`;
    }
  }
}
fs.writeFileSync(path.join(outDir, 'damage.md'), md);

md = `# Speed: ${nameA} (A) vs ${nameB} (B)\n\nGenerated ${info.generated}. Final speeds include items, abilities, weather and Tailwind as the calc handles them. Priority is ignored.\n\n| Team | Pokemon | Item | Speed stat | Final (normal) | Final (Tailwind) |\n|---|---|---|---|---|---|\n`;
for (const s of speedMons) md += `| ${s.team} | ${s.pokemon} | ${s.item} | ${s.rawSpeedStat} | ${s.speedNormal} | ${s.speedTailwind} |\n`;
for (const st of speedMatrix) {
  md += `\n## ${st.title}\n\nCell = who moves first (speed of ${nameA} mon vs ${nameB} mon).\n\n| ${nameA} \\ ${nameB} | ${teamB.map(tag).join(' | ')} |\n|---|${teamB.map(() => '---').join('|')}|\n`;
  st.cells.forEach((row, i) => { md += `| ${tag(teamA[i])} | ${row.map(c => `${c.first} (${c.speedA} v ${c.speedB})`).join(' | ')} |\n`; });
}
fs.writeFileSync(path.join(outDir, 'speed.md'), md);

console.log(`Done. ${matchups.length} matchups written to ${outDir}`);
if (warnings.length) console.log('Warnings:\n- ' + warnings.join('\n- '));
