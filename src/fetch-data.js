// Phase 3 data gathering from the VGCPastes repository sheet (Champions M-C) + Pokepaste.
//   node src/fetch-data.js fetch [--events 10] [--ranks "Champion,Runner Up"]   -> raw cache + data/staging (review first)
//   node src/fetch-data.js promote                                              -> validated files into /meta and data/usage
// Spreads: for every Pokemon, the most common (nature + stat points) among ALL pastes in the sheet that list EVs.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { parseTeam } = require('./parse');
const { loadMetaTeam } = require('./meta');

const UA = 'poketeam-analysis/0.3 (personal VGC analysis tool; https://github.com/carlosreisguevara/poketeam_analysis)';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const today = () => new Date().toISOString().slice(0, 10);
const dir = (...p) => path.join(root, ...p);
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); };
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const idOf = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const need = (c, m) => { if (!c) throw new Error('SITE CHANGED? ' + m); };

function parseCsv(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch;
  }
  r.push(c); rows.push(r); return rows;
}

async function http(url, retries = 2) {
  let err;
  for (let a = 0; a <= retries; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return { status: 404, text: null };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { status: 200, text: await res.text() };
    } catch (e) { err = e; await sleep(1500 * (a + 1)); }
  }
  throw new Error(`FETCH FAILED ${url}: ${err.message}`);
}

async function fetchCmd() {
  const cfg = JSON.parse(fs.readFileSync(dir('config.json'), 'utf8'));
  need(cfg.teams_sheet && cfg.teams_sheet.id, 'config.json has no teams_sheet.id');
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${cfg.teams_sheet.id}/edit?gid=${cfg.teams_sheet.gid}`;
  const csvUrl = `https://docs.google.com/spreadsheets/d/${cfg.teams_sheet.id}/export?format=csv&gid=${cfg.teams_sheet.gid}`;
  const nEvents = parseInt(arg('--events', '10'), 10);
  const ranks = arg('--ranks', 'Champion,Runner Up').split(',');
  const t0 = Date.now();
  fs.rmSync(dir('data', 'staging'), { recursive: true, force: true });

  // 1) the sheet
  const res = await http(csvUrl); need(res.status === 200, 'sheet not readable at ' + csvUrl);
  write(dir('data', 'raw', 'sheet', 'vgcpastes-mc.csv'), res.text);
  const rows = parseCsv(res.text);
  const hi = rows.findIndex(r => r.includes('Pokepaste') && r.includes('Rank'));
  need(hi > -1, 'header row with "Pokepaste" and "Rank" not found');
  const H = rows[hi]; const col = n => { const i = H.findIndex(x => x.trim().startsWith(n)); need(i > -1, `column "${n}" missing`); return i; };
  const C = { id: col('Team ID'), paste: col('Pokepaste'), date: col('Date Shared'), event: col('Tournament'), rank: col('Rank'), src: col('Link to Source') };
  const teams = rows.slice(hi + 1).filter(r => /^MC\d+/.test(r[C.id])).map(r => ({
    id: r[C.id], paste: (r[C.paste] || '').trim(), date: new Date(r[C.date] + ' UTC'), dateText: r[C.date], event: r[C.event], rank: r[C.rank].trim(), source: r[C.src],
  }));
  need(teams.length > 50, `only ${teams.length} team rows found`);
  // Only events that were played under the current regulation (the sheet has no regulation column; the user names them).
  const only = (arg('--only-events') ? arg('--only-events').split(';') : cfg.regulation_events) || [];
  need(only.length, 'no regulation events set: add "regulation_events" to config.json or pass --only-events "A;B"');
  const allCount = teams.length;
  for (let i = teams.length - 1; i >= 0; i--) if (!only.includes(teams[i].event)) teams.splice(i, 1);
  need(teams.length, `none of the sheet rows belong to ${only.join(', ')}`);
  console.log(`Using only ${only.join(' + ')}: ${teams.length} of ${allCount} teams`);
  console.log(`Sheet: ${teams.length} teams, ${teams.filter(t => t.paste).length} with a Pokepaste link (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // 2) every paste (cached), 4 at a time
  const pastes = teams.filter(t => /^https:\/\/pokepast\.es\/[0-9a-f]+$/.test(t.paste));
  let done = 0, failed = [];
  const queue = [...pastes];
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (queue.length) {
      const t = queue.shift(); const file = dir('data', 'raw', 'pokepaste', `${t.id}.txt`);
      try {
        if (fs.existsSync(file)) t.text = fs.readFileSync(file, 'utf8');
        else {
          const r = await http(t.paste + '/raw');
          if (r.status !== 200 || !/Ability:/.test(r.text)) throw new Error('no usable paste');
          t.text = r.text; write(file, r.text); await sleep(250);
        }
      } catch (e) { failed.push(`${t.id} ${t.paste}: ${e.message}`); }
      if (++done % 100 === 0) console.log(`  pastes ${done}/${pastes.length}`);
    }
  }));
  console.log(`Pastes read: ${pastes.length - failed.length}/${pastes.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  need(failed.length <= pastes.length * 0.2, `${failed.length} of ${pastes.length} pastes failed:\n${failed.slice(0, 5).join('\n')}`);

  // 3) parse, count spreads per species
  const stats = {}; const bad = []; let withSpread = 0;
  for (const t of pastes) {
    if (!t.text) continue;
    try { t.sets = parseTeam(t.text, { gen: 9, ruleset: 'champions', strict: false }); } catch (e) { bad.push(`${t.id}: ${e.message}`); continue; }
    if (t.sets.some(s => s.hasEvs)) withSpread++;
    for (const s of t.sets) {
      if (!s.hasEvs || !s.nature) continue;
      const key = `${s.nature}|${JSON.stringify(Object.fromEntries(Object.entries(s.evs).filter(([, v]) => v).sort()))}`;
      const e = (stats[s.species] ||= { n: 0, spreads: {} });
      e.n++; (e.spreads[key] ||= { nature: s.nature, points: JSON.parse(key.split('|')[1]), count: 0, teams: [] }).count++;
      e.spreads[key].teams.push(t.id);
    }
  }
  console.log(`Parsed ${pastes.length - bad.length} pastes; ${withSpread} contain spreads; ${bad.length} unparseable`);

  // 4) usage files (most common spread first)
  const fetched = today();
  const usageFor = sp => {
    const e = stats[sp]; if (!e) return null;
    const spreads = Object.values(e.spreads).sort((a, b) => b.count - a.count).map(s => ({ nature: s.nature, points: s.points, usage_pct: Math.round((s.count / e.n) * 1000) / 10, count: s.count }));
    return { source_url: sheetUrl, fetched, site: 'VGCPastes repository (Champions M-C) via Pokepaste', format: 'gen9championsvgc2026regmc', dataset_month: null, pokemon: sp, sample_games: e.n, sample_unit: 'team lists with EVs', spreads, natures: [] };
  };
  for (const sp of Object.keys(stats)) write(dir('data', 'staging', 'usage', `${idOf(sp)}.json`), usageFor(sp));

  // 5) meta teams: top finishers of the most recent events
  const placed = teams.filter(t => t.text && ranks.includes(t.rank) && t.sets && !Number.isNaN(t.date.getTime()));
  const events = [...new Map(placed.map(t => [t.event, t.date])).entries()].sort((a, b) => b[1] - a[1]).slice(0, nEvents).map(e => e[0]);
  const chosen = placed.filter(t => events.includes(t.event)).sort((a, b) => b.date - a.date);
  need(chosen.length, 'no Champion/Runner Up teams found');
  const missing = new Set();
  for (const t of chosen) {
    const header = `# Name: ${t.event} - ${t.rank} (${t.id})\n# Source: ${t.paste}\n# Fetched: ${fetched}\n# Format: Regulation M-C (VGCPastes repository ${t.id})\n# Result: ${t.rank}, ${t.dateText}\n# Tournament source: ${t.source || 'n/a'}\n# Found via: ${sheetUrl}\n\n`;
    write(dir('data', 'staging', 'meta', `${slug(t.event)}-${slug(t.rank)}-${t.id.toLowerCase()}.txt`), header + t.text.trim() + '\n');
    for (const s of t.sets) if ((!s.hasEvs || !s.nature) && !stats[s.species] && !stats[idOf(s.species)]) missing.add(s.species);
  }

  const report = { fetched, sheetUrl, sheetTeams: teams.length, pastes: pastes.length, pastesFailed: failed, unparseable: bad, pastesWithSpreads: withSpread, events, chosen: chosen.map(t => ({ id: t.id, event: t.event, rank: t.rank, date: t.dateText, paste: t.paste, pokemon: t.sets.map(s => s.species), hasSpreads: t.sets.some(s => s.hasEvs) })), missingSpreadData: [...missing] };
  write(dir('data', 'staging', 'fetch-report.json'), report);
  let md = `# Fetch summary (${fetched})\n\nSource: ${sheetUrl}\nSheet teams: ${teams.length}. Pastes read: ${pastes.length - failed.length}/${pastes.length}. Pastes that list spreads: ${withSpread}. Unparseable: ${bad.length}.\n\n## Teams staged for /meta (${chosen.length}; ${ranks.join(' + ')} of the ${events.length} most recent events)\n\n| Team | Event | Rank | Date | Spreads in paste? | Pokemon |\n|---|---|---|---|---|---|\n`;
  for (const t of report.chosen) md += `| ${t.id} | ${t.event} | ${t.rank} | ${t.date} | ${t.hasSpreads ? 'yes' : 'no (will use most common spreads, ASSUMED)'} | ${t.pokemon.join(', ')} |\n`;
  const used = [...new Set(chosen.flatMap(t => t.sets.map(s => s.species)))].sort();
  md += `\n## Most common spread per Pokemon in the staged teams (from ${withSpread} team lists with EVs)\n\n| Pokemon | Samples | Most common spread | Share |\n|---|---|---|---|\n`;
  for (const sp of used) { const u = usageFor(sp); md += u ? `| ${sp} | ${u.sample_games}${u.sample_games < 3 ? ' LOW SAMPLE' : ''} | ${u.spreads[0].nature}, ${JSON.stringify(u.spreads[0].points)} | ${u.spreads[0].usage_pct}% |\n` : `| ${sp} | 0 | UNKNOWN (no spread data) | |\n`; }
  if (missing.size) md += `\n**No spread data at all (will be UNKNOWN where the paste has none):** ${[...missing].join(', ')}\n`;
  if (bad.length || failed.length) md += `\n## Problems\n\n${[...failed, ...bad].map(p => `- ${p}`).join('\n')}\n`;
  write(dir('data', 'staging', 'SUMMARY.md'), md);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s. Review: data/staging/SUMMARY.md (nothing is in /meta or data/usage yet; next: node src/fetch-data.js promote)`);
}

function promoteCmd() {
  const st = dir('data', 'staging');
  need(fs.existsSync(path.join(st, 'fetch-report.json')), 'nothing staged; run: node src/fetch-data.js fetch');
  const ok = [], bad = [];
  for (const f of fs.readdirSync(path.join(st, 'meta'))) {
    try { loadMetaTeam(path.join(st, 'meta', f), { usageDir: path.join(st, 'usage') }); ok.push(f); } catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  fs.mkdirSync(dir('meta'), { recursive: true }); fs.mkdirSync(dir('data', 'usage'), { recursive: true });
  for (const f of ok) fs.copyFileSync(path.join(st, 'meta', f), dir('meta', f));
  const uf = fs.readdirSync(path.join(st, 'usage'));
  for (const f of uf) fs.copyFileSync(path.join(st, 'usage', f), dir('data', 'usage', f));
  console.log(`Promoted ${ok.length} teams to /meta and ${uf.length} usage files to data/usage.`);
  if (bad.length) console.log(`NOT promoted (${bad.length}):\n- ${bad.join('\n- ')}`);
}

const cmd = process.argv[2];
(cmd === 'fetch' ? fetchCmd() : cmd === 'promote' ? Promise.resolve(promoteCmd()) : Promise.reject(new Error('Usage: node src/fetch-data.js fetch|promote')))
  .catch(e => { console.error('\nSTOPPED: ' + e.message); process.exit(1); });
