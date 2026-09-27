"use strict";
// Sound, synthesised in the browser (no audio files). The ambience is positional: each place has its own sound
// (crowds at the Colosseum and the Circus, market chatter in the Forum, birds on the hills, water in the naval
// battle) that gets louder as you approach, pans left or right depending on where it is, and is muffled when it is
// behind you. Also footsteps on different surfaces and sound effects for fights, races and the naval battle.

const Sfx = (() => {
  const KEY = "rome-sound";
  let ctx = null, master = null, noise = null, brown = null, on = true, excite = 0, burst = 0, burstT = 4;
  let stepPhase = 0, hoofT = 0, birdT = 3, cricketT = 1, clock = 0, rumble = null, wind = null;
  const tmp = { x: 0, y: 0, z: 0 };
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) { /* storage unavailable */ }

  // Places that make sound. `crowd` sources swell when the crowd is cheering.
  const AMBIENCE = [
    { id: "colosseum", x: 430, z: 30, range: 420, base: 0.55, freq: 650, Q: 0.5, swell: 0.3, crowd: true },
    { id: "circus", x: -230, z: 430, range: 460, base: 0.5, freq: 600, Q: 0.5, swell: 0.3, crowd: true },
    { id: "forum", x: 30, z: 0, range: 300, base: 0.45, freq: 900, Q: 0.7, swell: 0.6 },
    { id: "trajan", x: -150, z: -240, range: 220, base: 0.3, freq: 1000, Q: 0.8, swell: 0.6 },
    { id: "pantheon", x: -480, z: -420, range: 200, base: 0.26, freq: 800, Q: 0.8, swell: 0.4 },
    { id: "city", x: 0, z: 100, range: 1100, base: 0.22, freq: 480, Q: 0.4, swell: 0.2 },
    { id: "water", x: 430, z: 30, range: 160, base: 0.6, freq: 380, Q: 0.6, swell: 0.7, when: () => Naval.active },
  ];
  const sources = [];

  function makeNoise(seconds, kind) {
    const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  function loop(buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  function init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = on ? 0.7 : 0;
    master.connect(ctx.destination);
    noise = makeNoise(3, "white");
    brown = makeNoise(4, "brown");

    for (const a of AMBIENCE) {
      const src = loop(noise), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner();
      bp.type = "bandpass"; bp.frequency.value = a.freq; bp.Q.value = a.Q;
      lp.type = "lowpass"; lp.frequency.value = 3000;
      g.gain.value = 0;
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(pan); pan.connect(master);
      sources.push({ ...a, g, lp, pan, phase: Math.random() * 6 });
    }
    // wind: everywhere, a little stronger on high ground
    const ws = loop(brown), wl = ctx.createBiquadFilter(), wg = ctx.createGain();
    wl.type = "lowpass"; wl.frequency.value = 500; wg.gain.value = 0.05;
    ws.connect(wl); wl.connect(wg); wg.connect(master);
    wind = { g: wg, f: wl };
    // chariot wheels rumbling
    const rs = loop(brown), rl = ctx.createBiquadFilter(), rg = ctx.createGain();
    rl.type = "lowpass"; rl.frequency.value = 260; rg.gain.value = 0;
    rs.connect(rl); rl.connect(rg); rg.connect(master);
    rumble = { g: rg };
  }

  // ---------- listener maths ----------

  function listener() {
    const d = camera.getWorldDirection(tmp2);
    return { x: camera.position.x, z: camera.position.z, fx: d.x, fz: d.z };
  }
  const tmp2 = new THREE.Vector3();

  // Where a sound at (x, z) sits relative to the listener: volume falloff, stereo pan and muffling when behind you.
  function spatial(L, x, z, range) {
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz) || 0.001;
    const att = Math.pow(Math.max(0, 1 - d / range), 2);
    const fl = Math.hypot(L.fx, L.fz) || 1, fx = L.fx / fl, fz = L.fz / fl;
    const front = (dx * fx + dz * fz) / d;        // 1 = straight ahead, -1 = behind
    const right = (dx * -fz + dz * fx) / d;       // +1 = fully to your right
    return { att, pan: Math.max(-0.9, Math.min(0.9, right)), facing: 0.5 + 0.5 * front, d };
  }

  // ---------- synthesis helpers ----------

  const now = () => ctx.currentTime;

  function outNode(pos, vol) {
    const g = ctx.createGain(), pan = ctx.createStereoPanner(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 12000;
    let v = vol;
    if (pos) {
      const L = listener(), s = spatial(L, pos.x, pos.z, pos.range || 260);
      v = vol * (0.15 + 0.85 * s.att) * (0.6 + 0.4 * s.facing);
      pan.pan.value = s.pan;
      lp.frequency.value = 900 + 9000 * s.facing;
    }
    g.gain.value = v;
    g.connect(lp); lp.connect(pan); pan.connect(master);
    return g;
  }

  function tone(freq, dur, type, vol, slideTo, pos, delay = 0) {
    const t0 = now() + delay, o = ctx.createOscillator(), env = ctx.createGain(), out = outNode(pos, 1);
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(env); env.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function puff(dur, freq, Q, vol, pos, filter = "bandpass", attack = 0.005, delay = 0) {
    const t0 = now() + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), env = ctx.createGain(), out = outNode(pos, 1);
    s.buffer = noise;
    f.type = filter; f.frequency.value = freq; f.Q.value = Q;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(env); env.connect(out);
    s.start(t0, Math.random() * 2); s.stop(t0 + dur + 0.05);
  }

  const SOUNDS = {
    swing: () => puff(0.2, 1300, 0.8, 0.22),
    hit: () => { puff(0.14, 300, 0.8, 0.5); tone(120, 0.18, "sine", 0.5, 60); },
    clash: () => { puff(0.12, 3200, 1.5, 0.4); tone(1900, 0.35, "triangle", 0.16, 1300); tone(2850, 0.3, "triangle", 0.1, 2200); },
    hurt: () => { tone(130, 0.3, "sine", 0.55, 55); puff(0.2, 220, 0.7, 0.35); },
    roar: () => { tone(85, 0.9, "sawtooth", 0.28, 55); tone(170, 0.8, "sawtooth", 0.12, 100); puff(0.7, 350, 0.5, 0.35, null, "bandpass", 0.1); },
    cheer: () => { puff(1.8, 900, 0.4, 0.6, null, "bandpass", 0.4); puff(1.4, 1700, 0.5, 0.25, null, "bandpass", 0.5); },
    cannon: (o) => { tone(150, 0.55, "sine", 0.9, 32, o); puff(0.5, 260, 0.4, 0.9, o, "lowpass"); puff(0.15, 2500, 0.6, 0.3, o); },
    splash: (o) => puff(0.35, 1800, 0.6, 0.3, o),
    crash: (o) => { puff(0.28, 500, 0.6, 0.7, o); tone(95, 0.3, "square", 0.22, 45, o); },
    whip: () => puff(0.12, 4200, 3, 0.4),
    twang: () => { tone(230, 0.16, "triangle", 0.3, 120); puff(0.12, 3200, 2, 0.22); },
    scrape: () => { puff(0.28, 1100, 0.9, 0.3); puff(0.22, 2600, 1.2, 0.14, null, "bandpass", 0.01, 0.05); },
    bump: () => { puff(0.18, 240, 0.7, 0.75); tone(85, 0.28, "sine", 0.6, 45); },
    oof: () => { tone(230, 0.2, "sawtooth", 0.14, 150); puff(0.12, 500, 0.8, 0.3); },
    beep: () => tone(880, 0.14, "square", 0.13),
    jump: () => { tone(300, 0.12, "triangle", 0.18, 520); puff(0.08, 900, 1, 0.12); },
    horn: () => { tone(196, 0.9, "sawtooth", 0.16); tone(294, 0.9, "sawtooth", 0.11); tone(392, 0.9, "sawtooth", 0.07); },
    discover: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.55, "sine", 0.16, null, null, i * 0.11)); },
    coin: () => { tone(1320, 0.09, "sine", 0.16); tone(1760, 0.16, "sine", 0.14, null, null, 0.07); },
    gong: () => { tone(82, 2.2, "sine", 0.5); tone(164, 1.6, "sine", 0.2); puff(0.3, 900, 0.5, 0.2); },
  };

  function footstep(kind) {
    const j = 0.85 + Math.random() * 0.3;
    if (kind === "stone") puff(0.07, 2000 * j, 1.3, 0.22, null, "bandpass", 0.002);
    else if (kind === "sand") puff(0.13, 520 * j, 0.6, 0.2, null, "bandpass", 0.01);
    else if (kind === "grass") puff(0.16, 1300 * j, 0.5, 0.1, null, "bandpass", 0.02);
    else puff(0.09, 900 * j, 0.9, 0.18, null, "bandpass", 0.004);
  }

  function surface() {
    const x = player.x, z = player.z;
    if (inArena(x, z) || inCircusTrack(x, z)) return "sand";
    if (inColosseum(x, z)) return "stone";
    const g = groundAt(x, z), h = heightAt(x, z);
    if (g > h + 0.05) return "stone";
    if ((Math.abs(x - 30) < 150 && Math.abs(z) < 38) || (Math.abs(z) < 5 && x > -110 && x < 420)) return "stone";
    if (h > 2) return "grass";
    return "dirt";
  }

  // ---------- per-frame ----------

  function update(dt, info) {
    if (!ctx) return;
    clock += dt;
    const L = listener(), t = now();

    // crowd excitement follows the games; occasional roars while the crowd is cheering
    excite += ((Crowd.cheering ? 1 : 0) - excite) * Math.min(1, dt * 1.2);
    burst = Math.max(0, burst - dt * 0.6);
    burstT -= dt;
    if (burstT <= 0) { burstT = 3 + Math.random() * 6; if (excite > 0.5) burst = 1; }

    for (const s of sources) {
      if (s.when && !s.when()) { s.g.gain.setTargetAtTime(0, t, 0.3); continue; }
      const sp = spatial(L, s.x, s.z, s.range);
      const swell = 1 + s.swell * (Math.sin(clock * 0.7 + s.phase) * 0.5 + Math.sin(clock * 1.9 + s.phase * 2) * 0.3);
      let vol = s.base * sp.att * swell * (0.55 + 0.45 * sp.facing);
      if (s.crowd) vol *= 1 + 1.8 * excite + 1.0 * burst;
      const cut = 500 + 4500 * Math.pow(sp.facing, 1.6) + (s.crowd ? 1500 * excite : 0); // behind you = muffled
      s.target = { gain: +Math.min(1.3, vol).toFixed(3), pan: +sp.pan.toFixed(2), cutoff: Math.round(cut), dist: Math.round(sp.d) };
      s.g.gain.setTargetAtTime(Math.min(1.3, vol), t, 0.12);
      s.pan.pan.setTargetAtTime(sp.pan, t, 0.12);
      s.lp.frequency.setTargetAtTime(cut, t, 0.12);
    }
    const height = typeof heightAt === "function" ? heightAt(camera.position.x, camera.position.z) : 0;
    wind.g.gain.setTargetAtTime(0.04 + 0.006 * height + 0.02 * Math.sin(clock * 0.3), t, 0.5);
    wind.f.frequency.setTargetAtTime(380 + 400 * (0.5 + 0.5 * Math.sin(clock * 0.21)), t, 0.5);

    // footsteps on the ground
    if (info.mode === "walk" && info.walking > 1 && !Vitals.resting) {
      stepPhase += (info.walking * dt) / (info.running ? 1.9 : 1.15);
      if (stepPhase >= 1) { stepPhase = 0; footstep(surface()); }
    } else stepPhase = 0.6;

    // chariot: galloping hooves and rumbling wheels
    const v = info.mode === "race" && Race.active ? Race.speed() : 0;
    rumble.g.gain.setTargetAtTime(v > 1 ? 0.03 + 0.2 * Math.min(1, v / 27) : 0, t, 0.1);
    if (v > 3) {
      hoofT += (dt * v) / 5.5;
      if (hoofT >= 1) { hoofT = 0; puff(0.07, 170 + Math.random() * 90, 1.1, 0.18 * Math.min(1, v / 15), null, "lowpass"); }
    }

    // crickets after dark
    if ((info.night || 0) > 0.5 && (info.mode === "walk" || info.mode === "watch")) {
      cricketT -= dt;
      if (cricketT <= 0) {
        cricketT = 0.35 + Math.random() * 1.1;
        const a = Math.random() * 6.28, r = 6 + Math.random() * 30, o = { x: camera.position.x + Math.cos(a) * r, z: camera.position.z + Math.sin(a) * r, range: 60 };
        const base = 4300 + Math.random() * 500;
        for (let i = 0; i < 3; i++) tone(base, 0.035, "sine", 0.05, base * 1.02, o, i * 0.07);
      }
    }
    // birds up on the hills (not at night)
    if ((info.night || 0) < 0.5 && (info.mode === "walk" || info.mode === "watch")) {
      birdT -= dt;
      if (birdT <= 0) {
        birdT = 2.5 + Math.random() * 5;
        if (height > 3 || Math.hypot(camera.position.x, camera.position.z) > 520) {
          const a = Math.random() * 6.28, r = 25 + Math.random() * 60, x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
          const base = 2600 + Math.random() * 1800, o = { x, z, range: 130 };
          for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) tone(base * (0.9 + Math.random() * 0.3), 0.07, "sine", 0.07, base * 1.25, o, i * 0.11);
        }
      }
    }
  }

  return {
    init,
    debug: () => sources.map((s) => ({ id: s.id, ...s.target })),
    get state() { return ctx ? ctx.state : "off"; },
    get on() { return on; },
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* ignore */ }
      if (ctx) { ctx.resume(); master.gain.setTargetAtTime(on ? 0.7 : 0, now(), 0.05); }
      return on;
    },
    play(name, pos) {
      if (!ctx || !on || !SOUNDS[name]) return;
      try { SOUNDS[name](pos ? { x: pos.x, z: pos.z, range: pos.range || 240 } : null); } catch (e) { console.warn("sound error:", name, e); }
    },
    update(dt, info) { try { update(dt, info); } catch (e) { if (!Sfx._warned) { Sfx._warned = 1; console.warn("sound update error:", e); } } },
  };
})();
