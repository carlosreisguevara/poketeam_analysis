// Run: node tests/run-phase4-tests.js  (needs output/<team> from `npm run analyze`; it re-counts KOs independently from damage.json)
const fs = require('fs');
const path = require('path');
const { summarize } = require('../src/summarize');
let pass = 0, bad = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); } else { bad++; console.log('FAIL  ' + n + '\n      ' + d); } };

// 1. KO text classification, using the texts the calc really produces
const koTexts = { 'guaranteed OHKO': [1, 'g'], '6.3% chance to OHKO': [1, 'c'], 'guaranteed 2HKO': [2, 'g'], '93.8% chance to 2HKO after hail damage': [2, 'c'], 'possible 2HKO': [2, 'c'], 'guaranteed 3HKO': null, 'possible 9HKO': null, 'no damage': null, '': null };
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'summarize.js'), 'utf8');
const koClass = new Function('row', src.match(/function koClass[\s\S]*?\n}\n/)[0] + '; return koClass(row);');
for (const [t, exp] of Object.entries(koTexts)) {
  const k = koClass({ status: false, maxDamage: t ? 10 : 0, ko: t });
  check(`1. KO text "${t}" -> ${exp ? exp.join('') : 'none'}`, exp ? k && k.n === exp[0] && k.kind === exp[1] : k === null, JSON.stringify(k));
}

// 2. Independent recount against the raw tables
const root = process.argv[2] || path.join(__dirname, '..', 'output', 'my-team');
if (!fs.existsSync(root)) { console.log('SKIP  2. no output folder; run npm run analyze first'); }
else {
  const r = summarize(root);
  for (const m of r.matchups) {
    const dmg = JSON.parse(fs.readFileSync(path.join(root, m.name, 'damage.json'), 'utf8'));
    const info = JSON.parse(fs.readFileSync(path.join(root, m.name, 'run-info.json'), 'utf8'));
    let rawKillsMe = 0, rawIKill = 0;
    for (const mu of dmg) for (const d of mu.directions) for (const row of d.rows) {
      if (row.status || !/^guaranteed OHKO/.test(row.ko)) continue;
      if (d.attackerSide === info.teamA.name) rawIKill++; else rawKillsMe++;
    }
    const sum = o => Object.values(o).flat().filter(e => e.n === 1 && e.kind === 'g').length;
    check(`2. ${m.name}: guaranteed-OHKO counts match raw tables (against me ${rawKillsMe}, by me ${rawIKill})`, sum(m.killsMe) === rawKillsMe && sum(m.iKill) === rawIKill, `summary ${sum(m.killsMe)}/${sum(m.iKill)}`);
    const sp = JSON.parse(fs.readFileSync(path.join(root, m.name, 'speed.json'), 'utf8')).matrices.find(x => x.id === 'normal');
    const rawFaster = sp.cells.flat().filter(c => c.first === info.teamB.name).length;
    check(`2. ${m.name}: outspeed counts match raw speed table (${rawFaster})`, m.speed.reduce((a, s) => a + s.outspeedsMe.length, 0) === rawFaster, '');
  }
  check('3. Opponents are shown by species (no nicknames)', !r.matchups.some(m => Object.keys(m.iKill).some(n => /^(Aang|Appa|Nico robin|Ryuji|Parlayprince|Flower man)/.test(n))), 'nickname found');
}
console.log(`\n${pass} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
