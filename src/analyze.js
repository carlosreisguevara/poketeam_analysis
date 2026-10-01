// One command for any team:  node src/analyze.js [teams/my-team.txt] [--scenario file.json]
// Validates your team, validates every opponent team in /meta, runs the calc engine for each matchup and writes an index.
// Nothing is re-fetched or re-typed: change the team file, run this again.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadTeamFile, loadMetaTeam } = require('./meta');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const si = args.indexOf('--scenario');
const scenario = si > -1 ? args[si + 1] : null;
const teamFile = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--scenario') || path.join('teams', 'my-team.txt');

function die(msg) { console.error('\nSTOPPED: ' + msg); process.exit(1); }
if (!fs.existsSync(path.join(root, 'node_modules', '@smogon', 'calc'))) die('Calculator not installed. Run: npm run setup');
if (!fs.existsSync(teamFile)) die(`Team file not found: ${teamFile}. Put your team (Showdown export format) in /teams.`);

let mine;
try { mine = loadTeamFile(teamFile); } catch (e) { die(`Your team file has a problem:\n  ${e.message}`); }
const teamName = mine.meta.name;
console.log(`Team "${teamName}": ${mine.sets.map(s => s.label).join(', ')}`);
mine.sets.flatMap(s => s.warnings || []).forEach(w => console.log('  warning: ' + w));

const metaDir = path.join(root, 'meta');
const metaFiles = fs.existsSync(metaDir) ? fs.readdirSync(metaDir).filter(f => f.endsWith('.txt') && !f.startsWith('_')) : [];
if (!metaFiles.length) die('No opponent teams in /meta yet. They come from public sources (Phase 3: usage data and common teams). Nothing was invented.');

const outRoot = path.join('output', teamName);
fs.mkdirSync(outRoot, { recursive: true });
const ok = [], failed = [];
for (const f of metaFiles) {
  const file = path.join('meta', f);
  const name = path.basename(f, '.txt');
  try {
    loadMetaTeam(file); // fails loudly on UNKNOWN items, abilities, spreads or missing source/date
    const cmd = [path.join(__dirname, 'calc-teams.js'), teamFile, file, '--out', path.join(outRoot, name)];
    if (scenario) cmd.push('--scenario', scenario);
    execFileSync(process.execPath, cmd, { stdio: 'pipe' });
    ok.push(name); console.log(`  OK    ${name}`);
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message).trim().split('\n').filter(Boolean).slice(-1)[0];
    failed.push({ name, msg }); console.log(`  FAIL  ${name}: ${msg}`);
  }
}

let md = `# Analysis index: ${teamName}\n\nGenerated ${new Date().toISOString()}${scenario ? `, scenario ${scenario}` : ''}\n\n## Matchups calculated (${ok.length})\n\n`;
md += ok.map(n => `- ${n}: [damage](${n}/damage.md), [speed](${n}/speed.md), [stats](${n}/stats.md)`).join('\n') + '\n';
if (failed.length) md += `\n## Opponent teams that could NOT be calculated (${failed.length})\n\n` + failed.map(x => `- ${x.name}: ${x.msg}`).join('\n') + '\n';
md += '\n## Not built yet\n\n- Key-threat summary across all matchups (Phase 4)\n- Written report with gameplans (Phase 5)\n';
fs.writeFileSync(path.join(outRoot, 'INDEX.md'), md);
console.log(`\nDone: ${ok.length} calculated, ${failed.length} failed. Index: ${path.join(outRoot, 'INDEX.md')}`);
process.exit(failed.length ? 2 : 0);
