"use strict";
// The aircraft you can buy at the animals and rides stall in the modern cities: jets of every size, an airliner, a freighter, military planes, a glider, a gyrocopter,
// a helicopter, a tiltrotor, an airship and a hot air balloon. This file holds their numbers (Car merges AIRCRAFT into its MODELS, and Market makes a shop item from each one)
// and their 3D models. How they fly is in car.js. Loaded before car.js and market.js. Every model faces -z, with its wheels (or skids or basket) on y = 0.
//   air:  "wing" (fixed wing: needs a run to take off), "heli", "vtol" (tiltrotor), "blimp" or "balloon"
//   wing: { lift: speed you can take off at, stall: below this you sink, ceiling }      climb: m/s up       span: wing span (the wingtips hit buildings)
//   eye:  where the pilot's eyes are (pilot view)      cam, camY, lookY: how far back and up the chase camera sits      rad: size of the rotors or the envelope (for crashes)

const AIRCRAFT = (() => {
  const T = THREE;
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const box = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  // a cylinder lying along z: r1 at the nose end (-z), r2 at the tail end
  const tube = (r1, r2, len, mat, x, y, z) => { const m = new T.Mesh(new T.CylinderGeometry(r1, r2, len, 14), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; return m; };
  const ball = (rx, ry, rz, mat, x, y, z) => { const m = new T.Mesh(new T.SphereGeometry(1, 16, 12), mat); m.scale.set(rx, ry, rz); m.position.set(x, y, z); m.castShadow = true; return m; };
  const wheelAt = (r, w, x, y, z) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, w, 12), lam(0x1a1a1a)); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m; };
  const rope = (a, b, mat) => {                                                                       // a thin stick from point a to point b
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = new T.Mesh(new T.BoxGeometry(0.05, d.length(), 0.05), mat);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); return m;
  };
  const spin = (u, o, axis, s) => { (u.rotors = u.rotors || []).push({ o, axis, s }); };

  // ---- fixed-wing jets and big planes: one builder, many shapes. o: col, stripe, win (windows), wing "low"|"high", sweep, eng "wing"|"rear"|"fighter", engines (2 or 4), tail "T"|"low"|"twin", r (fuselage radius)
  function jet(M, o) {
    const g = new T.Group(), wheels = [];
    const L = M.len, S = M.span, r = o.r || Math.max(0.55, L * 0.06), gr = 0.3 + L * 0.008, y0 = r + gr * 2 + 0.2;
    const white = lam(o.col), acc = lam(o.stripe), dk = lam(0x2b2b2b), steel = lam(0x8a8f96), glass = lam(0x1d3a4a);
    g.add(tube(r, r, L * 0.45, white, 0, y0, -L * 0.075), tube(r * 0.2, r, L * 0.2, white, 0, y0, -L * 0.4), tube(r, r * 0.25, L * 0.35, white, 0, y0, L * 0.325));    // the tube, the nose and the tail cone
    g.add(box(r * 2.04, r * 0.16, L * 0.45, acc, 0, y0 - r * 0.1, -L * 0.075));                       // a coloured band along the sides
    if (o.eng === "fighter") g.add(ball(r * 0.7, r * 0.5, L * 0.12, glass, 0, y0 + r * 0.75, -L * 0.2));   // bubble canopy
    else g.add(box(r * 1.5, r * 0.5, L * 0.07, glass, 0, y0 + r * 0.45, -L * 0.32));                // cockpit windows
    if (o.win) for (let z = -L * 0.26; z < L * 0.16; z += 1.1) for (const sx of [-1, 1]) g.add(box(0.05, r * 0.26, 0.4, glass, sx * (r + 0.01), y0 + r * 0.2, z));
    // wings
    const wy = o.wing === "high" ? y0 + r * 0.8 : y0 - r * 0.45, hs = S / 2 - r, chord = o.eng === "fighter" ? L * 0.3 : L * 0.16, wz = o.eng === "fighter" ? L * 0.12 : L * 0.04;
    for (const sx of [-1, 1]) {
      const root = new T.Group(); root.position.set(sx * r * 0.9, wy, wz); root.rotation.y = sx * (o.sweep || 0.35);
      root.add(box(hs, 0.16, chord, white, sx * hs / 2, 0, 0), box(hs, 0.18, 0.18, acc, sx * hs / 2, 0, -chord / 2));
      root.add(box(0.12, 0.7 + L * 0.02, chord * 0.5, acc, sx * hs, 0.35 + L * 0.01, 0));       // winglet
      g.add(root);
    }
    // engines
    if (o.eng === "wing") {
      const xs = o.engines === 4 ? [0.3, 0.6] : [0.4];
      for (const f of xs) for (const sx of [-1, 1]) {
        const x = sx * (r + hs * f);
        g.add(tube(r * 0.46, r * 0.4, L * 0.12, steel, x, wy - r * 0.6, wz - chord * 0.55), tube(r * 0.3, r * 0.3, L * 0.125, dk, x, wy - r * 0.6, wz - chord * 0.55 - 0.02));
      }
    } else if (o.eng === "rear") {
      for (const sx of [-1, 1]) g.add(tube(r * 0.42, r * 0.34, L * 0.14, steel, sx * (r + r * 0.6), y0 + r * 0.45, L * 0.27), box(0.3, 0.5, L * 0.12, white, sx * (r + r * 0.25), y0 + r * 0.3, L * 0.27));
    } else {
      g.add(tube(r * 0.7, r * 0.55, L * 0.12, dk, 0, y0, L * 0.5), tube(r * 0.5, r * 0.5, L * 0.13, lam(0xff7a2a), 0, y0, L * 0.5));    // fighter: one big exhaust with a hot glow
      for (const sx of [-1, 1]) g.add(box(r * 0.55, r * 0.8, L * 0.16, dk, sx * (r + 0.1), y0 - r * 0.1, -L * 0.15));                  // the air intakes
    }
    // tail
    const fin = o.finH || r * 2.4 + L * 0.03;
    const addFin = (x, tilt) => { const f = box(0.14, fin, L * 0.16, o.fin ? lam(o.fin) : white, x, y0 + r * 0.6 + fin / 2 - 0.1, L * 0.4); f.rotation.x = 0.3; f.rotation.z = tilt; g.add(f); return f; };
    if (o.tail === "twin") { addFin(r * 0.9, 0.4); addFin(-r * 0.9, -0.4); } else addFin(0, 0);
    const sy = o.tail === "T" ? y0 + r * 0.6 + fin - 0.2 : y0 + r * 0.1;
    for (const sx of [-1, 1]) { const st = new T.Group(); st.position.set(sx * 0.2, sy, L * (o.tail === "T" ? 0.46 : 0.42)); st.rotation.y = sx * 0.35; st.add(box(S * 0.17, 0.1, L * 0.08, white, sx * S * 0.085, 0, 0)); g.add(st); }
    // landing gear: a nose wheel and the main wheels (double for the big ones)
    const strut = (x, z) => { g.add(box(0.12, y0 - r - gr, 0.12, dk, x, (y0 - r + gr) / 2 + 0.05, z)); };
    const gear = (x, z) => { const w = wheelAt(gr, 0.22, x, gr, z); g.add(w); wheels.push(w); strut(x, z); };
    gear(0, -L * 0.3); for (const sx of [-1, 1]) { gear(sx * r * 1.5, L * 0.08); if (L > 17) gear(sx * r * 1.5, L * 0.08 + gr * 2.4); }
    return { g, wheels };
  }

  // ---- a glider: a slim body, very long thin wings and a T-tail
  function glider(M) {
    const g = new T.Group(), wheels = [], white = lam(0xf5f7fa), red = lam(0xc0262b), glass = lam(0x1d3a4a);
    g.add(tube(0.4, 0.45, 2.6, white, 0, 1.0, -1.3), tube(0.45, 0.12, 4.0, white, 0, 1.0, 2.0), ball(0.45, 0.4, 1.0, glass, 0, 1.3, -1.2));
    g.add(box(M.span, 0.1, 1.1, white, 0, 1.45, -0.2), box(M.span, 0.12, 0.2, red, 0, 1.45, -0.8));
    g.add(box(0.1, 1.2, 0.8, white, 0, 1.8, 3.8), box(2.6, 0.08, 0.6, white, 0, 2.4, 3.9));
    const w = wheelAt(0.2, 0.1, 0, 0.2, -0.5); g.add(w, box(0.08, 0.6, 0.08, lam(0x2b2b2b), 0, 0.5, -0.5)); wheels.push(w);
    return { g, wheels };
  }

  // ---- a gyrocopter: an open frame, a free-spinning rotor on a mast and a pusher propeller at the back
  function gyro(M) {
    const g = new T.Group(), wheels = [], u = g.userData, dk = lam(0x2b2b2b), red = lam(0xc0262b), steel = lam(0xb0b4ba);
    g.add(box(0.2, 0.2, 3.0, dk, 0, 0.7, 0.2), box(0.5, 0.15, 0.6, red, 0, 0.95, -0.2), box(0.5, 0.5, 0.15, red, 0, 1.2, 0.05), box(0.14, 1.9, 0.14, steel, 0, 1.7, 0.2));
    g.add(box(0.5, 0.5, 0.7, dk, 0, 1.0, 1.2), box(0.1, 0.9, 0.9, red, 0, 1.2, 1.7), box(0.08, 0.5, 0.5, red, 0, 0.8, 1.7));
    const rotor = new T.Group(); rotor.position.set(0, 2.7, 0.2); rotor.add(box(6.4, 0.05, 0.28, dk, 0, 0, 0)); g.add(rotor); spin(u, rotor, "y", 24);
    const prop = new T.Group(); prop.position.set(0, 1.0, 1.65); prop.add(box(0.1, 1.5, 0.05, dk, 0, 0, 0)); g.add(prop); spin(u, prop, "z", 60);
    for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [0, 1.6]]) { const w = wheelAt(0.22, 0.12, x, 0.22, z); g.add(w); wheels.push(w); }
    g.add(box(0.06, 0.5, 0.06, dk, -0.6, 0.45, -0.9), box(0.06, 0.5, 0.06, dk, 0.6, 0.45, -0.9));
    return { g, wheels };
  }

  // ---- a helicopter
  function heli(M) {
    const g = new T.Group(), wheels = [], u = g.userData, red = lam(M.color), dk = lam(0x2b2b2b), glass = lam(0x1d3a4a), white = lam(0xf2f2f4);
    g.add(ball(1.1, 1.05, 2.0, red, 0, 1.9, -0.2), ball(0.95, 0.75, 1.2, glass, 0, 2.05, -1.4));
    g.add(box(0.36, 0.4, 4.6, red, 0, 2.2, 3.1), box(0.1, 1.4, 0.9, white, 0, 2.7, 5.2), box(1.1, 0.08, 0.5, white, 0, 2.3, 5.0));
    g.add(box(0.2, 0.7, 0.2, dk, 0, 3.2, -0.1));
    const rotor = new T.Group(); rotor.position.set(0, 3.6, -0.1); rotor.add(box(9.6, 0.05, 0.35, dk, 0, 0, 0), box(0.35, 0.05, 9.6, dk, 0, 0, 0)); g.add(rotor); spin(u, rotor, "y", 34);
    const tail = new T.Group(); tail.position.set(0.25, 2.7, 5.2); tail.add(box(0.05, 1.8, 0.14, dk, 0, 0, 0), box(0.05, 0.14, 1.8, dk, 0, 0, 0)); g.add(tail); spin(u, tail, "x", 50);
    for (const sx of [-1, 1]) { g.add(box(0.12, 0.12, 3.4, dk, sx * 1.1, 0.12, -0.2), box(0.1, 1.0, 0.1, dk, sx * 1.0, 0.65, -1.0), box(0.1, 1.0, 0.1, dk, sx * 1.0, 0.65, 0.6)); }
    return { g, wheels };
  }

  // ---- a tiltrotor: it takes off like a helicopter, then its two rotors tilt forward and it flies like a plane
  function tiltrotor(M) {
    const g = new T.Group(), wheels = [], u = g.userData, white = lam(M.color), dk = lam(0x2b2b2b), glass = lam(0x1d3a4a), steel = lam(0x8a8f96), blue = lam(0x2455a4);
    const y0 = 2.0, L = M.len, S = M.span;
    g.add(tube(0.9, 1.05, L * 0.8, white, 0, y0, 0), tube(0.2, 0.9, L * 0.2, white, 0, y0, -L * 0.5), tube(1.05, 0.3, L * 0.3, white, 0, y0, L * 0.5), ball(0.8, 0.5, 1.0, glass, 0, y0 + 0.35, -L * 0.45));
    g.add(box(S, 0.2, 2.0, white, 0, y0 + 1.0, -0.4), box(S, 0.22, 0.25, blue, 0, y0 + 1.0, -1.4));
    g.add(box(0.12, 2.2, 1.3, white, 0.9, y0 + 1.2, L * 0.55), box(0.12, 2.2, 1.3, white, -0.9, y0 + 1.2, L * 0.55), box(4, 0.12, 1.0, white, 0, y0 + 2.2, L * 0.57));
    u.pods = [];
    for (const sx of [-1, 1]) {
      const pod = new T.Group(); pod.position.set(sx * (S / 2 - 0.4), y0 + 1.1, -0.4); g.add(pod); u.pods.push(pod);
      pod.add(box(0.8, 1.5, 0.8, steel, 0, 0.5, 0));                                              // the pod stands upright with its rotor above it; it tilts forward in flight
      const rotor = new T.Group(); rotor.position.y = 1.4; for (let i = 0; i < 3; i++) { const b = box(0.28, 0.05, 3.4, dk, 0, 0, 0); b.rotation.y = i * Math.PI / 3; rotor.add(b); } pod.add(rotor); spin(u, rotor, "y", 40);
    }
    for (const [x, z] of [[-0.9, 1.0], [0.9, 1.0], [0, -L * 0.35]]) { const w = wheelAt(0.3, 0.2, x, 0.3, z); g.add(w, box(0.1, 1.5, 0.1, dk, x, 1.0, z)); wheels.push(w); }
    return { g, wheels };
  }

  // ---- an airship: a long blue and white gas bag with a gondola underneath and four fins
  function blimp(M) {
    const g = new T.Group(), wheels = [], u = g.userData, bag = lam(M.color), white = lam(0xf2f2f4), dk = lam(0x2b2b2b), glass = lam(0x1d3a4a);
    g.add(ball(3.4, 3.4, 11, bag, 0, 6.3, 0));
    for (const z of [-5, -2, 1, 4]) g.add(ball(3.42, 3.42, 0.45, white, 0, 6.3, z));                 // white bands round the bag
    g.add(box(2.0, 1.3, 4.2, white, 0, 1.9, -0.5), box(1.8, 0.6, 1.2, glass, 0, 2.15, -2.45), box(0.3, 1.8, 0.3, dk, 0, 3.4, -0.5));
    for (const a of [0, 1, 2, 3]) { const f = box(0.12, 3.2, 3.0, bag, 0, 0, 0), p = new T.Group(); p.position.set(0, 6.3, 9.2); p.rotation.z = a * Math.PI / 2; f.position.y = 2.4; p.add(f); g.add(p); }
    for (const sx of [-1, 1]) { const pr = new T.Group(); pr.position.set(sx * 1.25, 1.9, 0.6); pr.add(box(0.08, 1.5, 0.12, dk, 0, 0, 0)); g.add(pr, box(0.5, 0.5, 0.6, dk, sx * 1.1, 1.9, 0.6)); spin(u, pr, "z", 45); }
    const w = wheelAt(0.3, 0.2, 0, 0.3, -0.5); g.add(w, box(0.1, 0.9, 0.1, dk, 0, 0.8, -0.5)); wheels.push(w);
    return { g, wheels };
  }

  // ---- a hot air balloon: a striped envelope, a skirt, ropes, a burner and a wicker basket
  function balloon(M) {
    const g = new T.Group(), u = g.userData, cols = [0xd8412f, 0xf2f2f4, 0xe8b72a, 0x2455a4], wicker = lam(0x9a6b35), dk = lam(0x2b2b2b);
    const N = 12;
    for (let i = 0; i < N; i++) {
      const m = new T.Mesh(new T.SphereGeometry(5.6, 6, 14, (i / N) * Math.PI * 2, (Math.PI * 2) / N, 0, Math.PI * 0.84), new T.MeshLambertMaterial({ color: cols[i % cols.length], side: T.DoubleSide }));
      m.scale.y = 1.25; m.position.y = 10.2; m.castShadow = true; g.add(m);
    }
    g.add(new T.Mesh(new T.CylinderGeometry(1.7, 3.5, 2.4, 12, 1, true), new T.MeshLambertMaterial({ color: 0xd8412f, side: T.DoubleSide })).translateY(4.4));
    g.add(box(1.5, 1.0, 1.5, wicker, 0, 0.5, 0));
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) { g.add(rope([x, 1.0, z], [x * 2.4, 4.4, z * 2.4], dk), box(0.1, 0.45, 0.1, wicker, x, 1.2, z)); }
    g.add(box(0.3, 0.3, 0.3, dk, 0, 2.7, 0));
    const flame = new T.Mesh(new T.ConeGeometry(0.28, 1.2, 8), new T.MeshBasicMaterial({ color: 0xffa530 })); flame.position.set(0, 3.5, 0); flame.visible = false; g.add(flame); u.flame = flame;
    return { g, wheels: [] };
  }

  // The numbers. `price` and `note` make the shop item. Speeds are in m/s (km/h = 3.6 times as much).
  const J = (o) => ({ fly: true, air: "wing", verb: "climb in", accel: 7, turn: 1, ...o });
  const models = {
    glider: J({ name: "Glider", price: 1200, max: 40, glide: 24, turn: 1.1, color: 0xf5f7fa, len: 7.5, wid: 1.2, span: 16, wing: { lift: 17, stall: 12, ceiling: 420 }, climb: 7, spool: 1.4, sink: 1.3, eye: [0, 1.5, -1.4], cam: 1.2, camY: 4, lookY: 1.4, make: glider,
      note: "An unpowered sailplane. Press W for a tow up to 80 m, then it glides. Hold Space to pull up (it costs speed), and look for the rising air of a thermal to climb again." }),
    gyro: J({ name: "Gyrocopter", price: 1500, max: 31, turn: 1.7, color: 0xc0262b, len: 3.2, wid: 1.6, span: 6, wing: { lift: 13, stall: 10, ceiling: 260 }, climb: 7, spool: 1.5, eye: [0, 1.7, -0.3], cam: 0.8, camY: 3.4, lookY: 1.8, make: gyro,
      note: "An open frame with a free-spinning rotor and a pusher propeller. It lifts off at only 47 km/h, so it needs hardly any runway." }),
    helicopter: { name: "Helicopter", price: 4500, fly: true, air: "heli", hover: true, verb: "climb in", max: 50, accel: 6, turn: 1.7, color: 0xc0262b, len: 6.5, wid: 2.4, span: 10, rad: 5.2, radY: 3.4, body: 1.5, ceiling: 320, climb: 9, hard: 8, respond: 0.9, eye: [0, 2.35, -1.2], cam: 1.2, camY: 6, lookY: 2.6, make: heli,
      note: "A helicopter takes off straight up and hovers. W and S fly forward and back, Space climbs, Shift sinks." },
    tiltrotor: { name: "Tiltrotor", price: 7000, fly: true, air: "vtol", hover: true, verb: "climb in", max: 95, accel: 6, turn: 1.3, color: 0xf2f2f4, len: 12, wid: 2.6, span: 14, rad: 7.5, radY: 3.8, body: 2, ceiling: 360, climb: 9, hard: 7, respond: 0.5, eye: [0, 2.7, -4.6], cam: 1.6, camY: 7, lookY: 2.6, make: tiltrotor,
      note: "It takes off like a helicopter, then its rotors tilt forward and it flies like a plane. Top speed 342 km/h." },
    blimp: { name: "Airship", price: 5000, fly: true, air: "blimp", hover: true, verb: "climb in", max: 20, accel: 3, turn: 0.55, color: 0x2455a4, len: 9, wid: 3.4, span: 8, rad: 7, radY: 6, body: 3, ceiling: 300, climb: 4, hard: 6, respond: 0.35, eye: [0, 2.2, -2.5], cam: 2, camY: 8, lookY: 3, make: blimp,
      note: "A long blue gas bag with a gondola. Slow and gentle: it floats at any height and steers like a ship. Top speed 72 km/h." },
    balloon: { name: "Hot air balloon", price: 2000, fly: true, air: "balloon", hover: true, verb: "climb in", max: 10, accel: 1, turn: 0.5, color: 0xd8412f, len: 2.6, wid: 2.6, span: 6, rad: 5.6, radY: 9, body: 1, ceiling: 380, climb: 6, hard: 6, open: true, eye: [0, 1.9, 0], cam: 2.2, camY: 10, lookY: 8, make: balloon,
      note: "Hold Space for the burner to rise; Shift lets the hot air out to sink. You cannot steer: the wind carries you, and it blows in a different direction at each height." },
    vlj: J({ name: "Very light jet", price: 6000, max: 92, turn: 1.1, color: 0xf2f2f4, len: 9, wid: 1.8, span: 11, wing: { lift: 38, stall: 33, ceiling: 380 }, climb: 14, spool: 0.8, eye: [0, 1.95, -3.0], cam: 1.2, camY: 5.5, lookY: 1.5, o: { col: 0xf2f2f4, stripe: 0x2455a4, wing: "low", eng: "rear", tail: "T", sweep: 0.2 },
      note: "A small four-seat jet (like the HondaJet) that can use short runways. Top speed 331 km/h." }),
    lightjet: J({ name: "Light jet", price: 8000, max: 104, turn: 1.05, color: 0xf2f2f4, len: 11, wid: 2.0, span: 13, wing: { lift: 42, stall: 37, ceiling: 380 }, climb: 14, spool: 0.75, eye: [0, 2.1, -3.6], cam: 1.35, camY: 6, lookY: 1.6, o: { col: 0xf2f2f4, stripe: 0xc0262b, wing: "low", eng: "rear", tail: "T", sweep: 0.25, win: true },
      note: "A six to nine seat business jet (like the Cessna Citation). Top speed 374 km/h." }),
    midjet: J({ name: "Midsize jet", price: 10000, max: 115, turn: 1.0, color: 0xeef1f4, len: 14, wid: 2.3, span: 16, wing: { lift: 46, stall: 41, ceiling: 380 }, climb: 13, spool: 0.7, eye: [0, 2.3, -4.6], cam: 1.5, camY: 6.5, lookY: 1.8, o: { col: 0xeef1f4, stripe: 0x1f6a5a, wing: "low", eng: "rear", tail: "T", sweep: 0.3, win: true },
      note: "A jet with a stand-up cabin for eight to ten people. Top speed 414 km/h." }),
    supermid: J({ name: "Super midsize jet", price: 12000, max: 126, turn: 0.95, color: 0xeef1f4, len: 16, wid: 2.5, span: 18, wing: { lift: 50, stall: 45, ceiling: 380 }, climb: 13, spool: 0.65, eye: [0, 2.5, -5.2], cam: 1.7, camY: 7, lookY: 2, o: { col: 0xeef1f4, stripe: 0x6b2a8c, wing: "low", eng: "rear", tail: "T", sweep: 0.32, win: true },
      note: "A larger-cabin jet for up to twelve passengers. Top speed 454 km/h." }),
    heavyjet: J({ name: "Heavy long-range jet", price: 16000, max: 138, turn: 0.9, color: 0xe9edf1, len: 19, wid: 2.8, span: 21, wing: { lift: 54, stall: 49, ceiling: 380 }, climb: 12, spool: 0.6, eye: [0, 2.7, -6.4], cam: 1.9, camY: 7.5, lookY: 2.2, o: { col: 0xe9edf1, stripe: 0x1d2a4a, wing: "low", eng: "rear", tail: "T", sweep: 0.36, win: true },
      note: "A giant business jet with lie-flat beds that can fly right round the world. Top speed 497 km/h." }),
    airliner: J({ name: "Airliner", price: 20000, max: 148, turn: 0.75, color: 0xf4f6f8, len: 24, wid: 3.4, span: 26, wing: { lift: 60, stall: 54, ceiling: 380 }, climb: 11, spool: 0.45, eye: [0, 3.0, -8.4], cam: 2.2, camY: 9, lookY: 2.6, o: { col: 0xf4f6f8, stripe: 0x1d4fa0, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.42, win: true, fin: 0x1d4fa0 },
      note: "A twin-engine passenger jet like a Boeing 737. It needs a long, long street to take off. Top speed 533 km/h." }),
    b777x: J({ name: "Boeing 777X", price: 40000, max: 152, turn: 0.65, color: 0xf4f6f8, len: 32, wid: 4.2, span: 36, wing: { lift: 66, stall: 60, ceiling: 380 }, climb: 10, spool: 0.38, eye: [0, 3.7, -11.4], cam: 2.5, camY: 11, lookY: 3, o: { col: 0xf4f6f8, stripe: 0xc79a2a, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.44, r: 2.1, win: true, fin: 0xc79a2a },
      note: "The newest and biggest twin-engine airliner, with huge engines and very long wings. It needs the longest run of any passenger plane. Top speed 547 km/h." }),
    a350: J({ name: "Airbus A350", price: 38000, max: 150, turn: 0.68, color: 0xf4f6f8, len: 30, wid: 4.0, span: 34, wing: { lift: 64, stall: 58, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 3.5, -10.6], cam: 2.4, camY: 10.5, lookY: 3, o: { col: 0xf4f6f8, stripe: 0x00205b, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.95, win: true, fin: 0x00205b },
      note: "A long-range twin-engine airliner with curved wingtips and a wide cabin. Top speed 540 km/h." }),
    cargo: J({ name: "Cargo freighter", price: 24000, max: 148, turn: 0.65, color: 0xe4e0d4, len: 30, wid: 4.2, span: 32, wing: { lift: 64, stall: 58, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 3.9, -10.6], cam: 2.5, camY: 11, lookY: 3, o: { col: 0xe4e0d4, stripe: 0xd9a21b, wing: "low", eng: "wing", engines: 4, tail: "low", sweep: 0.45, r: 2.0, fin: 0xd9a21b },
      note: "A huge four-engine freight plane (like the Boeing 747 freighter) with a high nose cockpit and no passenger windows. Top speed 533 km/h." }),
    fighter: J({ name: "Fighter jet", price: 30000, max: 210, turn: 1.8, color: 0x7d838c, len: 14, wid: 2.2, span: 9.5, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -3.6], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x7d838c, stripe: 0x4a4f56, wing: "mid", eng: "fighter", tail: "twin", sweep: 0.8, r: 0.8, finH: 2.0 },
      note: "A military stealth fighter (like the F-35): very fast and quick to turn. Top speed 756 km/h." }),
    bomber: J({ name: "Bomber", price: 36000, max: 160, turn: 0.8, color: 0x4a4f56, len: 22, wid: 3.6, span: 34, wing: { lift: 60, stall: 54, ceiling: 400 }, climb: 11, spool: 0.45, eye: [0, 2.9, -7.2], cam: 2.2, camY: 8, lookY: 2.4, o: { col: 0x4a4f56, stripe: 0x2d3036, wing: "mid", eng: "wing", engines: 4, tail: "low", sweep: 0.6, r: 1.4 },
      note: "A big grey four-engine military bomber with long swept wings. (It carries no bombs here: this game has no way to drop them.) Top speed 576 km/h." }),
    transport: J({ name: "Military transport", price: 28000, max: 140, turn: 0.7, color: 0x6f7a5a, len: 28, wid: 4.4, span: 32, wing: { lift: 62, stall: 56, ceiling: 380 }, climb: 10, spool: 0.42, eye: [0, 3.6, -10.0], cam: 2.4, camY: 10, lookY: 3, o: { col: 0x6f7a5a, stripe: 0x4a5340, wing: "high", eng: "wing", engines: 4, tail: "T", sweep: 0.22, r: 2.2, fin: 0x6f7a5a },
      note: "A green military cargo plane (like the C-17 Globemaster) with a high wing and a T-tail. It can carry tanks. Top speed 504 km/h." }),
  };
  // the fixed-wing jets are built by `jet` from their `o` options
  for (const M of Object.values(models)) if (M.o) { const o = M.o; M.make = (m) => jet(m, o); }
  return models;
})();
