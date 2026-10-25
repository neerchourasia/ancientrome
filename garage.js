"use strict";
// Garages. Every house except the small one you start with has a garage beside it. Stand at the open front and press F to open
// it: it lists the cars, rickshaws, carts and elephants you own, and lets you take one out or park it away again. Whatever you
// own (and have not taken out) stands inside. The walls are built by home.js (Rome) and delhi.js (Old Delhi) from the parts below.
// Depends on car.js, market.js and game.js at run time.

const Garage = (() => {
  const W = 11, D = 8, H = 3.6;        // across the front, depth, wall height (metres)
  const sites = [];                    // { city, x, z, facing, tier: () => n, group, shown }
  const DIR = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  const YAW = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // the way a parked car faces (out of the garage)

  // local garage coordinates (lx across, lz towards the open front) into the world
  function toWorld(cx, cz, facing, lx, lz) {
    switch (facing) {
      case "n": return [cx + lx, cz - lz];
      case "s": return [cx - lx, cz + lz];
      case "w": return [cx - lz, cz + lx];
      default: return [cx + lz, cz - lx];
    }
  }

  // The boxes of the garage: { x, y0, z, w, h, d, mat, solid } in world coordinates (x, z are centres).
  // mat is "wall", "roof", "dark" (the shutter and floor) or "door".
  function parts(cx, cz, facing) {
    const across = facing === "n" || facing === "s";
    const out = [];
    const add = (lx, y0, lz, w, h, d, mat, solid) => {
      const [x, z] = toWorld(cx, cz, facing, lx, lz);
      out.push({ x, y0, z, w: across ? w : d, h, d: across ? d : w, mat, solid });
    };
    add(0, 0, -D / 2 + 0.25, W, H, 0.5, "wall", true);                  // back wall
    for (const s of [-1, 1]) add(s * (W / 2 - 0.25), 0, 0, 0.5, H, D, "wall", true); // side walls
    add(0, H, 0, W + 0.8, 0.4, D + 0.8, "roof", false);
    add(0, 2.9, D / 2 - 0.25, W, 0.7, 0.5, "wall", false);              // the header over the opening
    add(0, 2.3, D / 2 - 0.1, W - 1.6, 0.55, 0.2, "door", false);       // the shutter, rolled up
    add(0, 0.02, 0, W - 1, 0.06, D - 1, "dark", false);                 // the floor
    return out;
  }

  // The vehicles you own and have not taken out, for the era you are in (at most two fit)
  function stored() {
    if (typeof Market === "undefined" || typeof Car === "undefined") return [];
    return Object.keys(Market.ITEMS).filter((id) => {
      const it = Market.ITEMS[id], M = Car.MODELS[id];
      return (it.type === "car" || it.type === "mount") && M && !(M.fly && id !== "plane") && Market.owns(id) && (M.era || "modern") === era && Car.current !== id;
    }).slice(0, 2);
  }

  const mine = (s) => typeof city !== "undefined" && s.city === city;
  let sig = "", t = 0;

  function refresh() {
    const list = stored(), key = list.join(",") + "|" + era;
    for (const s of sites) {
      const on = s.tier() >= 1;
      if (key !== sig || s.shown !== on) {
        s.shown = on;
        if (s.group) { s.parent.remove(s.group); s.group = null; }
        if (on && list.length) {
          s.group = new THREE.Group();
          list.forEach((id, i) => {
            const [x, z] = toWorld(s.x, s.z, s.facing, i === 0 ? -2.6 : 2.6, -0.4);
            const m = Car.model(id);
            m.position.set(x, 0, z); m.rotation.y = YAW[s.facing];
            s.group.add(m);
          });
          s.parent.add(s.group);
        }
      }
    }
    sig = key;
  }

  // the garage whose open front you are standing at (in this city, and only once you own a house with one)
  function at(x, z, feet = 0) {
    if (feet > 3) return null;
    for (const s of sites) {
      if (!mine(s) || s.tier() < 1) continue;
      const [fx, fz] = toWorld(s.x, s.z, s.facing, 0, D / 2 + 3);
      if (Math.hypot(x - fx, z - fz) < 4.2) return s;
    }
    return null;
  }

  return {
    parts, W, D, H,
    // parent: where the vehicles are shown; (x, z) world centre; tier(): your house tier in that city
    register(city, parent, x, z, facing, tier) { sites.push({ city, parent, x, z, facing, tier, group: null, shown: null }); },
    at, refresh, stored,
    any: () => sites.some((s) => mine(s) && s.tier() >= 1), // you have a garage in this city
    update(dt) { t -= dt; if (t <= 0) { t = 0.7; refresh(); } },
    open() { if (!at(player.x, player.z, player.feet)) return false; Market.open("garage"); return true; },
  };
})();
