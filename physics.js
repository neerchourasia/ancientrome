"use strict";
// Terrain height, walkable surfaces (steps, podiums, seats) and solid obstacles.
// Everything is axis-aligned so lookups are cheap. Units are metres.

const BOUNDS = { minX: -780, maxX: 680, minZ: -680, maxZ: 830 };
const PLAYER_R = 0.4;
let lastBlock = null; // the obstacle blockedAt() last reported, so a crash can say what you hit
const MAX_STEP = 0.75; // tallest single step the player can climb

const HILLS = [
  { name: "Palatine", x: 40, z: 260, r: 170, flat: 95, h: 22 },
  { name: "Capitoline", x: -235, z: -50, r: 110, flat: 62, h: 20 },
  { name: "Aventine", x: -450, z: 560, r: 140, flat: 70, h: 26 },
  { name: "Caelian", x: 330, z: 340, r: 125, flat: 60, h: 20 },
  { name: "Quirinal", x: 120, z: -330, r: 130, flat: 60, h: 18 },
];

const smoothstep = (t) => t * t * (3 - 2 * t);

function heightAt(x, z) {
  let h = 0;
  for (const k of HILLS) {
    const d = Math.hypot(x - k.x, z - k.z);
    if (d < k.r) h = Math.max(h, k.h * smoothstep(Math.min(1, (k.r - d) / (k.r - k.flat))));
  }
  return h;
}

// Uniform grid so each lookup only tests nearby items.
class Grid {
  constructor(size) { this.s = size; this.m = new Map(); }
  key(i, j) { return (i + 2048) * 4096 + (j + 2048); }
  add(item, x0, x1, z0, z1) {
    const s = this.s;
    for (let i = Math.floor(x0 / s); i <= Math.floor(x1 / s); i++) {
      for (let j = Math.floor(z0 / s); j <= Math.floor(z1 / s); j++) {
        const k = this.key(i, j);
        let a = this.m.get(k);
        if (!a) this.m.set(k, (a = []));
        a.push(item);
      }
    }
  }
  at(x, z) { return this.m.get(this.key(Math.floor(x / this.s), Math.floor(z / this.s))) || NONE; }
}
const NONE = [];

const platformGrid = new Grid(64);
const blockerGrid = new Grid(64);
const MAP_SHAPES = []; // simple shapes for the map: {k:'r'|'e', ...}

// An elliptical ring (Colosseum, Pantheon wall) with an optional corridor cut through it.
function inCorridor(p, dx, dz) {
  if (p.gap <= 0) return false;
  if (p.axis === "x") return Math.abs(dz) < p.gap && (p.side === 0 || Math.sign(dx) === p.side);
  return Math.abs(dx) < p.gap && (p.side === 0 || Math.sign(dz) === p.side);
}

function addPlatformBox(x0, x1, z0, z1, top) {
  platformGrid.add({ t: 0, x0, x1, z0, z1, top }, x0, x1, z0, z1);
}
function addPlatformCircle(cx, cz, r, top) {
  platformGrid.add({ t: 1, cx, cz, r2: r * r, top }, cx - r, cx + r, cz - r, cz + r);
}
function addPlatformRing(p) {
  platformGrid.add({ t: 2, gap: 0, axis: "x", side: 0, ...p }, p.cx - p.ax, p.cx + p.ax, p.cz - p.az, p.cz + p.az);
}
// Obstacles can belong to one era only (`extra.era` = "ancient" or "modern"), or be switched off (`off`), so the
// Ancient / Modern Rome switch can change what blocks you. The item is returned so it can be changed later.
let modernEra = false;
// Movable obstacles (like your parked car): circles that can be switched on and moved. Checked in blockedAt().
const dynBlockers = [];
const setPhysicsEra = (m) => { modernEra = !!m; };
function addBlockerBox(x0, x1, z0, z1, y0, y1, extra) {
  const item = { t: 0, x0, x1, z0, z1, y0, y1, ...extra };
  blockerGrid.add(item, x0, x1, z0, z1);
  return item;
}
function addBlockerCircle(cx, cz, r, y0, y1, extra) {
  const item = { t: 1, cx, cz, r, y0, y1, ...extra };
  blockerGrid.add(item, cx - r, cx + r, cz - r, cz + r);
  return item;
}
function addBlockerRing(p) {
  const item = { t: 2, gap: 0, axis: "x", side: 0, ...p };
  blockerGrid.add(item, p.cx - p.ax, p.cx + p.ax, p.cz - p.az, p.cz + p.az);
  return item;
}

// Height of the walkable surface at (x, z).
function groundAt(x, z) {
  let h = heightAt(x, z);
  const list = platformGrid.at(x, z);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.top <= h) continue;
    if (p.t === 0) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) h = p.top;
    } else if (p.t === 1) {
      const dx = x - p.cx, dz = z - p.cz;
      if (dx * dx + dz * dz <= p.r2) h = p.top;
    } else {
      const dx = x - p.cx, dz = z - p.cz;
      const u = Math.hypot(dx / p.ax, dz / p.az);
      if (u >= p.u0 && u <= p.u1 && !inCorridor(p, dx, dz)) h = p.top;
    }
  }
  return h;
}

function blockedAt(x, z, feet) {
  for (let i = 0; i < dynBlockers.length; i++) {
    const d = dynBlockers[i];
    if (d.on && feet < d.y1 - 0.9 && Math.hypot(x - d.x, z - d.z) < d.r + PLAYER_R) { lastBlock = d; return true; }
  }
  const list = blockerGrid.at(x, z);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.off || (b.era && (b.era === "modern") !== modernEra)) continue;
    if (!(feet + 1.2 > b.y0 && feet < b.y1 - 0.9)) continue;
    if (b.t === 0) {
      if (x > b.x0 - PLAYER_R && x < b.x1 + PLAYER_R && z > b.z0 - PLAYER_R && z < b.z1 + PLAYER_R) { lastBlock = b; return true; }
    } else if (b.t === 1) {
      if (Math.hypot(x - b.cx, z - b.cz) < b.r + PLAYER_R) { lastBlock = b; return true; }
    } else {
      const dx = x - b.cx, dz = z - b.cz;
      if (b.zs && Math.sign(dz) !== b.zs) continue; // only the north (-1) or south (+1) half of the ring
      const u = Math.hypot(dx / b.ax, dz / b.az);
      if (u >= b.u0 && u <= b.u1 && !inCorridor(b, dx, dz)) { lastBlock = b; return true; }
    }
  }
  return false;
}

// Can someone standing at (fx, fz) step to (tx, tz)?
function canMove(fx, fz, tx, tz) {
  if (tx < BOUNDS.minX || tx > BOUNDS.maxX || tz < BOUNDS.minZ || tz > BOUNDS.maxZ) return false;
  const feet = groundAt(fx, fz);
  if (groundAt(tx, tz) - feet > MAX_STEP) return false;
  return !blockedAt(tx, tz, feet);
}
