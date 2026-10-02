// Polite HTTP: identifies itself, waits between requests, retries briefly, and fails loudly.
const UA = 'poketeam-analysis/0.3 (personal VGC analysis tool; https://github.com/carlosreisguevara/poketeam_analysis)';
const MIN_GAP_MS = 1000;
let last = 0;

async function get(url, { retries = 2, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = Math.max(0, last + MIN_GAP_MS - Date.now());
    if (wait) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) return { status: 404, text: null, url };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, text: await res.text(), url };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`FETCH FAILED for ${url}: ${lastErr.message}`);
}

module.exports = { get, UA };
