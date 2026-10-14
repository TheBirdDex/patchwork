import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGrid, stats, previewStats, mirrorHalf, revealLines, resultLine, strongest, battle, STOCK } from '../shared/rules.js';
import { Rooms } from '../server/rooms.js';

test('preview uses only own half, mirrored', () => {
  const g = emptyGrid(); g[3][2] = 1; g[9][20] = 4; // A cell, B cell
  const m = mirrorHalf(g, 0);
  assert.equal(m[3][2], 1); assert.equal(m[3][29], 1); assert.equal(m[9][20], 0); assert.equal(m[9][11], 0);
  const mb = mirrorHalf(g, 1); assert.equal(mb[9][20], 4); assert.equal(mb[9][11], 4); assert.equal(mb[3][2], 0);
  const g2 = g.map(r => r.slice()); g2[9][20] = 0; g2[10][25] = 6;
  assert.deepEqual(previewStats(g, 0), previewStats(g2, 0)); // partner changes don't affect A's preview
});

test('opponent is chosen at draw start, broadcast, and is the one fought', () => {
  const rs = new Rooms({ timers: false }); const box = [];
  const a = rs.create(m => box.push(m)); rs.join(a.room.code, null, () => {});
  const msg = box.filter(m => m.t === 'room' && m.phase === 'drawing').at(-1);
  assert.ok(msg.foe && STOCK.some(s => s.name === msg.foe.name));
  assert.equal(msg.round, 1);
  rs.timeUp(a.room);
  assert.equal(a.room.reveal.foe.name, msg.foe.name);
});

test('reveal line names the real strongest stat; result line matches the battle', () => {
  const big = emptyGrid(); for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) big[y][x] = 1;
  const st = stats(big); const k = strongest(st);
  const lines = revealLines(st, STOCK[0]);
  assert.match(lines.strongest, new RegExp({ hp: 'HP', power: 'Power', speed: 'Speed', reach: 'Reach', defense: 'Defense' }[k]));
  assert.match(lines.matchup, /Rok/);
  for (const foe of STOCK) {
    const r = battle({ name: 'me', ...st }, foe); const line = resultLine(st, foe, r);
    assert.ok(r.winner === 'you' ? line.startsWith('You won') : line.includes(foe.name), line);
  }
});
