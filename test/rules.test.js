import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGrid, stats, measure, battle, nameFor, pickStock, STOCK, damage, SIZE } from '../shared/rules.js';

function blob() { const g = emptyGrid(); for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) g[y][x] = 1 + (x % 2); return g; }
function stick() { const g = emptyGrid(); for (let y = 2; y < 30; y++) { g[y][15] = 3; g[y][16] = 3; } for (let x = 8; x < 24; x++) g[10][x] = 3; return g; }

test('empty grid gives minimum stats', () => {
  assert.deepEqual(stats(emptyGrid()), { hp: 30, power: 3, speed: 10, reach: 1, defense: 1 });
});
test('full single-color grid', () => {
  const g = emptyGrid().map(r => r.fill(1));
  assert.deepEqual(stats(g), { hp: 30, power: 3, speed: 1, reach: 10, defense: 1 });
});
test('same drawing always same stats, name, battle', () => {
  const s1 = stats(blob()), s2 = stats(blob());
  assert.deepEqual(s1, s2);
  assert.equal(nameFor(s1, 42), nameFor(s2, 42));
  assert.deepEqual(battle({ name: 'x', ...s1 }, pickStock(42)), battle({ name: 'x', ...s2 }, pickStock(42)));
});
test('blob is tanky and slow, stick is fast and fragile', () => {
  const b = stats(blob()), s = stats(stick());
  assert.ok(b.hp - s.hp >= 15, `hp ${b.hp} vs ${s.hp}`);
  assert.ok(s.speed - b.speed >= 3, `speed ${s.speed} vs ${b.speed}`);
});
test('symmetry measured across center line', () => {
  assert.equal(measure(stick()).symmetry, 1);
  const g = emptyGrid(); g[0][0] = 1; assert.equal(measure(g).symmetry, 0);
});
test('damage formula and minimum 1', () => {
  assert.equal(damage({ power: 6, reach: 5 }, { defense: 5 }), 6);
  assert.equal(damage({ power: 1, reach: 0 }, { defense: 10 }), 1);
});
test('battle ends by KO or 20 rounds, deterministic', () => {
  for (const foe of STOCK) for (const me of STOCK) {
    const r = battle(me, foe);
    assert.ok(['you', 'foe'].includes(r.winner));
    assert.ok(r.events.at(-1).round <= 20);
    assert.deepEqual(r, battle(me, foe));
  }
});
test('Zipp double-strikes Rok every 3rd attack', () => {
  const r = battle(STOCK[1], STOCK[0]);
  const zipp = r.events.filter(e => e.attacker === 'you');
  assert.equal(zipp[2].double, true); assert.equal(zipp[0].double, false);
});

// QA pass 1 regressions
import { stats as st2, nameFor as nf, STOCK as SK, battle as bt, emptyGrid as eg } from '../shared/rules.js';
test('P1-001: solid one-color fill loses to every stock creature', () => {
  const g = eg().map(r => r.fill(1)); const s = st2(g);
  for (const foe of SK) assert.equal(bt({ name: 'Block', ...s }, foe).winner, 'foe', `vs ${foe.name}`);
});
function variety() {
  const out = [];
  const g1 = eg(); for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) g1[y][x] = 1 + (x % 2); out.push(g1); // blob
  const g2 = eg(); for (let y = 2; y < 30; y++) { g2[y][15] = 3; g2[y][16] = 3; } for (let x = 8; x < 24; x++) g2[10][x] = 3; out.push(g2); // stick
  const g3 = eg(); for (let i = 0; i < 32; i++) { g3[4][i] = 1; g3[27][i] = 2; g3[i][4] = 3; g3[i][27] = 4; } out.push(g3); // outline 4 colors
  const g4 = eg(); for (let y = 0; y < 32; y += 2) for (let x = (y / 2) % 2; x < 32; x += 2) g4[y][x] = 1 + ((x + y) % 6); out.push(g4); // speckle 6 colors
  const g5 = eg(); for (let y = 10; y < 22; y++) for (let x = 10; x < 22; x++) g5[y][x] = 5; out.push(g5); // small square
  return out;
}
test('P1-002: Power spans at least 4 values across varied drawings', () => {
  const powers = new Set(variety().map(g => st2(g).power));
  assert.ok(powers.size >= 4, [...powers].join(','));
});
test('P1-003: different drawings mostly get different names with the same seed', () => {
  const names = variety().map(g => nf(st2(g), 7, g));
  assert.ok(new Set(names).size >= 4, names.join(','));
});

// QA pass 2 regressions (Lens's tuning drawings from /tmp/tune.mjs)
function tuneSet() {
  const D = {};
  const blob = eg(); for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) blob[y][x] = 1; D.blob = blob;
  const stick = eg(); for (let y = 4; y < 28; y++) stick[y][15] = stick[y][16] = 2; for (let x = 6; x < 26; x++) stick[12][x] = 2; for (let i = 0; i < 6; i++) { stick[27 - i][10 + i] = 2; stick[27 - i][21 - i] = 2; } D.stick = stick;
  const ring = eg(); for (let y = 6; y < 26; y++) for (let x = 6; x < 26; x++) { const d = Math.hypot(x - 15.5, y - 15.5); if (d < 10 && d > 6) ring[y][x] = 1 + ((x + y) % 4); } D.ring = ring;
  const big = eg(); for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) big[y][x] = 1 + (y % 3); D.big = big;
  const spiky = eg(); for (let y = 10; y < 22; y++) for (let x = 10; x < 22; x++) spiky[y][x] = 3; for (let x = 2; x < 30; x += 3) for (let y = 2; y < 10; y++) spiky[y][x] = spiky[31 - y][x] = 5; D.spiky = spiky;
  return D;
}
test('P2-001: every stock creature beats at least one reasonable drawing', () => {
  const D = tuneSet();
  for (const foe of SK) {
    const beaten = Object.entries(D).filter(([, g]) => bt({ name: 'me', ...st2(g) }, foe).winner === 'foe').map(([k]) => k);
    assert.ok(beaten.length >= 1, `${foe.name} beats nothing`);
  }
  assert.equal(bt({ name: 'me', ...st2(D.blob) }, SK[0]).winner, 'foe'); // Rok beats blob
  assert.equal(bt({ name: 'me', ...st2(D.stick) }, SK[0]).winner, 'foe'); // Rok beats stick
});
test('P2-001: detailed drawings can still win (effort pays off)', () => {
  const D = tuneSet();
  for (const k of ['ring', 'spiky']) for (const foe of SK) assert.equal(bt({ name: 'me', ...st2(D[k]) }, foe).winner, 'you', `${k} vs ${foe.name}`);
});
test('P2-002: empty and near-empty grids get minimum HP', () => {
  assert.equal(st2(eg()).hp, 30);
  const g = eg(); for (let x = 0; x < 10; x++) g[0][x] = 1; assert.equal(st2(g).hp, 30);
});
