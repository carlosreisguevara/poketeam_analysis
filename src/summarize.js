// Phase 4 summary: reads the per-matchup tables written by calc-teams.js and writes
//   output/<team>/THREATS.md and threats.json  (what outspeeds me, what OHKOs/2HKOs me, what I KO)
// No number is computed here: every figure is copied from damage.json / speed.json (which come from @smogon/calc).
// Usage: node src/summarize.js output/<team>
const fs = require('fs');
const path = require('path');

const strip = s => s.replace(/ \[ASSUMED\]$/, '');
const isAssumed = s => / \[ASSUMED\]$/.test(s);

// Turns the calc's KO text into {n, kind}. kind: g = guaranteed, c = chance/possible. null = no KO within 2 hits.
function koClass(row) {
  if (row.status || !row.maxDamage || !row.ko) return null;
  const m = row.ko.match(/(guaranteed|possible|[\d.]+% chance to)\s*(?:to )?(O|\d)HKO/);
  if (!m) return null;
  const n = m[2] === 'O' ? 1 : parseInt(m[2], 10);
  if (n > 2) return null;
  return { n, kind: m[1] === 'guaranteed' ? 'g' : 'c', text: row.ko };
}

function summarize(outRoot) {
  const teamName = path.basename(outRoot);
  const matchDirs = fs.readdirSync(outRoot).filter(d => fs.existsSync(path.join(outRoot, d, 'damage.json')));
  if (!matchDirs.length) throw new Error(`No matchup folders in ${outRoot}. Run: npm run analyze`);
  const result = { team: teamName, generated: new Date().toISOString(), matchups: [] };

  for (const m of matchDirs) {
    const dmg = JSON.parse(fs.readFileSync(path.join(outRoot, m, 'damage.json'), 'utf8'));
    const spd = JSON.parse(fs.readFileSync(path.join(outRoot, m, 'speed.json'), 'utf8'));
    const info = JSON.parse(fs.readFileSync(path.join(outRoot, m, 'run-info.json'), 'utf8'));
    const mine = [...new Set(dmg.map(x => x.a))], theirs = [...new Set(dmg.map(x => x.b))];
    const killsMe = {}, iKill = {};
    mine.forEach(p => (killsMe[p] = [])); theirs.forEach(p => (iKill[p] = []));
    for (const mu of dmg) for (const d of mu.directions) {
      const mineAttacking = d.attackerSide === info.teamA.name;
      for (const r of d.rows) {
        const k = koClass(r); if (!k) continue;
        const entry = { pokemon: mineAttacking ? d.attacker : d.attacker, vs: d.defender, move: r.move, priority: r.priority, minPct: r.minPct, maxPct: r.maxPct, ko: k.text, n: k.n, kind: k.kind };
        (mineAttacking ? iKill[d.defender] : killsMe[d.defender]).push(entry);
      }
    }
    const norm = spd.matrices.find(x => x.id === 'normal'), tr = spd.matrices.find(x => x.id === 'trick_room');
    const speed = mine.map((p, i) => {
      const cells = norm.cells[i]; const faster = [], tie = [], slower = [];
      cells.forEach(c => { const o = c.b; (c.first === info.teamB.name ? faster : c.first === 'TIE' ? tie : slower).push({ pokemon: o, theirSpeed: c.speedB }); });
      return { pokemon: p, mySpeed: cells[0].speedA, outspeedsMe: faster, tiesMe: tie, iOutspeed: slower };
    });
    const cnt = (obj, f) => Object.values(obj).filter(l => l.some(f)).length;
    const scores = {
      myPokemonFacingGuaranteedOhko: cnt(killsMe, e => e.n === 1 && e.kind === 'g'),
      myPokemonFacingAnyOhko: cnt(killsMe, e => e.n === 1),
      myPokemonFacingAny2hkoOrBetter: cnt(killsMe, () => true),
      theirPokemonIGuaranteedOhko: cnt(iKill, e => e.n === 1 && e.kind === 'g'),
      theirPokemonIAnyOhko: cnt(iKill, e => e.n === 1),
      theirPokemonIAny2hkoOrBetter: cnt(iKill, () => true),
      opposingFasterPairs: speed.reduce((a, x) => a + x.outspeedsMe.length, 0),
      pairsTotal: speed.reduce((a, x) => a + x.outspeedsMe.length + x.tiesMe.length + x.iOutspeed.length, 0),
      opposingPokemon: theirs.length,
    };
    result.matchups.push({ name: m, scores, source: info.sources.B, assumedPokemon: theirs.filter(isAssumed), myAssumed: mine.filter(isAssumed), killsMe, iKill, speed, notes: info.notes });
  }
  fs.writeFileSync(path.join(outRoot, 'threats.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(outRoot, 'THREATS.md'), render(result));
  return result;
}

const cell = (list) => list.length ? list.map(e => `${e.pokemon === undefined ? '' : e.pokemon + ' '}${e.move}${e.priority > 0 ? ` (+${e.priority})` : ''}`).join('; ') : '-';

function bucket(entries, n, kind) { return entries.filter(e => e.n === n && e.kind === kind); }

function render(r) {
  let md = `# Key threats: ${r.team}\n\nGenerated ${r.generated}. Every figure comes from the damage and speed tables in each matchup folder (CALC). Neutral doubles field, everything at full HP, no boosts; see each matchup's run-info.json for limits. \`?\` after a KO means it only KOs on some damage rolls ("chance" or "possible"). Moves with priority show (+N); speed order does not apply to them. **[ASSUMED]** marks spreads that were not in the source team.\n\n`;

  // ---- overall: opposing Pokemon that threaten my team across all matchups
  const opp = {};
  for (const m of r.matchups) for (const [mon, list] of Object.entries(m.killsMe)) for (const e of list) {
    const key = strip(e.pokemon);
    const o = (opp[key] ||= { teams: new Set(), hits: {} });
    o.teams.add(m.name);
    const h = (o.hits[strip(mon)] ||= { n: 99, kind: 'c', moves: new Set() });
    if (e.n < h.n || (e.n === h.n && e.kind === 'g' && h.kind === 'c')) { h.n = e.n; h.kind = e.kind; }
    h.moves.add(e.move);
  }
  md += `## Overall: opposing Pokemon that KO mine (across ${r.matchups.length} opposing teams)\n\nOnly Pokemon that can OHKO or 2HKO at least one of mine are listed. "Teams" = how many of the opposing teams carry it.\n\n| Opposing Pokemon | Teams | Can OHKO | Can 2HKO |\n|---|---|---|---|\n`;
  const rows = Object.entries(opp).map(([name, o]) => ({ name, teams: o.teams.size, ohko: Object.entries(o.hits).filter(([, h]) => h.n === 1), twohko: Object.entries(o.hits).filter(([, h]) => h.n === 2) }))
    .sort((a, b) => (b.ohko.length - a.ohko.length) || (b.twohko.length - a.twohko.length) || (b.teams - a.teams));
  for (const x of rows) md += `| ${x.name} | ${x.teams} | ${x.ohko.map(([p, h]) => p + (h.kind === 'g' ? '' : '?')).join(', ') || '-'} | ${x.twohko.map(([p, h]) => p + (h.kind === 'g' ? '' : '?')).join(', ') || '-'} |\n`;

  // ---- overall: my Pokemon, speed and what they KO
  const mineNames = [...new Set(r.matchups.flatMap(m => Object.keys(m.killsMe).map(strip)))];
  md += `\n## Overall: each of my Pokemon\n\n| My Pokemon | Speed | Outsped by (opposing Pokemon faster at normal speed, number of teams) | Opposing Pokemon I can OHKO (number of teams) |\n|---|---|---|---|\n`;
  for (const p of mineNames) {
    const fast = {}, ko = {}; let spd = '';
    for (const m of r.matchups) {
      const sp = m.speed.find(s => strip(s.pokemon) === p); if (sp) { spd = sp.mySpeed; sp.outspeedsMe.forEach(o => (fast[strip(o.pokemon)] = (fast[strip(o.pokemon)] || new Set()).add(m.name))); }
      for (const [opo, list] of Object.entries(m.iKill)) if (list.some(e => strip(e.pokemon) === p && e.n === 1 && e.kind === 'g')) (ko[strip(opo)] ||= new Set()).add(m.name);
    }
    const fmt = o => Object.entries(o).sort((a, b) => b[1].size - a[1].size).map(([k, v]) => `${k} (${v.size})`).join(', ') || '-';
    md += `| ${p} | ${spd} | ${fmt(fast)} | ${fmt(ko)} |\n`;
  }

  // ---- per matchup
  for (const m of r.matchups) {
    md += `\n---\n\n## vs ${m.source.name}\n\nSource: ${m.source.source} (fetched ${m.source.fetched}); result: ${m.source.result || 'n/a'}\n`;
    if (m.assumedPokemon.length) md += `\nASSUMED spreads on this team: ${m.assumedPokemon.map(strip).join(', ')}. Details: ${m.name}/damage.md\n`;
    md += `\n### Speed (normal, no Tailwind, no Trick Room)\n\n| My Pokemon | Speed | Outsped by | Tie | I outspeed |\n|---|---|---|---|---|\n`;
    for (const s of m.speed) md += `| ${s.pokemon} | ${s.mySpeed} | ${s.outspeedsMe.map(o => `${o.pokemon} ${o.theirSpeed}`).join(', ') || '-'} | ${s.tiesMe.map(o => `${o.pokemon} ${o.theirSpeed}`).join(', ') || '-'} | ${s.iOutspeed.length} of ${s.outspeedsMe.length + s.tiesMe.length + s.iOutspeed.length} |\n`;
    md += `\n### What can KO me (opposing Pokemon, move)\n\n| My Pokemon | Guaranteed OHKO | OHKO? | Guaranteed 2HKO | 2HKO? |\n|---|---|---|---|---|\n`;
    for (const [mon, list] of Object.entries(m.killsMe)) md += `| ${mon} | ${cell(bucket(list, 1, 'g'))} | ${cell(bucket(list, 1, 'c'))} | ${cell(bucket(list, 2, 'g'))} | ${cell(bucket(list, 2, 'c'))} |\n`;
    md += `\n### What I can KO (my Pokemon, move)\n\n| Opposing Pokemon | Guaranteed OHKO | OHKO? | Guaranteed 2HKO | 2HKO? |\n|---|---|---|---|---|\n`;
    for (const [mon, list] of Object.entries(m.iKill)) md += `| ${mon} | ${cell(bucket(list, 1, 'g'))} | ${cell(bucket(list, 1, 'c'))} | ${cell(bucket(list, 2, 'g'))} | ${cell(bucket(list, 2, 'c'))} |\n`;
  }
  return md;
}

module.exports = { summarize };
if (require.main === module) {
  const dirArg = process.argv[2];
  if (!dirArg) { console.error('Usage: node src/summarize.js output/<team>'); process.exit(1); }
  const r = summarize(dirArg);
  console.log(`Wrote ${path.join(dirArg, 'THREATS.md')} (${r.matchups.length} matchups)`);
}
