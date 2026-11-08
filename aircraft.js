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
    const A = AircraftGfx, g = new T.Group(), wheels = [], fighter = o.eng === "fighter";
    const L = M.len, S = M.span, r = o.r || Math.max(0.55, L * 0.06), gr = 0.3 + L * 0.008, y0 = r + gr * 2 + 0.2;
    const white = A.paint(o.col), acc = A.paint(o.stripe, 60), dk = lam(0x2b2b2b), steel = A.metal(0x8a8f96), glass = A.glass(), finMat = o.fin ? A.paint(o.fin) : white;
    // the fuselage is one smooth lathe (a rounded nose, a long body and a tail that narrows); a fighter's is slim and pointed
    const body = new T.Mesh(A.fuselage(L, r, fighter ? { noseEnd: 0.34, noseR: 0.02, tailStart: 0.7, tailR: 0.6 } : { noseEnd: 0.21, noseR: 0.2, tailStart: 0.66, tailR: 0.1 }), white); body.position.y = y0; body.castShadow = true; g.add(body);
    if (!fighter) for (const sx of [-1, 1]) { const cl = new T.Mesh(new T.PlaneGeometry(L * 0.44, r * 0.1), new T.MeshPhongMaterial({ color: o.stripe, side: T.DoubleSide, shininess: 60 })); cl.position.set(sx * r * 0.985, y0 - r * 0.12, -L * 0.075); cl.rotation.y = sx * Math.PI / 2; g.add(cl); }        // a coloured stripe along each side
    const strip = (len, z, yy, rr) => { for (const sx of [-1, 1]) { const w = A.windowStrip(len, rr * 0.3); w.position.set(sx * rr * 0.985, yy, z); w.rotation.y = sx * Math.PI / 2; g.add(w); } };
    if (o.deck) {                                                                                   // a double-decker (A380): a second, shorter fuselage on top of the first, with its own row of windows
      const up = new T.Mesh(A.fuselage(L * 0.6, r * 0.82, { noseEnd: 0.3, noseR: 0.3, tailStart: 0.75, tailR: 0.3 }), white); up.position.set(0, y0 + r * 0.72, -L * 0.2); up.castShadow = true; g.add(up);
      strip(L * 0.44, -L * 0.2, y0 + r * 1.2, r * 0.82);
    }
    if (o.hump) { const hu = new T.Mesh(A.fuselage(L * 0.36, r * 0.7, { noseEnd: 0.4, noseR: 0.25, tailStart: 0.7, tailR: 0.3 }), white); hu.position.set(0, y0 + r * 0.78, -L * 0.3); hu.castShadow = true; g.add(hu); }   // a 747-style upper deck hump at the front
    if (o.uav) { /* a drone: no canopy and no cockpit windows */ }
    else if (fighter) g.add(ball(r * 0.7, r * 0.5, L * 0.12, glass, 0, y0 + r * 0.75, -L * 0.2));   // bubble canopy
    else g.add(ball(r * 0.62, r * 0.32, L * 0.04, glass, 0, y0 + r * 0.45, -L * 0.375));              // cockpit windows
    if (o.win) strip(L * 0.42, -L * 0.05, y0 + r * 0.2, r);
    // wings: tapered, swept back, with a little lift at the tips
    const wy = o.wing === "high" ? y0 + r * 0.8 : y0 - r * 0.45, hs = S / 2 - r, chord = fighter ? L * 0.3 : L * 0.16, wz = fighter ? L * 0.12 : L * 0.04, sw = o.sweep || 0.35;
    const tipAt = (f) => ({ x: Math.cos(sw) * hs * f, z: Math.sin(sw) * hs * f });                    // a point along the wing, in the body's frame (z is back)
    for (const sx of [-1, 1]) {
      const root = new T.Group(); root.position.set(sx * r * 0.9, wy, wz); root.rotation.y = -sx * sw; root.rotation.z = sx * 0.03;
      const tipLen = o.tip === "fold" ? S * 0.075 : 0, main = hs - tipLen, taper = fighter ? 0.3 : o.tip === "fold" || o.tip === "curve" ? 0.5 : 0.36;
      const wing = new T.Mesh(A.wingGeo(main, chord * 1.25, chord * taper, 0.16 + L * 0.004, 0), white); wing.scale.x = sx; wing.castShadow = true; root.add(wing);
      if (o.tip === "fold") {                                                                     // folding wingtips (777X): a hinged outer section that folds up on the ground and stretches out to fly
        const tip = new T.Group(); tip.position.set(sx * main, 0, 0.12); tip.add(box(tipLen, 0.14, chord * 0.5, white, sx * tipLen / 2, 0, 0), box(0.2, 0.2, chord * 0.5, dk, 0, 0, 0));
        tip.rotation.z = sx * 1.45; root.add(tip); (g.userData.tips = g.userData.tips || []).push({ g: tip, side: sx });
      } else if (o.tip === "curve") {                                                             // curved wingtips (A350): the wing bends smoothly up into a blade
        let parent = root, x = sx * main;
        for (let k = 0; k < 4; k++) {
          const seg = new T.Group(), len = S * 0.03, ch = chord * (0.5 - k * 0.08); seg.position.set(k === 0 ? x : sx * len, 0, 0); seg.rotation.z = sx * 0.4;
          seg.add(box(len + 0.05, 0.12, ch, white, sx * len / 2, 0, 0.08 * k));
          parent.add(seg); parent = seg;
        }
      } else { const wl = new T.Mesh(A.finGeo(0.7 + L * 0.02, chord * 0.5, chord * 0.2, chord * 0.2, 0.1), acc); wl.rotation.y = Math.PI / 2; wl.position.set(sx * (hs - 0.05), 0.05, -chord * 0.15); root.add(wl); }   // a plain winglet
      g.add(root);
    }
    // engines
    const engine = (x, y, z, len, rr) => {                                                          // a nacelle with a lip, a fan and a cone, hung on a short pylon under the wing
      const e = A.nacelle(len, rr, white, steel); e.position.set(x, y, z); g.add(e);
      g.add(box(rr * 0.3, (wy - y) * 0.8, len * 0.5, white, x, y + (wy - y) * 0.4, z + len * 0.1));
    };
    if (o.eng === "wing") {
      const xs = o.engines === 8 ? [0.18, 0.34, 0.5, 0.66] : o.engines === 4 ? [0.3, 0.6] : [0.4];
      for (const f of xs) for (const sx of [-1, 1]) { const t = tipAt(f); engine(sx * (r * 0.9 + t.x), wy - r * 0.6, wz + t.z - chord * 0.75, L * 0.13, r * 0.44); }
    } else if (o.eng === "prop") {                                                                  // turboprops (A400M): a nacelle on each wing with a spinning propeller
      for (const f of o.engines === 2 ? [0.4] : [0.28, 0.58]) for (const sx of [-1, 1]) {
        const t = tipAt(f), x = sx * (r * 0.9 + t.x), z = wz + t.z - chord * 0.7, py = wy - r * 0.25;
        g.add(tube(r * 0.3, r * 0.26, L * 0.15, steel, x, py, z + L * 0.02));
        const prop = new T.Group(); prop.position.set(x, py, z - L * 0.06); for (let i = 0; i < 3; i++) { const b = box(0.14, r * 2.1, 0.05, dk, 0, 0, 0); b.rotation.z = i * Math.PI / 3; prop.add(b); } g.add(prop); spin(g.userData, prop, "z", 70);
      }
    } else if (o.eng === "rear") {
      for (const sx of [-1, 1]) { const e = A.nacelle(L * 0.15, r * 0.4, white, steel); e.position.set(sx * (r + r * 0.6), y0 + r * 0.45, L * 0.27); g.add(e, box(0.3, 0.5, L * 0.12, white, sx * (r + r * 0.25), y0 + r * 0.3, L * 0.27)); }
    } else {
      g.add(tube(r * 0.7, r * 0.55, L * 0.12, dk, 0, y0, L * 0.5), tube(r * 0.5, r * 0.5, L * 0.13, lam(0xff7a2a), 0, y0, L * 0.5));    // fighter: one big exhaust with a hot glow
      for (const sx of [-1, 1]) g.add(box(r * 0.55, r * 0.8, L * 0.16, dk, sx * (r + 0.1), y0 - r * 0.1, -L * 0.15));                  // the air intakes
    }
    // tail: a swept fin (twin fins lean out) and tapered tailplanes
    const fin = o.finH || r * 2.4 + L * 0.03, finBase = y0 + r * 0.3;
    const addFin = (x, tilt) => { const f = new T.Mesh(A.finGeo(fin, L * 0.18, L * 0.07, L * 0.1, 0.14), finMat); f.position.set(x, finBase, L * 0.33); f.rotation.z = tilt; f.castShadow = true; g.add(f); return f; };
    if (o.tail === "none") { /* a flying wing: no tail */ } else if (o.tail === "twin") { addFin(r * 0.9, 0.4); addFin(-r * 0.9, -0.4); } else addFin(0, 0);
    const sy = o.tail === "T" ? finBase + fin - 0.1 : y0 + r * 0.1;
    if (o.tail !== "none") for (const sx of [-1, 1]) { const st = new T.Group(); st.position.set(sx * 0.2, sy, L * (o.tail === "T" ? 0.44 : 0.42)); st.rotation.y = -sx * 0.35; const tp = new T.Mesh(A.wingGeo(S * 0.17, L * 0.11, L * 0.05, 0.1, 0), white); tp.scale.x = sx; tp.castShadow = true; st.add(tp); g.add(st); }
    if (o.boom) { const bm = box(0.3, 0.3, L * 0.22, lam(0x555a60), 0, y0 - r * 0.6, L * 0.44); bm.rotation.x = 0.22; g.add(bm, box(S * 0.09, 0.06, 0.5, lam(0x555a60), 0, y0 - r * 0.6 + 0.4, L * 0.52)); }   // the tanker's refuelling boom
    if (o.canard) for (const sx of [-1, 1]) { const c = new T.Mesh(A.wingGeo(S * 0.17, L * 0.1, L * 0.05, 0.07, 0), white); c.scale.x = sx; c.position.set(sx * r * 0.9, y0 + r * 0.25, -L * 0.26); g.add(c); }   // small front wings (Typhoon)
    if (o.pods) for (const sx of [-1, 1]) g.add(tube(0.2, 0.16, 1.7, dk, sx * (r * 0.9 + hs * Math.cos(sw)), wy + 0.12, wz + hs * Math.sin(sw)));   // wingtip pods (Growler)
    // landing gear: a nose wheel and the main wheels (double for the big ones)
    const strut = (x, z) => { g.add(box(0.12, y0 - r - gr, 0.12, dk, x, (y0 - r + gr) / 2 + 0.05, z)); };
    const gear = (x, z) => { const w = A.wheelMesh(gr, 0.22, x, gr, z); g.add(w); wheels.push(w); strut(x, z); };
    gear(0, -L * 0.3); for (const sx of [-1, 1]) { gear(sx * r * 1.5, L * 0.08); if (L > 17) gear(sx * r * 1.5, L * 0.08 + gr * 2.4); }
    // navigation lights on the wingtips and tail, and the strobes (Car makes them flash)
    if (!o.uav) { const t = tipAt(o.tip === "fold" ? 1 - S * 0.075 / hs : 1); A.addLights(g, 2 * (r * 0.9 + t.x), wy + 0.15, wz + t.z, finBase + fin, L * 0.4, 0.1 + L * 0.004); }
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

  // ---- a scaled copy of the helicopter (the Little Bird and the Airbus helicopters are the same shape in another size and colour)
  const scaled = (build, k) => (M) => { const r = build(M); r.g.scale.setScalar(k); return r; };

  // ---- an attack helicopter (Apache): a slim body, a two-seat tandem cockpit, stub wings with weapon pods, a chin gun and a four-blade rotor
  function gunship(M) {
    const g = new T.Group(), wheels = [], u = g.userData, body = lam(M.color), dk = lam(0x2b2b2b), glass = lam(0x1d3a4a);
    g.add(box(1.0, 1.2, 4.2, body, 0, 2.0, -0.3), ball(0.5, 0.45, 1.0, glass, 0, 2.45, -1.7), ball(0.5, 0.45, 0.9, glass, 0, 2.85, -0.3), tube(0.07, 0.07, 1.1, dk, 0, 1.4, -2.5));
    g.add(box(0.36, 0.4, 4.6, body, 0, 2.3, 3.4), box(0.1, 1.5, 0.9, body, 0, 2.9, 5.5), box(1.8, 0.08, 0.5, body, 0, 2.5, 5.3));
    for (const sx of [-1, 1]) g.add(box(1.7, 0.1, 0.8, body, sx * 1.4, 1.85, -0.2), tube(0.16, 0.16, 1.5, dk, sx * 2.0, 1.7, -0.2), box(0.1, 0.45, 0.1, dk, sx * 0.9, 0.9, -0.5), wheelAt(0.22, 0.12, sx * 0.9, 0.25, -0.5));
    g.add(box(0.2, 0.7, 0.2, dk, 0, 2.95, -0.2), wheelAt(0.15, 0.1, 0, 0.2, 5.0), box(0.06, 1.6, 0.06, dk, 0, 1.2, 5.0));
    const rotor = new T.Group(); rotor.position.set(0, 3.4, -0.2); rotor.add(box(7.6, 0.05, 0.3, dk, 0, 0, 0), box(0.3, 0.05, 7.6, dk, 0, 0, 0)); g.add(rotor); spin(u, rotor, "y", 36);
    const tail = new T.Group(); tail.position.set(0.2, 2.8, 5.5); tail.add(box(0.05, 1.6, 0.14, dk, 0, 0, 0), box(0.05, 0.14, 1.6, dk, 0, 0, 0)); g.add(tail); spin(u, tail, "x", 50);
    return { g, wheels };
  }

  // ---- a tandem-rotor transport helicopter (Chinook): a long boxy body with a rotor on a tall pylon at each end, turning in opposite directions
  function tandem(M) {
    const g = new T.Group(), wheels = [], u = g.userData, body = lam(M.color), dk = lam(0x2b2b2b), glass = lam(0x1d3a4a);
    g.add(box(2.2, 2.1, 9.0, body, 0, 2.0, 0.4), box(2.0, 1.1, 1.6, glass, 0, 2.4, -4.4), box(1.7, 1.2, 1.6, body, 0, 1.9, 5.3));      // the cabin, the cockpit windows and the rear ramp
    g.add(box(0.5, 1.5, 0.6, body, 0, 3.6, 5.2), box(0.4, 1.2, 0.4, dk, 0, 3.6, -3.0));                                              // the rear pylon and the front mast
    for (const sx of [-1, 1]) g.add(box(0.5, 0.5, 2.2, dk, sx * 1.15, 1.1, -0.5), wheelAt(0.3, 0.2, sx * 1.3, 0.3, -2.4), wheelAt(0.3, 0.2, sx * 1.3, 0.3, 3.6), box(0.1, 0.9, 0.1, dk, sx * 1.2, 0.7, -2.4));
    for (const [z, y, s] of [[-3.0, 4.35, 30], [5.2, 4.65, -30]]) {
      const r = new T.Group(); r.position.set(0, y, z); for (let i = 0; i < 3; i++) { const b = box(0.3, 0.05, 7.4, dk, 0, 0, 0); b.rotation.y = i * Math.PI / 3; r.add(b); } g.add(r); spin(u, r, "y", s);
    }
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
    a380: J({ name: "Airbus A380", price: 50000, max: 150, turn: 0.6, color: 0xf4f6f8, len: 36, wid: 4.8, span: 40, wing: { lift: 68, stall: 62, ceiling: 380 }, climb: 9, spool: 0.34, eye: [0, 5.0, -13.2], cam: 2.8, camY: 12, lookY: 3.6, o: { col: 0xf4f6f8, stripe: 0x6b2a8c, wing: "low", eng: "wing", engines: 4, tail: "low", sweep: 0.38, r: 2.4, win: true, fin: 0x6b2a8c, deck: true },
      note: "The double-decker superjumbo: two full decks of seats, four engines and enormous wings, the biggest passenger plane of all. It needs the longest run there is. Top speed 540 km/h." }),
    b777x: J({ name: "Boeing 777X", price: 40000, max: 152, turn: 0.65, color: 0xf4f6f8, len: 32, wid: 4.2, span: 36, wing: { lift: 66, stall: 60, ceiling: 380 }, climb: 10, spool: 0.38, eye: [0, 3.7, -11.4], cam: 2.5, camY: 11, lookY: 3, o: { col: 0xf4f6f8, stripe: 0xc79a2a, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.44, r: 2.1, win: true, fin: 0xc79a2a, tip: "fold" },
      note: "The newest and biggest twin-engine airliner, with huge engines and very long wings. It needs the longest run of any passenger plane. The wingtips fold up on the ground and stretch out to fly. Top speed 547 km/h." }),
    a350: J({ name: "Airbus A350", price: 38000, max: 150, turn: 0.68, color: 0xf4f6f8, len: 30, wid: 4.0, span: 34, wing: { lift: 64, stall: 58, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 3.5, -10.6], cam: 2.4, camY: 10.5, lookY: 3, o: { col: 0xf4f6f8, stripe: 0x00205b, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.95, win: true, fin: 0x00205b, tip: "curve" },
      note: "A long-range twin-engine airliner with wingtips that curve smoothly upwards and a wide cabin. Top speed 540 km/h." }),
    cargo: J({ name: "Cargo freighter", price: 24000, max: 148, turn: 0.65, color: 0xe4e0d4, len: 30, wid: 4.2, span: 32, wing: { lift: 64, stall: 58, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 3.9, -10.6], cam: 2.5, camY: 11, lookY: 3, o: { col: 0xe4e0d4, stripe: 0xd9a21b, wing: "low", eng: "wing", engines: 4, tail: "low", sweep: 0.45, r: 2.0, fin: 0xd9a21b },
      note: "A huge four-engine freight plane (like the Boeing 747 freighter) with a high nose cockpit and no passenger windows. Top speed 533 km/h." }),
    fighter: J({ name: "Fighter jet", price: 30000, max: 210, turn: 1.8, color: 0x7d838c, len: 14, wid: 2.2, span: 9.5, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -3.6], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x7d838c, stripe: 0x4a4f56, wing: "mid", eng: "fighter", tail: "twin", sweep: 0.8, r: 0.8, finH: 2.0 },
      note: "A military stealth fighter (like the F-35): very fast and quick to turn. Top speed 756 km/h." }),
    bomber: J({ name: "Bomber", price: 36000, max: 160, turn: 0.8, color: 0x4a4f56, len: 22, wid: 3.6, span: 34, wing: { lift: 60, stall: 54, ceiling: 400 }, climb: 11, spool: 0.45, eye: [0, 2.9, -7.2], cam: 2.2, camY: 8, lookY: 2.4, o: { col: 0x4a4f56, stripe: 0x2d3036, wing: "mid", eng: "wing", engines: 4, tail: "low", sweep: 0.6, r: 1.4 },
      note: "A big grey four-engine military bomber with long swept wings. (It carries no bombs here: this game has no way to drop them.) Top speed 576 km/h." }),
    transport: J({ name: "Military transport", price: 28000, max: 140, turn: 0.7, color: 0x6f7a5a, len: 28, wid: 4.4, span: 32, wing: { lift: 62, stall: 56, ceiling: 380 }, climb: 10, spool: 0.42, eye: [0, 3.6, -10.0], cam: 2.4, camY: 10, lookY: 3, o: { col: 0x6f7a5a, stripe: 0x4a5340, wing: "high", eng: "wing", engines: 4, tail: "T", sweep: 0.22, r: 2.2, fin: 0x6f7a5a },
      note: "A green military cargo plane (like the C-17 Globemaster) with a high wing and a T-tail. It can carry tanks. Top speed 504 km/h." }),
    b737max: J({ name: "Boeing 737 MAX", price: 23000, max: 150, turn: 0.75, color: 0xf4f6f8, len: 26, wid: 3.7, span: 28, wing: { lift: 58, stall: 52, ceiling: 380 }, climb: 11, spool: 0.45, eye: [0, 3.8, -9.1], cam: 2.3, camY: 9.8, lookY: 3.0, o: { col: 0xf4f6f8, stripe: 0x1d4fa0, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.75, win: true, fin: 0x1d4fa0 },
      note: "The single-aisle workhorse of short and medium routes, with large modern engines and split winglets. Top speed 540 km/h." }),
    b787: J({ name: "Boeing 787 Dreamliner", price: 37000, max: 150, turn: 0.68, color: 0xf4f6f8, len: 29, wid: 4.1, span: 33, wing: { lift: 60, stall: 54, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 4.1, -10.1], cam: 2.6, camY: 10.9, lookY: 3.2, o: { col: 0xf4f6f8, stripe: 0x2f9fd4, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.95, win: true, tip: "curve", fin: 0x2f9fd4 },
      note: "A long-range twin-engine airliner built from carbon composites, with big windows and raked wingtips. Top speed 540 km/h." }),
    b777: J({ name: "Boeing 777", price: 36000, max: 152, turn: 0.65, color: 0xf4f6f8, len: 32, wid: 4.4, span: 35, wing: { lift: 62, stall: 56, ceiling: 380 }, climb: 10, spool: 0.38, eye: [0, 4.4, -11.2], cam: 2.9, camY: 12.0, lookY: 3.4, o: { col: 0xf4f6f8, stripe: 0xb02a2a, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.42, r: 2.1, win: true, fin: 0xb02a2a },
      note: "A big twin-engine long-haul airliner with the largest jet engines on any twin. The 777X is its newer, longer-winged cousin. Top speed 547 km/h." }),
    b767f: J({ name: "Boeing 767 freighter", price: 27000, max: 148, turn: 0.7, color: 0xe4e0d4, len: 27, wid: 4.0, span: 31, wing: { lift: 59, stall: 53, ceiling: 380 }, climb: 10, spool: 0.42, eye: [0, 4.0, -9.4], cam: 2.4, camY: 10.1, lookY: 3.1, o: { col: 0xe4e0d4, stripe: 0x7a4a1f, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.9, win: false, fin: 0x7a4a1f },
      note: "A freight version of the twin-engine 767, with no passenger windows. Used for parcels all around the world. Top speed 533 km/h." }),
    bbj: J({ name: "Boeing Business Jet", price: 26000, max: 150, turn: 0.8, color: 0xf4f6f8, len: 25, wid: 3.6, span: 28, wing: { lift: 58, stall: 52, ceiling: 380 }, climb: 12, spool: 0.5, eye: [0, 3.7, -8.8], cam: 2.2, camY: 9.4, lookY: 2.9, o: { col: 0xf4f6f8, stripe: 0xc79a2a, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.7, win: true, fin: 0xc79a2a },
      note: "A private VIP jet built on a 737 airframe, with a gold stripe and a fully fitted cabin. Top speed 540 km/h." }),
    vc25: J({ name: "Air Force One (VC-25)", price: 60000, max: 150, turn: 0.6, color: 0xf4f6f8, len: 36, wid: 4.6, span: 36, wing: { lift: 65, stall: 59, ceiling: 380 }, climb: 9, spool: 0.34, eye: [0, 4.6, -12.6], cam: 3.2, camY: 13.5, lookY: 3.6, o: { col: 0xf4f6f8, stripe: 0x5b8fc9, wing: "low", eng: "wing", engines: 4, tail: "low", sweep: 0.42, r: 2.2, win: true, hump: true, fin: 0x1d4fa0 },
      note: "A jumbo jet in the blue and white colours of the presidential plane, with four engines and a hump on the nose. Top speed 540 km/h." }),
    b52: J({ name: "B-52 Stratofortress", price: 55000, max: 150, turn: 0.6, color: 0x9aa1a8, len: 40, wid: 3.6, span: 46, wing: { lift: 68, stall: 62, ceiling: 380 }, climb: 9, spool: 0.35, eye: [0, 3.9, -14.0], cam: 3.6, camY: 15.0, lookY: 3.1, o: { col: 0x9aa1a8, stripe: 0x6b7078, wing: "high", eng: "wing", engines: 8, tail: "low", sweep: 0.5, r: 1.7, win: false },
      note: "A giant grey bomber with eight engines in pairs under long swept wings. (It carries no bombs here: this game has no way to drop them.) Top speed 540 km/h." }),
    kc46: J({ name: "KC-46 Pegasus", price: 38000, max: 150, turn: 0.7, color: 0x9aa1a8, len: 28, wid: 4.0, span: 31, wing: { lift: 60, stall: 54, ceiling: 380 }, climb: 10, spool: 0.42, eye: [0, 4.0, -9.8], cam: 2.5, camY: 10.5, lookY: 3.1, o: { col: 0x9aa1a8, stripe: 0x6b7078, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.9, win: false, boom: true },
      note: "A military tanker built on the 767, with a long refuelling boom under its tail. Top speed 540 km/h." }),
    p8: J({ name: "P-8 Poseidon", price: 34000, max: 155, turn: 0.85, color: 0x9aa1a8, len: 25, wid: 3.6, span: 28, wing: { lift: 58, stall: 52, ceiling: 380 }, climb: 12, spool: 0.5, eye: [0, 3.7, -8.8], cam: 2.2, camY: 9.4, lookY: 2.9, o: { col: 0x9aa1a8, stripe: 0x555a60, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.7, win: false },
      note: "A grey sub-hunting patrol plane built on a 737, quick and agile for its size. Top speed 558 km/h." }),
    a220: J({ name: "Airbus A220", price: 17000, max: 146, turn: 0.85, color: 0xf4f6f8, len: 21, wid: 3.1, span: 23, wing: { lift: 55, stall: 49, ceiling: 380 }, climb: 12, spool: 0.5, eye: [0, 3.2, -7.3], cam: 1.9, camY: 7.9, lookY: 2.6, o: { col: 0xf4f6f8, stripe: 0x00a3a1, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.38, r: 1.45, win: true, fin: 0x00a3a1 },
      note: "A small, efficient single-aisle airliner built for short routes, with wide cabin and engines on the wings. Top speed 526 km/h." }),
    a320neo: J({ name: "Airbus A320neo", price: 24000, max: 148, turn: 0.78, color: 0xf4f6f8, len: 25, wid: 3.5, span: 27, wing: { lift: 58, stall: 52, ceiling: 380 }, climb: 11, spool: 0.46, eye: [0, 3.6, -8.8], cam: 2.2, camY: 9.4, lookY: 2.9, o: { col: 0xf4f6f8, stripe: 0x00205b, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.65, win: true, fin: 0x00205b },
      note: "The world's best-selling single-aisle airliner, with large new-engine-option engines and sharklet wingtips. Top speed 533 km/h." }),
    a321xlr: J({ name: "Airbus A321XLR", price: 28000, max: 148, turn: 0.74, color: 0xf4f6f8, len: 28, wid: 3.6, span: 28, wing: { lift: 60, stall: 54, ceiling: 380 }, climb: 10, spool: 0.44, eye: [0, 3.7, -9.8], cam: 2.5, camY: 10.5, lookY: 2.9, o: { col: 0xf4f6f8, stripe: 0x6b2a8c, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.7, win: true, fin: 0x6b2a8c },
      note: "A stretched single-aisle airliner with an extra fuel tank, able to fly as far as much bigger planes. Top speed 533 km/h." }),
    a330neo: J({ name: "Airbus A330neo", price: 34000, max: 150, turn: 0.68, color: 0xf4f6f8, len: 31, wid: 4.2, span: 36, wing: { lift: 62, stall: 56, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 4.2, -10.8], cam: 2.8, camY: 11.6, lookY: 3.3, o: { col: 0xf4f6f8, stripe: 0x0d6b8c, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.42, r: 2.0, win: true, fin: 0x0d6b8c },
      note: "A medium to long-haul twin-aisle airliner with new engines and larger, curved-tip wings. Top speed 540 km/h." }),
    a350f: J({ name: "Airbus A350F freighter", price: 40000, max: 150, turn: 0.68, color: 0xe4e0d4, len: 31, wid: 4.1, span: 34, wing: { lift: 62, stall: 56, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 4.1, -10.8], cam: 2.8, camY: 11.6, lookY: 3.2, o: { col: 0xe4e0d4, stripe: 0x00205b, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.4, r: 1.95, win: false, tip: "curve", fin: 0x00205b },
      note: "A big freight version of the A350, with curved wingtips and no passenger windows. Top speed 540 km/h." }),
    a400m: J({ name: "Airbus A400M Atlas", price: 30000, max: 130, turn: 0.72, color: 0x6f7a5a, len: 30, wid: 4.4, span: 34, wing: { lift: 52, stall: 46, ceiling: 380 }, climb: 11, spool: 0.42, eye: [0, 4.3, -10.5], cam: 2.7, camY: 11.2, lookY: 3.4, o: { col: 0x6f7a5a, stripe: 0x4a5340, wing: "high", eng: "prop", engines: 4, tail: "T", sweep: 0.12, r: 2.1, win: false, fin: 0x6f7a5a },
      note: "A green military transport with four big propellers and a high wing. It can take off from short runs and carry heavy loads. It flies slower than the jets. Top speed 468 km/h." }),
    a330mrtt: J({ name: "A330 MRTT", price: 38000, max: 150, turn: 0.68, color: 0x9aa1a8, len: 31, wid: 4.2, span: 36, wing: { lift: 62, stall: 56, ceiling: 380 }, climb: 10, spool: 0.4, eye: [0, 4.2, -10.8], cam: 2.8, camY: 11.6, lookY: 3.3, o: { col: 0x9aa1a8, stripe: 0x6b7078, wing: "low", eng: "wing", engines: 2, tail: "low", sweep: 0.42, r: 2.0, win: false, boom: true },
      note: "A military tanker-transport built on the A330, with a refuelling boom under its tail. Top speed 540 km/h." }),
    f15ex: J({ name: "F-15EX Eagle II", price: 36000, max: 225, turn: 1.6, color: 0x9aa1a8, len: 19, wid: 2.2, span: 13, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -4.9], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x9aa1a8, stripe: 0x555a60, wing: "mid", eng: "fighter", tail: "twin", sweep: 0.55, r: 0.95, finH: 2.0 },
      note: "A big twin-engine fighter with huge power and twin tails, quick to climb. Top speed 810 km/h." }),
    superhornet: J({ name: "F/A-18 Super Hornet", price: 33000, max: 215, turn: 1.75, color: 0x7d838c, len: 18, wid: 2.2, span: 12.5, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -4.6], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x7d838c, stripe: 0x1d4fa0, wing: "mid", eng: "fighter", tail: "twin", sweep: 0.6, r: 0.9, finH: 2.0 },
      note: "A carrier-based twin-engine fighter with slanted twin tails, tough and agile. Top speed 774 km/h." }),
    growler: J({ name: "EA-18G Growler", price: 35000, max: 215, turn: 1.7, color: 0x555a60, len: 18, wid: 2.2, span: 12.5, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -4.6], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x555a60, stripe: 0x2d3036, wing: "mid", eng: "fighter", tail: "twin", sweep: 0.6, r: 0.9, finH: 2.0, pods: true },
      note: "The electronic-warfare version of the Super Hornet, in dark grey with pods on its wingtips. Top speed 774 km/h." }),
    f47: J({ name: "F-47 stealth fighter", price: 45000, max: 235, turn: 1.7, color: 0x4a4f56, len: 19, wid: 2.2, span: 14, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -4.9], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x4a4f56, stripe: 0x2d3036, wing: "mid", eng: "fighter", tail: "none", sweep: 1.0, r: 0.9, finH: 2.0 },
      note: "A next-generation stealth fighter: a broad, tailless wing with no fins at all. Very fast. Top speed 846 km/h." }),
    typhoon: J({ name: "Eurofighter Typhoon", price: 34000, max: 225, turn: 1.85, color: 0x8a8f96, len: 16, wid: 2.2, span: 11, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 26, spool: 1.0, eye: [0, 2.1, -4.1], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x8a8f96, stripe: 0x1d4fa0, wing: "mid", eng: "fighter", tail: "low", sweep: 0.95, r: 0.85, finH: 2.2, canard: true },
      note: "A twin-engine delta-winged fighter with small canard wings at the front. Very quick to turn and climb. Top speed 810 km/h." }),
    mq25: J({ name: "MQ-25 Stingray", price: 28000, max: 150, turn: 1.0, color: 0x6a7078, len: 15, wid: 2.2, span: 22, wing: { lift: 40, stall: 34, ceiling: 400 }, climb: 14, spool: 0.8, eye: [0, 2.1, -3.9], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0x6a7078, stripe: 0x2d3036, wing: "high", eng: "fighter", tail: "low", sweep: 0.25, r: 0.85, finH: 2.0, uav: true },
      note: "An unmanned refuelling drone for aircraft carriers: no cockpit and long straight wings. Top speed 540 km/h." }),
    mq28: J({ name: "MQ-28 Ghost Bat", price: 25000, max: 200, turn: 1.8, color: 0xa0a5ab, len: 11.7, wid: 2.2, span: 7.3, wing: { lift: 58, stall: 52, ceiling: 400 }, climb: 22, spool: 1.0, eye: [0, 2.1, -3.0], cam: 1.4, camY: 5.5, lookY: 1.6, o: { col: 0xa0a5ab, stripe: 0x555a60, wing: "mid", eng: "fighter", tail: "twin", sweep: 0.7, r: 0.6, finH: 1.1, uav: true },
      note: "A small stealthy drone that flies alongside crewed jets: no cockpit, with small twin tails. Top speed 720 km/h." }),
    littlebird: { name: "AH-6 Little Bird", price: 7000, fly: true, air: "heli", hover: true, verb: "climb in", max: 55, accel: 6, turn: 1.7, color: 0x7d838c, len: 4.5, wid: 1.7, span: 7.0, rad: 3.6, radY: 2.4, body: 1.0, ceiling: 320, climb: 9, hard: 8, respond: 0.9, eye: [0, 1.65, -0.84], cam: 0.8, camY: 4.2, lookY: 1.8, make: scaled(heli, 0.7),
      note: "A tiny, nimble light helicopter that fits in tight spaces. It hovers and darts about quickly. Top speed 198 km/h." },
    h125: { name: "Airbus H125", price: 5500, fly: true, air: "heli", hover: true, verb: "climb in", max: 56, accel: 6, turn: 1.7, color: 0xf2f2f4, len: 5.5, wid: 2.0, span: 8.5, rad: 4.4, radY: 2.9, body: 1.3, ceiling: 420, climb: 9, hard: 8, respond: 0.9, eye: [0, 2.0, -1.02], cam: 1.0, camY: 5.1, lookY: 2.2, make: scaled(heli, 0.85),
      note: "A single-engine light helicopter that can fly higher than most. Popular for sightseeing and rescue. Top speed 202 km/h." },
    h145: { name: "Airbus H145", price: 8000, fly: true, air: "heli", hover: true, verb: "climb in", max: 54, accel: 6, turn: 1.7, color: 0x2455a4, len: 6.5, wid: 2.4, span: 10.0, rad: 5.2, radY: 3.4, body: 1.5, ceiling: 320, climb: 9, hard: 8, respond: 0.9, eye: [0, 2.35, -1.2], cam: 1.2, camY: 6.0, lookY: 2.6, make: scaled(heli, 1.0),
      note: "A twin-engine helicopter used by air ambulances and police. Steady and powerful. Top speed 194 km/h." },
    h160: { name: "Airbus H160", price: 12000, fly: true, air: "heli", hover: true, verb: "climb in", max: 62, accel: 6, turn: 1.7, color: 0x2f9fd4, len: 7.5, wid: 2.8, span: 11.5, rad: 6.0, radY: 3.9, body: 1.7, ceiling: 320, climb: 9, hard: 8, respond: 0.9, eye: [0, 2.7, -1.38], cam: 1.4, camY: 6.9, lookY: 3.0, make: scaled(heli, 1.15),
      note: "A sleek, quiet medium helicopter with curved blades and good speed. Top speed 223 km/h." },
    nh90: { name: "NH90", price: 18000, fly: true, air: "heli", hover: true, verb: "climb in", max: 60, accel: 6, turn: 1.7, color: 0x6f7a5a, len: 9.1, wid: 3.4, span: 14.0, rad: 7.3, radY: 4.8, body: 2.1, ceiling: 320, climb: 9, hard: 8, respond: 0.9, eye: [0, 3.29, -1.68], cam: 1.7, camY: 8.4, lookY: 3.6, make: scaled(heli, 1.4),
      note: "A big green military transport helicopter that carries troops and cargo. Top speed 216 km/h." },
    apache: { name: "AH-64 Apache", price: 26000, fly: true, air: "heli", hover: true, verb: "climb in", max: 58, accel: 6, turn: 1.7, color: 0x555d4a, len: 6.5, wid: 2.4, span: 10.0, rad: 5.2, radY: 3.4, body: 1.5, ceiling: 320, climb: 9, hard: 8, respond: 0.9, eye: [0, 2.35, -1.7], cam: 1.2, camY: 6.0, lookY: 2.6, make: gunship,
      note: "A dark green attack helicopter with a tandem cockpit, stub wings with pods and a chin gun. (It carries no weapons here.) Top speed 209 km/h." },
    chinook: { name: "CH-47 Chinook", price: 22000, fly: true, air: "heli", hover: true, verb: "climb in", max: 52, accel: 6, turn: 1.7, color: 0x6f7a5a, len: 6.5, wid: 2.4, span: 10.0, rad: 5.2, radY: 3.4, body: 1.5, ceiling: 300, climb: 9, hard: 8, respond: 0.9, eye: [0, 2.7, -4.0], cam: 1.2, camY: 6.0, lookY: 2.6, make: tandem,
      note: "A big transport helicopter with a rotor at each end, which carry heavy loads. Top speed 187 km/h." },
  };
  // the fixed-wing jets are built by `jet` from their `o` options
  for (const M of Object.values(models)) if (M.o) { const o = M.o; M.make = (m) => jet(m, m.o || o); }   // m.o, so that a livery (a painted copy of the model) can change the colours
  return models;
})();

// The paint schemes (liveries) an aircraft can be painted in: a body colour, a stripe colour and a tail colour. The jets use all three; the
// helicopters, tiltrotor and airship use the body colour. The glider, gyrocopter and balloon are not painted.
const LIVERIES = [
  { id: "factory", name: "Factory colours" },
  { id: "sunrise", name: "Sunrise", col: 0xf7f2e8, stripe: 0xf08a24, fin: 0xf08a24 },
  { id: "ocean", name: "Ocean", col: 0xf4f6f8, stripe: 0x1aa6c8, fin: 0x1aa6c8 },
  { id: "emerald", name: "Emerald", col: 0xf4f6f8, stripe: 0x1f9d57, fin: 0x1f9d57 },
  { id: "royal", name: "Royal purple", col: 0xf4f6f8, stripe: 0x6b2a8c, fin: 0x6b2a8c },
  { id: "crimson", name: "Crimson", col: 0xb02a2a, stripe: 0xf4f6f8, fin: 0xf4f6f8 },
  { id: "midnight", name: "Midnight", col: 0x1d2a4a, stripe: 0xf2c230, fin: 0xf2c230 },
  { id: "gold", name: "Gold", col: 0xf0e2b0, stripe: 0xc79a2a, fin: 0xc79a2a },
  { id: "chrome", name: "Chrome", col: 0xc9ced4, stripe: 0x2d3036, fin: 0x2d3036 },
  { id: "desert", name: "Desert", col: 0xc2a878, stripe: 0x8a7550, fin: 0x8a7550 },
  { id: "forest", name: "Forest", col: 0x55633f, stripe: 0x3a4630, fin: 0x3a4630 },
  { id: "arctic", name: "Arctic", col: 0xe6eaee, stripe: 0x7a8a99, fin: 0x7a8a99 },
  { id: "night", name: "Night black", col: 0x2a2d31, stripe: 0x555a60, fin: 0x555a60 },
];
const paintable = (M) => !!(M && (M.o || M.air === "heli" || M.air === "vtol" || M.air === "blimp"));
// a copy of the model's numbers in the livery's colours (the builders read `color` and `o` from it)
const paintedModel = (M, lv) => (lv && paintable(M) ? { ...M, color: lv.col, o: M.o && { ...M.o, col: lv.col, stripe: lv.stripe, fin: lv.fin } } : M);
