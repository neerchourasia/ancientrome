"use strict";
// The programme at the Theatre of Pompey: sit in the seats and press V to watch a play, like the games at the Colosseum.
// Five acts, as at a real festival: a prologue with the chorus, a comedy (Plautus' "The Pot of Gold"), a tragedy (Seneca's
// "Medea"), music and dance (a pantomime with an aulos player) and a parade for Pompey's triumph. Performers in masks and
// bright tunics play on the stage, say their lines over their heads, and a caption explains what you are seeing.
// Used by watch.js (the camera and the V key). Depends on world.js (the theatre), fight.js (figures), show.js (animals).

const Theatre = (() => {
  const T = THREE;
  const C = { x: -690, z: -125, R0: 15 };                       // the theatre's centre (see buildPompey in world.js)
  const STAGE = { y: 1.3, z: C.z - 7, w: 28 };                  // the stage: its floor height, its middle, how far the actors may roam each way
  const box = (parent, w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  let scene = null, group = null, items = [], state = {}, act = null, t = 0, done = false, sub = "", focusPos = { x: C.x, z: STAGE.z }, said = new Set();

  function init(sc) { scene = sc; }
  const inTheatre = (x, z) => Math.hypot(x - C.x, z - C.z) < 50 && z > C.z - 14 || (Math.abs(x - C.x) < 31 && z > C.z - 22 && z < C.z);

  // ---------- performers ----------
  function actor(look, x, z, o = {}) {
    const m = Fight.makeFoe(look);
    m.arm.visible = false; m.shieldG.visible = false;
    // a mask: a pale face-plate with a dark open mouth, as in the Roman theatre
    const mask = box(m.g, 0.34, 0.4, 0.06, lam(o.mask || 0xf0e6cc), 0, 1.62, -0.24); box(mask, 0.5, 0.3, 1, lam(0x2a1a14), 0, -0.2, 0.2);
    m.g.position.set(x, o.y || STAGE.y, z);
    group.add(m.g);
    const a = { m, g: m.g, x, z, y: o.y === undefined ? STAGE.y : o.y, hd: 0, sp: 0, phase: Math.random() * 6, name: o.name || "" };
    items.push(a);
    return a;
  }
  function animal(kind, x, z) {
    const a = Animals.make(kind);
    a.g.position.set(x, STAGE.y, z); group.add(a.g);
    const it = { m: a, g: a.g, x, z, y: STAGE.y, hd: 0, sp: 0, phase: 0, isAnimal: true };
    items.push(it);
    return it;
  }
  const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  const bearing = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  function walkTo(a, tx, tz, sp, dt) { const d = dist(a, { x: tx, z: tz }); if (d < 0.2) { a.sp = 0; return true; } a.hd += angDiff(a.hd, bearing(a, { x: tx, z: tz })) * Math.min(1, dt * 8); const s = Math.min(d, sp * dt); a.x += Math.sin(a.hd) * s; a.z += Math.cos(a.hd) * s; a.sp = sp; return false; }
  const say = (a, text, ms = 3.4) => { if (typeof Speech !== "undefined") Speech.say(a, text, ms); };
  // say a line once, when the act's clock passes `at`
  const line = (at, a, text, ms) => { const k = text + at; if (t >= at && !said.has(k)) { said.add(k); say(a, text, ms); } };
  const caption = (at, text) => { if (t >= at) sub = text; };

  // ---------- acts ----------
  const ACTS = {
    prologue: {
      title: "Prologue: the chorus", dur: 28,
      setup() {
        state.chorus = [0, 1, 2, 3, 4].map((i) => actor({ color: [0xe8e0c8, 0xd9c9a0, 0xc9b88a, 0xe0d8c0, 0xd0c4a0][i], plume: 0xd8b03a }, C.x - 30 + i * 3, STAGE.z - 2));
        state.host = actor({ color: 0x6b2a8a, plume: 0xd8b03a }, C.x, STAGE.z + 1, { name: "the prologue" });
        sub = "Pompey built Rome's first stone theatre in 55 BC. Until then, plays were staged in wooden theatres that were pulled down after the festival.";
      },
      tick(dt) {
        const n = state.chorus.length;
        state.chorus.forEach((c, i) => { const a = t * 0.5 + (i / n) * 6.28; walkTo(c, C.x + Math.cos(a) * 9, STAGE.z - 1 + Math.sin(a) * 3.5, 4.5, dt); c.hd = a + Math.PI / 2; });
        state.host.hd = Math.PI; state.host.sp = 0;
        line(3, state.host, "Citizens of Rome, welcome!"); line(9, state.host, "Today we give you laughter... and tears.");
        caption(8, "The actors wore masks, so the people in the back rows could see who each character was. Only men performed in the Roman theatre.");
        caption(18, "The chorus sang and danced between the scenes. About 17,000 people could sit in this theatre.");
        if (t > 27) done = true;
        focusPos = { x: C.x, z: STAGE.z };
      },
    },
    comedy: {
      title: "Comedy: The Pot of Gold (Plautus)", dur: 42,
      setup() {
        state.euclio = actor({ color: 0x8a8070, plume: 0xdddddd }, C.x - 6, STAGE.z, { mask: 0xe8d8b0 });
        state.thief = actor({ color: 0xb3262b, plume: 0x2a1a14 }, C.x + 26, STAGE.z - 3, { mask: 0xf0c8a0 });
        const pot = new T.Mesh(new T.CylinderGeometry(0.28, 0.2, 0.4, 10), lam(0xd9a928)); pot.position.set(0.2, 1.1, -0.3); state.euclio.g.add(pot); state.pot = pot;
        sub = "Plautus' comedy 'The Pot of Gold': old Euclio has found a pot of gold, and cannot trust anyone near it.";
      },
      tick(dt) {
        const { euclio: e, thief: th, pot } = state;
        if (t < 10) { e.hd = 0.5 + Math.sin(t) * 0.8; e.sp = 0; e.x = C.x - 6 + Math.sin(t * 1.3) * 2; }
        else if (t < 24) { // the thief creeps up, Euclio keeps looking round
          const tgt = { x: e.x + 2, z: e.z }; walkTo(th, tgt.x, tgt.z, 2.2, dt);
          e.hd = Math.PI * 0.5 + Math.sin(t * 1.7) * 1.2; e.sp = 0;
        } else if (t < 36) { // the chase: the thief grabs the pot and runs round the stage
          if (pot.parent === e.g) { e.g.remove(pot); th.g.add(pot); pot.position.set(0.25, 1.05, -0.3); }
          const a = (t - 24) * 0.9; const tx = C.x + Math.cos(a) * 17, tz = STAGE.z + Math.sin(a) * 4; walkTo(th, tx, tz, 7, dt);
          walkTo(e, th.x - Math.sin(th.hd) * 3, th.z - Math.cos(th.hd) * 3, 6.4, dt);
        } else { th.sp = 0; e.sp = 0; e.hd = Math.PI; th.hd = Math.PI; }
        line(1, e, "My gold! Not a soul must know!"); line(6, e, "Who is that? Who goes there?"); line(15, th, "Hush... just a peek...");
        line(25, th, "Mine now, old man!"); line(26, e, "STOP THIEF! My pot! My pot!"); line(30, e, "They have robbed me! I am ruined!"); line(37, th, "(He gives the pot back, and bows.)");
        caption(12, "Plautus wrote for the crowd: stock characters like the miser and the cunning servant, fast jokes and chases made people roar with laughter.");
        caption(30, "Molière's 'The Miser', nearly 1,900 years later, borrows the plot of this very play.");
        if (t > 41) done = true;
        focusPos = { x: (e.x + th.x) / 2, z: (e.z + th.z) / 2 };
      },
    },
    tragedy: {
      title: "Tragedy: Medea (Seneca)", dur: 40,
      setup() {
        state.medea = actor({ color: 0x5a1a2a, plume: 0x1a1a1a }, C.x + 5, STAGE.z, { mask: 0xe8dcc8 });
        state.jason = actor({ color: 0x2a4a8a, plume: 0xd8b03a }, C.x - 6, STAGE.z, { mask: 0xf0e6cc });
        state.chorus = [0, 1, 2].map((i) => actor({ color: 0x9a948a, plume: 0x333333 }, C.x - 8 + i * 8, STAGE.z + 5));
        sub = "Seneca's tragedy 'Medea': Jason has abandoned the sorceress Medea, who gave up everything for him.";
      },
      tick(dt) {
        const { medea: m, jason: j } = state;
        m.hd = bearing(m, j); j.hd = bearing(j, m); m.sp = j.sp = 0;
        if (t > 22) { m.m.arm.visible = true; m.m.arm.rotation.x = 2.4 + Math.sin(t * 3) * 0.2; }
        if (t > 30) { walkTo(m, C.x + 24, STAGE.z - 4, 5, dt); }
        state.chorus.forEach((c, i) => { c.hd = Math.PI + Math.sin(t * 0.8 + i) * 0.2; const bow = t > 18 ? Math.min(0.7, (t - 18) * 0.15) : 0; c.g.rotation.x = bow; });
        line(2, j, "Medea, our bond is ended."); line(6, m, "You swore to me, Jason, before the gods!"); line(12, j, "Fate commands it. Creon's daughter will be my bride.");
        line(17, m, "Then I curse your house, and all you love."); line(24, j, "No! Not my sons!"); line(32, m, "Medea... has become herself.");
        caption(10, "Roman tragedy, such as Seneca's, was full of rage and revenge. It was probably read aloud more often than staged, but his plots were famous.");
        caption(26, "The tragic mask had a high forehead and a gaping mouth, which helped carry the voice across a big theatre.");
        if (t > 39) done = true;
        focusPos = { x: (m.x + j.x) / 2, z: STAGE.z };
      },
    },
    dance: {
      title: "Music and dance: the pantomime", dur: 38,
      setup() {
        state.flute = actor({ color: 0x3a6a4a, plume: 0xd8b03a }, C.x - 12, STAGE.z + 6);
        for (const x of [-0.12, 0.12]) { const pipe = box(state.flute.g, 0.05, 0.05, 0.9, lam(0xd9a928), x, 1.15, -0.5); pipe.rotation.y = x * 2.5; }
        state.dancers = [0xd9411f, 0x2f6bd9, 0x2f8f4a, 0xe8c13a].map((c, i) => actor({ color: c, plume: 0xf0e6cc }, C.x - 9 + i * 6, STAGE.z));
        sub = "A pantomime: one masked dancer tells a whole story in movement, while musicians play the double flute (the aulos) and a chorus sings.";
      },
      tick(dt) {
        const n = state.dancers.length;
        state.dancers.forEach((d, i) => {
          const a = t * 0.9 + (i / n) * 6.28, rad = 5 + Math.sin(t * 0.5 + i) * 2.5;
          walkTo(d, C.x + Math.cos(a) * rad * 1.6, STAGE.z + Math.sin(a) * rad * 0.5, 5, dt);
          d.hd = a + Math.PI / 2; d.m.arm.visible = true; d.m.arm.rotation.x = Math.sin(t * 5 + i * 2) * 1.4 + 1.0; d.y = STAGE.y + Math.abs(Math.sin(t * 4 + i)) * 0.35;
        });
        state.flute.hd = 0.2 * Math.sin(t); state.flute.sp = 0;
        caption(10, "Pantomime dancers were the superstars of imperial Rome. The best earned fortunes and had fans who rioted for them.");
        caption(24, "The audience clapped, shouted and sometimes threw things: a theatre could be as rowdy as the Circus.");
        if (t % 6 < 0.05) Sfx.play("coin");
        if (t > 37) done = true;
        focusPos = { x: C.x, z: STAGE.z };
      },
    },
    parade: {
      title: "Parade for Pompey's triumph", dur: 36,
      setup() {
        state.pompey = actor({ color: 0x7a2a8a, plume: 0xd8b03a }, C.x - 30, STAGE.z + 1, { mask: 0xe8d4b0 });
        state.lion = animal("lion", C.x - 40, STAGE.z - 3); state.deer = animal("deer", C.x - 46, STAGE.z + 2); state.ostrich = animal("ostrich", C.x - 52, STAGE.z - 1);
        sub = "In 55 BC Pompey opened this theatre with a great festival: five days of games, with hundreds of lions, and elephants in the Circus.";
      },
      tick(dt) {
        const { pompey: p } = state;
        const lead = Math.min(1, t / 26), px = C.x - 30 + lead * 60;
        walkTo(p, px, STAGE.z + 1, 3.5, dt); p.m.arm.visible = true; p.m.arm.rotation.x = 2.7;
        for (const [i, a] of [state.lion, state.deer, state.ostrich].entries()) { walkTo(a, px - 8 - i * 6, STAGE.z - 3 + (i % 2) * 4, 3.4, dt); }
        line(4, p, "Romans! Behold the spoils of the East!"); line(14, p, "Pompey the Great salutes you!");
        caption(12, "Pompey added a temple to Venus Victrix at the top of the seats, so that the theatre was, officially, only the steps up to a temple.");
        caption(24, "A hall of the great portico behind the stage became the Senate's meeting place. There, on 15 March 44 BC, Julius Caesar was killed.");
        if (t > 35) done = true;
        focusPos = { x: p.x, z: STAGE.z };
      },
    },
  };
  const ORDER = ["prologue", "comedy", "tragedy", "dance", "parade"];

  function clear() {
    if (group) { scene.remove(group); group = null; }
    items = []; state = {}; act = null; sub = ""; done = false; t = 0; said = new Set();
  }

  function start(name) {
    clear();
    act = ACTS[name]; group = new T.Group(); scene.add(group);
    act.setup();
  }

  function update(dt) {
    if (!act) return { done: true };
    t += dt; act.tick(dt);
    for (const it of items) {
      it.g.position.set(it.x, it.y, it.z); it.g.rotation.y = it.hd;
      const m = it.m;
      if (m && m.legs && m.legs.length) { it.phase += (it.sp || 0) * 0.12; m.legs.forEach((l, i) => { l.rotation.x = Math.sin(it.phase + (i % 2 ? Math.PI : 0)) * 0.6 * Math.min(1, (it.sp || 0) / 3); }); }
      else if (m && m.mats && !it.isAnimal) { it.g.rotation.z = Math.sin(it.phase += (it.sp || 0) * 0.14) * 0.05 * Math.min(1, (it.sp || 0) / 3); }
    }
    return { done };
  }

  return { init, start, update, clear, ORDER, ACTS, inTheatre, C, get subtitle() { return sub; }, focus: () => focusPos };
})();
