import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../server/rooms.js';

function player() { const box = []; const send = (m) => box.push(m); return { box, send }; }
function setup() {
  const rs = new Rooms({ timers: false }); const a = player(), b = player();
  const ra = rs.create(a.send); const rb = rs.join(ra.room.code, null, b.send);
  return { rs, a, b, room: ra.room, pa: ra.player, pb: rb.player };
}
const fill = (x0) => { const c = []; for (let y = 5; y < 25; y++) for (let x = x0; x < x0 + 10; x++) c.push([x, y, 2]); return c; };

test('two players join and drawing starts; third is refused', () => {
  const { rs, room } = setup();
  assert.equal(room.phase, 'drawing');
  assert.equal(rs.join(room.code, null, () => {}).error, 'room_full');
  assert.equal(rs.join('NOPE00', null, () => {}).error, 'room_not_found');
});

test("partner's cells never reach the other player before reveal", () => {
  const { rs, a, b, room, pa, pb } = setup();
  rs.paint(room, pa, fill(2)); rs.done(room, pa);
  rs.paint(room, pb, fill(18));
  const leaked = b.box.some(m => JSON.stringify(m).includes('"grid"') && m.t !== 'own_grid')
    || b.box.filter(m => m.t === 'own_grid').some(m => m.grid.some(r => r.slice(0, 16).some(Boolean)));
  assert.equal(leaked, false);
  assert.ok(!a.box.some(m => m.t === 'reveal'));
  rs.done(room, pb);
  assert.equal(room.phase, 'reveal');
  const rev = b.box.find(m => m.t === 'reveal');
  assert.ok(rev.grid[5].slice(0, 16).some(Boolean) && rev.grid[5].slice(16).some(Boolean));
});

test('players cannot paint the other half', () => {
  const { rs, room, pa } = setup();
  rs.paint(room, pa, [[20, 5, 1], [3, 5, 1], [3, 99, 1], ['x', 1, 1], [3, 6, 9]]);
  assert.equal(pa.grid[5][20], 0); assert.equal(pa.grid[5][3], 1); assert.equal(pa.grid[6][3], 0);
});

test('too little ink is refused, timer force-fills', () => {
  const { rs, a, room, pa, pb } = setup();
  rs.done(room, pa);
  assert.equal(pa.done, false);
  assert.equal(a.box.at(-1).code, 'too_little_ink');
  rs.timeUp(room);
  assert.equal(room.phase, 'reveal');
  assert.ok(pa.done && pb.done);
});

test('drop and rejoin restores seat and drawing', () => {
  const { rs, room, pa } = setup();
  rs.paint(room, pa, fill(2));
  rs.drop(room, pa);
  assert.equal(pa.connected, false);
  const c = player();
  const r = rs.join(room.code.toLowerCase(), pa.token, c.send);
  assert.equal(r.player, pa); assert.equal(pa.connected, true);
  assert.ok(c.box.find(m => m.t === 'own_grid').grid[5][2]);
});

test('full round: reveal, battle, result, play again, report/hide', () => {
  const { rs, a, room, pa, pb } = setup();
  rs.paint(room, pa, fill(2)); rs.paint(room, pb, fill(18)); rs.done(room, pa); rs.done(room, pb);
  rs.advance(room, pa, { t: 'battle' });
  assert.equal(room.phase, 'battle'); assert.ok(a.box.find(m => m.t === 'battle_log').events.length);
  rs.advance(room, pa, { t: 'battle_over' }); assert.equal(room.phase, 'result');
  rs.advance(room, pa, { t: 'play_again' }); assert.equal(room.phase, 'result');
  rs.advance(room, pb, { t: 'play_again' }); assert.equal(room.phase, 'drawing'); assert.equal(room.round, 2);
  rs.paint(room, pa, fill(2)); rs.paint(room, pb, fill(18)); rs.done(room, pa); rs.done(room, pb);
  rs.advance(room, pb, { t: 'report_hide' });
  assert.equal(rs.rooms.has(room.code), false);
  assert.equal(a.box.at(-1).reason, 'hidden');
});

test('leaving after rejoin window closes the room for partner', () => {
  const { rs, b, room, pa } = setup();
  rs.drop(room, pa); rs.leave(room, pa);
  assert.equal(b.box.at(-1).reason, 'partner_left');
});
