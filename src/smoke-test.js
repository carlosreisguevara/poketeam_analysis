const { calculate, Generations, Pokemon, Move, Field } = require('@smogon/calc');
const gen = Generations.get(9);
const atk = new Pokemon(gen, 'Garchomp', { level: 50, nature: 'Jolly', evs: { atk: 252 } });
const def = new Pokemon(gen, 'Incineroar', { level: 50, evs: { hp: 252 } });
const r = calculate(gen, atk, def, new Move(gen, 'Earthquake'), new Field({ gameType: 'Doubles' }));
console.log(r.fullDesc());
