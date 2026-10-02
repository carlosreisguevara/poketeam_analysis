// Run: node tests/run-phase5-tests.js
// Checks that the report builder refuses untraceable numbers and unlabelled statements, and that every damage
// number in a real REPORT.md also appears in the separately generated damage.md tables.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const BUILD = path.join(__dirname, '..', 'src', 'build-report.js');
let pass = 0, bad = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); } else { bad++; console.log('FAIL  ' + n + '\n      ' + d); } };

function build(template) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
  fs.writeFileSync(path.join(dir, 'REPORT.template.md'), template);
  const r = spawnSync(process.execPath, [BUILD, dir], { encoding: 'utf8' });
  return { code: r.status, err: r.stderr, out: fs.existsSync(path.join(dir, 'REPORT.md')) ? fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8') : null };
}

let r = build('# Title\n\n- **CALC** Words only, no numbers.\n- **JUDGMENT** Also fine, MC408 is allowed.\n');
check('1. A template with labelled statements and no hand-typed numbers builds', r.code === 0 && r.out.includes('Words only'), r.err);

r = build('# Title\n\n- **CALC** Raichu is faster than 100 of them.\n');
check('2. A number typed by hand is rejected', r.code === 1 && /number typed by hand/.test(r.err), r.err);

r = build('# Title\n\n- Raichu is fast.\n');
check('3. A statement without CALC or JUDGMENT is rejected', r.code === 1 && /must start with/.test(r.err), r.err);

r = build('# Title\n\n- **CALC** Unknown: {{dmg:nowhere|my X|Y|opp Z}}\n');
check('4. A token that cannot be traced is rejected', r.code === 1 && /matches 0 folders/.test(r.err), r.err);

r = build('# Title\n\n- **CALC** Bad kind: {{magic:1}}\n');
check('5. An unknown token type is rejected', r.code === 1 && /unknown token type/.test(r.err), r.err);

// Independent cross-check on the real report, if it has been built
const out = path.join(__dirname, '..', 'output', 'my-team');
const srcFile = path.join(out, 'REPORT-sources.md');
if (!fs.existsSync(srcFile)) console.log('SKIP  6. no built report in output/my-team (run npm run report)');
else {
  const rows = fs.readFileSync(srcFile, 'utf8').split('\n').filter(l => /^\| `\{\{(dmg|pct):/.test(l));
  let checked = 0, missing = [];
  for (const row of rows) {
    const tok = row.match(/`\{\{(?:dmg|pct):([^}]*)\}\}`/)[1].replace(/\\\|/g, '|').split('|').map(x => x.trim());
    const folder = fs.readdirSync(out).find(d => d.includes(tok[0].toLowerCase()));
    const range = row.match(/`\s*\|\s*([\d.]+-[\d.]+%)/)[1];
    const md = fs.readFileSync(path.join(out, folder, 'damage.md'), 'utf8');
    const move = tok[2];
    const ok = md.split('\n').some(l => l.startsWith(`| ${move} |`) && l.includes(`| ${range} |`));
    checked++; if (!ok) missing.push(`${tok.join(' | ')} -> ${range}`);
  }
  check(`6. All ${checked} damage numbers in the report appear in the independent damage.md tables`, checked > 0 && missing.length === 0, missing.slice(0, 5).join('\n      '));
}
console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
