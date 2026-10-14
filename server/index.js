import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Rooms } from './rooms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const rooms = new Rooms();

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/healthz') { res.end('ok'); return; }
  if (u === '/') u = '/index.html';
  const base = u.startsWith('/shared/') ? root : path.join(root, 'public');
  const file = path.join(base, path.normalize(u));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  let ctx = null, msgs = 0;
  const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const rate = setInterval(() => { msgs = 0; }, 1000);
  ws.on('message', (raw) => {
    if (++msgs > 60) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create' && !ctx) { const r = rooms.create(send); ctx = r; return; }
    if (m.t === 'join' && !ctx) {
      const r = rooms.join(m.code, m.token, send);
      if (r.error) send({ t: 'error', code: r.error, message: r.error === 'room_full' ? 'Room full' : 'This room expired, start a new one' });
      else ctx = r;
      return;
    }
    if (!ctx || !rooms.rooms.has(ctx.room.code)) return;
    if (m.t === 'paint') rooms.paint(ctx.room, ctx.player, m.cells);
    else if (m.t === 'done') rooms.done(ctx.room, ctx.player);
    else rooms.advance(ctx.room, ctx.player, m);
  });
  ws.on('close', () => { clearInterval(rate); if (ctx) rooms.drop(ctx.room, ctx.player); });
});

// P3-002: detect dead connections (closed lid, lost network) that never send a close frame
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 10_000);
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, HEARTBEAT_MS).unref();

const PORT = Number(process.env.PORT || 8787);
server.listen(PORT, () => console.log(`Patchwork on http://localhost:${PORT}`));
