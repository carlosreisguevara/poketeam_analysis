// Run: node tests/run-tests.js
// Expected values are copied from the official @smogon/calc test suite (the same engine the Showdown calc site uses):
//   node_modules/@smogon/calc/dist/test/calc.test.js  (line numbers noted per case)
const { Generations } = require('@smogon/calc');
const { parseTeam } = require('../src/parse');
const E = require('../src/engine');

let pass = 0, failN = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS  ${name}`); } else { failN++; console.log(`FAIL  ${name}\n      ${detail}`); }
}
const one = (txt, gen) => parseTeam(txt, { gen, ruleset: 'standard', strict: false })[0];
const parseDesc = d => { const m = d.match(/: (\d+)-(\d+) \(([\d.]+) - ([\d.]+)%\)(?: -- (.*))?$/); return { lo: +m[1], hi: +m[2], p1: +m[3], p2: +m[4], ko: m[5] || '' }; };

// Run one upstream case through OUR engine path (parser -> engine) and compare to the upstream expected description.
function upstreamCase(name, gen, atkTxt, defTxt, move, scenarioObj, expectedDesc, expectedRange) {
  const g = Generations.get(gen);
  const sc = E.loadScenario(scenarioObj);
  const r = E.calcMove(g, one(atkTxt, gen), one(defTxt, gen), move, sc, 'A', 'standard');
  if (expectedDesc) {
    const e = parseDesc(expectedDesc);
    check(name, r.minDamage === e.lo && r.maxDamage === e.hi && r.minPct === e.p1 && r.maxPct === e.p2 && r.ko === e.ko,
      `expected ${e.lo}-${e.hi} (${e.p1} - ${e.p2}%) "${e.ko}" but got ${r.minDamage}-${r.maxDamage} (${r.minPct} - ${r.maxPct}%) "${r.ko}"`);
  } else {
    check(name, r.minDamage === expectedRange[0] && r.maxDamage === expectedRange[1], `expected ${expectedRange} got ${r.minDamage}-${r.maxDamage}`);
  }
}

// 1. Doubles loaded field: Helping Hand, Light Screen, Friend Guard, Grassy Terrain, Hail, Stealth Rock, Spikes, Leech Seed (calc.test.js line 1088)
upstreamCase('1. Loaded doubles field (Helping Hand, Light Screen, Friend Guard, terrain, weather, hazards)', 7,
  'Abomasnow @ Icy Rock\nAbility: Snow Warning\nHasty Nature\nEVs: 252 Atk / 4 SpD / 252 Spe\n- Blizzard',
  'Hoopa-Unbound @ Choice Band\nAbility: Magician\nJolly Nature\nEVs: 32 HP / 224 Atk / 252 Spe\n- Protect',
  'Blizzard',
  { field: { terrain: 'Grassy', weather: 'Hail' },
    sideB: { isSR: true, spikes: 1, isLightScreen: true, isSeeded: true, isFriendGuard: true },
    sideA: { isHelpingHand: true, isTailwind: true } },
  "0 SpA Abomasnow Helping Hand Blizzard vs. 32 HP / 0 SpD Hoopa-Unbound through Light Screen with an ally's Friend Guard: 50-59 (16.1 - 19%) -- guaranteed 3HKO after Stealth Rock, 1 layer of Spikes, hail damage, Leech Seed damage, and Grassy Terrain recovery");

// 2. Spread move (allAdjacentFoes) in doubles (calc.test.js line 902)
upstreamCase('2. Spread reduction, Blizzard in doubles', 3,
  'Gengar\nModest Nature\nEVs: 252 SpA\n- Blizzard',
  'Chansey @ Leftovers\nBold Nature\nEVs: 252 HP / 252 Def\n- Protect',
  'Blizzard', {}, '252+ SpA Gengar Blizzard vs. 252 HP / 0 SpD Chansey: 69-82 (9.8 - 11.6%)');

// 3. Spread move (allAdjacent) in doubles (calc.test.js line 890)
upstreamCase('3. Spread reduction, Explosion in doubles', 3,
  'Gengar\nMild Nature\nEVs: 100 Atk\n- Explosion',
  'Chansey @ Leftovers\nBold Nature\nEVs: 252 HP / 252 Def\n- Protect',
  'Explosion', {},
  '100 Atk Gengar Explosion vs. 252 HP / 252+ Def Chansey: 578-681 (82.1 - 96.7%) -- guaranteed 2HKO after Leftovers recovery');

// 4. Weather Ball changes type with weather, gen 9 (calc.test.js line 171; expected 'modern' values)
const wb = [['Sun', [344, 408]], ['Rain', [86, 102]], ['Sand', [77, 91]], ['Hail', [230, 272]]];
for (const [w, range] of wb) {
  upstreamCase(`4. Weather Ball in ${w} (gen 9)`, 9, 'Castform\n- Weather Ball', 'Bulbasaur\n- Protect', 'Weather Ball', { field: { weather: w } }, null, range);
}

// 5. Fixed-damage move at level 50 (calc.test.js line 59)
upstreamCase('5. Night Shade, level 50 (gen 9)', 9, 'Mew\nLevel: 50\n- Night Shade', 'Vulpix\n- Protect', 'Night Shade', {},
  'Lvl 50 Mew Night Shade vs. 0 HP Vulpix: 50-50 (23 - 23%) -- guaranteed 5HKO');

// 6. Protect blocks damage (calc.test.js line 106)
upstreamCase('6. Protect blocks damage (gen 9)', 9, 'Snorlax\n- Hyper Beam', 'Chansey\n- Protect', 'Hyper Beam', { sideB: { isProtected: true } }, null, [0, 0]);

// ---- Champions stat-point checks (engine rule, verified through calc output) ----
{
  const g = Generations.get(9);
  const base = txt => parseTeam(txt, { gen: 9, ruleset: 'champions' })[0];
  const mk = sp => base(`Sylveon @ Fairy Feather\nAbility: Cute Charm\nLevel: 50\nEVs: ${sp} HP / ${sp} Def\nHardy Nature\n- Protect`);
  const s0 = E.finalStats(g, mk(0), 'champions'), s1 = E.finalStats(g, mk(1), 'champions'), s32 = E.finalStats(g, mk(32), 'champions');
  check('7. Champions: 1 stat point = exactly +1 stat (HP and Def)', s1.hp - s0.hp === 1 && s1.def - s0.def === 1, `HP ${s0.hp}->${s1.hp}, Def ${s0.def}->${s1.def}`);
  check('8. Champions: 32 stat points = exactly +32 stat (HP and Def)', s32.hp - s0.hp === 32 && s32.def - s0.def === 32, `HP ${s0.hp}->${s32.hp}, Def ${s0.def}->${s32.def}`);
}

// ---- Parser must fail loudly ----
function mustThrow(name, txt, ruleset = 'champions') {
  let msg = null; try { parseTeam(txt, { gen: 9, ruleset }); } catch (e) { msg = e.message; }
  check(name, msg !== null, 'did not throw'); if (msg) console.log(`      -> ${msg}`);
}
const ok = 'Sylveon @ Fairy Feather\nAbility: Cute Charm\nLevel: 50\nModest Nature\n';
mustThrow('9. Rejects more than 32 points in one stat', ok.replace('Modest', 'EVs: 33 HP\nModest') + '- Protect');
mustThrow('10. Rejects more than 66 stat points total', ok.replace('Modest', 'EVs: 32 HP / 32 Def / 3 SpA\nModest') + '- Protect');
mustThrow('11. Rejects IVs in Champions', ok.replace('Modest', 'IVs: 0 Atk\nModest') + '- Protect');
mustThrow('12. Rejects missing Nature', 'Sylveon @ Fairy Feather\nAbility: Cute Charm\n- Protect');
mustThrow('13. Rejects unknown move', ok + '- Fakemove');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
