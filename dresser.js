"use strict";
// The dresser in every house: a wooden chest of drawers with a mirror. Stand in front of it and press F to see the things you own
// that you can wear, and put them on or take them off. You cannot buy anything here (the clothier in the market square sells them).
// home.js (Rome) and delhi.js (Old Delhi) build the dresser from the parts below. Depends on market.js and game.js at run time.

const Dresser = (() => {
  const sites = [];                   // { city, x, z, facing, here: () => bool }
  const W = 1.9, D = 0.9;             // across the front, depth

  // local coordinates (lx across, lz towards the front) into the world; facing is the way the front looks (n, s, w, e)
  function toWorld(cx, cz, facing, lx, lz) {
    switch (facing) {
      case "n": return [cx + lx, cz - lz];
      case "s": return [cx - lx, cz + lz];
      case "w": return [cx - lz, cz + lx];
      default: return [cx + lz, cz - lx];
    }
  }

  // boxes { x, y0, z, w, h, d, mat, solid } in world coordinates; y0 is relative to the floor
  function parts(cx, cz, facing) {
    const across = facing === "n" || facing === "s", out = [];
    const add = (lx, y0, lz, w, h, d, mat, solid) => { const [x, z] = toWorld(cx, cz, facing, lx, lz); out.push({ x, y0, z, w: across ? w : d, h, d: across ? d : w, mat, solid }); };
    add(0, 0, 0, W, 1.15, D, "wood", true);                          // the chest of drawers
    add(0, 1.15, 0, W + 0.1, 0.08, D + 0.1, "top", false);
    for (const s of [-0.45, 0.45]) add(s, 0.55, D / 2 + 0.01, 0.8, 0.45, 0.04, "drawer", false); // drawer fronts
    for (const s of [-0.45, 0.45]) add(s, 0.9, D / 2 + 0.01, 0.8, 0.18, 0.04, "drawer", false);
    add(0, 1.3, -D / 2 + 0.1, 1.3, 1.1, 0.06, "mirror", false);      // a mirror standing on top, against the wall
    add(0, 1.2, -D / 2 + 0.07, 1.46, 1.3, 0.04, "frame", false);
    return out;
  }

  const here = (s) => typeof city !== "undefined" && s.city === city && s.here();
  function at(x, z, feet = 0) {
    if (feet > 3) return null;
    for (const s of sites) {
      if (!here(s)) continue;
      const [fx, fz] = toWorld(s.x, s.z, s.facing, 0, D / 2 + 1.0);
      if (Math.hypot(x - fx, z - fz) < 1.7) return s;
    }
    return null;
  }

  return {
    parts, at,
    register(city, x, z, facing, here) { sites.push({ city, x, z, facing, here }); },
    open() { if (!at(player.x, player.z, player.feet)) return false; Market.open("dresser"); return true; },
  };
})();
