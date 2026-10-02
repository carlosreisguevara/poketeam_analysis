// Serves the output folder locally so the report opens in a browser:  node src/serve.js  ->  http://localhost:4173/my-team/REPORT.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'output');
const port = parseInt(process.env.PORT || '4173', 10);
const types = { '.html': 'text/html; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { const teams = fs.existsSync(root) ? fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'REPORT.html'))) : []; res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<h1>Reports</h1>${teams.map(t => `<p><a href="/${t}/REPORT.html">${t}</a></p>`).join('') || '<p>No REPORT.html yet. Run npm run report.</p>'}`); return; }
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Open http://localhost:${port}/ (Ctrl+C to stop)`));
