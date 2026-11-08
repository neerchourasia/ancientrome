"use strict";
// Instruments (🎼 Play an instrument in the menu): twenty-five instruments made in the browser from oscillators, filters and noise (no sound files): trumpet, piano, violin, guitar and flute, the Roman
// tuba, cornu, aulos, lyre, water organ and drum, the sitar, bansuri, harmonium, shehnai and tabla of Delhi, the ocarina, conch, marimba and rattle of the Maya, and the erhu, dizi, guzheng, pipa and
// gong of Beijing. Play with the keys (three rows: Z-/, A-; and Q-P, which are ten notes each in a scale you choose: the Greek Dorian mode for Rome, a raga for Delhi, pentatonic scales for Beijing and
// the Maya, major and minor), or tap the keys on the screen. The second tab is a rhythm game: notes fall down five lanes (A S D F G) to a song, and you play them in time. When you play, other players
// near you in the same city hear it (the game server passes `note` messages on; server.py on_note). Depends on game.js (openPanel, closePanels, toast), audio.js (Sfx.on) and online.js (Online).

const Instruments = (() => {
  // ---------------------------------------------------------------- the instruments
  // kind "sustain": held while the key is down; "pluck": rings out by itself; "hit": a drum or gong. mid: the MIDI note where the middle row of keys begins.
  const SCALES = {
    major: ["Major", [0, 2, 4, 5, 7, 9, 11]], minor: ["Minor", [0, 2, 3, 5, 7, 8, 10]], dorian: ["Greek Dorian mode (Rome)", [0, 2, 3, 5, 7, 9, 10]], bhairav: ["Raga Bhairav (Delhi)", [0, 1, 4, 5, 7, 8, 11]],
    yaman: ["Raga Yaman (Delhi)", [0, 2, 4, 6, 7, 9, 11]], pent: ["Pentatonic (Beijing)", [0, 2, 4, 7, 9]], minpent: ["Minor pentatonic (Maya)", [0, 3, 5, 7, 10]], chroma: ["Every note", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  };
  const CITY_SCALE = { rome: "dorian", delhi: "bhairav", cancun: "minpent", beijing: "pent" };
  const P = {   // the sound of each instrument, as settings for the three kinds of voice below
    trumpet: { kind: "sustain", mid: 60, waves: [["sawtooth", 1, 0, 0.6], ["sawtooth", 1, 6, 0.4]], lp: [700, 3200, 0.09], a: 0.035, d: 0.12, s: 0.75, r: 0.12, vib: [5.5, 0.004, 0.3], peak: 0.2 },
    tuba: { kind: "sustain", mid: 55, waves: [["sawtooth", 1, 0, 0.5], ["square", 1, 4, 0.3], ["sawtooth", 2, 0, 0.2]], lp: [500, 2600, 0.12], a: 0.05, d: 0.15, s: 0.8, r: 0.15, vib: [5, 0.003, 0.4], peak: 0.2 },
    cornu: { kind: "sustain", mid: 48, waves: [["sawtooth", 1, 0, 0.6], ["sine", 0.5, 0, 0.5]], lp: [400, 1100, 0.15], a: 0.09, d: 0.2, s: 0.8, r: 0.2, peak: 0.22 },
    aulos: { kind: "sustain", mid: 62, waves: [["sawtooth", 1, 0, 0.5], ["sawtooth", 1, 12, 0.5]], lp: [3000, 3000, 0], peak_f: [1100, 2.5], a: 0.04, d: 0.08, s: 0.85, r: 0.1, vib: [5.2, 0.006, 0.15], noise: 0.02, peak: 0.16 },
    hydraulis: { kind: "sustain", mid: 55, waves: [["sine", 1, 0, 0.5], ["sine", 2, 0, 0.3], ["sine", 3, 0, 0.2], ["sine", 4, 0, 0.12], ["sine", 0.5, 0, 0.2]], a: 0.03, d: 0.05, s: 0.9, r: 0.15, peak: 0.2 },
    lyre: { kind: "pluck", mid: 60, waves: [["triangle", 1, 0, 0.6], ["sine", 2, 0, 0.25], ["sine", 3, 0, 0.1]], decay: 1.4, lp: [4500, 900, 0.8], peak: 0.3 },
    tympanum: { kind: "hit", mid: 40, drum: [130, 55, 0.13, 0.55, 420], peak: 0.7 },
    bansuri: { kind: "sustain", mid: 67, waves: [["sine", 1, 0, 0.8], ["sine", 2, 0, 0.1]], noise: 0.09, noiseQ: 2, a: 0.07, d: 0.1, s: 0.8, r: 0.12, vib: [4.8, 0.004, 0.2], peak: 0.28 },
    sitar: { kind: "pluck", mid: 55, waves: [["sawtooth", 1, 0, 0.4], ["square", 1, 3, 0.25], ["sine", 1.5, 0, 0.12]], decay: 2.0, bend: 1.04, lp: [5000, 1500, 1.5], res: [2000, 800, 8], peak: 0.22 },
    harmonium: { kind: "sustain", mid: 55, waves: [["sawtooth", 1, 0, 0.35], ["sawtooth", 1, 5, 0.3], ["square", 2, 0, 0.15]], lp: [1800, 1800, 0], a: 0.05, d: 0.05, s: 0.9, r: 0.1, peak: 0.2 },
    shehnai: { kind: "sustain", mid: 62, waves: [["sawtooth", 1, 0, 0.5], ["sawtooth", 1, 14, 0.5]], lp: [4500, 4500, 0], peak_f: [1500, 3], a: 0.04, d: 0.08, s: 0.85, r: 0.1, vib: [5.5, 0.007, 0.1], noise: 0.03, peak: 0.16 },
    tabla: { kind: "hit", mid: 50, drum: [220, 110, 0.06, 0.4, 2500], pitched: true, peak: 0.65 },
    ocarina: { kind: "sustain", mid: 67, waves: [["sine", 1, 0, 0.9], ["sine", 3, 0, 0.04]], noise: 0.02, a: 0.05, d: 0.05, s: 0.9, r: 0.1, vib: [5, 0.003, 0.3], peak: 0.3 },
    conch: { kind: "sustain", mid: 45, waves: [["sawtooth", 1, 0, 0.5], ["sine", 0.5, 0, 0.4]], lp: [300, 700, 0.2], noise: 0.08, noiseLP: 600, a: 0.15, d: 0.2, s: 0.85, r: 0.25, peak: 0.26 },
    marimba: { kind: "pluck", mid: 60, waves: [["sine", 1, 0, 0.9], ["sine", 4, 0, 0.25]], decay: 0.7, peak: 0.4 },
    rattle: { kind: "hit", mid: 60, rattle: true, peak: 0.5 },
    erhu: { kind: "sustain", mid: 62, waves: [["sawtooth", 1, 0, 0.5], ["sawtooth", 1, 5, 0.3]], lp: [2500, 2500, 0], peak_f: [800, 1.5], a: 0.1, d: 0.1, s: 0.85, r: 0.15, vib: [6, 0.012, 0.2], peak: 0.2 },
    dizi: { kind: "sustain", mid: 67, waves: [["sine", 1, 0, 0.6], ["triangle", 2, 0, 0.2], ["sine", 3, 0, 0.1]], noise: 0.06, noiseQ: 3, a: 0.04, d: 0.06, s: 0.9, r: 0.1, vib: [5, 0.003, 0.2], peak: 0.28 },
    guzheng: { kind: "pluck", mid: 60, waves: [["triangle", 1, 0, 0.6], ["sine", 2, 0, 0.3], ["sine", 4, 0, 0.08]], decay: 1.8, bend: 1.02, peak: 0.3 },
    pipa: { kind: "pluck", mid: 60, waves: [["sawtooth", 1, 0, 0.35], ["triangle", 2, 0, 0.3]], decay: 0.55, lp: [6000, 1200, 0.4], repeat: 0.085, peak: 0.28 },
    gong: { kind: "hit", mid: 43, gong: [1, 1.47, 2.09, 2.56, 3.2], peak: 0.35 },
    piano: { kind: "pluck", mid: 60, waves: [["triangle", 1, 0, 0.55], ["sine", 2, 0, 0.2], ["sine", 3, 0, 0.08]], decay: 1.6, lp: [3500, 900, 1.2], peak: 0.35 },
    violin: { kind: "sustain", mid: 64, waves: [["sawtooth", 1, 0, 0.5], ["sawtooth", 1, 7, 0.4]], lp: [1500, 3500, 0.2], a: 0.08, d: 0.1, s: 0.8, r: 0.12, vib: [5.5, 0.008, 0.2], peak: 0.2 },
    guitar: { kind: "pluck", mid: 52, waves: [["sawtooth", 1, 0, 0.4], ["triangle", 1, 2, 0.3]], decay: 1.2, lp: [3000, 700, 0.9], peak: 0.3 },
    flute: { kind: "sustain", mid: 72, waves: [["sine", 1, 0, 0.8], ["sine", 2, 0, 0.15]], noise: 0.05, noiseQ: 2, a: 0.05, d: 0.06, s: 0.9, r: 0.1, vib: [5, 0.003, 0.3], peak: 0.28 },
  };
  // [id, name, emoji, group]
  const LIST = [
    ["tuba", "Tuba (Roman trumpet)", "🎺", "rome"], ["cornu", "Cornu (Roman horn)", "📯", "rome"], ["aulos", "Aulos (double pipe)", "🎶", "rome"], ["lyre", "Lyre", "🪕", "rome"], ["hydraulis", "Water organ", "🎹", "rome"], ["tympanum", "Drum", "🥁", "rome"],
    ["bansuri", "Bansuri (bamboo flute)", "🪈", "delhi"], ["sitar", "Sitar", "🪕", "delhi"], ["harmonium", "Harmonium", "🎹", "delhi"], ["shehnai", "Shehnai", "🎶", "delhi"], ["tabla", "Tabla", "🥁", "delhi"],
    ["ocarina", "Ocarina (clay flute)", "🪈", "maya"], ["conch", "Conch shell", "🐚", "maya"], ["marimba", "Marimba", "🎼", "maya"], ["rattle", "Rattle", "🪇", "maya"],
    ["erhu", "Erhu", "🎻", "beijing"], ["dizi", "Dizi (bamboo flute)", "🪈", "beijing"], ["guzheng", "Guzheng", "🎼", "beijing"], ["pipa", "Pipa", "🪕", "beijing"], ["gong", "Gong", "🔔", "beijing"],
    ["trumpet", "Trumpet", "🎺", "modern"], ["piano", "Piano", "🎹", "modern"], ["violin", "Violin", "🎻", "modern"], ["guitar", "Guitar", "🎸", "modern"], ["flute", "Flute", "🪈", "modern"],
  ];
  const GROUPS = [["all", "All"], ["rome", "Rome"], ["delhi", "Old Delhi"], ["maya", "Maya"], ["beijing", "Beijing"], ["modern", "Modern"]];

  // ---------------------------------------------------------------- making the sound (works on any audio context, a real one or an offline one for testing)
  let noiseBuf = null;
  const noise = (ctx) => {
    if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  };
  const filter = (ctx, type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const sweep = (param, t, from, to, time) => { param.setValueAtTime(from, t); if (time > 0) param.exponentialRampToValueAtTime(to, t + time); };

  // a note that is held: returns { stop(time) }
  function sustain(ctx, out, t, f, vel, p) {
    const mix = ctx.createGain(), env = ctx.createGain(), src = [];
    env.gain.value = 0.0001;
    let tail = mix;
    for (const [type, mult, det, g] of p.waves) { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = type; o.frequency.value = f * mult; o.detune.value = det; gg.gain.value = g; o.connect(gg); gg.connect(mix); o.start(t); src.push(o); }
    if (p.vib) {
      const [rate, depth, delay] = p.vib, lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * depth, t + delay + 0.25); lfo.connect(lg);
      for (const o of src) lg.connect(o.frequency);
      lfo.start(t); src.push(lfo);
    }
    if (p.noise) { const n = noise(ctx), nf = p.noiseLP ? filter(ctx, "lowpass", p.noiseLP) : filter(ctx, "bandpass", f * 2, p.noiseQ || 2), ng = ctx.createGain(); ng.gain.value = p.noise; n.connect(nf); nf.connect(ng); ng.connect(mix); n.start(t); src.push(n); }
    if (p.lp) { const l = filter(ctx, "lowpass", p.lp[0]); sweep(l.frequency, t, p.lp[0], Math.max(60, p.lp[1]), p.lp[2]); tail.connect(l); tail = l; }
    if (p.peak_f) { const pk = filter(ctx, "peaking", p.peak_f[0], p.peak_f[1]); pk.gain.value = 9; tail.connect(pk); tail = pk; }
    tail.connect(env); env.connect(out);
    const peak = vel * p.peak;
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(peak, t + p.a); env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * p.s), t + p.a + p.d);
    let done = false;
    return { stop(tt) { if (done) return; done = true; env.gain.cancelScheduledValues(tt); env.gain.setValueAtTime(Math.max(0.0002, peak * p.s), tt); env.gain.exponentialRampToValueAtTime(0.0001, tt + p.r); for (const o of src) o.stop(tt + p.r + 0.05); } };
  }
  // a plucked or struck note that rings out on its own
  function pluck(ctx, out, t, f, vel, p) {
    const mix = ctx.createGain(), env = ctx.createGain(), end = t + p.decay + 0.1;
    for (const [type, mult, det, g] of p.waves) {
      const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = type; o.detune.value = det; gg.gain.value = g;
      if (p.bend) sweep(o.frequency, t, f * mult * p.bend, f * mult, 0.06); else o.frequency.value = f * mult;
      o.connect(gg); gg.connect(mix); o.start(t); o.stop(end);
    }
    let tail = mix;
    if (p.lp) { const l = filter(ctx, "lowpass", p.lp[0]); sweep(l.frequency, t, p.lp[0], Math.max(60, p.lp[1]), p.lp[2]); tail.connect(l); tail = l; }
    if (p.res) { const r = filter(ctx, "peaking", p.res[0], 6); r.gain.value = p.res[2]; sweep(r.frequency, t, p.res[0], p.res[1], p.decay); tail.connect(r); tail = r; }   // (the buzz of a sitar's bridge)
    tail.connect(env); env.connect(out);
    const peak = vel * p.peak;
    env.gain.setValueAtTime(peak, t); env.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
    return { stop() {} };
  }
  function hit(ctx, out, t, f, vel, p) {
    const peak = vel * p.peak;
    if (p.rattle) {                                                           // a rattle: three short bursts of noise
      for (let k = 0; k < 3; k++) { const n = noise(ctx), h = filter(ctx, "highpass", 3500), g = ctx.createGain(), s = t + k * 0.05; n.connect(h); h.connect(g); g.connect(out); g.gain.setValueAtTime(peak * 0.5, s); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.07); n.start(s); n.stop(s + 0.09); }
      return { stop() {} };
    }
    if (p.gong) {                                                             // a gong: partials that are not whole multiples of the note, ringing for seconds
      const env = ctx.createGain(); env.connect(out); env.gain.setValueAtTime(peak, t); env.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      p.gong.forEach((m, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * m; g.gain.value = 1 / (1 + i * 0.7); o.connect(g); g.connect(env); o.start(t); o.stop(t + 3.6); });
      return { stop() {} };
    }
    const [from, to, sw, dec, click] = p.drum, base = p.pitched ? f : to * 1.0, start = p.pitched ? f * 1.6 : from;       // a drum: a sine that falls in pitch, and a click of noise
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; sweep(o.frequency, t, start, base, sw); o.connect(g); g.connect(out);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); o.start(t); o.stop(t + dec + 0.05);
    const n = noise(ctx), nf = filter(ctx, p.pitched ? "bandpass" : "lowpass", click, 1), ng = ctx.createGain(); n.connect(nf); nf.connect(ng); ng.connect(out);
    ng.gain.setValueAtTime(peak * 0.4, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); n.start(t); n.stop(t + 0.1);
    return { stop() {} };
  }
  function voice(ctx, out, id, f, t, vel = 0.8) { const p = P[id]; return (p.kind === "sustain" ? sustain : p.kind === "pluck" ? pluck : hit)(ctx, out, t, f, vel, p); }

  // ---------------------------------------------------------------- the real audio: one context, a little reverb and a compressor so many notes do not clip
  let ctx = null, bus = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); const comp = ctx.createDynamicsCompressor(), dry = ctx.createGain(), wet = ctx.createGain(), rev = ctx.createConvolver(), master = ctx.createGain();
      const len = Math.floor(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
      rev.buffer = ir; dry.gain.value = 0.9; wet.gain.value = 0.22; master.gain.value = 0.9;
      bus = ctx.createGain(); bus.connect(dry); bus.connect(rev); rev.connect(wet); dry.connect(comp); wet.connect(comp); comp.connect(master); master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // ---------------------------------------------------------------- the keys
  const ROWS = [["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"], ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon"], ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"]];
  const LABELS = [["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/"], ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";"], ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"]];
  let inst = "trumpet", scale = "major", group = "all", tab = "play", relayAt = 0;
  const held = new Map();                       // key code -> { voice, timer }
  const degreeOf = (code) => { for (let r = 0; r < 3; r++) { const c = ROWS[r].indexOf(code); if (c >= 0) return (r - 1) * 10 + c; } return null; };
  function freqOf(degree) {                      // the note of a degree in the scale (0 is where the middle row begins)
    const steps = SCALES[scale][1], n = steps.length, oct = Math.floor(degree / n), i = ((degree % n) + n) % n;
    return hz(P[inst].mid + oct * 12 + steps[i]);
  }
  function startNote(code, degree, vel = 0.8) {
    if (held.has(code)) return;
    const c = audio(); if (!c) return;
    const f = freqOf(degree), p = P[inst], v = voice(c, bus, inst, f, c.currentTime, vel), h = { v, id: inst };
    if (p.repeat) h.timer = setInterval(() => voice(c, bus, h.id, f, c.currentTime, vel * 0.8), p.repeat * 1000);
    held.set(code, h); lit(code, true);
    const t = performance.now();
    if (t - relayAt > 90 && typeof Online !== "undefined" && Online.connected) { relayAt = t; Online.navalSend({ t: "note", i: inst, f: Math.round(f * 10) / 10 }); }       // (the others near you hear it)
  }
  function stopNote(code) { const h = held.get(code); if (!h) return; held.delete(code); if (h.timer) clearInterval(h.timer); if (ctx) h.v.stop(ctx.currentTime); lit(code, false); }
  const stopAll = () => { for (const code of [...held.keys()]) stopNote(code); };

  // the notes other players play near you: louder when closer, and from the side they are on
  function heard(m) {
    if (!P[m.i] || !Number.isFinite(m.f) || typeof Sfx === "undefined" || !Sfx.on) return;
    const c = audio(); if (!c) return;
    let vol = 0.6, pan = 0;
    try {
      const q = Online.peerList().find((x) => x.id === m.id);
      if (q && q.x !== null) { const d = Math.hypot(q.x - player.x, q.z - player.z); vol = Math.max(0.08, 0.7 * (1 - d / 70)); pan = Math.max(-1, Math.min(1, Math.sin(Math.atan2(q.x - player.x, -(q.z - player.z)) + player.yaw) * 0.8)); }
    } catch (e) { /* use the default */ }
    const out = c.createStereoPanner ? c.createStereoPanner() : c.createGain(); if (out.pan) out.pan.value = pan; out.connect(bus);
    const v = voice(c, out, m.i, m.f, c.currentTime, vol);
    if (P[m.i].kind === "sustain") v.stop(c.currentTime + 0.55);
  }

  // ---------------------------------------------------------------- the panel
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const keyEls = new Map();
  function lit(code, on) { const k = keyEls.get(code); if (k) k.classList.toggle("down", on); }

  function build() {
    const body = $("ins-body"); body.replaceChildren();
    const tabs = el("div", undefined, "ins-tabs");
    for (const [id, name] of [["play", "🎼 Play"], ["game", "🎯 Rhythm game"]]) { const b = el("button", tr(name)); b.type = "button"; b.className = tab === id ? "on" : ""; b.addEventListener("click", () => { stopAll(); Game.stop(); tab = id; build(); }); tabs.append(b); }
    body.append(tabs);
    const gr = el("div", undefined, "ins-groups");
    for (const [id, name] of GROUPS) { const b = el("button", tr(name)); b.type = "button"; b.className = group === id ? "on" : ""; b.addEventListener("click", () => { group = id; build(); }); gr.append(b); }
    body.append(gr);
    const grid = el("div", undefined, "ins-grid");
    for (const [id, name, emoji, g] of LIST) {
      if (group !== "all" && g !== group) continue;
      const b = el("button"); b.type = "button"; b.className = inst === id ? "on" : ""; b.append(el("span", emoji, "ins-emoji"), el("span", tr(name)));
      b.addEventListener("click", () => { stopAll(); inst = id; audio(); build(); try { localStorage.setItem("rome-inst", inst); } catch (e) { /* ignore */ } preview(); });
      grid.append(b);
    }
    body.append(grid);
    const row = el("div", undefined, "ins-row"), sel = el("select"); sel.setAttribute("aria-label", tr("Scale"));
    for (const [id, [name]] of Object.entries(SCALES)) { const o = el("option", tr(name)); o.value = id; sel.append(o); }
    sel.value = scale; sel.addEventListener("change", () => { stopAll(); scale = sel.value; try { localStorage.setItem("rome-scale", scale); } catch (e) { /* ignore */ } });
    row.append(el("label", tr("Scale")), sel); body.append(row);
    if (tab === "play") {
      const kb = el("div", undefined, "ins-keys"); keyEls.clear();
      for (let r = 2; r >= 0; r--) {
        const line = el("div", undefined, "ins-keyrow");
        ROWS[r].forEach((code, c) => {
          const k = el("button", LABELS[r][c]); k.type = "button"; k.className = "ins-key"; keyEls.set(code, k);
          const down = (e) => { e.preventDefault(); startNote(code, degreeOf(code)); }, up = (e) => { e.preventDefault(); stopNote(code); };
          k.addEventListener("pointerdown", down); k.addEventListener("pointerup", up); k.addEventListener("pointerleave", up); k.addEventListener("pointercancel", up);
          line.append(k);
        });
        kb.append(line);
      }
      body.append(kb, el("p", tr("Play with the keys: three rows (Q to P, A to ;, Z to /) are three octaves of the scale, low at the bottom. Hold a key to hold a note. Or tap the keys on the screen. Other players near you hear you."), "dnote"));
    } else Game.render(body);
  }
  function preview() { const c = audio(); if (!c) return; const d = degreeOf("KeyA"), f = freqOf(d), v = voice(c, bus, inst, f, c.currentTime, 0.7); if (P[inst].kind === "sustain") v.stop(c.currentTime + 0.5); }

  // ---------------------------------------------------------------- the rhythm game
  // songs: [lane 1 to 5, beats]; the lanes are the first five notes of the scale on the keys A S D F G
  const SONGS = [
    { name: "Mary had a little lamb", bpm: 100, notes: [[3, 1], [2, 1], [1, 1], [2, 1], [3, 1], [3, 1], [3, 2], [2, 1], [2, 1], [2, 2], [3, 1], [5, 1], [5, 2], [3, 1], [2, 1], [1, 1], [2, 1], [3, 1], [3, 1], [3, 1], [3, 1], [2, 1], [2, 1], [3, 1], [2, 1], [1, 4]] },
    { name: "Hot cross buns", bpm: 100, notes: [[3, 1], [2, 1], [1, 2], [3, 1], [2, 1], [1, 2], [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5], [2, 0.5], [2, 0.5], [2, 0.5], [2, 0.5], [3, 1], [2, 1], [1, 2]] },
    { name: "Ode to Joy", bpm: 108, notes: [[3, 1], [3, 1], [4, 1], [5, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 1], [2, 1], [3, 1], [3, 1.5], [2, 0.5], [2, 2], [3, 1], [3, 1], [4, 1], [5, 1], [5, 1], [4, 1], [3, 1], [2, 1], [1, 1], [1, 1], [2, 1], [3, 1], [2, 1.5], [1, 0.5], [1, 2]] },
    { name: "Fanfare (to play on a trumpet)", bpm: 120, notes: [[1, 0.5], [1, 0.5], [1, 1], [3, 1], [5, 2], [3, 1], [5, 1], [3, 2], [1, 1], [3, 0.5], [3, 0.5], [5, 1], [4, 1], [3, 1], [2, 1], [1, 3]] },
  ];
  const Game = (() => {
    let song = 0, run = null, raf = 0, timer = 0, canvas = null, info = null;
    const LANE_KEYS = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG"], LEAD = 2.2, WIN = [0.11, 0.24];
    function stop() { cancelAnimationFrame(raf); clearInterval(timer); raf = 0; timer = 0; run = null; }
    function render(body) {
      const row = el("div", undefined, "ins-row"), sel = el("select"); sel.setAttribute("aria-label", tr("Song"));
      SONGS.forEach((s, i) => { const o = el("option", tr(s.name)); o.value = String(i); sel.append(o); }); sel.value = String(song); sel.addEventListener("change", () => { song = Number(sel.value); stop(); build(); });
      const go = el("button", tr("▶ Start")); go.type = "button"; go.addEventListener("click", start);
      row.append(el("label", tr("Song")), sel, go); body.append(row);
      canvas = document.createElement("canvas"); canvas.width = 440; canvas.height = 320; canvas.className = "ins-canvas"; body.append(canvas);
      info = el("p", tr("Notes fall down five lanes. Press A S D F G when a note reaches the line. Press ▶ Start."), "dnote"); body.append(info);
      draw();
    }
    function start() {
      const c = audio(); if (!c) return;
      stopAll();
      const spb = 60 / SONGS[song].bpm; let beat = 2;                                  // two beats of count-in
      const notes = SONGS[song].notes.map(([lane, len]) => { const n = { lane: lane - 1, at: beat * spb, hit: null }; beat += len; return n; });
      run = { notes, t0: performance.now() / 1000, score: 0, perfect: 0, good: 0, miss: 0, combo: 0, best: 0, end: beat * spb + 1.2 };
      info.textContent = ""; clearInterval(timer); timer = setInterval(logic, 50); loop();
    }
    const now = () => performance.now() / 1000 - run.t0;
    function press(code) {
      if (!run) return false;
      const lane = LANE_KEYS.indexOf(code); if (lane < 0) return false;
      const t = now(); let best = null;
      for (const n of run.notes) if (n.hit === null && n.lane === lane && Math.abs(n.at - t) < WIN[1] && (!best || Math.abs(n.at - t) < Math.abs(best.at - t))) best = n;
      startNote(code, lane);
      if (!best) { run.combo = 0; return true; }
      const e = Math.abs(best.at - t);
      best.hit = e < WIN[0] ? "perfect" : "good";
      run[best.hit]++; run.score += best.hit === "perfect" ? 100 : 50; run.combo++; run.best = Math.max(run.best, run.combo);
      return true;
    }
    function loop() { raf = requestAnimationFrame(loop); draw(); }                       // (drawing follows the screen's frames...)
    function logic() {                                                                  // ...but the scoring follows the clock, so a slow or hidden tab still judges the song right
      if (!run) return;
      const t = now();
      for (const n of run.notes) if (n.hit === null && t - n.at > WIN[1]) { n.hit = "miss"; run.miss++; run.combo = 0; }
      if (t > run.end) finish();
    }
    function finish() {
      cancelAnimationFrame(raf); clearInterval(timer); raf = 0; timer = 0;
      const total = run.notes.length, acc = (run.perfect + run.good * 0.5) / total, stars = acc > 0.9 ? 3 : acc > 0.7 ? 2 : acc > 0.45 ? 1 : 0;
      info.textContent = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}  ${tr("Score")} ${run.score} · ${tr("perfect")} ${run.perfect} · ${tr("good")} ${run.good} · ${tr("missed")} ${run.miss} · ${tr("best run")} ${run.best}`;
      if (typeof Sfx !== "undefined" && stars) Sfx.play("medal");
      run = null; draw();
    }
    function draw() {
      if (!canvas) return;
      const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, lw = W / 5, lineY = H - 56;
      g.fillStyle = "#14100b"; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.08)"; g.fillRect(i * lw, 0, lw, H); }
      g.fillStyle = "#e2b955"; g.fillRect(0, lineY, W, 3);
      const colors = ["#d9604f", "#e2b955", "#6fbf73", "#5fa8d3", "#b77fd1"];
      for (let i = 0; i < 5; i++) { g.fillStyle = colors[i]; g.globalAlpha = 0.35; g.beginPath(); g.arc(i * lw + lw / 2, lineY + 28, 20, 0, 7); g.fill(); g.globalAlpha = 1; g.fillStyle = "#fff"; g.font = "bold 16px system-ui"; g.textAlign = "center"; g.fillText("ASDFG"[i], i * lw + lw / 2, lineY + 34); }
      if (!run) return;
      const t = now();
      for (const n of run.notes) {
        const y = lineY - (n.at - t) / LEAD * lineY;
        if (y < -20 || y > H + 20 || n.hit === "perfect" || n.hit === "good") continue;
        g.globalAlpha = n.hit === "miss" ? 0.25 : 1; g.fillStyle = colors[n.lane]; g.beginPath(); g.arc(n.lane * lw + lw / 2, y, 16, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      g.fillStyle = "#f1ead8"; g.font = "bold 18px system-ui"; g.textAlign = "left"; g.fillText(`${tr("Score")} ${run.score}`, 10, 24); g.textAlign = "right"; g.fillText(run.combo > 1 ? `${run.combo} ✕` : "", W - 10, 24);
    }
    return { render, stop, press, get running() { return !!run; } };
  })();

  // ---------------------------------------------------------------- opening, keys
  const isOpen = () => $("instruments") && $("instruments").classList.contains("show");
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    try { const i = localStorage.getItem("rome-inst"), s = localStorage.getItem("rome-scale"); if (P[i]) inst = i; if (SCALES[s]) scale = s; else scale = CITY_SCALE[typeof city !== "undefined" ? city : "rome"] || "major"; } catch (e) { /* ignore */ }
    openPanel("#instruments"); build(); audio();
  }
  function bind() {
    const b = $("btn-play"); if (b) b.addEventListener("click", open);
    addEventListener("keydown", (e) => {
      if (!isOpen() || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape") return;
      const d = degreeOf(e.code); if (d === null) return;
      e.preventDefault(); e.stopPropagation();
      if (tab === "game" && Game.press(e.code)) return;
      startNote(e.code, d);
    }, true);
    addEventListener("keyup", (e) => { if (held.has(e.code)) stopNote(e.code); }, true);
    new MutationObserver(() => { if (!isOpen()) { stopAll(); Game.stop(); } }).observe($("instruments"), { attributes: true, attributeFilter: ["class"] });
  }

  // a test hook: render a note of an instrument without sound, to check it is not silent or broken
  async function renderNote(id, midi = 60, seconds = 1.2) {
    const oc = new OfflineAudioContext(1, Math.floor(44100 * seconds), 44100), out = oc.createGain(); out.connect(oc.destination);
    const v = voice(oc, out, id, hz(midi), 0, 0.8); if (P[id].kind === "sustain") v.stop(0.6);
    return (await oc.startRendering()).getChannelData(0);
  }
  return { bind, open, heard, renderNote, game: Game, LIST, SCALES, INSTRUMENT_IDS: Object.keys(P) };
})();
