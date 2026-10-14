// End-to-end over real WebSockets against a running server (PORT env, default 8787).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { before, after } from 'node:test';
const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL = `ws://localhost:${PORT}`;
let srv;
before(() => new Promise((res) => { srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT } }); srv.stdout.on('data', res); }));
after(() => srv.kill());
function client() {
  const ws = new WebSocket(URL); const box = []; let waiters = [];
  ws.on('message', d => { const m = JSON.parse(d); box.push(m); waiters = waiters.filter(w => !(w.f(m) && (w.r(m), true))); });
  const until = (f) => new Promise((r, j) => { const hit = box.find(f); if (hit) return r(hit); waiters.push({ f, r }); setTimeout(() => j(new Error('timeout')), 3000); });
  return { ws, box, until, send: m => ws.send(JSON.stringify(m)), open: new Promise(r => ws.on('open', r)) };
}
test('two clients play a full round over the network', async () => {
  const a = client(), b = client(); await a.open; await b.open;
  a.send({ t: 'create' }); const s = await a.until(m => m.t === 'session');
  b.send({ t: 'join', code: s.code }); await b.until(m => m.t === 'room' && m.phase === 'drawing');
  const cells = (x0) => { const c = []; for (let y = 4; y < 28; y++) for (let x = x0; x < x0 + 12; x++) c.push([x, y, 1 + (y % 3)]); return c; };
  a.send({ t: 'paint', cells: cells(2) }); b.send({ t: 'paint', cells: cells(18) });
  a.send({ t: 'done' }); await b.until(m => m.t === 'room' && m.players.some(p => p.done));
  assert.ok(!b.box.some(m => m.t === 'reveal'), 'no reveal before both done');
  assert.ok(!JSON.stringify(b.box.filter(m => m.t !== 'own_grid')).includes('grid'), 'no foreign grid to B');
  b.send({ t: 'done' });
  const ra = await a.until(m => m.t === 'reveal'), rb = await b.until(m => m.t === 'reveal');
  assert.deepEqual(ra, rb);
  a.send({ t: 'battle' }); await b.until(m => m.t === 'battle_log');
  a.send({ t: 'battle_over' }); await b.until(m => m.t === 'room' && m.phase === 'result');
  a.ws.close(); b.ws.close();
});

test('P3-002: partner silently dropping after reveal is detected and the other player is told', async () => {
  const port = PORT + 1;
  const s2 = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: port, REJOIN_MS: 600, HEARTBEAT_MS: 300 } });
  await new Promise(r => s2.stdout.on('data', r));
  try {
    const mk = () => { const ws = new WebSocket(`ws://localhost:${port}`, { autoPong: false }); const box = []; ws.on('message', d => box.push(JSON.parse(d)));
      return { ws, box, send: m => ws.send(JSON.stringify(m)), open: new Promise(r => ws.on('open', r)) }; };
    const a = mk(), b = mk(); await a.open; await b.open;
    a.ws.on('ping', () => a.ws.pong()); // A stays healthy; B never answers pings, like a dead phone
    a.send({ t: 'create' }); await new Promise(r => setTimeout(r, 100));
    const code = a.box.find(m => m.t === 'session').code;
    b.send({ t: 'join', code }); await new Promise(r => setTimeout(r, 100));
    a.send({ t: 'done' }); b.send({ t: 'done' }); // too little ink; force via paint
    const cells = (x0) => Array.from({ length: 100 }, (_, i) => [x0 + (i % 10), 5 + Math.floor(i / 10), 1]);
    a.send({ t: 'paint', cells: cells(2) }); b.send({ t: 'paint', cells: cells(18) });
    a.send({ t: 'done' }); b.send({ t: 'done' });
    await new Promise(r => setTimeout(r, 200));
    assert.ok(a.box.some(m => m.t === 'reveal'));
    await new Promise(r => setTimeout(r, 2500)); // heartbeat kills B, then the 600 ms rejoin window passes
    const closed = a.box.find(m => m.t === 'closed');
    assert.equal(closed?.reason, 'partner_left');
    a.ws.close();
  } finally { s2.kill(); }
});
