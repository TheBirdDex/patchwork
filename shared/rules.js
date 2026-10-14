// Patchwork shared rules: stats, naming, battle. Deterministic. Used by server and tests.
export const SIZE = 32;
export const COLORS = 6; // color ids 1..6, 0 = empty
export const MIN_INK = 0.02;

export function emptyGrid() { return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0)); }

export function measure(grid) {
  let filled = 0, edges = 0, minX = SIZE, maxX = -1, minY = SIZE, maxY = -1, mirrored = 0;
  const used = new Set();
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = grid[y][x];
    if (!c) continue;
    filled++; used.add(c);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (grid[y][SIZE - 1 - x]) mirrored++;
    if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 || !grid[y][x - 1] || !grid[y][x + 1] || !grid[y - 1][x] || !grid[y + 1][x]) edges++;
  }
  const total = SIZE * SIZE;
  return {
    ink: filled / total,
    spread: filled ? ((maxX - minX + 1) * (maxY - minY + 1)) / total : 0,
    colors: used.size,
    symmetry: filled ? mirrored / filled : 0,
    detail: filled ? edges / filled : 0,
  };
}

export function halfInk(grid, side) {
  const x0 = side === 0 ? 0 : SIZE / 2; let n = 0;
  for (let y = 0; y < SIZE; y++) for (let x = x0; x < x0 + SIZE / 2; x++) if (grid[y][x]) n++;
  return n / (SIZE * SIZE / 2);
}

export function stats(grid) {
  const m = measure(grid);
  return {
    hp: m.ink < MIN_INK ? 30 : 30 + Math.round(70 * Math.max(0, 1 - Math.abs(m.ink - 0.4) / 0.6)), // P2-002: near-empty is minimum
    power: Math.min(10, 2 + Math.max(1, m.colors) + Math.round(3 * m.detail)),
    speed: 1 + Math.round(9 * (1 - m.ink)),
    reach: 1 + Math.round(9 * m.spread),
    defense: 1 + Math.round(9 * m.symmetry * (1 - m.ink)),
  };
}

// Seeded PRNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PREFIX = {
  tank: ['Grumble', 'Boulder', 'Thud', 'Lump', 'Stomp', 'Chonk', 'Rumble', 'Bulk'],
  fast: ['Zip', 'Flick', 'Dart', 'Skitter', 'Whisk', 'Zoom', 'Scurry', 'Blip'],
  bright: ['Glimmer', 'Prism', 'Blaze', 'Spark', 'Dazzle', 'Flare', 'Glint', 'Razzle'],
  even: ['Mossy', 'Pebble', 'Tumble', 'Bramble', 'Wobble', 'Nubbin', 'Puddle', 'Fizzle'] };
const SUFFIX = ['wing', 'claw', 'snout', 'tail', 'fang', 'horn', 'paw', 'beak', 'tusk', 'fin', 'whisker', 'belly', 'nose', 'spine', 'hoof', 'toes'];
export function gridHash(grid) { let h = 2166136261; for (const row of grid) for (const c of row) { h ^= c; h = Math.imul(h, 16777619); } return h >>> 0; }
export function nameFor(st, seed, grid) {
  const r = rng((seed ^ 0x9e37 ^ (grid ? gridHash(grid) : 0)) >>> 0);
  const kind = st.hp >= 70 ? 'tank' : st.speed >= 8 ? 'fast' : st.power >= 7 ? 'bright' : 'even';
  const p = PREFIX[kind][Math.floor(r() * PREFIX[kind].length)];
  return p + SUFFIX[Math.floor(r() * SUFFIX.length)];
}

export const STOCK = [
  { name: 'Rok', hp: 70, power: 10, speed: 2, reach: 3, defense: 5 },
  { name: 'Zipp', hp: 60, power: 6, speed: 10, reach: 6, defense: 6 },
  { name: 'Mossle', hp: 80, power: 6, speed: 6, reach: 5, defense: 6 },
];
export function pickStock(seed) { return STOCK[Math.floor(rng(seed)() * STOCK.length)]; }

export function damage(att, def) {
  return Math.max(1, att.power + Math.floor(att.reach / 3) - Math.floor(def.defense / 3));
}

// a, b: {name, hp, power, speed, reach, defense}. Returns {events, winner}
export function battle(a, b) {
  const f = [{ ...a, cur: a.hp, side: 'you' }, { ...b, cur: b.hp, side: 'foe' }];
  const aFirst = a.speed !== b.speed ? a.speed > b.speed : a.reach >= b.reach;
  const order = aFirst ? [f[0], f[1]] : [f[1], f[0]];
  const fast = order[0], slow = order[1];
  const double = fast.speed >= 2 * slow.speed;
  const events = []; let fastAttacks = 0, round = 0;
  for (round = 1; round <= 20; round++) {
    for (const att of order) {
      const def = att === order[0] ? order[1] : order[0];
      let hits = 1;
      if (att === fast) { fastAttacks++; if (double && fastAttacks % 3 === 0) hits = 2; }
      for (let h = 0; h < hits; h++) {
        const d = damage(att, def); def.cur = Math.max(0, def.cur - d);
        events.push({ round, attacker: att.side, dmg: d, double: hits === 2, hp: { you: f[0].cur, foe: f[1].cur } });
        if (def.cur === 0) return { events, winner: att.side, reason: 'ko' };
      }
    }
  }
  const pa = f[0].cur / f[0].hp, pb = f[1].cur / f[1].hp;
  return { events, winner: pa >= pb ? 'you' : 'foe', reason: 'rounds' };
}

// ---- v1.1: make drawing matter (explanations) ----
export const STOCK_INFO = {
  Rok: { trait: 'Slow, hits very hard.', tip: 'Be fast and skinny to strike first.' },
  Zipp: { trait: 'Super fast, fragile.', tip: 'Go big and chunky to soak its hits.' },
  Mossle: { trait: 'Good at everything.', tip: 'Use lots of colors and spikes to out-hit it.' },
};
export const RANGES = { hp: [30, 100], power: [3, 10], speed: [1, 10], reach: [1, 10], defense: [1, 10] };
export const STAT_LABEL = { hp: 'HP', power: 'Power', speed: 'Speed', reach: 'Reach', defense: 'Defense' };
export const STAT_DRIVER = { hp: 'big body', power: 'colors + spikes', speed: 'less ink', reach: 'spread wide', defense: 'mirror shape' };
const STAT_WHY = { hp: 'a big, solid body', power: 'lots of colors and spiky edges', speed: 'a light, skinny body', reach: 'a wide, sprawling shape', defense: 'two halves that match' };
export const norm = (k, v) => Math.max(0, Math.min(1, (v - RANGES[k][0]) / (RANGES[k][1] - RANGES[k][0])));

// Preview from one player's own half only, mirrored onto the full grid (never uses partner cells).
export function mirrorHalf(grid, side) {
  const g = emptyGrid();
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE / 2; x++) {
    const src = side === 0 ? x : SIZE - 1 - x;
    g[y][x] = g[y][SIZE - 1 - x] = grid[y][src];
  }
  return g;
}
export function previewStats(grid, side) { return stats(mirrorHalf(grid, side)); }

export function strongest(st) {
  const keys = Object.keys(RANGES);
  let best = keys[0];
  for (const k of keys) if (norm(k, st[k]) > norm(best, st[best])) best = k;
  return best;
}
export function revealLines(st, foe) {
  const k = strongest(st);
  const first = st.speed !== foe.speed ? st.speed > foe.speed : st.reach >= foe.reach;
  const myHit = damage(st, foe), foeHit = damage(foe, st);
  const IS = { Rok: 'is slow but hits very hard', Zipp: 'is super fast but fragile', Mossle: 'is good at everything' };
  let matchup = `${foe.name} ${IS[foe.name] || 'is ready'}: `;
  matchup += first ? 'you strike first' : `${foe.name} strikes first`;
  matchup += `, you hit for ${myHit} and it hits for ${foeHit}.`;
  return { strongest: `Strongest: ${STAT_LABEL[k]}, thanks to ${STAT_WHY[k]}.`, matchup };
}
export function resultLine(st, foe, result) {
  // L-004: explain from the actual battle log, never from a guess.
  const won = result.winner === 'you';
  const firstSide = result.events[0]?.attacker;
  const myHit = damage(st, foe), foeHit = damage(foe, st);
  const winnerFirst = firstSide === result.winner;
  if (result.reason === 'rounds') return won ? 'Time ran out and you had more health left.' : `Time ran out and ${foe.name} had more health left. ${STOCK_INFO[foe.name]?.tip || ''}`.trim();
  if (won) {
    if (winnerFirst) return 'You struck first and never let up.';
    if (myHit > foeHit) return `${foe.name} was faster, but your hits did ${myHit} to its ${foeHit}.`;
    return `${foe.name} hit first, but your big body outlasted it.`;
  }
  const tip = STOCK_INFO[foe.name]?.tip || '';
  if (winnerFirst) return `${foe.name} struck first and never let up. ${tip}`.trim();
  if (foeHit > myHit) return `You were faster, but ${foe.name}'s hits did ${foeHit} to your ${myHit}. ${tip}`.trim();
  return `You hit first, but ${foe.name} outlasted you. ${tip}`.trim();
}
