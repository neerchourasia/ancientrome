"use strict";
// Gladiator duel in the Colosseum arena: first-person sword and shield against three opponents.

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const ARENA = { cx: 430, cz: 30, ax: 94 * 0.3, az: 78 * 0.3 };
const inArena = (x, z) => ((x - ARENA.cx) / 94) ** 2 + ((z - ARENA.cz) / 78) ** 2 < 0.3 * 0.3;

const FOES = [
  { name: "Murmillo", hp: 70, dmg: 12, speed: 3.0, windup: 0.8, recover: 1.1, blockP: 0.15, poise: 0, color: 0x8f3a2a, plume: 0x2b5fa8 },
  { name: "Thraex", hp: 95, dmg: 15, speed: 3.6, windup: 0.62, recover: 0.9, blockP: 0.3, poise: 0.35, color: 0x2f6b8f, plume: 0xd8b03a },
  { name: "Champion of Rome", hp: 135, dmg: 19, speed: 4.1, windup: 0.5, recover: 0.7, blockP: 0.42, poise: 0.6, color: 0x4b2f63, plume: 0xb3262b },
  // Beast hunt (venatio): a lion, fought on its own with `L`
  { name: "Lion", beast: true, hp: 90, dmg: 21, speed: 6.2, windup: 0.5, recover: 1.0, blockP: 0, poise: 0.3, engage: 4.2, reach: 4.8, color: 0xc8963e, plume: 0x6b4a1e },
  { name: "Wild Boar", beast: true, kind: "boar", hp: 60, dmg: 14, speed: 6.6, windup: 0.4, recover: 0.9, blockP: 0, poise: 0.2, engage: 3.2, reach: 3.8 },
  { name: "Bear", beast: true, kind: "bear", hp: 120, dmg: 20, speed: 3.8, windup: 0.75, recover: 1.2, blockP: 0, poise: 0.5, engage: 3.3, reach: 3.7 },
];

// Prize money for beating each opponent (denarii).
const PURSE = { "Murmillo": 25, "Thraex": 35, "Champion of Rome": 45, "Lion": 60, "Wild Boar": 30, "Bear": 50 };

const Fight = (() => {
  let scene, cam, fp, sword, shield, foe = null, lastRound = 2, lastOpts = {}, seq = [0, 1, 2], earned = 0;
  let active = false, round = 0, phase = "idle", phaseT = 0, bobT = 0, blockAmt = 0, msgTimer;
  const P = { hp: 100, stam: 100, swing: -1, hit: false, block: false, hurt: 0, draw: 0, drawing: false, ammo: 0, ammoT: 0, dodgeT: 0, dodgeCd: 0, iframes: 0, shiftPrev: false, dodgeX: 0, dodgeZ: 0 };
  // The animal hunt is fought with a bow and arrows instead of the sword and shield.
  let bow = false, bowG = null, stringUp = null, stringDown = null, nockedArrow = null;
  const arrows = [];
  const ARROW_G = 12;
  const el = (id) => document.getElementById(id);

  // ---------- models ----------

  function init(sc, camera) {
    scene = sc; cam = camera;
    fp = new THREE.Group();
    fp.visible = false;

    const steel = lambert(0xd5d8de), gold = lambert(0xdcb444, { emissive: 0x3d2f05 }), leather = lambert(0x5a3a22), red = lambert(0x9c2a26);
    sword = new THREE.Group();
    const blade = new THREE.Mesh(BOX, steel); blade.scale.set(0.07, 0.95, 0.02); blade.position.y = 0.6;
    const guard = new THREE.Mesh(BOX, gold); guard.scale.set(0.3, 0.05, 0.07); guard.position.y = 0.12;
    const grip = new THREE.Mesh(BOX, leather); grip.scale.set(0.05, 0.22, 0.05); grip.position.y = 0;
    sword.add(blade, guard, grip);
    sword.position.set(0.42, -0.42, -0.75);
    sword.rotation.set(-0.35, 0, -0.25);

    shield = new THREE.Group();
    const face = new THREE.Mesh(BOX, red); face.scale.set(0.72, 1.0, 0.07);
    const trim = new THREE.Mesh(BOX, gold); trim.scale.set(0.78, 1.06, 0.05); trim.position.z = -0.02;
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), gold); boss.rotation.x = Math.PI / 2; boss.position.z = 0.06;
    shield.add(trim, face, boss);
    shield.position.set(-0.55, -0.45, -0.8);
    shield.rotation.set(0.1, 0.4, 0.1);

    fp.add(sword, shield);
    buildBow();
    fp.scale.setScalar(0.72);
    for (const m of [sword, shield, bowG]) m.traverse((c) => { c.frustumCulled = false; });
    cam.add(fp);
    scene.add(cam);
  }

  // A first-person bow: a curved stave, a string that is pulled back as you draw, and a nocked arrow.
  function buildBow() {
    bowG = new THREE.Group();
    bowG.visible = false;
    const wood = lambert(0x6b4a2a), cord = lambert(0xe8dcc0), shaft = lambert(0xc9a96b), tip = lambert(0xb7bcc4), feather = lambert(0xb3262b);
    const part = (parent, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };
    const pts = [];
    for (let i = 0; i <= 8; i++) { const y = -0.6 + (1.2 * i) / 8; pts.push([y, -0.3 * (1 - (y / 0.6) ** 2)]); }
    for (let i = 0; i < 8; i++) {
      const [y0, z0] = pts[i], [y1, z1] = pts[i + 1];
      const seg = part(bowG, 0.045, Math.hypot(y1 - y0, z1 - z0) + 0.012, 0.045, wood, 0, (y0 + y1) / 2, (z0 + z1) / 2);
      seg.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    }
    part(bowG, 0.06, 0.16, 0.06, lambert(0x3a2a1c), 0, 0, -0.3); // grip
    stringUp = part(bowG, 0.008, 1, 0.008, cord, 0, 0, 0);
    stringDown = part(bowG, 0.008, 1, 0.008, cord, 0, 0, 0);
    nockedArrow = new THREE.Group();
    part(nockedArrow, 0.012, 0.012, 0.85, shaft, 0, 0, -0.42);
    part(nockedArrow, 0.03, 0.03, 0.09, tip, 0, 0, -0.88);
    part(nockedArrow, 0.05, 0.012, 0.1, feather, 0, 0, -0.05);
    part(nockedArrow, 0.012, 0.05, 0.1, feather, 0, 0, -0.05);
    bowG.add(nockedArrow);
    bowG.position.set(-0.32, -0.34, -0.95);
    bowG.scale.setScalar(0.72);
    bowG.rotation.set(0.05, 0.4, -0.12);
    fp.add(bowG);
    poseBow(0);
  }

  // Pull the string back by `draw` (0 to 1).
  function poseBow(draw) {
    const d = 0.3 * draw, L = Math.hypot(0.6, d), a = Math.atan2(d, 0.6);
    stringUp.scale.set(0.008, L, 0.008); stringUp.position.set(0, 0.3, d / 2); stringUp.rotation.x = Math.atan2(d, -0.6);
    stringDown.scale.set(0.008, L, 0.008); stringDown.position.set(0, -0.3, d / 2); stringDown.rotation.x = Math.atan2(-d, -0.6);
    nockedArrow.position.set(0, 0, d);
    nockedArrow.visible = P.ammo > 0 || draw > 0;
    void a;
  }

  function makeFoe(def) {
    const g = new THREE.Group();
    const tunic = lambert(def.color), skin = lambert(0xc9956b), steel = lambert(0xb7bcc4), plume = lambert(def.plume), wood = lambert(0x6b4a2a), gold = lambert(0xdcb444);
    const part = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const body = part(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), tunic, 0, 1.15, 0);
    part(new THREE.BoxGeometry(0.2, 0.75, 0.22), skin, -0.13, 0.4, 0);
    part(new THREE.BoxGeometry(0.2, 0.75, 0.22), skin, 0.13, 0.4, 0);
    part(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), wood, 0, 0.72, 0);
    part(new THREE.SphereGeometry(0.19, 10, 8), skin, 0, 1.85, 0);
    const helmet = part(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), steel, 0, 1.9, 0);
    part(new THREE.BoxGeometry(0.06, 0.28, 0.6), plume, 0, 2.15, -0.02);
    // shield arm
    const shieldG = new THREE.Group();
    shieldG.position.set(-0.52, 1.25, 0.2);
    part(new THREE.BoxGeometry(0.16, 1.15, 0.7), tunic, 0, 0, 0, shieldG);
    part(new THREE.BoxGeometry(0.18, 1.2, 0.74), gold, -0.02, 0, 0, shieldG);
    part(new THREE.BoxGeometry(0.19, 1.1, 0.64), tunic, -0.03, 0, 0, shieldG);
    g.add(shieldG);
    // sword arm (pivot at the shoulder)
    const arm = new THREE.Group();
    arm.position.set(0.5, 1.55, 0);
    part(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), skin, 0, -0.3, 0, arm);
    part(new THREE.BoxGeometry(0.05, 0.9, 0.03), steel, 0, -0.95, 0, arm);
    part(new THREE.BoxGeometry(0.22, 0.05, 0.06), gold, 0, -0.55, 0, arm);
    g.add(arm);
    return { g, arm, shieldG, mats: [tunic], body, helmet };
  }

  // ---------- lion ----------

  function makeLion(def) {
    const g = new THREE.Group();
    const fur = lambert(def.color), mane = lambert(def.plume), dark = lambert(0x2a1c10);
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    part(new THREE.BoxGeometry(0.85, 0.85, 1.9), fur, 0, 1.0, 0);
    for (const [lx, lz] of [[-0.28, 0.75], [0.28, 0.75], [-0.28, -0.75], [0.28, -0.75]]) part(new THREE.BoxGeometry(0.22, 0.65, 0.24), fur, lx, 0.32, lz);
    part(new THREE.BoxGeometry(0.56, 0.54, 0.6), fur, 0, 1.25, 1.2);
    part(new THREE.BoxGeometry(0.3, 0.22, 0.28), lambert(0xd9b47a), 0, 1.15, 1.55);
    part(new THREE.BoxGeometry(0.1, 0.08, 0.06), dark, 0, 1.24, 1.7);
    part(new THREE.BoxGeometry(0.1, 0.08, 0.04), dark, -0.16, 1.38, 1.5);
    part(new THREE.BoxGeometry(0.1, 0.08, 0.04), dark, 0.16, 1.38, 1.5);
    const ruff = part(new THREE.SphereGeometry(0.55, 10, 8), mane, 0, 1.25, 0.85); ruff.scale.set(1, 1.05, 0.85);
    const tail = part(new THREE.BoxGeometry(0.1, 0.1, 0.95), fur, 0, 1.15, -1.35); tail.rotation.x = 0.5;
    part(new THREE.SphereGeometry(0.14, 8, 6), mane, 0, 1.4, -1.75);
    return { g, arm: new THREE.Group(), shieldG: new THREE.Group(), mats: [fur] };
  }

  // ---------- flow ----------

  function msg(text, ms = 1600) {
    const m = el("center-msg");
    m.textContent = text;
    m.classList.add("show");
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => m.classList.remove("show"), ms);
  }

  // opts.lion: only the lion (bow). opts.hunt: an animal hunt (boar, bear, then the lion). Otherwise three gladiators.
  function start(opts = {}) {
    if (active) return;
    if (!Vitals.canFight()) {
      toast(`You are too wounded to fight (health ${Math.round(Vitals.hp)}/100). Press Z to rest and heal.`);
      return;
    }
    lastOpts = opts; earned = 0;
    seq = opts.lion ? [3] : opts.hunt ? [4, 5, 3] : [0, 1, 2];
    active = true; mode = "fight"; round = 0; lastRound = seq.length - 1;
    P.hp = Vitals.hp; P.stam = 100; P.swing = -1; P.block = false; P.hurt = 0; // you start as hurt as you already are
    bow = !!(opts.hunt || opts.lion); // hunting animals, including the lone lion, is done with a bow
    P.draw = 0; P.drawing = false; P.ammo = quiverSize(); P.ammoT = 0; P.dodgeT = 0; P.dodgeCd = 0; P.iframes = 0;
    sword.visible = shield.visible = !bow;
    bowG.visible = bow;
    el("bow-hud").hidden = !bow;
    el("reticle").hidden = !bow;
    el("fight-keys").innerHTML = bow
      ? "Hold <kbd>Space</kbd> or the mouse to draw the bow, release to shoot · <kbd>Shift</kbd> dodge · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Esc</kbd> leave"
      : "<kbd>Space</kbd> or click to attack · hold <kbd>Shift</kbd> or right-click to block · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Esc</kbd> leave";
    Object.assign(player, { x: ARENA.cx - 16, z: ARENA.cz, yaw: -Math.PI / 2, pitch: -0.06, feet: 0, y: EYE, vx: 0, vz: 0 });
    fp.visible = true;
    el("fight-hud").classList.add("show");
    Sfx.play("gong");
    Crowd.setCheer(true);
    closePanels();
    nextRound();
  }

  function nextRound() {
    if (foe) scene.remove(foe.mesh.g);
    const def = FOES[seq[round]];
    const mesh = def.beast ? (def.kind ? Animals.make(def.kind) : makeLion(def)) : makeFoe(def);
    const life = bow ? 2.2 : 1; // arrows do less damage than a sword, so the hunted animals are tougher
    foe = { def, mesh, hp: def.hp * life, max: def.hp * life, x: ARENA.cx + 16, z: ARENA.cz, state: "approach", t: 0.9, blockT: 0, flash: 0, swing: -1, alive: true, fall: 0, lunge: 0 };
    mesh.g.position.set(foe.x, 0, foe.z);
    scene.add(mesh.g);
    P.stam = 100;
    if (bow) { P.ammo = quiverSize(); P.draw = 0; P.drawing = false; } // a full quiver for each animal
    if (round > 0) P.hp = Math.min(100, P.hp + 12); // a quick bandage between rounds
    phase = "intro"; phaseT = 2.2;
    msg(seq.length === 1 ? (def.beast ? "A lion is released!" : def.name) : `${lastOpts.hunt ? "Hunt" : "Round"} ${round + 1} of ${seq.length}: ${def.name}`, 2000);
  }

  function stop(win, title, text) {
    if (!active) return;
    active = false; mode = "walk"; phase = "idle";
    fp.visible = false;
    if (foe) { scene.remove(foe.mesh.g); foe = null; }
    for (const a of arrows) scene.remove(a.mesh);
    arrows.length = 0;
    camera.fov = 70; camera.updateProjectionMatrix();
    el("reticle").hidden = true;
    el("fight-hud").classList.remove("show");
    el("flash").style.opacity = 0;
    Crowd.setCheer(false);
    // The fight leaves its mark: you keep the damage you took, and a defeat costs you money and leaves you badly wounded.
    const defeat = !!title && !win;
    Vitals.hp = defeat ? 15 : Math.max(5, P.hp);
    if (defeat) {
      const fine = Math.min(30, Vitals.coins);
      Vitals.coins -= fine;
      text += ` You lose ${fine} denarii in medical fees${earned ? ` (you keep the ${earned} denarii you earned)` : ""} and are left badly wounded. Rest with Z before you fight again.`;
    } else if (win) text += ` Purse earned: ${earned} denarii. Health: ${Math.round(Vitals.hp)}/100.`;
    const again = lastOpts;
    if (title) showResult(title, text, [
      { label: win ? "Fight again" : "Try again", fn: () => { closePanels(); start(again); } },
      { label: "Leave the arena", fn: closePanels },
    ]);
    else msg("You leave the arena.", 1400);
  }

  // ---------- combat ----------

  // A big quiver for the animal hunt (three animals to bring down), a smaller one for the lion on its own.
  const quiverSize = () => (lastOpts.hunt ? 30 : 14);

  // Sword: swing. Bow: start drawing (release() shoots).
  function attack() {
    if (bow) {
      if (!active || phase !== "fight" || P.drawing || !foe.alive) return;
      if (P.ammo <= 0) { msg("Out of arrows! Keep moving", 900); return; }
      P.drawing = true; P.draw = 0;
      return;
    }
    if (!active || phase !== "fight" || P.swing >= 0 || P.block || P.stam < 14 || !foe.alive) return;
    P.swing = 0; P.hit = false; P.stam -= 14;
    Sfx.play("swing");
    if ((foe.state === "approach" || foe.state === "recover") && Math.random() < foe.def.blockP) foe.blockT = 0.5;
  }

  function release() {
    if (!bow || !P.drawing) return;
    P.drawing = false;
    if (P.draw >= 0.18) shoot(P.draw);
    P.draw = 0;
  }

  // Fire an arrow at the animal. The aim helps you: it turns toward the animal, leads a moving target and allows
  // for gravity, but a short draw is weak and wobbly, so you still have to time your shots.
  function shoot(charge) {
    if (P.ammo <= 0 || !foe || !foe.alive) return;
    P.ammo--;
    Sfx.play("twang");
    const speed = 26 + 34 * charge, ex = player.x, ey = EYE - 0.15, ez = player.z;
    const ty = foe.def.kind === "bear" ? 1.2 : 1.0;
    let d = Math.hypot(foe.x - ex, foe.z - ez), t = d / speed;
    const tx = foe.x + (foe.vx || 0) * t * 0.5, tz = foe.z + (foe.vz || 0) * t * 0.5;
    d = Math.hypot(tx - ex, tz - ez); t = d / speed;
    const aim = [tx - ex, ty + 0.5 * ARROW_G * t * t - ey, tz - ez];
    const spread = (1 - charge) * 0.16 + 0.035;
    let vx = aim[0], vy = aim[1], vz = aim[2];
    const len = Math.hypot(vx, vy, vz);
    vx = vx / len + (Math.random() - 0.5) * spread; vy = vy / len + (Math.random() - 0.5) * spread; vz = vz / len + (Math.random() - 0.5) * spread;
    const l2 = Math.hypot(vx, vy, vz);
    const mesh = new THREE.Group();
    const shaft = new THREE.Mesh(BOX, lambert(0xc9a96b)); shaft.scale.set(0.03, 0.03, 0.95); mesh.add(shaft);
    const head = new THREE.Mesh(BOX, lambert(0xb7bcc4)); head.scale.set(0.07, 0.07, 0.14); head.position.z = -0.5; mesh.add(head);
    mesh.frustumCulled = false;
    scene.add(mesh);
    arrows.push({ mesh, x: ex + Math.sin(player.yaw) * -0.5, y: ey, z: ez + Math.cos(player.yaw) * -0.5, vx: (vx / l2) * speed, vy: (vy / l2) * speed, vz: (vz / l2) * speed, charge, life: 3, stuck: 0 });
  }

  function updateArrows(dt) {
    const dir = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, -1);
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.life -= dt;
      if (a.stuck > 0) { a.stuck -= dt; if (a.stuck <= 0 || a.life <= 0) { scene.remove(a.mesh); arrows.splice(i, 1); } continue; }
      const steps = Math.max(1, Math.ceil((Math.hypot(a.vx, a.vy, a.vz) * dt) / 0.35)), h = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        a.vy -= ARROW_G * h;
        a.x += a.vx * h; a.y += a.vy * h; a.z += a.vz * h;
        const f = foe;
        if (f && f.alive) {
          const r = f.def.kind === "bear" ? 0.95 : 0.7, top = f.def.kind === "bear" ? 2.2 : 1.7;
          if (Math.hypot(a.x - f.x, a.z - f.z) < r && a.y > 0.05 && a.y < top) {
            const head = a.y > (f.def.kind === "bear" ? 1.5 : 1.2);
            hurtFoe((8 + 22 * a.charge) * (head ? 1.4 : 1), false);
            if (head) msg("Headshot!", 500);
            scene.remove(a.mesh); arrows.splice(i, 1); done = true;
          }
        }
        if (!done && (a.y <= 0.05 || a.life <= 0)) { a.stuck = 0.8; a.y = 0.05; a.vx = a.vy = a.vz = 0; done = true; }
      }
      if (!arrows[i] || arrows[i] !== a) continue;
      a.mesh.position.set(a.x, a.y, a.z);
      if (a.stuck <= 0) { dir.set(a.vx, a.vy, a.vz).normalize(); a.mesh.quaternion.setFromUnitVectors(fwd, dir); }
    }
  }

  // Damage the animal or gladiator (shared by the sword and the arrows).
  function hurtFoe(base, melee) {
    const f = foe, d = Math.hypot(f.x - player.x, f.z - player.z);
    if (!f.alive) return;
    if (f.blockT > 0) { f.hp -= base * 0.15; f.state = "stagger"; f.t = 0.4; msg("Blocked!", 600); Sfx.play("clash"); }
    else {
      Sfx.play("hit"); f.hp -= base; f.flash = 0.18;
      if (Math.random() >= f.def.poise + (melee ? 0 : 0.45)) { f.state = "stagger"; f.t = 0.38; }
      if (melee) { const n = 0.7 / Math.max(d, 0.1); f.x += (f.x - player.x) * n; f.z += (f.z - player.z) * n; }
    }
    if (f.hp <= 0) {
      f.alive = false; f.hp = 0; phase = "roundwon"; phaseT = 2.4;
      Sfx.play("cheer");
      const purse = PURSE[f.def.name] || 30;
      earned += purse; Vitals.coins += purse;
      msg(`${round === lastRound ? "The crowd erupts!" : `${f.def.name} falls. The crowd roars!`} +${purse} denarii`, 2200);
    }
  }

  function playerHit() {
    const f = foe, d = Math.hypot(f.x - player.x, f.z - player.z);
    if (!f.alive || d > 3.1) return;
    hurtFoe(20 * (0.85 + Math.random() * 0.3), true);
  }

  function foeStrike() {
    const f = foe, d = Math.hypot(f.x - player.x, f.z - player.z);
    if (d > (f.def.reach || 3.1)) return;
    if (P.iframes > 0) { msg("Dodged!", 500); return; }
    let dmg = f.def.dmg * (0.85 + Math.random() * 0.3);
    if (P.block && P.stam > 0) {
      dmg *= 0.15; P.stam = Math.max(0, P.stam - 16);
      f.state = "stagger"; f.t = 0.5; msg("Blocked!", 600); Sfx.play("clash");
    } else { P.hurt = 0.7; Sfx.play("hurt"); }
    P.hp -= dmg;
    if (f.def.beast && f.state !== "stagger") f.lunge = 0.28; // the lion pounces
    if (P.hp <= 0) {
      P.hp = 0; phase = "over";
      if (f.def.beast) stop(false, "Mauled by the lion", "Beast hunts (venationes) were a staple of the games, with lions, leopards and bears brought from across the empire. Will you try again?");
      else stop(false, "You fall in the sand", "The crowd holds its breath. In the arena, a beaten gladiator could appeal for mercy (missio), and the editor of the games decided the outcome. Will you try again?");
    }
  }

  function updateFoe(dt) {
    const f = foe, m = f.mesh, def = f.def;
    const dx = player.x - f.x, dz = player.z - f.z, dist = Math.hypot(dx, dz) || 0.01;
    f.flash -= dt;
    f.blockT = Math.max(0, f.blockT - dt);
    m.mats[0].emissive.setHex(f.flash > 0 ? 0x771111 : f.state === "windup" ? 0x553300 : 0x000000);

    if (!f.alive) {
      f.fall = Math.min(1, f.fall + dt * 2);
      if (def.beast) { m.g.rotation.z = f.fall * (Math.PI / 2); m.g.position.y = 0.3 * f.fall; }
      else { m.g.rotation.x = -f.fall * (Math.PI / 2); m.g.position.y = 0.2 * f.fall; }
      return;
    }
    m.g.rotation.y = Math.atan2(dx, dz);
    const step = (dir, speed) => { f.x += (dx / dist) * dir * speed * dt; f.z += (dz / dist) * dir * speed * dt; };

    if (def.beast) { // crouch before pouncing, prowl with a small bob
      const crouch = f.state === "windup" ? 0.78 : 1;
      m.g.scale.y += (crouch - m.g.scale.y) * Math.min(1, dt * 12);
      if (f.state === "windup") m.g.position.y = 0;
    }
    if (f.lunge > 0) { f.lunge -= dt; if (dist > 1.7) step(1, 17); }

    if (phase === "fight") {
      f.t -= dt;
      if (f.state === "approach") {
        if (dist > (def.engage || 2.4)) step(1, def.speed);
        else if (f.t <= 0) { f.state = "windup"; f.t = def.windup; if (def.beast) Sfx.play("roar"); }
      } else if (f.state === "windup") {
        if (f.t <= 0) { foeStrike(); if (f.state === "windup") { f.state = "recover"; f.t = def.recover; f.swing = 0; } }
      } else if (f.state === "recover") {
        if (dist < 3.6) step(-1, 1.6);
        if (f.t <= 0) { f.state = "approach"; f.t = 0.15 + Math.random() * 0.5; }
      } else if (f.state === "stagger") {
        step(-1, 0.6);
        if (f.t <= 0) { f.state = "approach"; f.t = 0.3; }
      }
    }
    // keep inside the arena and out of the player
    if (dist < 1.4 && phase !== "roundwon") { f.x -= (dx / dist) * (1.4 - dist); f.z -= (dz / dist) * (1.4 - dist); }
    clampArena(f);
    m.g.position.x = f.x; m.g.position.z = f.z;

    // arm pose: rest, wind up (arm raised back), strike (swing forward)
    let a = -0.5;
    if (f.state === "windup") a = -0.5 + (2.9 * (1 - f.t / def.windup));
    else if (f.swing >= 0) { f.swing += dt / 0.22; a = 2.4 - Math.min(1, f.swing) * 3.7; if (f.swing >= 1) f.swing = -1; }
    m.arm.rotation.x += (a - m.arm.rotation.x) * Math.min(1, dt * 22);
    const sz = f.blockT > 0 ? 0.55 : 0.2, sx = f.blockT > 0 ? -0.15 : -0.52;
    m.shieldG.position.z += (sz - m.shieldG.position.z) * Math.min(1, dt * 14);
    m.shieldG.position.x += (sx - m.shieldG.position.x) * Math.min(1, dt * 14);
  }

  function clampArena(o) {
    const e = ((o.x - ARENA.cx) / ARENA.ax) ** 2 + ((o.z - ARENA.cz) / ARENA.az) ** 2;
    if (e > 1) { const k = 1 / Math.sqrt(e); o.x = ARENA.cx + (o.x - ARENA.cx) * k; o.z = ARENA.cz + (o.z - ARENA.cz) * k; }
  }

  // ---------- per-frame ----------

  function update(dt, keys) {
    if (!active) return;
    phaseT -= dt;
    if (phase === "intro" && phaseT <= 0) { phase = "fight"; msg("Fight!", 800); }
    if (phase === "roundwon" && phaseT <= 0) {
      if (round === lastRound) {
        stop(true, lastOpts.lion ? "The lion is slain!" : lastOpts.hunt ? "The hunt is won!" : "Victory in the arena!", lastOpts.hunt
          ? "The crowd roars as the last beast falls. Animal hunts (venationes) usually filled the morning of the games, with lions, bears, boars and exotic animals brought from across the empire. Sometimes the arena was decorated with trees and rocks to look like a wild landscape."
          : lastOpts.lion
          ? "The crowd roars as the beast falls. Beast hunts (venationes) were a staple of the games, with lions, leopards and bears brought from across the empire, and they often opened the day before the gladiators appeared."
          : "The crowd chants your name. The editor of the games awards you the rudis, the wooden sword that symbolised a gladiator's freedom. You are a free man.");
        return;
      }
      round++; nextRound();
    }
    if (!active) return;

    // movement, relative to the opponent (auto lock-on)
    const dx = foe.x - player.x, dz = foe.z - player.z, dist = Math.hypot(dx, dz) || 0.01;
    const nx = dx / dist, nz = dz / dist;
    const shiftDown = keys.has("ShiftLeft") || keys.has("ShiftRight");
    P.block = !bow && phase === "fight" && P.swing < 0 && (shiftDown || keys.has("KeyB") || Fight.mouseBlock);
    const fwd = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const side = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    const speed = P.block ? 2.2 : P.drawing ? 2.8 : 4.4;
    let mx = nx * fwd + -nz * side, mz = nz * fwd + nx * side;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx = (mx / ml) * speed * dt; mz = (mz / ml) * speed * dt; player.x += mx; player.z += mz; }
    if (bow) { // Shift: a quick dodge roll (with a short cooldown) that lets you slip past a charge
      P.dodgeCd = Math.max(0, P.dodgeCd - dt); P.iframes = Math.max(0, P.iframes - dt);
      if (shiftDown && !P.shiftPrev && P.dodgeCd <= 0 && phase === "fight") {
        const l = ml || 1;
        P.dodgeX = ml > 0 ? mx / l : -nx; P.dodgeZ = ml > 0 ? mz / l : -nz;
        P.dodgeT = 0.25; P.dodgeCd = 1.1; P.iframes = 0.35; P.drawing = false; P.draw = 0;
        Sfx.play("swing");
      }
      if (P.dodgeT > 0) { P.dodgeT -= dt; player.x += P.dodgeX * 11 * dt; player.z += P.dodgeZ * 11 * dt; }
    }
    P.shiftPrev = shiftDown;
    if (dist < 1.5) { player.x -= nx * (1.5 - dist); player.z -= nz * (1.5 - dist); }
    clampArena(player);
    player.yaw += angDiff(player.yaw, Math.atan2(-nx, -nz)) * Math.min(1, dt * 9);
    if (bow && foe.alive) { // tilt the view up to where the arrow will go
      const t = dist / 45;
      player.pitch += (Math.atan2(1.0 + 0.5 * ARROW_G * t * t - EYE, dist) - player.pitch) * Math.min(1, dt * 8);
    } else player.pitch = -0.06;
    bobT += ml > 0 ? dt * 8 : 0;
    player.y = EYE + Math.sin(bobT) * 0.03;
    player.feet = 0;

    // stamina
    P.stam = Math.min(100, P.stam + (P.swing >= 0 ? 0 : P.block ? 6 : 16) * dt);

    // player swing
    if (P.swing >= 0) {
      P.swing += dt / 0.34;
      if (P.swing >= 0.4 && !P.hit) { P.hit = true; playerHit(); }
      if (P.swing >= 1) P.swing = -1;
    }
    const fx0 = foe.x, fz0 = foe.z;
    updateFoe(dt);
    if (!active) return;
    if (dt > 0) { foe.vx = (foe.vx || 0) * 0.6 + ((foe.x - fx0) / dt) * 0.4; foe.vz = (foe.vz || 0) * 0.6 + ((foe.z - fz0) / dt) * 0.4; }

    // bow: draw, arrows in flight, arrow supply and view zoom
    if (bow) {
      if (P.drawing) { P.draw = Math.min(1, P.draw + dt / 1.15); if (P.hurt > 0.5) { P.drawing = false; P.draw = 0; } }
      updateArrows(dt);
      if (P.ammo < 8) { P.ammoT += dt; if (P.ammoT > 3) { P.ammoT = 0; P.ammo++; } } // you pick up a few spent arrows
      poseBow(P.draw);
      bowG.rotation.z = -0.12 - 0.05 * P.draw;
      bowG.position.x = -0.32 + 0.1 * P.draw; // the bow comes toward the centre as you draw
      const fov = 70 - 9 * P.draw;
      if (Math.abs(camera.fov - fov) > 0.2) { camera.fov = fov; camera.updateProjectionMatrix(); }
      el("ammo").textContent = `Arrows: ${P.ammo}`;
      el("draw-fill").style.width = `${P.draw * 100}%`;
      el("draw-fill").style.background = P.draw >= 1 ? "#ffd24a" : "#c98a3e";
    }

    // first-person weapon pose
    blockAmt += ((P.block ? 1 : 0) - blockAmt) * Math.min(1, dt * 14);
    const p = Math.max(0, P.swing), s = P.swing >= 0 ? Math.sin(p * Math.PI) : 0;
    sword.position.set(0.42 - s * 0.6 - blockAmt * 0.1, -0.42 + s * 0.16 - blockAmt * 0.2, -0.75 + s * -0.15);
    sword.rotation.set(-0.35 - s * 1.35, -s * 0.3, -0.25 + s * 0.9);
    shield.position.set(-0.55 + blockAmt * 0.55, -0.45 + blockAmt * 0.32, -0.8 + blockAmt * 0.18);
    shield.rotation.set(0.1 - blockAmt * 0.1, 0.4 - blockAmt * 0.4, 0.1 - blockAmt * 0.1);

    // HUD
    P.hurt = Math.max(0, P.hurt - dt * 1.5);
    el("flash").style.opacity = P.hurt * 0.55;
    el("foe-name").textContent = foe.def.name;
    el("foe-fill").style.width = `${(foe.hp / (foe.max || foe.def.hp)) * 100}%`;
    el("hp-fill").style.width = `${P.hp}%`;
    el("st-fill").style.width = `${P.stam}%`;
  }

  return { init, start, stop: () => stop(false), update, attack, release, makeFoe, makeLion, mouseBlock: false, get active() { return active; }, debug: () => ({ phase, round, P: { ...P }, foe: foe && { x: foe.x, z: foe.z, hp: foe.hp, state: foe.state, alive: foe.alive } }) };
})();
