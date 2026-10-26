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
    plane: { name: "Light plane", max: 62, accel: 7, turn: 1.2, color: 0xf2f2f4, len: 7.2, wid: 2.4, fly: true, air: "wing", verb: "climb in" },   // flies (see flyUpdate); wings are wider than the hull, which is what hits things
    bus: { name: "Bus", max: 17, accel: 5.5, turn: 1.25, color: 0xd9411f, len: 9.0, wid: 2.5 },
    chariot: { name: "Chariot", max: 21, accel: 9, turn: 1.9, color: 0xb3262b, len: 3.6, wid: 1.4, era: "ancient", motor: false, camH: 2.4, verb: "climb on" },
    horse: { name: "Horse", max: 18, accel: 9, turn: 2.2, color: 0x7a4a2a, len: 2.8, wid: 1.0, era: "ancient", motor: false, camH: 2.5, verb: "climb on" },
    camel: { name: "Camel", max: 11, accel: 5, turn: 1.8, color: 0xc9a46a, len: 3.4, wid: 1.2, era: "ancient", motor: false, camH: 3.3, verb: "climb on" },
    donkey: { name: "Donkey", max: 8, accel: 4.5, turn: 2.3, color: 0x8a8580, len: 2.1, wid: 0.9, era: "ancient", motor: false, camH: 2.0, verb: "climb on" },
    elephant: { name: "Elephant", max: 14, accel: 6, turn: 1.5, color: 0x9c9a95, len: 4.8, wid: 2.2, era: "ancient", motor: false, camH: 2.6, verb: "climb on" },
  };
  Object.assign(MODELS, AIRCRAFT);   // jets, helicopters, balloons ... (aircraft.js)
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
    if (MODELS[id].make) {                                                                            // an aircraft from aircraft.js: with a cockpit to sit in (pilot view) unless it is open
      const r = MODELS[id].make(MODELS[id]), ud = r.g.userData;
      ud.shell = MODELS[id].open ? [] : r.g.children.slice();
      if (!MODELS[id].open) ud.cockpit = planeCockpit(r.g, MODELS[id].eye);
      return { g: r.g, wheels: r.wheels, legs: [] };
    }
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
      const n0 = g.children.length;
      g.add(box(1.3, 1.2, 5.2, white, 0, 1.3, 0.3), box(1.34, 0.28, 5.24, red, 0, 1.12, 0.3));          // the body and a red stripe
      g.add(box(1.1, 0.9, 1.2, dk, 0, 1.3, -2.8), box(1.0, 0.7, 1.4, white, 0, 1.55, -0.9));              // the engine and the cockpit
      g.add(box(1.0, 0.6, 1.1, lam(0x1d3a4a), 0, 1.85, -0.9));                                           // the canopy
      g.add(box(11, 0.16, 1.8, white, 0, 2.4, -0.7), box(11.04, 0.18, 0.4, red, 0, 2.4, -1.4));           // the wing and its red front edge
      g.add(box(0.12, 1.3, 1.1, white, 0, 2.2, 3.2), box(3.6, 0.12, 1.0, white, 0, 1.55, 3.2));          // the tail fin and the tailplane
      for (const sx of [-1, 1]) g.add(box(0.1, 1.3, 0.1, dk, sx * 1.6, 1.8, -0.7));                       // the wing struts
      g.add(box(0.1, 0.9, 0.1, dk, 0, 0.55, -1.8), box(0.1, 0.8, 0.1, dk, -0.8, 0.55, 0.6), box(0.1, 0.8, 0.1, dk, 0.8, 0.55, 0.6));
      for (const [x, z, r] of [[0, -1.8, 0.28], [-0.8, 0.6, 0.3], [0.8, 0.6, 0.3]]) { const w = wheel(r, 0.14, x, r, z); g.add(w); wheels.push(w); }
      const prop = new THREE.Group(); prop.position.set(0, 1.3, -3.45); prop.add(box(0.18, 2.5, 0.08, dk, 0, 0, 0), box(2.5, 0.18, 0.08, dk, 0, 0, 0.01)); g.add(prop); g.userData.prop = prop;
      g.userData.cockpit = planeCockpit(g);
      g.userData.shell = [g.children[n0], g.children[n0 + 1], g.children[n0 + 3]];                     // the body, its stripe and the cockpit block: hidden from the inside so you can see the panel
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

  // Take the car out of the garage: it appears right where you are standing (facing the way you face), and you are in it at once.
  // If something is in the way there it is moved to the nearest clear spot; only if there is none at all, you are told there is no room.
  function deploy(id) {
    if (!MODELS[id]) return;
    if (eraOf(MODELS[id]) !== era) { toast(eraOf(MODELS[id]) === "modern" ? "Cars and rickshaws only exist in the modern cities. Press K to go there." : "Carts and elephants only live in the ancient cities. Press K to go there."); return; }
    if (mode !== "walk") { toast("Get out of what you are in first."); return; }
    stow();
    const m = build(id);
    car = { id, M: MODELS[id], x: player.x, z: player.z, yaw: player.yaw, v: 0, ...m, y: groundAt(player.x, player.z), alt: 0, vy: 0, vx: 0, vz: 0, pitch: 0, roll: 0, throttle: 0 };
    if (!clearAt(car.x, car.z, car.yaw) && !rescue()) { car = null; toast("There is no room to put it here. Find an open street."); return; }
    car.y = groundAt(car.x, car.z);
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.y = car.yaw;
    scene.add(car.g);
    placeCircles(false);
    player.x = car.x; player.z = car.z;
    Sfx.play("coin");
    enter();                                                                                          // and you get in
  }

  function stow() {
    if (driving) exit(true);
    if (car) { scene.remove(car.g); car = null; }
    placeCircles(false);
  }

  const nearby = () => !!car && !driving && mode === "walk" && Math.hypot(player.x - car.x, player.z - car.z) < 7;

  // the controls shown for each kind of aircraft: [the hint line, the toast when you get in]
  function airHelp(M) {
    const tail = " · <kbd>C</kbd> pilot view · <kbd>F</kbd> fly on at the edge of the city · <kbd>X</kbd> get out (on the ground)";
    if (M.glide) return ["<kbd>W</kbd> tow rope (up to 80 m) · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> pull up · <kbd>Shift</kbd> dive" + tail, "Glider: hold W for a tow up to 80 m, then glide. Look for a thermal (rising air) to climb again. Land gently, and press X to get out."];
    if (M.air === "heli" || M.air === "vtol") return ["<kbd>W</kbd> forward · <kbd>S</kbd> back · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> climb · <kbd>Shift</kbd> descend" + tail, `${M.name}: hold Space to lift straight off; W flies forward. Land gently and press X to get out.`];
    if (M.air === "blimp") return ["<kbd>W</kbd> forward · <kbd>S</kbd> back · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> climb · <kbd>Shift</kbd> descend" + tail, "Airship: slow and gentle. Hold Space to rise, W to move, and Shift to come down again."];
    if (M.air === "balloon") return ["<kbd>Space</kbd> burner (rise) · <kbd>Shift</kbd> let hot air out (sink) · <kbd>A</kbd><kbd>D</kbd> turn the basket · the wind carries you, and it blows a different way at each height" + tail, "Balloon: hold Space to fire the burner and rise. You cannot steer: climb and sink to find a wind that goes where you want."];
    const lift = Math.round(((M.wing || PLANE).lift * 3.6) / 10) * 10;
    return ["<kbd>W</kbd> power up · <kbd>S</kbd> power down / brake / reverse (on the ground) · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> climb · <kbd>Shift</kbd> dive" + tail, `${M.name}: W for power, and above about ${lift} km/h hold Space to take off. Shift dives. Land gently on a long street or a square, and press X to get out.`];
  }

  function enter() {
    if (!nearby() || eraOf(car.M) !== era) return;
    driving = true; mode = "drive";
    showPilot();
    placeCircles(false);
    camYaw = car.yaw;
    player.vx = player.vz = 0; Vitals.stopRest();
    $("#drive-hud").classList.add("show");
    $("#drive-alt").textContent = "";
    if (car.M.fly) { const h = airHelp(car.M); $("#drive-keys").innerHTML = h[0]; toast(h[1]); return; }
    $("#drive-keys").innerHTML = "<kbd>W</kbd> gas · <kbd>S</kbd> brake · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> handbrake · <kbd>X</kbd> or <kbd>Esc</kbd> get out";
    toast(car.M.motor === false ? "W go · S stop and back up · A D steer · Space halt · Esc to get off" : "W gas · S brake and reverse · A D steer · Space handbrake · Esc to get out");
  }

  function exit(silent) {
    if (!driving) return;
    if (car.M.fly && car.alt > 1.5) {                                                                // you cannot step out of a plane in the air (unless you are forced to)
      if (!silent) { toast("Land first! Slow down and come down gently on a street or a square."); return; }
      car.alt = 0; car.vy = 0; car.y = groundAt(car.x, car.z); car.g.position.y = car.y;
    }
    if (car.M.fly) { car.g.rotation.set(0, car.yaw, 0); car.throttle = 0; car.roll = car.pitch = 0; car.vx = car.vz = 0; flyOnReady = false; $("#drive-alt").textContent = ""; }
    driving = false; car.v = 0;
    if (car.M.fly) { if (car.g.userData.prop) car.g.userData.prop.visible = true; if (car.g.userData.cockpit) car.g.userData.cockpit.visible = false; for (const m of car.g.userData.shell || []) m.visible = true; }
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
    const far = car.M.fly ? 30 : 9;                                                                  // a big aircraft may have to be moved further to find room
    for (let r = 1; r <= far; r += car.M.fly ? 2 : 1) {
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
    if (typeof Trade !== "undefined") Trade.lose();
    toast(`Crash! ${why} (-38 health)`);
    car.v = 0; car.vy = 0; car.alt = 0; car.throttle = 0; car.roll = car.pitch = 0;
    if (!clearAt(car.x, car.z, car.yaw)) rescue();
  }
  let edgeT = 0, flyHint = false;
  // The inside of the plane, seen only in pilot view: an instrument panel with three dials that really work (speed, height and a compass),
  // a control wheel that turns when you steer, a throttle lever and the window posts. It sits in front of the pilot's eye at (0, 2.0, -0.95).
  function planeCockpit(g, eye = [0, 2.0, -0.95]) {
    const cp = new THREE.Group(); cp.visible = false; cp.position.set(eye[0], eye[1] - 2.0, eye[2] + 0.95); g.add(cp);      // (everything in it is placed for an eye at (0, 2, -0.95))
    const dkm = new THREE.MeshLambertMaterial({ color: 0x1c1d21 }), gry = new THREE.MeshLambertMaterial({ color: 0x3b3e45 }), rd = new THREE.MeshBasicMaterial({ color: 0xe23b2e }), wh = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
    const dash = new THREE.Group(); dash.position.set(0, 1.62, -1.8); dash.rotation.x = -0.3; cp.add(dash);
    dash.add(box(1.04, 0.34, 0.06, dkm, 0, 0, 0), box(1.1, 0.05, 0.3, dkm, 0, 0.19, 0.1));                  // the panel and the glare shield on top
    const needles = {};
    const dial = (name, x, label, marks, text) => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x2 = c.getContext("2d");
      x2.fillStyle = "#101114"; x2.fillRect(0, 0, 128, 128);
      x2.strokeStyle = "#f4f4f4"; x2.fillStyle = "#f4f4f4"; x2.lineWidth = 3; x2.textAlign = "center"; x2.textBaseline = "middle";
      for (let i = 0; i <= marks; i++) { const a = (-135 + (270 * i) / marks) * Math.PI / 180, ca = Math.sin(a), sa = -Math.cos(a); x2.beginPath(); x2.moveTo(64 + ca * 54, 64 + sa * 54); x2.lineTo(64 + ca * 46, 64 + sa * 46); x2.stroke(); }
      x2.font = "bold 14px sans-serif"; x2.fillText(label, 64, 92);
      if (text) { x2.font = "bold 20px sans-serif"; for (const [t, a] of text) { const r = a * Math.PI / 180; x2.fillText(t, 64 + Math.sin(r) * 34, 64 - Math.cos(r) * 34); } }
      const tex = new THREE.CanvasTexture(c);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 28), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.set(x, 0, 0.032); dash.add(face);
      const pivot = new THREE.Group(); pivot.position.set(x, 0, 0.036);
      const nd = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.004), name === "compass" ? rd : wh); nd.position.y = 0.025; pivot.add(nd);
      dash.add(pivot); needles[name] = pivot;
    };
    dial("speed", -0.3, "km/h", 9, null);
    dial("alt", 0, "ALT", 9, null);
    dial("compass", 0.3, "", 8, [["N", 0], ["E", 90], ["S", 180], ["W", 270]]);
    const lever = box(0.03, 0.025, 0.03, rd, 0.44, -0.08, 0.04); dash.add(box(0.03, 0.2, 0.01, gry, 0.44, -0.04, 0.032), lever);   // the throttle lever slides up and down its slot
    const yoke = new THREE.Group(); yoke.position.set(0, 1.7, -1.4); yoke.rotation.x = -0.3; cp.add(yoke);          // the control wheel
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 20), dkm); yoke.add(ring, box(0.2, 0.025, 0.025, dkm, 0, 0, 0), box(0.03, 0.03, 0.4, gry, 0, -0.02, 0.2));
    for (const sx of [-1, 1]) {                                                                                      // the window posts
      const post = box(0.035, 0.7, 0.035, dkm, sx * 0.55, 2.15, -1.55); post.rotation.z = sx * 0.3; post.rotation.x = 0.3; cp.add(post);
    }
    cp.userData = { needles, lever, yoke };
    return cp;
  }

  // Rising air for gliders: about half of the 450 m squares of the city have a thermal in them
  function thermalAt(x, z) {
    const i = Math.floor(x / 450), j = Math.floor(z / 450), h = Math.abs(Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1;
    if (h < 0.5) return 0;
    const cx = (i + 0.25 + 0.5 * ((h * 7.7) % 1)) * 450, cz = (j + 0.25 + 0.5 * ((h * 13.3) % 1)) * 450;
    return Math.max(0, 1 - Math.hypot(x - cx, z - cz) / 90);
  }
  // The wind a balloon is in: it blows a different way (and a different speed) at each height, so you steer by going up and down. [x, z] in m/s
  function windAt(alt) {
    const a = 0.9 + Math.sin(alt / 80) * 2.3 + Math.sin(alt / 31) * 0.4, s = 3.5 + 2.5 * (0.5 + 0.5 * Math.sin(alt / 55 + 1));
    return [Math.sin(a) * s, -Math.cos(a) * s];
  }
  const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

  // The end of every flying frame: keep to the city (flying on is possible at the edge), put the aircraft and the camera target where they belong, and show the readout
  function settle(dt, ground, hud) {
    const b = BOUNDS, m = 25;
    let edge = false;
    if (car.x < b.minX + m) { car.x = b.minX + m; edge = true; } if (car.x > b.maxX - m) { car.x = b.maxX - m; edge = true; }
    if (car.z < b.minZ + m) { car.z = b.minZ + m; edge = true; } if (car.z > b.maxZ - m) { car.z = b.maxZ - m; edge = true; }
    flyOnReady = edge && car.alt > 50;
    if (flyOnReady && !flyHint) { flyHint = true; toast("✈ You have reached the edge of the city. Press F to fly on to the next city."); }
    if (!flyOnReady) flyHint = false;
    // the aircraft, the camera target and you all move together
    car.y = ground + car.alt;
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.order = "YXZ"; car.g.rotation.set(car.pitch, car.yaw, car.roll);
    const u = car.g.userData;
    if (u.prop) u.prop.rotation.z += (4 + car.throttle * 70) * dt;
    const rev = car.M.hover ? (car.alt > 0.4 || car.vy > 0 || car.throttle > 0 ? 1 : 0.35) : 0.35 + car.throttle;                    // rotors turn faster in the air
    for (const r of u.rotors || []) r.o.rotation[r.axis] += r.s * rev * dt;
    if (u.tips) {                                                                                 // folding wingtips: folded up while parked, stretched out once you move or fly
      const want = car.alt <= 0.4 && Math.abs(car.v) < 3 && car.throttle < 0.05 ? 1 : 0;
      car.fold = (car.fold === undefined ? 1 : car.fold) + (want - (car.fold === undefined ? 1 : car.fold)) * Math.min(1, dt * 1.2);
      for (const t of u.tips) t.g.rotation.z = t.side * car.fold * 1.45;
    }
    for (const w of car.wheels) w.rotation.x += (car.v * dt) / 0.3;
    player.x = car.x; player.z = car.z; player.yaw = car.yaw; player.feet = car.y; player.vx = player.vz = 0;
    $("#drive-kmh").textContent = Math.round(Math.abs(car.v) * 3.6);
    $("#drive-alt").textContent = hud;
  }

  // Does a helicopter, airship or balloon touch a building if it moves by (dx, dz)? Its body (a small ring low down) and its rotors or envelope (a big ring up high) are checked.
  function crashHit(M, dx, dz) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx;
    for (const [R, h] of [[M.body || 1.6, 0.5], [M.rad, M.radY || 0.5]]) {
      for (const [a, b] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) {
        const x = car.x + dx + fx * a + rx * b, z = car.z + dz + fz * a + rz * b;
        if (blockedAt(x, z, groundAt(x, z) + car.alt + h)) return true;
      }
    }
    return false;
  }

  function flyUpdate(dt, keys) {
    const M = car.M, W = M.wing || PLANE, glide = !!M.glide, climb = M.climb || 12;
    const up = keys.has("Space"), dive = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const thrUp = keys.has("KeyW") || keys.has("ArrowUp"), thrDown = keys.has("KeyS") || keys.has("ArrowDown");
    const steer = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    car.steerIn = steer; car.pitchIn = up ? 1 : dive ? -1 : 0;
    if (glide) car.throttle = thrUp && car.alt < 80 ? Math.min(1, (car.throttle || 0) + 1.2 * dt) : Math.max(0, (car.throttle || 0) - 1.5 * dt);   // a glider has no engine: W is the tow rope, which lets go at 80 m
    else car.throttle = Math.max(0, Math.min(1, (car.throttle || 0) + (thrUp ? 0.55 : 0) * dt - (thrDown ? 0.9 : 0) * dt));
    const ground = groundAt(car.x, car.z), air = car.alt > 0.4;
    const th = glide && air ? thermalAt(car.x, car.z) : 0;
    // speed
    car.v += (Math.max(car.throttle * M.max, glide && air ? M.glide : 0) - car.v) * (air ? 0.2 : 0.28) * (M.spool || 1) * dt;
    if (!air && thrDown && car.throttle === 0) car.v -= (car.v > 0.3 ? 16 : 6) * dt;              // on the ground S brakes, and then backs the plane up (slowly)
    else if (!air && !thrUp && car.throttle === 0) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), 2.2 * dt);
    car.v = air ? Math.max(0, car.v) : Math.max(-6, car.v);                                          // you can only reverse on the ground
    // climbing and diving: only fast enough to fly, and below the stalling speed the plane sinks
    const lift = Math.min(1, Math.max(0, (car.v - W.lift + 4) / 16));
    let vyT = 0;
    if (up) vyT = climb * lift;
    else if (glide && thrUp && car.alt < 80) vyT = 11 * lift;                                          // the tow rope pulls a glider up by itself
    else if (dive && air) vyT = -climb * 1.15;
    else if (air) vyT = car.v < W.stall ? -(W.stall - car.v) * 0.8 - 2 : glide ? -M.sink - Math.max(0, car.v - M.glide) * 0.05 : 0;
    if (th && !dive) vyT += th * 6.5;
    car.vy += (vyT - car.vy) * Math.min(1, dt * 2.6);
    if (!air && car.vy < 0) car.vy = 0;
    car.alt += car.vy * dt;
    if (car.vy) car.v = Math.max(0, car.v - (car.vy - th * 6.5) * 0.12 * dt);                       // climbing costs a little speed, diving gives it back
    if (car.alt > W.ceiling) { car.alt = W.ceiling; car.vy = Math.min(0, car.vy); }
    if (car.alt <= 0) {                                                                            // touching down
      if (air && (car.vy < -9 || car.v > W.stall * 2.15)) { crashPlane(car.vy < -9 ? "You came down too steeply." : "You landed too fast."); }
      else if (air) { Sfx.play("bump"); }
      car.alt = 0; car.vy = 0;
    }
    // turning (the plane banks into the turn)
    const fast = Math.max(-1, Math.min(1, car.v / 22));
    car.yaw += steer * (car.alt > 0.4 ? 0.9 : Math.abs(car.v) > 2 ? 0.6 : 0) * (M.turn / 1.2) * fast * dt;
    car.roll += ((car.alt > 0.4 ? steer * 0.6 : 0) - car.roll) * Math.min(1, dt * 3);
    car.pitch += (Math.max(-0.5, Math.min(0.5, car.vy / 26)) - car.pitch) * Math.min(1, dt * 3);
    // moving: on the ground like a car, in the air over whatever is lower than the plane
    const dx = -Math.sin(car.yaw) * car.v * dt, dz = -Math.cos(car.yaw) * car.v * dt;
    if (car.alt > 0.4) {
      const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx, tip = M.span ? M.span / 2 - 0.2 : 5.3;
      let hit = false;
      for (const [a, b] of [[M.len / 2 + 0.3, 0], [0, 0], [-M.len / 2, 0], [0, tip], [0, -tip]]) {                        // nose, middle, tail and the two wing tips
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
    const hud = glide ? ` · ${Math.round(car.alt)} m up · ${th > 0.05 ? "in a thermal: rising air ↑" : car.throttle > 0 ? "on tow" : "gliding"}` : ` · ${Math.round(car.alt)} m up · power ${Math.round(car.throttle * 100)}%`;
    settle(dt, ground, hud);
  }

  // Helicopters, the tiltrotor, the airship and the balloon. They go up and down on their own (Space and Shift), and on the ground they just sit there.
  // Helicopter and tiltrotor: W and S fly forward and back at once, with no run needed. Tiltrotor: its rotors tilt forward as it speeds up.
  // Airship: slow and heavy. Balloon: Space is the burner; it is carried by the wind, which blows a different way at each height.
  function hoverUpdate(dt, keys) {
    const M = car.M, kind = M.air, balloon = kind === "balloon";
    const key = (...c) => c.some((k) => keys.has(k));
    const up = key("Space"), dive = key("ShiftLeft", "ShiftRight"), fwd = key("KeyW", "ArrowUp"), back = key("KeyS", "ArrowDown");
    const steer = (key("KeyA", "ArrowLeft") ? 1 : 0) - (key("KeyD", "ArrowRight") ? 1 : 0);
    car.steerIn = steer; car.pitchIn = up ? 1 : dive ? -1 : 0; car.throttle = fwd ? 1 : 0;
    const ground = groundAt(car.x, car.z), air = car.alt > 0.4;
    // up and down
    const vyT = up ? M.climb : dive ? -M.climb * (balloon ? 0.8 : 0.9) : balloon && air ? -0.7 : 0;                // a balloon cools and sinks slowly; the others hover
    car.vy += (vyT - car.vy) * Math.min(1, dt * (balloon ? 0.9 : 2.4));
    if (!air && car.vy < 0) car.vy = 0;
    car.alt += car.vy * dt;
    if (car.alt > M.ceiling) { car.alt = M.ceiling; car.vy = Math.min(0, car.vy); }
    if (car.alt <= 0) {                                                                            // touching down
      if (air && car.vy < -M.hard) crashPlane("You came down too hard.");
      else if (air) Sfx.play("bump");
      car.alt = 0; car.vy = 0;
    }
    // turning
    const yawRate = kind === "heli" ? 1 : kind === "vtol" ? 0.35 + 0.65 * Math.min(1, Math.abs(car.v) / 40) : kind === "blimp" ? Math.min(1, 0.25 + Math.abs(car.v) / 6) : 0.5;
    car.yaw += steer * M.turn * yawRate * (air ? 1 : 0.5) * dt;
    // going along
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    let dx, dz;
    if (balloon) {
      const [wx, wz] = air ? windAt(car.alt) : [0, 0];
      car.vx += (wx - car.vx) * Math.min(1, dt * 0.4); car.vz += (wz - car.vz) * Math.min(1, dt * 0.4);
      car.v = Math.hypot(car.vx, car.vz); dx = car.vx * dt; dz = car.vz * dt;
    } else {
      const target = ((fwd ? 1 : 0) - (back ? 0.5 : 0)) * M.max * (air ? 1 : 0.25);                   // on the ground you can only creep along
      car.v += (target - car.v) * Math.min(1, dt * M.respond);
      dx = fx * car.v * dt; dz = fz * car.v * dt;
    }
    if (air) {                                                                                     // you can rise from a tight spot, but not fly sideways into a building
      if (Math.abs(dx) + Math.abs(dz) > 1e-4 && crashHit(M, dx, dz) && !crashHit(M, 0, 0)) crashPlane(balloon ? "The balloon hit a building." : "You flew into a building.");
      else { car.x += dx; car.z += dz; }
    }
    else if (!balloon) { if (fits(dx, dz)) { car.x += dx; car.z += dz; } else car.v *= 0.3; }
    // leaning
    car.roll += ((air && !balloon ? steer * 0.3 * Math.min(1, Math.abs(car.v) / 10 + 0.3) : 0) - car.roll) * Math.min(1, dt * 3);
    const lean = kind === "heli" ? 0.22 : kind === "vtol" ? 0.1 : 0.05;
    car.pitch += ((balloon ? 0 : -(car.v / M.max) * lean + (kind === "blimp" ? car.vy / 30 : 0)) - car.pitch) * Math.min(1, dt * 3);
    const u = car.g.userData;
    if (u.pods) { car.tilt = (car.tilt || 0) + (Math.min(1, Math.abs(car.v) / (M.max * 0.45)) - (car.tilt || 0)) * Math.min(1, dt * 1.5); for (const p of u.pods) p.rotation.x = -car.tilt * Math.PI / 2; }
    if (u.flame) { u.flame.visible = up; u.flame.scale.y = 0.8 + Math.random() * 0.5; }
    let hud = ` · ${Math.round(car.alt)} m up`;
    if (balloon && air) hud += ` · drifting ${POINTS[(Math.round(Math.atan2(car.vx, -car.vz) / (Math.PI / 4)) + 8) % 8]}`;
    settle(dt, ground, hud);
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
        car.x = player.x; car.z = player.z; car.yaw = player.yaw; car.alt = 130; car.vy = 0; car.v = Math.max(car.v, Math.min(38, car.M.max * 0.7)); car.throttle = Math.max(car.throttle, 0.6);
        car.vx = -Math.sin(car.yaw) * car.v; car.vz = -Math.cos(car.yaw) * car.v;
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
    if (car.M.fly) { (car.M.hover ? hoverUpdate : flyUpdate)(dt, keys); return; }
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
  let pilot = false;                                                                                 // pilot view: you look out of the cockpit of the plane
  const eye = new THREE.Vector3();
  const showPilot = () => {                                                                         // in pilot view the cockpit shows and the propeller (which would fill the window) hides
    if (!car || !car.M.fly) return;
    const p = pilot && driving, ud = car.g.userData;
    if (ud.prop) ud.prop.visible = !p;
    if (ud.shell) for (const m of ud.shell) m.visible = !p;
    if (ud.cockpit) ud.cockpit.visible = p;
  };
  function togglePilot() {
    if (!car || !driving || !car.M.fly) return;
    pilot = !pilot; showPilot();
    toast(pilot ? "Pilot view. Press C to see the plane from outside again." : "Chase view. Press C for the pilot view.");
  }

  function camera(cam, dt) {
    if (!car) return;
    if (car.M.fly && pilot) {                                                                          // the pilot's seat: the camera rolls and pitches with the plane
      car.g.updateMatrixWorld(true);
      cam.position.copy(car.g.localToWorld(eye.set(...(car.M.eye || [0, 2.0, -0.95]))));
      cam.quaternion.copy(car.g.quaternion);
      camYaw = car.yaw;
      const ck = car.g.userData.cockpit;
      if (ck) {                                                                                        // the dials show how you are flying and the wheel follows your hands
        const u = ck.userData, d = (f) => 2.356 - Math.max(0, Math.min(1, f)) * 4.712;
        u.needles.speed.rotation.z = d(Math.abs(car.v) / 70); u.needles.alt.rotation.z = d(car.alt / 400); u.needles.compass.rotation.z = -car.yaw;
        u.lever.position.y = -0.14 + car.throttle * 0.2;
        u.yoke.rotation.z += (-(car.steerIn || 0) * 0.7 - u.yoke.rotation.z) * Math.min(1, dt * 8);
        u.yoke.position.z += (-1.4 + (car.pitchIn || 0) * 0.07 - u.yoke.position.z) * Math.min(1, dt * 6);
      }
      if (player.shake > 0) { cam.position.x += (Math.random() - 0.5) * player.shake * 0.4; cam.position.y += (Math.random() - 0.5) * player.shake * 0.3; player.shake = Math.max(0, player.shake - dt * 2.4); }
      const f = $("#flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
      return;
    }
    if (car.M.fly) {                                                                                   // behind and above the plane, looking where it is going
      let dy = car.yaw - camYaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      camYaw += dy * Math.min(1, dt * 2.6);
      const k = car.M.cam || 1, fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), d = (17 + Math.abs(car.v) * 0.07) * k, cx = car.x - fx * d, cz = car.z - fz * d;
      cam.position.set(cx, Math.max(groundAt(cx, cz) + 1.6, car.y + (car.M.camY || 5.2) - car.pitch * 6), cz);
      cam.lookAt(car.x + fx * 9 * k, car.y + (car.M.lookY || 1.3) + car.pitch * 5, car.z + fz * 9 * k);
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
    MODELS, model, deploy, stow, enter, exit, toggleEnter, togglePilot, update, camera, nearby, onEra,
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
    state: () => (car && driving ? { x: car.x, z: car.z, yaw: car.yaw, v: car.v, alt: car.alt || 0, roll: car.roll || 0 } : null),
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
