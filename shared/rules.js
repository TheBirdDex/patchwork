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
