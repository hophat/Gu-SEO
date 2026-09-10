import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import workerModule from './functions_dist/index.js';

const PORT = 8788;

function execSql(command) {
  try {
    const out = execFileSync('npx', [
      'wrangler', 'd1', 'execute', 'pages-seo',
      '--local',
      '--command', command,
      '--json'
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const parsed = JSON.parse(out);
    return parsed[0]?.results || [];
  } catch (err) {
    return [];
  }
}

const env = {
  DB: {
    prepare(query) {
      function makeRunner(...params) {
        return {
          async first() {
            let formatted = query;
            for (const p of params) {
              const val = typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`;
              formatted = formatted.replace('?', val);
            }
            const rows = execSql(formatted);
            return rows[0] || null;
          },
          async all() {
            let formatted = query;
            for (const p of params) {
              const val = typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`;
              formatted = formatted.replace('?', val);
            }
            const rows = execSql(formatted);
            return { results: rows };
          },
          async run() {
            let formatted = query;
            for (const p of params) {
              const val = typeof p === 'number' ? p : `'${String(p).replace(/'/g, "''")}'`;
              formatted = formatted.replace('?', val);
            }
            execSql(formatted);
            return { success: true };
          }
        };
      }
      return {
        ...makeRunner(),
        bind(...params) {
          return makeRunner(...params);
        }
      };
    }
  },
  ASSETS: {
    async fetch(req) {
      const raw = typeof req === 'string' ? req : req?.url;
      const url = raw ? new URL(raw, 'http://localhost:8788') : new URL('http://localhost:8788');
      let filePath = path.join(process.cwd(), 'public', url.pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': mimes[ext] || 'application/octet-stream' }
      });
    }
  },
  SITE_NAME: 'AI Content Factory Local',
  SITE_URL: 'http://localhost:8788',
  ADMIN_TOKEN: 'local-admin-token-12345',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost:8788'}`);

    const publicPath = path.join(process.cwd(), 'public', url.pathname);
    if (url.pathname !== '/' && fs.existsSync(publicPath) && !fs.statSync(publicPath).isDirectory()) {
      const ext = path.extname(publicPath).toLowerCase();
      const mimes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      const data = fs.readFileSync(publicPath);
      res.statusCode = 200;
      res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
      if (req.method === 'HEAD') return res.end();
      return res.end(data);
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const cfReq = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    });

    const ctx = {
      waitUntil(p) { Promise.resolve(p).catch(console.error); },
      passThroughOnException() {}
    };

    const response = await workerModule.fetch(cfReq, env, ctx);

    res.statusCode = response.status;
    response.headers.forEach((val, key) => res.setHeader(key, val));
    if (req.method === 'HEAD') return res.end();
    const resBody = await response.arrayBuffer();
    res.end(Buffer.from(resBody));
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.end(err.stack || String(err));
  }
});

server.listen(PORT, () => {
  console.log(`✓ AI Content Factory Dev Server running on http://localhost:${PORT}`);
});
