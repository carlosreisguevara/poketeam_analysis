// First-run setup:  npm run setup
// Installs the calculator if missing, creates folders, runs the smoke test and both test suites.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
process.chdir(root);

const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 18) { console.error(`Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org and run again.`); process.exit(1); }
console.log(`Node.js ${process.versions.node} OK`);

for (const d of ['teams', 'meta', 'data', 'data/usage', 'output', 'src', 'tests']) fs.mkdirSync(d, { recursive: true });

if (!fs.existsSync(path.join('node_modules', '@smogon', 'calc'))) {
  console.log('Installing the calculator (npm install)...');
  execSync('npm install', { stdio: 'inherit' });
}
console.log(`@smogon/calc ${require('@smogon/calc/package.json').version} installed`);

const run = (label, cmd) => { try { execSync(cmd, { stdio: 'pipe' }); console.log(`${label}: all passed`); } catch (e) { console.error(`${label}: FAILED\n${e.stdout}`); process.exit(1); } };
run('Calc smoke test', 'node src/smoke-test.js');
run('Phase 1 tests', 'node tests/run-tests.js');
run('Phase 2 tests', 'node tests/run-phase2-tests.js');
console.log('\nSetup complete. Put your team in teams/my-team.txt, then run: npm run analyze');
