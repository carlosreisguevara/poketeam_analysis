// Calc engine. Every number comes from @smogon/calc.
const calc = require('@smogon/calc');
const { getFinalSpeed } = require('@smogon/calc/dist/mechanics/util');

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Abilities that may change what Intimidate does. List is a manual-check reminder, NOT calculated.
const INTIMIDATE_CHECK = ['Clear Body', 'White Smoke', 'Full Metal Body', 'Hyper Cutter', 'Inner Focus',
  'Oblivious', 'Own Tempo', 'Scrappy', 'Guard Dog', 'Mirror Armor', 'Defiant', 'Competitive', 'Contrary', 'Simple'];

const DEFAULT_SCENARIO = {
  name: 'default (neutral doubles field)',
  field: {},          // e.g. {"weather":"Sun","terrain":"Electric","isGravity":true}
  sideA: {},          // e.g. {"isTailwind":true,"isReflect":true,"isHelpingHand":true}
  sideB: {},
  intimidate: { A: false, B: false }, // true = that side's Pokemon each took an Intimidate (-1 Atk)
  tera: { A: [], B: [] },             // labels of Pokemon that are Terastallized (need a Tera Type in the set)
};

function loadScenario(obj) {
  const s = JSON.parse(JSON.stringify(DEFAULT_SCENARIO));
  if (!obj) return s;
  for (const k of Object.keys(obj)) {
    if (!(k in DEFAULT_SCENARIO)) throw new Error(`Unknown scenario key "${k}".`);
    s[k] = (typeof DEFAULT_SCENARIO[k] === 'object' && !Array.isArray(DEFAULT_SCENARIO[k]))
      ? { ...DEFAULT_SCENARIO[k], ...obj[k] } : obj[k];
  }
  return s;
}

// Champions: 1 stat point = +1 final stat at level 50, IVs fixed at 31.
// calc computes floor((2*base + IV + floor(EV/4)) * level / 100); EV = 8 * stat points gives exactly +1 per point.
function toCalcSpreads(set, ruleset) {
  if (ruleset === 'champions') {
    const evs = {}; const ivs = {};
    for (const st of STATS) { evs[st] = (set.evs[st] || 0) * 8; ivs[st] = 31; }
    return { evs, ivs };
  }
  return { evs: set.evs, ivs: set.ivs };
}

function makePokemon(gen, set, ruleset, { tera = false, intimidated = false } = {}) {
  const { evs, ivs } = toCalcSpreads(set, ruleset);
  const opts = { evs, ivs };
  if (set.level !== undefined) opts.level = set.level;
  if (set.ability) opts.ability = set.ability;
  if (set.item) opts.item = set.item;
  if (set.nature) opts.nature = set.nature;
  if (tera) {
    if (!set.teraType) throw new Error(`${set.label}: Tera requested but the set has no "Tera Type:" line.`);
    opts.teraType = set.teraType;
  }
  if (intimidated) opts.boosts = { atk: -1 };
  return new calc.Pokemon(gen, set.species, opts);
}

function buildField(scenario, attackerSideKey) {
  const atkSide = attackerSideKey === 'A' ? scenario.sideA : scenario.sideB;
  const defSide = attackerSideKey === 'A' ? scenario.sideB : scenario.sideA;
  return new calc.Field({ gameType: 'Doubles', ...scenario.field, attackerSide: { ...atkSide }, defenderSide: { ...defSide } });
}

// Same rounding as the Showdown calc display: floor to one decimal.
const pct = (n, max) => Math.floor((n * 1000) / max) / 10;

// One attacker set using one move against one defender set. attackerSideKey: 'A' or 'B'.
function calcMove(gen, atkSet, defSet, moveName, scenario, attackerSideKey, ruleset) {
  const defKey = attackerSideKey === 'A' ? 'B' : 'A';
  const atk = makePokemon(gen, atkSet, ruleset, {
    tera: scenario.tera[attackerSideKey].includes(atkSet.label),
    intimidated: scenario.intimidate[attackerSideKey],
  });
  const def = makePokemon(gen, defSet, ruleset, {
    tera: scenario.tera[defKey].includes(defSet.label),
    intimidated: scenario.intimidate[defKey],
  });
  const move = new calc.Move(gen, moveName);
  const field = buildField(scenario, attackerSideKey);
  const result = calc.calculate(gen, atk, def, move, field);
  const isStatus = move.category === 'Status';
  const [lo, hi] = result.range();
  const maxHP = def.maxHP();
  let ko = { text: '' };
  if (!isStatus && hi > 0) { try { ko = result.kochance(); } catch (e) { ko = { text: `KO text unavailable: ${e.message}` }; } }
  return {
    attacker: atkSet.label, move: move.name, defender: defSet.label,
    status: isStatus, minDamage: lo, maxDamage: hi, defenderMaxHP: maxHP,
    minPct: pct(lo, maxHP), maxPct: pct(hi, maxHP),
    ko: ko.text || (hi === 0 ? 'no damage' : ''), koN: ko.n, koChance: ko.chance,
    priority: move.priority, bp: move.bp, type: move.type, target: move.target,
  };
}

function speedOf(gen, set, scenario, sideKey, ruleset, tailwind) {
  const mon = makePokemon(gen, set, ruleset, { tera: scenario.tera[sideKey].includes(set.label), intimidated: scenario.intimidate[sideKey] });
  const sideObj = new calc.Side({ ...(sideKey === 'A' ? scenario.sideA : scenario.sideB), isTailwind: tailwind });
  const field = new calc.Field({ gameType: 'Doubles', ...scenario.field });
  return { raw: mon.rawStats.spe, final: getFinalSpeed(gen, mon, field, sideObj) };
}

// state: { twA, twB, tr }. Returns 'A' | 'B' | 'TIE' plus the two speeds.
function speedOrder(gen, setA, setB, scenario, ruleset, state) {
  const a = speedOf(gen, setA, scenario, 'A', ruleset, state.twA).final;
  const b = speedOf(gen, setB, scenario, 'B', ruleset, state.twB).final;
  let first = a === b ? 'TIE' : (a > b ? 'A' : 'B');
  if (state.tr && first !== 'TIE') first = first === 'A' ? 'B' : 'A';
  return { first, speedA: a, speedB: b };
}

function finalStats(gen, set, ruleset) {
  const mon = makePokemon(gen, set, ruleset);
  return { ...mon.rawStats, hp: mon.maxHP() };
}

module.exports = { calc, DEFAULT_SCENARIO, loadScenario, makePokemon, calcMove, speedOf, speedOrder, finalStats, STATS, INTIMIDATE_CHECK };
