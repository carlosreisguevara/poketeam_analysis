// Phase 5: turns a report template into the final report. Numbers are never typed by hand: they are tokens that
// this script fills from the files in output/<team>/ and records in REPORT-sources.md. An unresolvable token,
// a number typed by hand, or a statement without a CALC/JUDGMENT label stops the build.
// Usage: node src/build-report.js [output/<team>]      (template: output/<team>/REPORT.template.md)
//
// Tokens (each resolves from a file in output/<team>/):
//   {{dmg:mc408|my Sneasler|Close Combat|opp Kingambit}}  -> "85-101% (6.3% chance to OHKO)"   damage.json
//   {{pct:...same...}}   range only: "85-101%"          {{ko:...same...}}  KO text only
//   {{spe:mc408|opp Politoed}}                           -> final speed                          speed.json
//   {{spd:mc408|my Sneasler|opp Kingambit}}              -> "189 vs 70"                           speed.json
//   {{stat:mc408|my Sneasler|hp}}                        -> final stat (hp atk def spa spd spe)  stats.json
//   {{tr:defensive.Ground.weakCount}}                    -> value from team-review.json
//   {{th:matchups.0.scores.opposingFasterPairs}}         -> value from threats.json
const fs = require('fs');
const path = require('path');

const outDir = process.argv[2] || path.join('output', 'my-team');
const tplFile = path.join(outDir, 'REPORT.template.md');
if (!fs.existsSync(tplFile)) { console.error(`STOPPED: ${tplFile} not found.`); process.exit(1); }
const read = f => JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'));
const strip = s => String(s).replace(/ \[ASSUMED\]$/, '');
const lc = s => strip(s).toLowerCase();
const cache = {};
const load = f => (cache[f] ||= read(f));
const folders = fs.readdirSync(outDir).filter(d => fs.existsSync(path.join(outDir, d, 'damage.json')));
const folderFor = id => { const f = folders.filter(d => d.includes(id.toLowerCase())); if (f.length !== 1) throw new Error(`matchup id "${id}" matches ${f.length} folders`); return f[0]; };
const side = s => { const m = String(s).trim().match(/^(my|opp)\s+(.+)$/i); if (!m) throw new Error(`"${s}" must start with "my " or "opp "`); return { who: m[1].toLowerCase(), name: m[2].trim() }; };

const sources = new Map();
const note = (token, value, src) => { if (!sources.has(token)) sources.set(token, { value, src }); return value; };

function dmgRow(folder, a, move, d) {
  const dmg = load(`${folder}/damage.json`), info = load(`${folder}/run-info.json`);
  const A = side(a), D = side(d);
  if (A.who === D.who) throw new Error('attacker and defender must be on opposite sides');
  const wantSide = A.who === 'my' ? info.teamA.name : info.teamB.name;
  for (const mu of dmg) for (const dir of mu.directions) {
    if (dir.attackerSide !== wantSide || lc(dir.attacker) !== lc(A.name) || lc(dir.defender) !== lc(D.name)) continue;
    const row = dir.rows.find(r => r.move.toLowerCase() === move.toLowerCase());
    if (row) return { row, src: `${folder}/damage.json: ${A.who} ${strip(dir.attacker)} -> ${strip(dir.defender)}, ${row.move}` };
  }
  throw new Error(`no damage row for ${a} | ${move} | ${d} in ${folder}`);
}

function resolve(kind, args) {
  if (kind === 'dmg' || kind === 'pct' || kind === 'ko') {
    const [id, a, move, d] = args; const folder = folderFor(id); const { row, src } = dmgRow(folder, a, move, d);
    if (row.status) throw new Error(`${move} is a status move`);
    const pct = `${row.minPct}-${row.maxPct}%`;
    const v = kind === 'pct' ? pct : kind === 'ko' ? (row.ko || 'no KO within the listed hits') : (row.ko ? `${pct} (${row.ko})` : pct);
    return { value: v, src };
  }
  if (kind === 'spe' || kind === 'spd') {
    const folder = folderFor(args[0]); const spd = load(`${folder}/speed.json`);
    if (kind === 'spe') {
      const s = side(args[1]); const mon = spd.pokemon.find(p => lc(p.pokemon) === lc(s.name) && (s.who === 'my') === (p.team === load(`${folder}/run-info.json`).teamA.name));
      if (!mon) throw new Error(`no speed for ${args[1]} in ${folder}`);
      return { value: String(mon.speedNormal), src: `${folder}/speed.json: ${s.who} ${strip(mon.pokemon)} normal speed` };
    }
    const A = side(args[1]), D = side(args[2]); const mine = A.who === 'my' ? A : D, opp = A.who === 'my' ? D : A;
    const norm = spd.matrices.find(m => m.id === 'normal');
    for (const row of norm.cells) for (const c of row) if (lc(c.a) === lc(mine.name) && lc(c.b) === lc(opp.name)) {
      const v = A.who === 'my' ? `${c.speedA} vs ${c.speedB}` : `${c.speedB} vs ${c.speedA}`;
      return { value: v, src: `${folder}/speed.json: normal matrix, my ${strip(c.a)} vs opp ${strip(c.b)}` };
    }
    throw new Error(`no speed pair ${args[1]} / ${args[2]} in ${folder}`);
  }
  if (kind === 'stat') {
    const folder = folderFor(args[0]); const s = side(args[1]); const st = load(`${folder}/stats.json`); const info = load(`${folder}/run-info.json`);
    const row = st.find(r => lc(r.pokemon) === lc(s.name) && (s.who === 'my') === (r.team === info.teamA.name));
    if (!row || !(args[2] in row.final)) throw new Error(`no stat ${args[2]} for ${args[1]} in ${folder}`);
    return { value: String(row.final[args[2]]), src: `${folder}/stats.json: ${s.who} ${strip(row.pokemon)} ${args[2]}` };
  }
  if (kind === 'tr') {
    let v = load('team-review.json'); for (const k of args[0].split('.')) { if (v === undefined || v === null) break; v = v[k]; }
    if (v === undefined || v === null) throw new Error(`team-review.json has no ${args[0]}`);
    return { value: Array.isArray(v) ? (v.join(', ') || 'none') : String(v), src: `team-review.json: ${args[0]}` };
  }
  if (kind === 'th') {
    let v = load('threats.json'); for (const k of args[0].split('.')) { if (v === undefined || v === null) break; v = v[k]; }
    if (v === undefined || v === null) throw new Error(`threats.json has no ${args[0]}`);
    return { value: Array.isArray(v) ? (v.map(strip).join(', ') || 'none') : String(v), src: `threats.json: ${args[0]}` };
  }
  throw new Error(`unknown token type "${kind}"`);
}

// ---- lint and render
const tpl = fs.readFileSync(tplFile, 'utf8').replace(/\r/g, '');
const errors = [];
const out = tpl.split('\n').map((line, i) => {
  const n = i + 1;
  const t = line.trim();
  const noTokens = t.replace(/\{\{[^}]*\}\}/g, '');
  const isHeading = /^#{1,6}\s/.test(t), isTable = t.startsWith('|'), isBlank = t === '' || t.startsWith('<!--') || /^-{3,}$/.test(t);
  if (!isHeading && !isBlank && !isTable) {
    const body = t.replace(/^([-*]|\d+\.)\s+/, '');
    if (!/^\*\*(CALC|JUDGMENT)\*\*/.test(body)) errors.push(`line ${n}: statement must start with **CALC** or **JUDGMENT**: "${t.slice(0, 70)}"`);
  }
  if (!isBlank && /\d/.test(noTokens.replace(/\bMC\d+\b/g, '').replace(/^\s*\d+\.\s/, '').replace(/^#.*$/, ''))) errors.push(`line ${n}: number typed by hand (use a token): "${t.slice(0, 80)}"`);
  return line.replace(/\{\{([a-z]+):([^}]*)\}\}/g, (tok, kind, rest) => {
    try { const r = resolve(kind, rest.split('|').map(x => x.trim())); return note(tok, r.value, r.src); }
    catch (e) { errors.push(`line ${n}: ${tok} -> ${e.message}`); return '???'; }
  });
});
if (errors.length) { console.error(`STOPPED: ${errors.length} problem(s) in ${tplFile}:\n- ` + errors.join('\n- ')); process.exit(1); }

const gen = new Date().toISOString();
fs.writeFileSync(path.join(outDir, 'REPORT.md'), out.join('\n') + `\n\n---\n\nGenerated ${gen}. Every number above was filled in by code; where each one comes from is listed in REPORT-sources.md.\n`);
let s = `# Where each number in REPORT.md comes from\n\nGenerated ${gen}. Each row is one token in the template.\n\n| Token | Value | Source file and row |\n|---|---|---|\n`;
for (const [tok, v] of sources) s += `| \`${tok.replace(/\|/g, '\\|')}\` | ${v.value} | ${v.src} |\n`;
fs.writeFileSync(path.join(outDir, 'REPORT-sources.md'), s);
console.log(`Wrote ${path.join(outDir, 'REPORT.md')} (${sources.size} distinct numbers traced, see REPORT-sources.md)`);
