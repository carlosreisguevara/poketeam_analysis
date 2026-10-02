// Pikalytics: usage list, per-Pokemon data (incl. spreads where the site has them) and featured tournament teams.
// Every parser checks the shape it expects and throws a clear error if the site changed.
const { get } = require('./http');
const BASE = 'https://www.pikalytics.com';
const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function expect(cond, msg) { if (!cond) throw new Error(`SITE CHANGED? ${msg}`); }

// Finds the data month and dataset id the site uses for a format.
async function discover(format) {
  const idx = await get(`${BASE}/ai/pokedex/${format}`);
  expect(idx.status === 200, `format "${format}" not found at ${idx.url}`);
  const month = (idx.text.match(/\*\*Data Date\*\*:\s*(\d{4}-\d{2})/) || [])[1];
  expect(month, `no "Data Date" in ${idx.url}`);
  const page = await get(`${BASE}/pokedex/${format}`);
  expect(page.status === 200, `format page missing: ${page.url}`);
  let m = page.text.match(new RegExp(`data-format="(${format}-\\d+)"`));
  let inferred = false;
  if (!m) { // older formats: reuse the site-wide numeric suffix, then prove it works by loading the usage list
    const any = page.text.match(/data-format="[a-z0-9]+-(\d+)"/);
    expect(any, `no data-format="<format>-<number>" anywhere in ${page.url}`);
    m = [null, `${format}-${any[1]}`]; inferred = true;
  }
  const ds = { format, month, datasetId: m[1], indexUrl: idx.url, suffixInferred: inferred };
  if (inferred) await usageList(ds); // throws if the guessed dataset id does not exist
  return ds;
}

async function usageList(ds) {
  const url = `${BASE}/api/l/${ds.month}/${ds.datasetId}`;
  const r = await get(url);
  expect(r.status === 200, `usage list missing: ${url}`);
  let list; try { list = JSON.parse(r.text); } catch { throw new Error(`SITE CHANGED? usage list is not JSON: ${url}`); }
  expect(Array.isArray(list) && list.length > 20, `usage list has ${Array.isArray(list) ? list.length : 'no'} entries: ${url}`);
  for (const p of list.slice(0, 10)) expect(p.name && (p.percent !== undefined || p.games !== undefined || p.raw !== undefined), `usage list entry has no name or usage figure: ${JSON.stringify(p).slice(0, 120)}`);
  return { url, entries: list.map(p => ({ name: p.name, usagePct: p.percent !== undefined ? parseFloat(p.percent) : null, winPct: parseFloat(p.winPercent) || null, games: p.games ?? null })) };
}

// Returns null when the site has no page for the Pokemon in this format.
async function pokemon(ds, name) {
  const url = `${BASE}/api/p/${ds.month}/${ds.datasetId}/${encodeURIComponent(name)}`;
  const r = await get(url);
  if (r.status === 404) return null;
  let j; try { j = JSON.parse(r.text); } catch { return null; } // unknown names return a non-JSON page
  if (!j || !j.name) return null;
  for (const k of ['abilities', 'items', 'moves', 'spreads']) expect(Array.isArray(j[k]), `"${k}" missing in ${url}`);
  for (const k of ['natures', 'teams']) if (!Array.isArray(j[k])) j[k] = []; // older formats omit these
  return { url, json: j };
}

function parseEv(ev, ctx) {
  const parts = String(ev).split('/').map(Number);
  expect(parts.length === 6 && parts.every(n => Number.isInteger(n) && n >= 0), `bad spread string "${ev}" (${ctx})`);
  const points = {}; KEYS.forEach((k, i) => { if (parts[i]) points[k] = parts[i]; });
  const sum = parts.reduce((a, b) => a + b, 0);
  expect(sum <= 66 && parts.every(n => n <= 32), `spread "${ev}" is not a stat-point spread (max 32 each, 66 total) (${ctx})`);
  return points;
}

// Convert the site's JSON for one Pokemon into the usage-file shape used by src/assume.js
function toUsage(ds, p, name) {
  const j = p.json;
  const spreads = j.spreads.map(s => ({ nature: s.nature || null, points: parseEv(s.ev, `${name} ${p.url}`), usage_pct: parseFloat(s.percent) }));
  for (const s of spreads) expect(!Number.isNaN(s.usage_pct), `spread usage not a number for ${name}`);
  const natures = j.natures.map(n => ({ nature: n.nature, usage_pct: parseFloat(n.percent) }));
  return {
    source_url: p.url, fetched: new Date().toISOString().slice(0, 10), site: 'Pikalytics', format: ds.format, dataset_month: ds.month,
    pokemon: j.name, sample_games: j.games ?? j.raw_count ?? null, spreads, natures,
  };
}

// Featured tournament teams on a Pokemon page: {author, record, link, tournamentLabel, ranking...}
function teamLinks(p) {
  return p.json.teams.filter(t => t.link && /^https:\/\/play\.limitlesstcg\.com\//.test(t.link)).map(t => ({
    author: t.author, record: t.record, link: t.link, tournament: t.tournamentLabel || t.event, tournamentDate: t.tournamentDate || null,
    placing: t.tournamentRanking ?? null,
  }));
}

module.exports = { discover, usageList, pokemon, toUsage, teamLinks };
