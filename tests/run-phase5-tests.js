// Run: node tests/run-phase5-tests.js   (needs output/my-team from npm run analyze && npm run review)
// Checks that the report builder refuses untraceable content, and that numbers in the finished page match the
// separately generated damage.md tables.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'src', 'build-html.js');
const SRC = path.join(ROOT, 'output', 'my-team');
let pass = 0, bad = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); } else { bad++; console.log('FAIL  ' + n + '\n      ' + d); } };

if (!fs.existsSync(path.join(SRC, 'REPORT-plans.json'))) { console.log('SKIP  no output/my-team/REPORT-plans.json (run the analysis and write the plans first)'); process.exit(0); }

function build(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'html-'));
  fs.cpSync(SRC, dir, { recursive: true });
  const pf = path.join(dir, 'REPORT-plans.json');
  const plans = JSON.parse(fs.readFileSync(pf, 'utf8'));
  if (mutate) mutate(plans);
  fs.writeFileSync(pf, JSON.stringify(plans));
  const r = spawnSync(process.execPath, [BUILD, dir, path.join(ROOT, 'teams', 'my-team.txt')], { encoding: 'utf8', cwd: ROOT });
  return { code: r.status, err: r.stderr + r.stdout, dir };
}

let r = build();
check('1. The unchanged plans build', r.code === 0, r.err);
const html = r.code === 0 ? fs.readFileSync(path.join(r.dir, 'REPORT.html'), 'utf8') : '';
const DATA = html ? JSON.parse(html.match(/const DATA = (.*);\n/)[1].replace(/\\u003c/g, '<')) : null;

r = build(p => { p.matchups.mc408.reasoning += ' It is faster than 100 of them.'; });
check('2. A number typed by hand in the plans is rejected', r.code === 1 && /number is typed by hand/.test(r.err), r.err);

r = build(p => { p.matchups.mc408.plans[0].lead[0] = 'Pikachu'; });
check('3. A Pokemon that is not on my team is rejected', r.code === 1 && /not on my team/.test(r.err), r.err);

r = build(p => { p.matchups.mc408.plans[0].back[0] = p.matchups.mc408.plans[0].lead[0]; });
check('4. A plan that does not name four different Pokemon is rejected', r.code === 1 && /four different/.test(r.err), r.err);

r = build(p => { p.matchups.mc408.plans[0].calcs[0].move = 'Splash'; });
check('5. A calc that cannot be found in the damage tables is rejected', r.code === 1 && /no damage row/.test(r.err), r.err);

r = build(p => { p.matchups.mc408.likelyFour[0] = 'Pikachu'; });
check('6. A likely-four Pokemon that is not on that team is rejected', r.code === 1 && /not on that team/.test(r.err), r.err);

r = build(p => { delete p.matchups.mc403; });
check('7. A matchup without plans is rejected', r.code === 1 && /no entry for mc403/.test(r.err), r.err);

if (DATA) {
  // 8. every damage number inside plans appears in the independent damage.md of that matchup
  let n = 0; const missing = [];
  for (const m of DATA.matchups) {
    const md = fs.readFileSync(path.join(SRC, m.folder, 'damage.md'), 'utf8');
    for (const pl of m.plan.plans) for (const c of pl.calcs) if (c.kind === 'dmg') {
      n++; const move = c.label.split(' → ')[0].split(' ').slice(1).join(' ');
      if (!md.split('\n').some(l => l.includes(`| ${move} |`) && l.includes(`| ${c.value} |`))) missing.push(`${m.id}: ${c.label} ${c.value}`);
    }
  }
  check(`8. All ${n} plan damage numbers appear in the independent damage.md tables`, n > 0 && missing.length === 0, missing.slice(0, 4).join('\n      '));

  // 9. every grid cell (best move) appears in damage.md
  let cells = 0; const miss2 = [];
  for (const m of DATA.matchups) {
    const md = fs.readFileSync(path.join(SRC, m.folder, 'damage.md'), 'utf8');
    for (const key of ['hitMe', 'iHit']) m[key].forEach(row => row.forEach(cs => { const c = cs[0]; if (!c) return; cells++; if (!md.includes(`| ${c.move} |`) || !md.includes(`| ${c.min}-${c.max}% |`)) miss2.push(`${m.id} ${c.move} ${c.min}-${c.max}`); }));
  }
  check(`9. All ${cells} best-move grid cells appear in the independent damage.md tables`, cells > 0 && miss2.length === 0, miss2.slice(0, 4).join('\n      '));

  // 10. scores shown on the overview equal an independent recount from damage.json
  const bad10 = [];
  for (const m of DATA.matchups) {
    const dmg = JSON.parse(fs.readFileSync(path.join(SRC, m.folder, 'damage.json'), 'utf8'));
    const info = JSON.parse(fs.readFileSync(path.join(SRC, m.folder, 'run-info.json'), 'utf8'));
    const mineHit = new Set(), theirsHit = new Set();
    for (const mu of dmg) for (const d of mu.directions) for (const row of d.rows) if (!row.status && /^guaranteed OHKO/.test(row.ko)) { if (d.attackerSide === info.teamA.name) theirsHit.add(d.defender); else mineHit.add(d.defender); }
    if (mineHit.size !== m.scores.myPokemonFacingGuaranteedOhko || theirsHit.size !== m.scores.theirPokemonIGuaranteedOhko) bad10.push(`${m.id}: ${mineHit.size}/${theirsHit.size} vs ${m.scores.myPokemonFacingGuaranteedOhko}/${m.scores.theirPokemonIGuaranteedOhko}`);
  }
  check('10. Overview scores match an independent recount of guaranteed one-hit KOs', bad10.length === 0, bad10.join('\n      '));
}
console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
