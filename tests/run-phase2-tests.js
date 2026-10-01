// Run: node tests/run-phase2-tests.js   (uses SYNTHETIC fixtures in tests/fixtures; no real data)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseTeam } = require('../src/parse');
const { applyAssumptions } = require('../src/assume');
const { loadMetaTeam } = require('../src/meta');
const FIX = path.join(__dirname, 'fixtures');
const USAGE = path.join(FIX, 'usage');
const NONE = path.join(FIX, 'nonexistent');
let pass = 0, bad = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); } else { bad++; console.log('FAIL  ' + n + '\n      ' + d); } };
const throws = (n, f, mustContain) => {
  let m = null; try { f(); } catch (e) { m = e.message; }
  check(n, m !== null && (!mustContain || m.includes(mustContain)), `message was: ${m}`);
  if (m) console.log('      -> ' + m);
};
const one = txt => parseTeam(txt, { gen: 9, ruleset: 'champions', strict: false })[0];
const RULE = () => ({ status: 'LOCKED' });
const INC = 'Incineroar @ Sitrus Berry\nAbility: Intimidate\n- Fake Out';

{ const s = one('Incineroar @ Sitrus Berry\nAbility: Intimidate\nLevel: 50\nEVs: 32 HP / 32 Def / 2 SpD\nCareful Nature\n- Fake Out');
  applyAssumptions(s, 9, { usageDir: USAGE, rule: RULE() });
  check('1. Complete set is not assumed', !s.assumed && s.nature === 'Careful', JSON.stringify(s.assumption)); }

{ const s = one('Garchomp @ Life Orb\nAbility: Rough Skin\n- Earthquake');
  applyAssumptions(s, 9, { usageDir: USAGE, rule: RULE() });
  check('2. Missing spread filled from most common usage spread, flagged ASSUMED with source and date',
    s.assumed && s.nature === 'Jolly' && s.evs.spe === 32 && s.assumption.url.includes('synthetic') && s.assumption.fetched === '2000-01-01' && s.assumption.usagePct === 40, JSON.stringify(s)); }

{ const s = one('Garchomp @ Life Orb\nAbility: Rough Skin\nEVs: 2 HP / 32 Atk / 32 Spe\n- Earthquake');
  applyAssumptions(s, 9, { usageDir: USAGE, rule: RULE() });
  check('3a. Partial set: only the nature is filled (best usage spread matching the given points)', s.nature === 'Jolly' && s.assumption.parts.join() === 'nature', JSON.stringify(s.assumption)); }

{ const s = one('Garchomp @ Life Orb\nAbility: Rough Skin\nAdamant Nature\n- Earthquake');
  applyAssumptions(s, 9, { usageDir: USAGE, rule: RULE() });
  check('3b. Partial set: only the points are filled (best usage spread with the given nature)', s.evs.hp === 32 && s.assumption.usagePct === 25, JSON.stringify(s)); }

throws('4. No usage data -> UNKNOWN and stop (no default spread is ever used)', () => applyAssumptions(one(INC), 9, { usageDir: NONE, rule: RULE() }), 'UNKNOWN');
throws('5. Usage exists but none matches the nature/points already given -> UNKNOWN and stop', () => applyAssumptions(one('Garchomp @ Life Orb\nAbility: Rough Skin\nBold Nature\n- Earthquake'), 9, { usageDir: USAGE, rule: RULE() }), 'UNKNOWN');
throws('6. Usage file with old-style EV numbers is rejected', () => applyAssumptions(one('Sneasler @ Focus Sash\nAbility: Unburden\n- Close Combat'), 9, { usageDir: USAGE, rule: RULE() }), 'EVs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-'));
const base = fs.readFileSync(path.join(FIX, 'SYNTHETIC-meta-team.txt'), 'utf8');
const write = (n, t) => { const f = path.join(tmp, n); fs.writeFileSync(f, t); return f; };
const opts = { usageDir: USAGE, rule: RULE() };
throws('7a. Meta file without Source is rejected', () => loadMetaTeam(write('a.txt', base.replace(/# Source:.*\n/, '')), opts), 'Source');
throws('7b. Meta file with bad date is rejected', () => loadMetaTeam(write('b.txt', base.replace('2000-01-01', 'yesterday')), opts), 'YYYY-MM-DD');
throws('7c. Missing Ability is UNKNOWN, never assumed', () => loadMetaTeam(write('c.txt', base.replace('Ability: Intimidate\n', '')), opts), 'UNKNOWN');
throws('7d. Missing Item is UNKNOWN, never assumed', () => loadMetaTeam(write('d.txt', base.replace(' @ Sitrus Berry\nAbility: Intimidate', '\nAbility: Intimidate')), opts), 'UNKNOWN');
{ const t = loadMetaTeam(path.join(FIX, 'SYNTHETIC-meta-team.txt'), opts);
  const a = t.sets.map(s => `${s.label}:${s.assumed ? 'ASSUMED' : 'given'}`).join(', ');
  check('7e. Valid meta file loads; only incomplete sets are ASSUMED', a === 'Garchomp:ASSUMED, Incineroar:given, Farigiraf:given, Sylveon:ASSUMED', a); }

console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
