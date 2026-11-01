"use strict";
// Pickpockets. Every few minutes while you walk about a hooded thief (dark clothes, a red ! over the head) sneaks up on you. If he touches you he grabs some of your denarii
// (a tenth of what you carry, at most 80) and runs. You have half a minute to catch him: run into him and you get the money back and a 20 denarii bounty from the city.
// Dodge him by moving away before he reaches you (he is only a little faster than a walking pace: sprinting with Shift always beats him). Hold more than 100 denarii for him
// to be interested. Depends on game.js (createFigure, player, scene, groundAt, blockedAt, mode, started, city), guards.js and vitals.js.

const Thieves = (() => {
  const T = THREE;
  const MIN_COINS = 100, MAX_STEAL = 80, BOUNTY = 20, FLEE_TIME = 30, TOUCH = 1.5, GAP = [150, 300];
  let caught = 0;
  try { caught = Math.max(0, Math.floor(Number(localStorage.getItem("rome-thieves-caught"))) || 0); } catch (e) { /* storage unavailable */ }
  let thief = null, wait = 90 + Math.random() * 90, mark = null, hudEl = null;

  function makeMark() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"); g.fillStyle = "#a8201a"; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 4; g.stroke(); g.fillStyle = "#fff"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", 32, 34);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthWrite: false, transparent: true })); s.scale.set(0.8, 0.8, 1); s.visible = false; scene.add(s); return s;
  }
  function dress(fig) {                                    // dark clothes, so he is easy to tell from the citizens
    fig.g.traverse((o) => { if (o.isMesh && o.material && o.material.color) { const h = o.material.color.getHex(); if (h === 0xf3e6c8) o.material.color.setHex(0x23202b); else if (h === 0x9c3a2e) o.material.color.setHex(0x601812); } });
  }
  const canStand = (x, z) => x > BOUNDS.minX + 3 && x < BOUNDS.maxX - 3 && z > BOUNDS.minZ + 3 && z < BOUNDS.maxZ - 3 && !blockedAt(x, z, groundAt(x, z));

  function spawn() {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = 28 + Math.random() * 12, x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d;
      if (!canStand(x, z)) continue;
      const fig = createFigure(); dress(fig); fig.g.position.set(x, groundAt(x, z), z); scene.add(fig.g);
      thief = { fig, x, z, yaw: 0, state: "stalk", left: FLEE_TIME, phase: 0, loot: 0, life: 70 };
      return;
    }
  }
  function remove() { if (!thief) return; scene.remove(thief.fig.g); thief = null; if (mark) mark.visible = false; }

  function step(dt, tx, tz, speed) {                       // walk towards (tx, tz) at `speed`, turning aside from walls
    const dx = tx - thief.x, dz = tz - thief.z, d = Math.hypot(dx, dz) || 1;
    let a = Math.atan2(-dx, -dz);                          // the yaw that faces the target (you face -z at yaw 0)
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const yaw = a + turn, nx = thief.x - Math.sin(yaw) * speed * dt, nz = thief.z - Math.cos(yaw) * speed * dt;
      if (canStand(nx, nz)) { thief.x = nx; thief.z = nz; let dy = yaw - thief.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; thief.yaw += dy * Math.min(1, dt * 10); return d; }
    }
    return d;
  }

  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    const busy = mode !== "walk" || Jail.active || Subway.underground;
    if (!thief) {
      if (busy || Vitals.coins < MIN_COINS) return;
      wait -= dt; if (wait <= 0) { wait = GAP[0] + Math.random() * (GAP[1] - GAP[0]); spawn(); }
      return;
    }
    if (!mark) mark = makeMark();
    const t = thief, f = t.fig;
    if (mode !== "walk" && mode !== "drive") { remove(); return; }        // you went into a fight, a game or the sky: he gives up
    t.life -= dt;
    const d0 = Math.hypot(player.x - t.x, player.z - t.z);
    if (t.state === "stalk") {
      if (t.life <= 0 || d0 > 90) { remove(); return; }
      if (d0 < 9 && typeof PetPerks !== "undefined" && PetPerks.scares()) { toast("🐾 Your lion cub growls and the thief runs off!"); remove(); return; }
      step(dt, player.x, player.z, 3.4);
      if (d0 < TOUCH && !Jail.active && Vitals.coins >= MIN_COINS) {
        const n = Math.max(10, Math.min(MAX_STEAL, Math.round((Vitals.coins * 0.1) / 5) * 5));
        Vitals.coins -= n; t.loot = n; t.state = "flee"; t.left = FLEE_TIME; Sfx.play("oof");
        const back = typeof PetPerks !== "undefined" ? PetPerks.recover(n) : 0; if (back) { Vitals.coins += back; t.loot = n - back; }
        toast(`${back ? `Your monkey grabbed ${back} back! ` : ""}A thief grabbed ${n} denarii! Catch him (he runs from you, the red ! shows where he is) before he gets away.`);
      }
    } else {
      t.left -= dt;
      const away = player.x - t.x, awayZ = player.z - t.z;
      step(dt, t.x - away * 5, t.z - awayZ * 5, 6.4);
      if (d0 < TOUCH + 0.4) {
        Vitals.coins += t.loot + BOUNTY; Sfx.play("coin"); toast(`You caught the thief! Your ${t.loot} denarii are back, and the city pays a ${BOUNTY} denarii bounty.`);
        caught++; try { localStorage.setItem("rome-thieves-caught", String(caught)); } catch (e) { /* ignore */ }
        remove(); return;
      }
      if (t.left <= 0 || d0 > 140) { toast("The thief got away with your money."); remove(); return; }
    }
    const g = groundAt(t.x, t.z), sp = t.state === "flee" ? 6.4 : 3.4;
    f.g.position.set(t.x, g, t.z); f.g.rotation.y = t.yaw;
    t.phase += dt * sp * 1.5; const w = 0.8 * Math.sin(t.phase);
    f.parts.armL.rotation.x = -w; f.parts.armR.rotation.x = w; f.parts.legL.rotation.x = -w; f.parts.legR.rotation.x = w;
    mark.visible = true; mark.position.set(t.x, g + 2.3 + Math.sin(performance.now() / 250) * 0.08, t.z);
    if (!hudEl) hudEl = document.getElementById("quest-hud");
    if (t.state === "flee" && hudEl && !Quests.active) { hudEl.hidden = false; hudEl.textContent = `🥷 Catch the thief! ${Math.max(0, Math.ceil(t.left))} s · ${Math.round(d0)} m away · +${t.loot + BOUNTY}`; }
  }

  return { update, get caught() { return caught; }, get active() { return thief ? thief.state : null; }, _spawn: spawn, _thief: () => thief };
})();
