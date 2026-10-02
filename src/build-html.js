// Builds output/<team>/REPORT.html: one self-contained page (no internet needed) with an overview, a team page,
// a tab per matchup and a Pokemon search. Numbers come from the output files; judgment comes from REPORT-plans.json.
// Usage: node src/build-html.js [output/<team>] [teams/<team>.txt]
// Stops with a clear message if the plans contain a number typed by hand, an unknown Pokemon, or an untraceable calc.
const fs = require('fs');
const path = require('path');
const { Generations, toID } = require('@smogon/calc');
const { loadTeamFile, loadMetaTeam } = require('./meta');
const E = require('./engine');

const outDir = process.argv[2] || path.join('output', 'my-team');
const teamFile = process.argv[3] || path.join('teams', path.basename(outDir) + '.txt');
const gen = Generations.get(9);
const read = f => JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
const strip = s => String(s).replace(/ \[ASSUMED\]$/, '');
const lc = s => strip(s).toLowerCase();
const errors = [];
const fail = m => errors.push(m);

for (const f of ['threats.json', 'team-review.json', 'REPORT-plans.json']) if (!fs.existsSync(path.join(outDir, f))) { console.error(`STOPPED: ${path.join(outDir, f)} not found. Run: npm run analyze && npm run review`); process.exit(1); }
const threats = read('threats.json'), review = read('team-review.json'), plans = read('REPORT-plans.json');

// ---- KO classes (same wording rules as summarize.js)
function koClass(row) {
  if (row.status || !row.maxDamage || !row.ko) return null;
  const m = row.ko.match(/(guaranteed|possible|[\d.]+% chance to)\s*(?:to )?(O|\d)HKO/);
  if (!m) return null;
  const n = m[2] === 'O' ? 1 : parseInt(m[2], 10);
  return n > 2 ? null : (n === 1 ? 'ohko' : 'two') + (m[1] === 'guaranteed' ? '-g' : '-c');
}
const RANK = { 'ohko-g': 4, 'ohko-c': 3, 'two-g': 2, 'two-c': 1, none: 0 };

function card(set, extra = {}) {
  const sp = gen.species.get(toID(set.species));
  const stats = E.finalStats(gen, set, 'champions');
  return {
    name: set.species, types: sp.types, item: set.item || '', ability: set.ability || '', nature: set.nature || '',
    points: set.evs, stats, speed: stats.spe,
    moves: set.moves.map(m => { const mv = gen.moves.get(toID(m)); return { name: mv.name, type: mv.type, cat: mv.category }; }),
    assumed: !!set.assumed, assumption: set.assumed ? { parts: set.assumption.parts, source: set.assumption.source, how: set.assumption.how, url: set.assumption.url, pct: set.assumption.usagePct, older: !!set.assumption.olderRegulation } : null, ...extra,
  };
}

const mine = loadTeamFile(teamFile).sets.map(s => card(s));
const myNames = mine.map(m => m.name);
const matchups = [];
const folders = fs.readdirSync(outDir).filter(d => fs.existsSync(path.join(outDir, d, 'damage.json')));
const metaDir = 'meta';

for (const folder of folders) {
  const id = (folder.match(/mc\d+/i) || [folder])[0].toLowerCase();
  const info = read(`${folder}/run-info.json`), dmg = read(`${folder}/damage.json`), spd = read(`${folder}/speed.json`);
  const metaFile = fs.readdirSync(metaDir).find(f => f.toLowerCase().includes(id) && f.endsWith('.txt'));
  const theirs = loadMetaTeam(path.join(metaDir, metaFile)).sets.map(s => card(s));
  const th = threats.matchups.find(m => m.name === folder);

  // cross tables: they -> me and me -> them. cell = every damaging move, best one first
  const cells = { hitMe: [], iHit: [] };
  for (const key of ['hitMe', 'iHit']) cells[key] = theirs.map(() => myNames.map(() => []));
  for (const mu of dmg) for (const d of mu.directions) {
    const mineAttacking = d.attackerSide === info.teamA.name;
    const ti = theirs.findIndex(t => lc(t.name) === lc(mineAttacking ? d.defender : d.attacker));
    const mi = myNames.findIndex(n => lc(n) === lc(mineAttacking ? d.attacker : d.defender));
    for (const r of d.rows) if (!r.status && r.maxDamage > 0) cells[mineAttacking ? 'iHit' : 'hitMe'][ti][mi].push({ move: r.move, type: r.type, min: r.minPct, max: r.maxPct, ko: r.ko, cls: koClass(r) || 'none', prio: r.priority });
  }
  for (const key of ['hitMe', 'iHit']) for (const row of cells[key]) for (const c of row) c.sort((a, b) => (RANK[b.cls] - RANK[a.cls]) || (b.max - a.max));

  const speedRows = spd.pokemon.map(p => ({ name: strip(p.pokemon), side: p.team === info.teamA.name ? 'me' : 'them', assumed: / \[ASSUMED\]$/.test(p.pokemon), normal: p.speedNormal, tailwind: p.speedTailwind }));
  const meta = info.sources.B;

  // ---- plans: lint and resolve calcs
  const pl = (plans.matchups || {})[id];
  if (!pl) fail(`REPORT-plans.json has no entry for ${id}`);
  const resolved = pl ? { likelyFour: pl.likelyFour, confidence: pl.confidence, reasoning: pl.reasoning, plans: pl.plans.map(p => ({ ...p, calcs: p.calcs.map(c => resolveCalc(id, c, dmg, info, theirs, speedRows)) })) } : null;
  if (pl) {
    for (const n of pl.likelyFour) if (!theirs.some(t => lc(t.name) === lc(n))) fail(`${id}: likelyFour "${n}" is not on that team`);
    if (pl.likelyFour.length !== 4) fail(`${id}: likelyFour must list exactly four`);
    for (const p of pl.plans) {
      const all = [...p.lead, ...p.back];
      if (p.lead.length !== 2 || p.back.length !== 2 || new Set(all).size !== 4) fail(`${id} / ${p.name}: choose four different Pokemon (two lead, two back)`);
      for (const n of all) if (!myNames.includes(n)) fail(`${id} / ${p.name}: "${n}" is not on my team`);
    }
    const text = [pl.reasoning, pl.confidence, ...pl.plans.flatMap(p => [p.name, p.why, ...p.avoid])].join(' ');
    if (/\d/.test(text)) fail(`${id}: a number is typed by hand in the plans text: "${(text.match(/.{0,25}\d.{0,15}/) || [''])[0]}"`);
  }

  matchups.push({
    id, folder, title: meta.name, source: meta.source, result: meta.result || '', fetched: meta.fetched, theirs, speed: speedRows, scores: th.scores,
    assumedCount: theirs.filter(t => t.assumed).length, ...cells, plan: resolved,
  });
}

function resolveCalc(id, c, dmg, info, theirs, speedRows) {
  const side = s => { const m = String(s).match(/^(my|opp)\s+(.+)$/); if (!m) { fail(`${id}: "${s}" must start with my or opp`); return { who: 'my', name: String(s) }; } return { who: m[1], name: m[2] }; };
  const A = side(c.a), D = side(c.d);
  if (c.type === 'spd') {
    const a = speedRows.find(r => r.side === (A.who === 'my' ? 'me' : 'them') && lc(r.name) === lc(A.name)), d = speedRows.find(r => r.side === (D.who === 'my' ? 'me' : 'them') && lc(r.name) === lc(D.name));
    if (!a || !d) { fail(`${id}: speed pair not found: ${c.a} / ${c.d}`); return { label: '?', value: '?' }; }
    return { kind: 'speed', label: `${strip(a.name)} vs ${strip(d.name)} speed`, value: `${a.normal} vs ${d.normal}`, ko: a.normal === d.normal ? 'tie' : (a.normal > d.normal) === (A.who === 'my') ? 'I move first' : 'they move first', cls: 'speed' };
  }
  const wantSide = A.who === 'my' ? info.teamA.name : info.teamB.name;
  for (const mu of dmg) for (const d of mu.directions) {
    if (d.attackerSide !== wantSide || lc(d.attacker) !== lc(A.name) || lc(d.defender) !== lc(D.name)) continue;
    const row = d.rows.find(r => r.move.toLowerCase() === c.move.toLowerCase());
    if (row) return { kind: 'dmg', label: `${strip(d.attacker)} ${row.move} → ${strip(d.defender)}`, value: `${row.minPct}-${row.maxPct}%`, ko: row.ko || '', cls: koClass(row) || 'none', mine: A.who === 'my' };
  }
  fail(`${id}: no damage row for ${c.a} | ${c.move} | ${c.d}`);
  return { label: '?', value: '?' };
}

// ---- team page and overview
const worst = plans.overall.worst;
for (const m of matchups) if (!worst.includes(m.id)) fail(`overall.worst is missing ${m.id}`);
const textAll = JSON.stringify([plans.team, plans.overall]);
if (/\d/.test(textAll.replace(/\bMC\d+\b/gi, '').replace(/mc\d+/g, ''))) fail('a number is typed by hand in the team or overall text of REPORT-plans.json');
if (errors.length) { console.error(`STOPPED: ${errors.length} problem(s):\n- ` + errors.join('\n- ')); process.exit(1); }

// ---- Pokemon index across all matchups
const index = {};
for (const m of matchups) m.theirs.forEach((t, ti) => {
  const e = (index[t.name] ||= { name: t.name, types: t.types, teams: [], threatens: {}, beatenBy: {} });
  e.teams.push({ id: m.id, assumed: t.assumed });
  myNames.forEach((n, mi) => {
    const h = m.hitMe[ti][mi][0], i = m.iHit[ti][mi][0];
    if (h && RANK[h.cls] > (RANK[(e.threatens[n] || {}).cls] || 0)) e.threatens[n] = { cls: h.cls, move: h.move, id: m.id };
    if (i && RANK[i.cls] > (RANK[(e.beatenBy[n] || {}).cls] || 0)) e.beatenBy[n] = { cls: i.cls, move: i.move, id: m.id };
  });
});

const DATA = {
  team: path.basename(outDir), generated: new Date().toISOString(), mine, myNames, matchups, plansTeam: plans.team, overall: plans.overall,
  defensive: review.defensive, offensive: review.offensive, teamSpeed: review.speed, index: Object.values(index).sort((a, b) => a.name.localeCompare(b.name)),
  limits: ['Neutral field, full HP, no boosts, both foes present for spread moves.', 'Not applied: Intimidate, sand or other weather from abilities, terrain, screens, Focus Sash and other item effects.', 'Speed order ignores move priority.', 'Opponent spreads marked ASSUMED are the most common spread, not what the player used.'],
};
const tpl = fs.readFileSync(path.join(__dirname, 'report-ui.html'), 'utf8');
const html = tpl.replace('/*__DATA__*/', () => 'const DATA = ' + JSON.stringify(DATA).replace(/</g, '\\u003c') + ';');
fs.writeFileSync(path.join(outDir, 'REPORT.html'), html);
console.log(`Wrote ${path.join(outDir, 'REPORT.html')} (${matchups.length} matchups, ${DATA.index.length} opposing Pokemon, ${(html.length / 1024).toFixed(0)} KB)`);
