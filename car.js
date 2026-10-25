"use strict";
// Cars, rickshaws, bullock carts and elephants: buy one in the Market, take it out, get on (X) and ride anywhere the streets and squares allow.
// The car follows the same obstacle rules as you do (walls, parked cars, lamp posts, trees), crashes cost you health,
// pedestrians you hit are knocked over, and the moving traffic brakes for you. Cars and rickshaws exist only in the modern cities; carts and elephants only in the ancient ones.
// Depends on game.js, physics.js, modern.js and audio.js at run time.

const Car = (() => {
  // max: top speed (m/s); accel: how quickly it gets there; turn: how sharply it steers
  const MODELS = {
    scooter: { name: "Vespa scooter", max: 15, accel: 9, turn: 2.7, color: 0xd9c24a, len: 1.9, wid: 0.7 },
    citycar: { name: "City car", max: 24, accel: 10, turn: 2.1, color: 0x3a6fb5, len: 3.8, wid: 1.8 },
    sportscar: { name: "Sports car", max: 36, accel: 16, turn: 1.9, color: 0xc0262b, len: 4.4, wid: 1.9 },
    rickshaw: { name: "Cycle rickshaw", max: 7, accel: 4.5, turn: 2.4, color: 0x2f8f4a, len: 2.6, wid: 1.2, motor: false },
    oxcart: { name: "Bullock cart", max: 5, accel: 2.2, turn: 1.6, color: 0x6b4a2b, len: 4.6, wid: 1.6, era: "ancient", motor: false, verb: "climb on" },
    bicycle: { name: "Bicycle", max: 7.5, accel: 3.6, turn: 2.6, color: 0x2f8f4a, len: 1.8, wid: 0.5, motor: false },
    motorcycle: { name: "Motorcycle", max: 34, accel: 14, turn: 2.4, color: 0x222a33, len: 2.1, wid: 0.8 },
    suv: { name: "SUV", max: 28, accel: 11, turn: 1.9, color: 0x3a5a3a, len: 4.8, wid: 2.0 },
    taxi: { name: "Taxi", max: 25, accel: 10, turn: 2.0, color: 0xf2c21b, len: 4.2, wid: 1.8 },
    truck: { name: "Delivery truck", max: 20, accel: 7, turn: 1.5, color: 0xe8e8e8, len: 6.4, wid: 2.2 },
    plane: { name: "Light plane", max: 62, accel: 7, turn: 1.2, color: 0xf2f2f4, len: 7.2, wid: 2.4, fly: true, verb: "climb in" },   // flies (see flyUpdate); wings are wider than the hull, which is what hits things
    bus: { name: "Bus", max: 17, accel: 5.5, turn: 1.25, color: 0xd9411f, len: 9.0, wid: 2.5 },
    chariot: { name: "Chariot", max: 21, accel: 9, turn: 1.9, color: 0xb3262b, len: 3.6, wid: 1.4, era: "ancient", motor: false, camH: 2.4, verb: "climb on" },
    horse: { name: "Horse", max: 18, accel: 9, turn: 2.2, color: 0x7a4a2a, len: 2.8, wid: 1.0, era: "ancient", motor: false, camH: 2.5, verb: "climb on" },
    camel: { name: "Camel", max: 11, accel: 5, turn: 1.8, color: 0xc9a46a, len: 3.4, wid: 1.2, era: "ancient", motor: false, camH: 3.3, verb: "climb on" },
    donkey: { name: "Donkey", max: 8, accel: 4.5, turn: 2.3, color: 0x8a8580, len: 2.1, wid: 0.9, era: "ancient", motor: false, camH: 2.0, verb: "climb on" },
    elephant: { name: "Elephant", max: 14, accel: 6, turn: 1.5, color: 0x9c9a95, len: 4.8, wid: 2.2, era: "ancient", motor: false, camH: 2.6, verb: "climb on" },
  };
  const eraOf = (M) => M.era || "modern"; // cars and rickshaws exist today; carts and elephants in the ancient cities

  let car = null, driving = false, camYaw = 0, bumpCd = 0, runCd = 0, stuckT = 0, phase = 0;
  const circles = [0, 1, 2].map(() => ({ x: 0, z: 0, r: 1.0, y1: 1.6, t: 1, mine: true, era: "modern", on: false }));
  for (const c of circles) dynBlockers.push(c);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const wheel = (r, w, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), lam(0x1a1a1a)); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m; };

  // A leg that swings from the hip: a pivot group with a box hanging below it.
  const leg = (w, len, mat, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); const b = box(w, len, w, mat, 0, -len / 2, 0); p.add(b); return p; };

  // Faces -z (like the people), so its yaw works like yours.
  function build(id) {
    const M = MODELS[id], g = new THREE.Group(), body = lam(M.color), glass = lam(0x1d2a33), wheels = [], legs = [];
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), tail = new THREE.MeshBasicMaterial({ color: 0xc01818 });
    if (id === "scooter") {
      g.add(box(0.34, 0.4, 1.3, body, 0, 0.55, 0.1), box(0.3, 0.1, 0.55, lam(0x2b2b2b), 0, 0.82, 0.3), box(0.9, 0.06, 0.06, lam(0x2b2b2b), 0, 1.1, -0.55), box(0.06, 0.55, 0.06, lam(0x2b2b2b), 0, 0.82, -0.55));
      g.add(box(0.1, 0.1, 0.06, lamp, 0, 0.95, -0.7));
      for (const z of [-0.65, 0.7]) { const w = wheel(0.3, 0.12, 0, 0.3, z); g.add(w); wheels.push(w); }
    } else if (id === "rickshaw") { // a bicycle in front, a seat and a coloured canopy behind
      const dark = lam(0x2b2b2b), cloth = lam(0xe8c13a);
      g.add(box(0.12, 0.12, 1.4, dark, 0, 0.7, -0.7), box(0.7, 0.06, 0.06, dark, 0, 1.1, -1.3), box(0.3, 0.1, 0.4, dark, 0, 0.95, -0.5));
      g.add(box(1.0, 0.18, 1.2, body, 0, 0.55, 0.6), box(0.95, 0.5, 0.2, body, 0, 0.9, 1.1), box(0.8, 0.12, 0.7, lam(0x7a3a2a), 0, 0.72, 0.65));
      for (const sx of [-1, 1]) for (const z of [0.1, 1.1]) g.add(box(0.06, 1.1, 0.06, dark, sx * 0.5, 1.15, z));
      g.add(box(1.25, 0.1, 1.5, cloth, 0, 1.75, 0.6));
      for (const [x, z, r] of [[0, -1.3, 0.34], [-0.58, 0.7, 0.3], [0.58, 0.7, 0.3]]) { const w = wheel(r, 0.08, x, r, z); g.add(w); wheels.push(w); }
    } else if (id === "oxcart") { // a wooden cart with big wheels, pulled by an ox
      const wood = lam(0x6b4a2b), wd = lam(0x4a3320), ox = lam(0xe8e0d0), horn = lam(0x2b2b2b);
      g.add(box(1.5, 0.15, 2.6, wood, 0, 1.0, 1.0), box(0.1, 0.5, 2.6, wood, -0.75, 1.3, 1.0), box(0.1, 0.5, 2.6, wood, 0.75, 1.3, 1.0), box(1.5, 0.5, 0.1, wood, 0, 1.3, 2.3));
      g.add(box(0.5, 0.9, 0.5, lam(0xd9a13a), 0, 1.6, 1.3)); // a bale of cloth
      g.add(box(0.1, 0.1, 2.2, wd, 0, 0.8, -1.4)); // the pole to the ox
      for (const sx of [-1, 1]) { const w = wheel(0.8, 0.1, sx * 0.9, 0.8, 1.0); g.add(w); wheels.push(w); }
      g.add(box(0.8, 0.85, 1.6, ox, 0, 1.2, -2.3), box(0.55, 0.55, 0.7, ox, 0, 1.45, -3.3), box(0.9, 0.08, 0.1, horn, 0, 1.8, -3.2));
      for (const [x, z] of [[-0.28, -1.7], [0.28, -1.7], [-0.28, -2.9], [0.28, -2.9]]) { const l = leg(0.2, 0.85, ox, x, 0.85, z); g.add(l); legs.push(l); }
    } else if (id === "bicycle") { // two thin wheels, a frame, a seat and handlebars
      const dark = lam(0x2b2b2b);
      g.add(box(0.05, 0.05, 1.0, body, 0, 0.62, 0), box(0.05, 0.5, 0.05, body, 0, 0.55, 0.4), box(0.05, 0.5, 0.05, body, 0, 0.55, -0.45), box(0.22, 0.06, 0.4, dark, 0, 0.95, 0.4), box(0.7, 0.05, 0.05, dark, 0, 1.05, -0.5));
      for (const z of [-0.65, 0.65]) { const w = wheel(0.34, 0.05, 0, 0.34, z); g.add(w); wheels.push(w); }
    } else if (id === "motorcycle") { // a tank, a seat, handlebars and two bigger wheels
      const dark = lam(0x2b2b2b), chrome = lam(0xb0b4ba);
      g.add(box(0.36, 0.38, 0.9, body, 0, 0.7, -0.1), box(0.3, 0.12, 0.8, dark, 0, 0.95, 0.5), box(0.8, 0.06, 0.06, dark, 0, 1.18, -0.6), box(0.08, 0.6, 0.08, chrome, 0, 0.8, -0.65), box(0.2, 0.3, 0.5, dark, 0, 0.4, 0.3));
      g.add(box(0.12, 0.12, 0.06, lamp, 0, 1.0, -0.78), box(0.18, 0.06, 0.18, tail, 0, 0.95, 1.0));
      for (const z of [-0.8, 0.85]) { const w = wheel(0.36, 0.14, 0, 0.36, z); g.add(w); wheels.push(w); }
    } else if (id === "suv" || id === "taxi") { // a tall boxy body with a roof (and a lit sign on a taxi)
      const L = M.len, W = M.wid, tall = id === "suv";
      g.add(box(W, tall ? 0.95 : 0.7, L, body, 0, tall ? 0.85 : 0.65, 0));
      g.add(box(W * 0.86, tall ? 0.7 : 0.55, L * (tall ? 0.62 : 0.5), glass, 0, tall ? 1.55 : 1.15, L * 0.06));
      g.add(box(W * 0.9, 0.1, 0.1, lamp, 0, 0.7, -L / 2 - 0.02), box(W * 0.9, 0.1, 0.1, tail, 0, 0.7, L / 2 + 0.02));
      if (tall) g.add(box(W * 0.8, 0.06, L * 0.4, lam(0x2b2b2b), 0, 1.95, L * 0.05)); else { g.add(box(0.7, 0.22, 0.3, lam(0xfff1b0), 0, 1.5, L * 0.05)); g.add(box(W, 0.1, 0.5, lam(0x1a1a1a), 0, 0.8, 0)); }
      for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.32]) { const w = wheel(tall ? 0.42 : 0.34, 0.24, sx * (W / 2), tall ? 0.42 : 0.34, z); g.add(w); wheels.push(w); }
    } else if (id === "truck") { // a small cab at the front and a big white box behind
      const L = M.len, W = M.wid;
      g.add(box(W, 1.0, 1.7, body, 0, 1.05, -L / 2 + 0.9), box(W * 0.86, 0.6, 1.0, glass, 0, 1.55, -L / 2 + 0.6), box(W, 0.4, L - 1.9, lam(0x3a3a3a), 0, 0.55, 0.9));
      g.add(box(W * 0.98, 2.3, L - 2.0, lam(0xf0efe8), 0, 2.0, 0.95), box(W * 0.9, 0.5, 0.06, body, 0.0, 2.4, L / 2 + 0.05));
      g.add(box(W * 0.9, 0.1, 0.1, lamp, 0, 0.7, -L / 2 - 0.02), box(W * 0.9, 0.1, 0.1, tail, 0, 0.7, L / 2 + 0.02));
      for (const sx of [-1, 1]) for (const z of [-L * 0.34, L * 0.28, L * 0.4]) { const w = wheel(0.5, 0.26, sx * (W / 2), 0.5, z); g.add(w); wheels.push(w); }
    } else if (id === "bus") { // long and tall, with a band of windows down both sides
      const L = M.len, W = M.wid;
      g.add(box(W, 2.2, L, body, 0, 1.6, 0), box(W * 1.02, 0.8, L * 0.9, glass, 0, 2.0, 0), box(W * 0.9, 0.5, 0.06, lam(0xfff1b0), 0, 2.4, -L / 2 - 0.04), box(W * 0.98, 0.08, L, lam(0xeeeeee), 0, 2.75, 0));
      g.add(box(W * 0.9, 0.1, 0.1, lamp, 0, 0.8, -L / 2 - 0.02), box(W * 0.9, 0.1, 0.1, tail, 0, 0.8, L / 2 + 0.02));
      for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.3]) { const w = wheel(0.55, 0.3, sx * (W / 2), 0.55, z); g.add(w); wheels.push(w); }
    } else if (id === "chariot") { // a light two-wheeled chariot with a horse in front
      const wood = lam(0x6b4a2b), gold = lam(0xd9a928), fur = lam(0x8a5a2b), dark = lam(0x241810);
      g.add(box(1.1, 0.12, 1.2, body, 0, 0.85, 0.7), box(1.1, 0.5, 0.08, body, 0, 1.15, 0.12), box(0.08, 0.5, 1.2, body, -0.55, 1.15, 0.7), box(0.08, 0.5, 1.2, body, 0.55, 1.15, 0.7), box(1.12, 0.06, 0.1, gold, 0, 1.42, 0.12));
      g.add(box(0.1, 0.1, 2.2, wood, 0, 0.85, -1.2));
      for (const sx of [-1, 1]) { const w = wheel(0.6, 0.1, sx * 0.66, 0.6, 0.7); g.add(w); wheels.push(w); }
      g.add(box(0.6, 0.7, 1.4, fur, 0, 1.3, -2.1), box(0.25, 0.7, 0.3, fur, 0, 1.75, -2.85), box(0.25, 0.3, 0.55, fur, 0, 2.05, -3.15), box(0.08, 0.5, 0.1, dark, 0, 1.9, -2.7), box(0.1, 0.6, 0.1, dark, 0, 1.2, -1.35));
      for (const [x, z] of [[-0.2, -2.6], [0.2, -2.6], [-0.2, -1.6], [0.2, -1.6]]) { const l = leg(0.14, 1.0, fur, x, 1.0, z); g.add(l); legs.push(l); }
    } else if (id === "horse" || id === "donkey" || id === "camel") { // animals to ride: a body, a neck and head, a tail, four legs and a saddle
      const fur = lam(M.color), dark = lam(id === "horse" ? 0x241810 : id === "camel" ? 0x8a6a3a : 0x5a5650), cloth = lam(id === "camel" ? 0xb3262b : 0x2f6b8f), gold = lam(0xd9a928);
      const big = id === "camel" ? 1.25 : id === "horse" ? 1 : 0.78, bodyY = (id === "camel" ? 1.85 : id === "horse" ? 1.45 : 1.05), legL = bodyY - 0.2, bl = M.len * 0.62;
      g.add(box(0.75 * big, 0.8 * big, bl, fur, 0, bodyY, 0.1));
      const neckH = id === "camel" ? 1.4 : 0.9;
      const neck = box(0.3 * big, neckH, 0.35 * big, fur, 0, bodyY + neckH / 2 - 0.05, -bl / 2 - 0.1); neck.rotation.x = id === "camel" ? 0.15 : 0.45; g.add(neck);
      g.add(box(0.32 * big, 0.36 * big, 0.75 * big, fur, 0, bodyY + neckH + 0.05, -bl / 2 - (id === "camel" ? 0.55 : 0.75)));
      g.add(box(0.1, id === "donkey" ? 0.5 : 0.2, 0.08, fur, 0.1 * big, bodyY + neckH + 0.4, -bl / 2 - 0.3), box(0.1, id === "donkey" ? 0.5 : 0.2, 0.08, fur, -0.1 * big, bodyY + neckH + 0.4, -bl / 2 - 0.3));
      if (id === "horse") g.add(box(0.1, 0.8, 0.14, dark, 0, bodyY + 0.9, -bl / 2 - 0.18)); // the mane
      if (id === "camel") { g.add(box(0.5, 0.55, 0.5, fur, 0, bodyY + 0.65, -0.35), box(0.5, 0.55, 0.5, fur, 0, bodyY + 0.65, 0.55)); }   // two humps
      const tl = box(0.12, 0.7, 0.12, dark, 0, bodyY - 0.1, bl / 2 + 0.2); tl.rotation.x = -0.3; g.add(tl);
      g.add(box(0.85 * big, 0.08, 0.9, cloth, 0, bodyY + (id === "camel" ? 1.0 : 0.42), id === "camel" ? 0.1 : 0.1), box(0.9 * big, 0.04, 0.95, gold, 0, bodyY + (id === "camel" ? 0.97 : 0.38), 0.1));
      g.add(box(0.5, 0.18, 0.6, lam(0x5a3a22), 0, bodyY + (id === "camel" ? 1.12 : 0.55), 0.1));                   // the saddle
      for (const [x, z] of [[-0.25, -bl * 0.35], [0.25, -bl * 0.35], [-0.25, bl * 0.45], [0.25, bl * 0.45]]) { const l = leg(0.16 * big, legL, id === "horse" ? fur : fur, x * big, legL, z); g.add(l); legs.push(l); }
    } else if (id === "elephant") { // a tall grey elephant with a red howdah
      const gr = lam(0x9c9a95), red = lam(0xa8282b), gold = lam(0xd9a928), ivory = lam(0xf1ead8);
      g.add(box(2.2, 2.1, 3.6, gr, 0, 3.0, 0.2), box(1.5, 1.6, 1.5, gr, 0, 3.3, -2.3));
      g.add(box(0.6, 1.9, 0.7, gr, 0, 2.3, -3.2), box(0.5, 0.7, 0.7, gr, 0, 1.4, -3.45));
      g.add(box(0.15, 1.3, 1.0, gr, 0.85, 3.4, -2.0), box(0.15, 1.3, 1.0, gr, -0.85, 3.4, -2.0));
      g.add(box(0.15, 0.15, 1.5, ivory, 0.5, 2.6, -3.2), box(0.15, 0.15, 1.5, ivory, -0.5, 2.6, -3.2));
      g.add(box(0.2, 1.2, 0.2, gr, 0, 2.3, 2.1));
      for (const [x, z] of [[-0.75, -1.2], [0.75, -1.2], [-0.75, 1.5], [0.75, 1.5]]) { const l = leg(0.7, 2.0, gr, x, 2.0, z); g.add(l); legs.push(l); }
      g.add(box(2.4, 0.12, 2.8, red, 0, 4.1, 0.2), box(2.5, 0.06, 2.9, gold, 0, 4.0, 0.2)); // the cloth on its back
      g.add(box(1.5, 0.15, 1.7, lam(0x7a3a2a), 0, 4.25, 0.2));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.1, 1.5, 0.1, gold, sx * 0.7, 5.0, 0.2 + sz * 0.75));
      g.add(box(1.7, 0.1, 1.9, red, 0, 5.8, 0.2));
    } else if (id === "plane") {                       // a small propeller plane: a fuselage, high wings, a tail, three wheels and a propeller
      const white = lam(0xf2f2f4), red = lam(0xc0262b), dk = lam(0x2b2b2b);
      g.add(box(1.3, 1.2, 5.2, white, 0, 1.3, 0.3), box(1.34, 0.28, 5.24, red, 0, 1.12, 0.3));          // the body and a red stripe
      g.add(box(1.1, 0.9, 1.2, dk, 0, 1.3, -2.8), box(1.0, 0.7, 1.4, white, 0, 1.55, -0.9));              // the engine and the cockpit
      g.add(box(1.0, 0.6, 1.1, lam(0x1d3a4a), 0, 1.85, -0.9));                                           // the canopy
      g.add(box(11, 0.16, 1.8, white, 0, 2.4, -0.7), box(11.04, 0.18, 0.4, red, 0, 2.4, -1.4));           // the wing and its red front edge
      g.add(box(0.12, 1.3, 1.1, white, 0, 2.2, 3.2), box(3.6, 0.12, 1.0, white, 0, 1.55, 3.2));          // the tail fin and the tailplane
      for (const sx of [-1, 1]) g.add(box(0.1, 1.3, 0.1, dk, sx * 1.6, 1.8, -0.7));                       // the wing struts
      g.add(box(0.1, 0.9, 0.1, dk, 0, 0.55, -1.8), box(0.1, 0.8, 0.1, dk, -0.8, 0.55, 0.6), box(0.1, 0.8, 0.1, dk, 0.8, 0.55, 0.6));
      for (const [x, z, r] of [[0, -1.8, 0.28], [-0.8, 0.6, 0.3], [0.8, 0.6, 0.3]]) { const w = wheel(r, 0.14, x, r, z); g.add(w); wheels.push(w); }
      const prop = new THREE.Group(); prop.position.set(0, 1.3, -3.45); prop.add(box(0.18, 2.5, 0.08, dk, 0, 0, 0), box(2.5, 0.18, 0.08, dk, 0, 0, 0.01)); g.add(prop); g.userData.prop = prop;
    } else {
      const L = M.len, W = M.wid, low = id === "sportscar";
      g.add(box(W, low ? 0.5 : 0.65, L, body, 0, low ? 0.5 : 0.6, 0));
      g.add(box(W * 0.84, low ? 0.4 : 0.55, L * (low ? 0.42 : 0.5), glass, 0, low ? 0.92 : 1.12, L * 0.05));
      g.add(box(W * 0.9, 0.1, 0.1, lamp, 0, 0.6, -L / 2 - 0.02), box(W * 0.9, 0.1, 0.1, tail, 0, 0.6, L / 2 + 0.02));
      if (low) g.add(box(W * 0.9, 0.06, 0.4, body, 0, 0.95, L / 2 - 0.2), box(0.08, 0.2, 0.08, body, W * 0.3, 0.8, L / 2 - 0.2), box(0.08, 0.2, 0.08, body, -W * 0.3, 0.8, L / 2 - 0.2)); // spoiler
      for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.32]) { const w = wheel(0.34, 0.2, sx * (W / 2), 0.34, z); g.add(w); wheels.push(w); }
    }
    return { g, wheels, legs };
  }

  function placeCircles(on) {
    if (!car) { for (const c of circles) c.on = false; return; }
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), h = car.M.len * 0.3;
    circles.forEach((c, i) => { const k = i - 1; c.x = car.x + fx * k * h; c.z = car.z + fz * k * h; c.r = Math.max(0.6, car.M.wid * 0.55); c.on = on; });
  }

  const freeSpot = (x, z) => !blockedAt(x, z, groundAt(x, z)) && canMove(x, z, x + 0.01, z);

  // Take the car out of the garage and park it in front of you
  function deploy(id) {
    if (!MODELS[id]) return;
    if (eraOf(MODELS[id]) !== era) { toast(eraOf(MODELS[id]) === "modern" ? "Cars and rickshaws only exist in the modern cities. Press K to go there." : "Carts and elephants only live in the ancient cities. Press K to go there."); return; }
    stow();
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx;
    let spot = null;
    for (const [f, r] of [[4, 2.6], [4, -2.6], [5.5, 0], [3, 3.6], [3, -3.6], [-4, 3], [7, 3], [0, 5]]) {
      const x = player.x + fx * f + rx * r, z = player.z + fz * f + rz * r;
      if (freeSpot(x, z) && freeSpot(x + fx * 2, z + fz * 2) && freeSpot(x - fx * 2, z - fz * 2)) { spot = [x, z]; break; }
    }
    if (!spot) { toast("There is no room to park here. Find an open street."); return; }
    const m = build(id);
    car = { id, M: MODELS[id], x: spot[0], z: spot[1], yaw: player.yaw, v: 0, ...m, y: groundAt(spot[0], spot[1]), alt: 0, vy: 0, pitch: 0, roll: 0, throttle: 0 };
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.y = car.yaw;
    scene.add(car.g);
    placeCircles(true);
    toast(`${car.M.name}: walk up to it and press X to ${car.M.verb || "get in"}.`);
    Sfx.play("coin");
  }

  function stow() {
    if (driving) exit(true);
    if (car) { scene.remove(car.g); car = null; }
    placeCircles(false);
  }

  const nearby = () => !!car && !driving && mode === "walk" && Math.hypot(player.x - car.x, player.z - car.z) < 7;

  function enter() {
    if (!nearby() || eraOf(car.M) !== era) return;
    driving = true; mode = "drive";
    placeCircles(false);
    camYaw = car.yaw;
    player.vx = player.vz = 0; Vitals.stopRest();
    $("#drive-hud").classList.add("show");
    $("#drive-alt").textContent = "";
    $("#drive-keys").innerHTML = car.M.fly ? "<kbd>W</kbd> power up · <kbd>S</kbd> power down / brake · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> climb · <kbd>Shift</kbd> dive · <kbd>F</kbd> fly on at the edge of the city · <kbd>X</kbd> get out (on the ground)" : "<kbd>W</kbd> gas · <kbd>S</kbd> brake · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> handbrake · <kbd>X</kbd> or <kbd>Esc</kbd> get out";
    if (car.M.fly) { toast("Plane: W for power, and above about 100 km/h hold Space to take off. Shift dives. Land gently on a long street or a square, and press X to get out."); return; }
    toast(car.M.motor === false ? "W go · S stop and back up · A D steer · Space halt · Esc to get off" : "W gas · S brake and reverse · A D steer · Space handbrake · Esc to get out");
  }

  function exit(silent) {
    if (!driving) return;
    if (car.M.fly && car.alt > 1.5) {                                                                // you cannot step out of a plane in the air (unless you are forced to)
      if (!silent) { toast("Land first! Slow down and come down gently on a street or a square."); return; }
      car.alt = 0; car.vy = 0; car.y = groundAt(car.x, car.z); car.g.position.y = car.y;
    }
    if (car.M.fly) { car.g.rotation.set(0, car.yaw, 0); car.throttle = 0; car.roll = car.pitch = 0; flyOnReady = false; $("#drive-alt").textContent = ""; }
    driving = false; car.v = 0;
    mode = "walk";
    $("#drive-hud").classList.remove("show");
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx;
    let spot = [car.x, car.z];
    for (const side of [2.6, -2.6, 3.4, -3.4]) {
      const x = car.x + rx * side, z = car.z + rz * side;
      if (freeSpot(x, z)) { spot = [x, z]; break; }
    }
    player.x = spot[0]; player.z = spot[1]; player.feet = groundAt(spot[0], spot[1]); player.vx = player.vz = 0;
    player.yaw = car.yaw; player.pitch = -0.05;
    placeCircles(true);
    if (!silent) toast(`You got off. Your ${car.M.name.toLowerCase()} stays parked here.`);
  }

  function toggleEnter() { if (driving) exit(); else if (nearby()) enter(); else if (car && eraOf(car.M) === era) toast(`Walk up to your ${car.M.name.toLowerCase()} to ${car.M.verb || "get in"}.`); }

  // Switching eras puts away anything that does not exist in the new one.
  function onEra(modern) { if (car && eraOf(car.M) !== (modern ? "modern" : "ancient")) stow(); }

  // The five contact points of the car (centre and four corners) at a position and heading
  function points(x, z, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx, h = car.M.len / 2 - 0.15, w = car.M.wid / 2 - 0.1;
    return [[0, 0], [h, w], [h, -w], [-h, w], [-h, -w]].map(([a, b]) => [x + fx * a + rx * b, z + fz * a + rz * b]);
  }
  const clearAt = (x, z, yaw) => points(x, z, yaw).every(([px, pz]) => !blockedAt(px, pz, groundAt(px, pz)));

  // A car wedged against something (or spawned in a tight spot) is moved to the nearest clear place
  function rescue() {
    for (let r = 1; r <= 9; r += 1) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, x = car.x + Math.cos(a) * r, z = car.z + Math.sin(a) * r;
        if (clearAt(x, z, car.yaw)) { car.x = x; car.z = z; car.v = 0; return true; }
      }
    }
    return false;
  }

  // Move by (dx, dz) if the whole car fits there (four corners and the centre); otherwise slide along the obstacle.
  function fits(dx, dz) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx, h = car.M.len / 2 - 0.15, w = car.M.wid / 2 - 0.1;
    for (const [a, b] of [[0, 0], [h, w], [h, -w], [-h, w], [-h, -w]]) {
      const x = car.x + fx * a + rx * b, z = car.z + fz * a + rz * b;
      if (!canMove(x, z, x + dx, z + dz)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- the plane
  // W / S: more or less engine power (S also brakes on the ground) · A D: turn (the plane banks) · Space: climb · Shift: dive. On the ground you roll
  // faster and faster: above about 100 km/h hold Space and you lift off; below about 95 km/h in the air you sink. Land gently (not too fast, not too steeply)
  // on a street or a square. Fly to the edge of the city and press F to fly on to the next city.
  const PLANE = { stall: 26, lift: 28, ceiling: 360 };
  function crashPlane(why) {
    Vitals.hp = Math.max(0, Vitals.hp - 38); player.shake = 1; $("#flash").style.opacity = 0.6; Sfx.play("crash");
    toast(`Crash! ${why} (-38 health)`);
    car.v = 0; car.vy = 0; car.alt = 0; car.throttle = 0; car.roll = car.pitch = 0;
    if (!clearAt(car.x, car.z, car.yaw)) rescue();
  }
  let edgeT = 0, flyHint = false;
  function flyUpdate(dt, keys) {
    const M = car.M;
    const up = keys.has("Space"), dive = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const thrUp = keys.has("KeyW") || keys.has("ArrowUp"), thrDown = keys.has("KeyS") || keys.has("ArrowDown");
    const steer = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    car.throttle = Math.max(0, Math.min(1, (car.throttle || 0) + (thrUp ? 0.55 : 0) * dt - (thrDown ? 0.9 : 0) * dt));
    const ground = groundAt(car.x, car.z), air = car.alt > 0.4;
    // speed
    car.v += (car.throttle * M.max - car.v) * (air ? 0.2 : 0.28) * dt;
    if (!air && thrDown && car.throttle === 0) car.v -= 16 * dt;                                  // brakes on the ground
    if (!air && !thrUp && car.throttle === 0) car.v -= 2.2 * dt;
    car.v = Math.max(0, car.v);
    // climbing and diving: only fast enough to fly, and below the stalling speed the plane sinks
    const lift = Math.min(1, Math.max(0, (car.v - PLANE.lift + 4) / 16));
    let vyT = 0;
    if (up) vyT = 12 * lift;
    else if (dive && air) vyT = -14;
    else if (air) vyT = car.v < PLANE.stall ? -(PLANE.stall - car.v) * 0.8 - 2 : 0;
    car.vy += (vyT - car.vy) * Math.min(1, dt * 2.6);
    if (!air && car.vy < 0) car.vy = 0;
    car.alt += car.vy * dt;
    car.v = Math.max(0, car.v - car.vy * 0.12 * dt);                                               // climbing costs a little speed, diving gives it back
    if (car.alt > PLANE.ceiling) { car.alt = PLANE.ceiling; car.vy = Math.min(0, car.vy); }
    if (car.alt <= 0) {                                                                            // touching down
      if (air && (car.vy < -9 || car.v > 56)) { crashPlane(car.vy < -9 ? "You came down too steeply." : "You landed too fast."); }
      else if (air) { Sfx.play("bump"); }
      car.alt = 0; car.vy = 0;
    }
    // turning (the plane banks into the turn)
    const fast = Math.min(1, car.v / 22);
    car.yaw += steer * (car.alt > 0.4 ? 0.9 : car.v > 2 ? 0.6 : 0) * fast * dt;
    car.roll += ((car.alt > 0.4 ? steer * 0.6 : 0) - car.roll) * Math.min(1, dt * 3);
    car.pitch += (Math.max(-0.5, Math.min(0.5, car.vy / 26)) - car.pitch) * Math.min(1, dt * 3);
    // moving: on the ground like a car, in the air over whatever is lower than the plane
    const dx = -Math.sin(car.yaw) * car.v * dt, dz = -Math.cos(car.yaw) * car.v * dt;
    if (car.alt > 0.4) {
      const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx;
      let hit = false;
      for (const [a, b] of [[M.len / 2 + 0.3, 0], [0, 0], [-M.len / 2, 0], [0, 5.3], [0, -5.3]]) {                        // nose, middle, tail and the two wing tips
        const x = car.x + dx + fx * a + rx * b, z = car.z + dz + fz * a + rz * b;
        if (blockedAt(x, z, groundAt(x, z) + car.alt)) hit = true;
      }
      if (hit) crashPlane("You flew into a building.");
      else { car.x += dx; car.z += dz; }
    } else if (fits(dx, dz)) { car.x += dx; car.z += dz; }
    else if (Math.abs(dx) > 1e-4 && fits(dx, 0)) { car.x += dx; car.v *= 1 - 1.6 * dt; }
    else if (Math.abs(dz) > 1e-4 && fits(0, dz)) { car.z += dz; car.v *= 1 - 1.6 * dt; }
    else if (car.v > 1) { if (bumpCd <= 0) { bumpCd = 0.9; Sfx.play("bump"); if (car.v > 8) { Vitals.hp = Math.max(0, Vitals.hp - car.v * 0.8); player.shake = 0.6; toast("Bump!"); } } car.v *= 0.2; }
    bumpCd = Math.max(0, bumpCd - dt);
    // the edge of the city: high up you can fly on to the next one
    const b = BOUNDS, m = 25;
    let edge = false;
    if (car.x < b.minX + m) { car.x = b.minX + m; edge = true; } if (car.x > b.maxX - m) { car.x = b.maxX - m; edge = true; }
    if (car.z < b.minZ + m) { car.z = b.minZ + m; edge = true; } if (car.z > b.maxZ - m) { car.z = b.maxZ - m; edge = true; }
    flyOnReady = edge && car.alt > 50;
    if (flyOnReady && !flyHint) { flyHint = true; toast("✈ You have reached the edge of the city. Press F to fly on to the next city."); }
    if (!flyOnReady) flyHint = false;
    // the plane, the camera target and you all move together
    car.y = ground + car.alt + 0.0;
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.order = "YXZ"; car.g.rotation.set(car.pitch, car.yaw, car.roll);
    if (car.g.userData.prop) car.g.userData.prop.rotation.z += (4 + car.throttle * 70) * dt;
    for (const w of car.wheels) w.rotation.x += (car.v * dt) / 0.3;
    player.x = car.x; player.z = car.z; player.yaw = car.yaw; player.feet = car.y; player.vx = player.vz = 0;
    $("#drive-kmh").textContent = Math.round(Math.abs(car.v) * 3.6);
    $("#drive-alt").textContent = ` · ${Math.round(car.alt)} m up · power ${Math.round(car.throttle * 100)}%`;
  }
  let flyOnReady = false;
  // fly on from the edge of the city to the next one: you arrive high above it, flying
  function flyOn() {
    if (!car || !driving || !car.M.fly || !flyOnReady || travelBusy) return false;
    const to = NEXT_CITY[city];
    travelBusy = true; $("#sleep").classList.add("on");
    setTimeout(() => {
      try {
        arriveIn(to);
        mode = "drive";
        car.x = player.x; car.z = player.z; car.yaw = player.yaw; car.alt = 130; car.vy = 0; car.v = Math.max(car.v, 38); car.throttle = Math.max(car.throttle, 0.6);
        car.y = groundAt(car.x, car.z) + car.alt; car.g.position.set(car.x, car.y, car.z);
        player.feet = car.y; flyOnReady = false; flyHint = false;
        $("#drive-hud").classList.add("show");
        toast(`You fly on to ${CITY_NAMES[to]}. Land on a long street or a square when you are ready (hold Shift to dive, S to slow down).`);
      } catch (e) { console.error(e); toast("Could not fly on"); }
      $("#sleep").classList.remove("on"); travelBusy = false;
    }, 900);
    return true;
  }

  function update(dt, keys) {
    if (!car || !driving) return;
    if (car.M.fly) { flyUpdate(dt, keys); return; }
    const M = car.M;
    bumpCd = Math.max(0, bumpCd - dt); runCd = Math.max(0, runCd - dt);
    const gas = keys.has("KeyW") || keys.has("ArrowUp"), brake = keys.has("KeyS") || keys.has("ArrowDown");
    const steer = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    if (gas) car.v += M.accel * (1 - Math.max(0, car.v) / M.max * 0.85) * dt;
    if (brake) car.v -= (car.v > 0.3 ? 26 : 9) * dt;
    if (!gas && !brake) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), (1.8 + Math.abs(car.v) * 0.12) * dt); // coasting
    if (keys.has("Space")) car.v *= Math.max(0, 1 - 3.2 * dt);
    car.v = Math.max(-7, Math.min(M.max, car.v));

    const grip = Math.min(1, Math.abs(car.v) / 4) * (1 - 0.45 * Math.abs(car.v) / M.max);
    car.yaw += steer * M.turn * grip * Math.sign(car.v || 1) * dt;
    const dx = -Math.sin(car.yaw) * car.v * dt, dz = -Math.cos(car.yaw) * car.v * dt;
    let hit = false;
    if (fits(dx, dz)) { car.x += dx; car.z += dz; }
    else if (Math.abs(dx) > Math.abs(dz) * 0.2 && Math.abs(dx) > 1e-4 && fits(dx, 0)) { car.x += dx; car.v *= 1 - 1.6 * dt; }   // scrape along a wall
    else if (Math.abs(dz) > Math.abs(dx) * 0.2 && Math.abs(dz) > 1e-4 && fits(0, dz)) { car.z += dz; car.v *= 1 - 1.6 * dt; }
    else hit = true;
    // pressing the pedals but going nowhere for a moment: move the car to the nearest clear spot
    stuckT = hit && (gas || brake) && Math.abs(car.v) < 1.5 ? stuckT + dt : 0;
    if (stuckT > 0.8) { stuckT = 0; if (rescue()) toast("Your car was wedged in, so it was moved to a clear spot."); }
    if (hit && Math.abs(car.v) > 1) {
      const impact = Math.abs(car.v);
      if (bumpCd <= 0) {
        bumpCd = 0.9;
        if (impact > 5) {
          const dmg = Math.min(30, (impact - 3) * 1.2);
          Vitals.hp = Math.max(0, Vitals.hp - dmg);
          player.shake = Math.min(1, impact / 20); $("#flash").style.opacity = 0.45;
          Sfx.play("crash"); toast(`Crash! (-${Math.round(dmg)} health)`);
        } else Sfx.play("bump");
      }
      car.v = -car.v * 0.25;
    } else if (hit) car.v = 0;

    // other cars on the road
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    for (const k of [0, M.len * 0.4, -M.len * 0.4]) {
      const h2 = hitsHere(car.x + fx * k, car.z + fz * k);
      if (h2 && bumpCd <= 0) { bumpCd = 0.9; car.v *= 0.2; player.shake = 0.6; Sfx.play("crash"); toast(h2.what ? `You ran into ${h2.what}!` : "You hit another car!"); break; }
    }
    // pedestrians
    if (Math.abs(car.v) > 2.5) {
      for (const c of peopleHere()) {
        if ((c.down || 0) > 0) continue;
        if (Math.hypot(c.x - (car.x + fx * M.len * 0.3), c.z - (car.z + fz * M.len * 0.3)) < 1.7) {
          c.down = Math.abs(car.v) > 10 ? 2.6 : 1.6;
          noteKnock();
          Speech.rammed(c, Math.abs(car.v) > 10);
          const d = Math.hypot(c.x - car.x, c.z - car.z) || 1;
          if (canMove(c.x, c.z, c.x + ((c.x - car.x) / d) * 1.6, c.z + ((c.z - car.z) / d) * 1.6)) { c.x += ((c.x - car.x) / d) * 1.6; c.z += ((c.z - car.z) / d) * 1.6; }
          Sfx.play("oof");
          if (runCd <= 0) { runCd = 2; toast("Watch out! You knocked over a citizen."); }
        }
      }
    }

    // the car, the camera target and you all move together
    car.y += (groundAt(car.x, car.z) - car.y) * Math.min(1, dt * 10);
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.y = car.yaw;
    for (const w of car.wheels) w.rotation.x += (car.v * dt) / 0.34;
    phase += car.v * dt * 1.1; // legs swing as an ox or elephant walks
    car.legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 * Math.min(1, Math.abs(car.v) / 2); });
    player.x = car.x; player.z = car.z; player.yaw = car.yaw; player.feet = car.y; player.vx = player.vz = 0;
    $("#drive-kmh").textContent = Math.round(Math.abs(car.v) * 3.6);
  }

  // The chase camera sits behind and above the car and swings round after it.
  function camera(cam, dt) {
    if (!car) return;
    if (car.M.fly) {                                                                                   // behind and above the plane, looking where it is going
      let dy = car.yaw - camYaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      camYaw += dy * Math.min(1, dt * 2.6);
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), d = 17 + car.v * 0.07, cx = car.x - fx * d, cz = car.z - fz * d;
      cam.position.set(cx, Math.max(groundAt(cx, cz) + 1.6, car.y + 5.2 - car.pitch * 6), cz);
      cam.lookAt(car.x + fx * 9, car.y + 1.3 + car.pitch * 5, car.z + fz * 9);
      if (player.shake > 0) { cam.position.x += (Math.random() - 0.5) * player.shake * 0.4; cam.position.y += (Math.random() - 0.5) * player.shake * 0.3; player.shake = Math.max(0, player.shake - dt * 2.4); }
      const f = $("#flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
      return;
    }
    let dy = car.yaw - camYaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    camYaw += dy * Math.min(1, dt * 4);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let d = 7.5 + (car.M.camH ? 3 : 0) + Math.abs(car.v) * 0.09;
    for (; d > 2.5; d -= 0.5) if (!blockedAt(car.x - fx * d, car.z - fz * d, car.y + 2.5)) break;
    const up = car.M.camH || 0;
    cam.position.set(car.x - fx * d, car.y + 2.6 + up + Math.abs(car.v) * 0.02, car.z - fz * d);
    cam.lookAt(car.x + fx * 2, car.y + 1.1 + up * 0.7, car.z + fz * 2);
    if (player.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * player.shake * 0.4; cam.position.y += (Math.random() - 0.5) * player.shake * 0.3;
      player.shake = Math.max(0, player.shake - dt * 2.4);
    }
    const f = $("#flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
  }

  // A fresh model of a vehicle for the Delhi games, in another colour (the body and the cloth or canopy take the colour).
  function model(id, color) {
    const M = MODELS[id], m = build(id), accents = id === "elephant" ? [0xa8282b] : id === "oxcart" ? [0xd9a13a] : [M.color, 0xe8c13a];
    if (color !== undefined) m.g.traverse((o) => { if (o.isMesh && o.material && o.material.color && accents.includes(o.material.color.getHex())) o.material = lam(color); });
    m.g.userData.wheels = m.wheels; m.g.userData.legs = m.legs;
    return m.g;
  }

  return {
    MODELS, model, deploy, stow, enter, exit, toggleEnter, update, camera, nearby, onEra,
    // Click on your parked car and it goes back to your garage (if you have one)
    clickAt(cx, cy, cam, canvasEl) {
      if (!car || driving || mode !== "walk") return false;
      const r = canvasEl.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam);
      if (!ray.intersectObject(car.g, true).length) return false;
      if (Math.hypot(player.x - car.x, player.z - car.z) > 30) return false;
      if (!Garage.any()) { toast("You need a garage: upgrade your house (the garden house or better has one). Or park it away from the garage list."); return true; }
      const name = car.M.name.toLowerCase();
      stow(); Garage.refresh(); Sfx.play("coin");
      toast(`Your ${name} goes back to your garage.`);
      return true;
    },
    get motor() { return !car || car.M.motor !== false; },
    // what other players should see of your vehicle: the one you are in, or the one you left parked
    share: () => (car ? { veh: driving ? car.id : null, park: driving ? null : [car.id, +car.x.toFixed(1), +car.z.toFixed(1), +car.yaw.toFixed(2)] } : { veh: null, park: null }),
    get speed() { return car && driving ? Math.abs(car.v) : 0; },
    state: () => (car && driving ? { x: car.x, z: car.z, yaw: car.yaw, v: car.v, alt: car.alt || 0 } : null),
    debugSet: (o) => { if (car) Object.assign(car, o); },
    flyOn, get flyReady() { return flyOnReady; }, get airborne() { return !!car && driving && car.M.fly && car.alt > 1; },                      // where your car is and how fast (the police chase it)
    drag: (f) => { if (car && driving) car.v *= f; },                                                        // a police car alongside slows you down
    get verb() { return car ? car.M.verb || "get in" : "get in"; },
    get current() { return car ? car.id : null; },
    get driving() { return driving; },
    debug: () => (car ? { x: car.x, z: car.z, yaw: car.yaw, v: car.v, stuckT, bumpCd, driving, fitsAhead: fits(-Math.sin(car.yaw) * 0.05, -Math.cos(car.yaw) * 0.05), fitsBack: fits(Math.sin(car.yaw) * 0.05, Math.cos(car.yaw) * 0.05) } : null),
    probe: () => (car ? points(car.x, car.z, car.yaw).map(([x, z]) => blockedAt(x, z, groundAt(x, z))) : null),
    speed01: () => (car && driving ? Math.min(1, Math.abs(car.v) / car.M.max) : 0),
  };
})();
