import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHandlers, type DashboardDeps } from './api/handlers.js';
import { renderDashboardHTML } from './ui.js';

export function createDashboardServer(deps: DashboardDeps) {
  const handlers = createHandlers(deps);
  const html = renderDashboardHTML();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS restricted to localhost only — prevents external sites from
    // making API calls to the dashboard
    const origin = req.headers.origin ?? '';
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve dashboard HTML at root
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // API routes
    const key = `${req.method} ${req.url}`;
    const handler = handlers[key];

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      let body: any;
      if (req.method === 'POST' || req.method === 'DELETE') {
        const raw = await readBody(req);
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }
        }
      }

      const result = await handler(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  return {
    server,
    listen: (port: number) => {
      return new Promise<void>((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve());
      });
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024) { req.destroy(); reject(new Error('Too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
