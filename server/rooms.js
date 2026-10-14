import crypto from 'node:crypto';
import { SIZE, COLORS, MIN_INK, emptyGrid, halfInk, stats, nameFor, pickStock, battle } from '../shared/rules.js';

export const CONFIG = { drawMs: Number(process.env.DRAW_MS || 60_000), rejoinMs: Number(process.env.REJOIN_MS || 120_000), roomTtlMs: 30 * 60_000 };
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BLOCK = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'bitch', 'dick', 'cock', 'pussy', 'rape', 'nazi'];
export const cleanName = (s) => !BLOCK.some(w => s.toLowerCase().includes(w));

export class Rooms {
  constructor({ now = () => Date.now(), timers = true } = {}) { this.rooms = new Map(); this.now = now; this.timers = timers; }

  code() { let c; do { c = Array.from(crypto.randomBytes(6), b => ALPHA[b % ALPHA.length]).join(''); } while (this.rooms.has(c)); return c; }

  create(send) {
    const room = { code: this.code(), phase: 'lobby', players: [], seed: crypto.randomBytes(4).readUInt32BE(0), created: this.now(), round: 0 };
    this.rooms.set(room.code, room);
    if (this.timers) room.ttl = setTimeout(() => this.destroy(room, 'expired'), CONFIG.roomTtlMs);
    return this.join(room.code, null, send);
  }

  join(code, token, send) {
    const room = this.rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return { error: 'room_not_found' };
    let p = token && room.players.find(x => x.token === token);
    if (p) { // rejoin
      p.send = send; p.connected = true; clearTimeout(p.dropTimer); p.dropTimer = null;
    } else {
      if (room.players.length >= 2) return { error: 'room_full' };
      p = { token: crypto.randomBytes(12).toString('hex'), side: room.players.length, send, connected: true, grid: emptyGrid(), done: false };
      room.players.push(p);
    }
    this.broadcast(room);
    if (room.phase === 'lobby' && room.players.length === 2) this.startDrawing(room);
    else this.syncPlayer(room, p);
    return { room, player: p };
  }

  startDrawing(room) {
    room.phase = 'drawing'; room.round++; room.reveal = null; room.result = null;
    for (const p of room.players) { p.grid = emptyGrid(); p.done = false; p.again = false; }
    room.roundSeed = (room.seed + room.round * 7919) >>> 0;
    room.foe = pickStock(room.roundSeed); // v1.1: opponent chosen before drawing
    room.deadline = this.now() + CONFIG.drawMs;
    clearTimeout(room.drawTimer);
    if (this.timers) room.drawTimer = setTimeout(() => this.timeUp(room), CONFIG.drawMs);
    this.broadcast(room);
    for (const p of room.players) this.syncPlayer(room, p);
  }

  paint(room, p, cells) {
    if (room.phase !== 'drawing' || p.done || !Array.isArray(cells)) return;
    const x0 = p.side * SIZE / 2;
    for (const c of cells.slice(0, 2048)) {
      if (!Array.isArray(c)) continue;
      const [x, y, col] = c.map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(col)) continue;
      if (x < x0 || x >= x0 + SIZE / 2 || y < 0 || y >= SIZE || col < 0 || col > COLORS) continue;
      p.grid[y][x] = col;
    }
  }

  done(room, p, force = false) {
    if (room.phase !== 'drawing' || p.done) return;
    if (!force && halfInk(p.grid, p.side) < MIN_INK) return p.send({ t: 'error', code: 'too_little_ink', message: 'Draw a bit more!' });
    if (halfInk(p.grid, p.side) < MIN_INK) this.filler(p); // timer ran out on an empty half
    p.done = true;
    this.broadcast(room);
    if (room.players.length === 2 && room.players.every(x => x.done)) this.reveal(room);
  }

  filler(p) { // a small default squiggle so a creature always exists
    const x0 = p.side * SIZE / 2;
    for (let y = 12; y < 20; y++) for (let x = x0 + 4; x < x0 + 12; x++) if ((x + y) % 2 === 0) p.grid[y][x] = 1;
  }

  timeUp(room) { if (room.phase === 'drawing') for (const p of room.players) this.done(room, p, true); }

  reveal(room) {
    clearTimeout(room.drawTimer);
    const grid = emptyGrid();
    for (const p of room.players) { const x0 = p.side * SIZE / 2; for (let y = 0; y < SIZE; y++) for (let x = x0; x < x0 + SIZE / 2; x++) grid[y][x] = p.grid[y][x]; }
    const seed = room.roundSeed;
    const st = stats(grid);
    let name = nameFor(st, seed, grid); if (!cleanName(name)) name = 'Patchling';
    const foe = room.foe;
    room.reveal = { grid, stats: st, name, foe, seed };
    room.result = battle({ name, ...st }, foe);
    room.phase = 'reveal';
    this.broadcast(room);
    for (const p of room.players) this.syncPlayer(room, p);
  }

  advance(room, p, msg) {
    if (msg.t === 'battle' && room.phase === 'reveal') { room.phase = 'battle'; this.broadcast(room); for (const q of room.players) this.syncPlayer(room, q); }
    else if (msg.t === 'battle_over' && room.phase === 'battle') { room.phase = 'result'; this.broadcast(room); }
    else if (msg.t === 'play_again' && room.phase === 'result') { p.again = true; this.broadcast(room); if (room.players.every(x => x.again) && room.players.length === 2) this.startDrawing(room); }
    else if (msg.t === 'report_hide' && ['reveal', 'battle', 'result'].includes(room.phase)) this.destroy(room, 'hidden');
  }

  drop(room, p) {
    if (!this.rooms.has(room.code) || !p.connected) return;
    p.connected = false; p.send = () => {};
    this.broadcast(room);
    if (this.timers) p.dropTimer = setTimeout(() => this.leave(room, p), CONFIG.rejoinMs);
  }

  leave(room, p) { if (!p.connected) this.destroy(room, 'partner_left'); }

  destroy(room, reason) {
    if (!this.rooms.has(room.code)) return;
    clearTimeout(room.drawTimer); clearTimeout(room.ttl);
    for (const p of room.players) { clearTimeout(p.dropTimer); p.send({ t: 'closed', reason }); }
    this.rooms.delete(room.code);
  }

  // Public room status. Never contains any player's cells.
  broadcast(room) {
    for (const p of room.players) p.send({
      t: 'room', code: room.code, phase: room.phase, round: room.round, foe: room.foe || null, you: p.side, deadline: room.deadline, now: this.now(),
      players: room.players.map(x => ({ side: x.side, connected: x.connected, done: x.done, again: !!x.again })),
    });
  }

  // Private per-player data: own half while drawing; merged result only after reveal.
  syncPlayer(room, p) {
    p.send({ t: 'session', token: p.token, code: room.code, side: p.side });
    if (room.phase === 'drawing') p.send({ t: 'own_grid', grid: p.grid });
    if (room.reveal) p.send({ t: 'reveal', ...room.reveal });
    if (room.result && ['battle', 'result'].includes(room.phase)) p.send({ t: 'battle_log', ...room.result });
  }
}
