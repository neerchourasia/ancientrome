"use strict";
// Background music, made in the browser (no audio files). It changes with where you are: a Dorian lyre with a flute in ancient
// Rome, soft piano in modern Rome, a raga with a tanpura drone, sitar plucks and a light tabla in Mughal Delhi, and a bright
// scale in modern Delhi. It slows and thins in rain, storms and at night, and speeds up and brightens on a festival day. It
// plays only while you walk, drive or watch (not in fights, races or naval battles, which have their own sound), through the
// same output as the rest of the sound, so the Sound switch silences it too. Depends on audio.js, weather.js, festival.js.

const Music = (() => {
  const KEY = "rome-music";
  let on = true, gain = null, ctx = null, nextT = 0, step = 0, deg = 3, level = 0, noiseBuf = null, bar = 0;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) { /* storage unavailable */ }

  // each style: the scale (semitones above the root), the root note, how it sounds, and how busy and fast it is
  const STYLES = {
    "rome-ancient": { scale: [0, 2, 3, 5, 7, 9, 10], root: 146.83, bpm: 66, wave: "triangle", cut: 2600, density: 0.55, drone: [1, 1.5], flute: true },
    "rome-modern": { scale: [0, 2, 4, 7, 9], root: 261.63, bpm: 72, wave: "sine", cut: 3200, density: 0.5, drone: [0.5, 0.75], flute: false },
    "delhi-ancient": { scale: [0, 1, 4, 5, 7, 8, 11], root: 130.81, bpm: 68, wave: "sawtooth", cut: 1900, density: 0.6, drone: [1, 1.5], tabla: true },
    "delhi-modern": { scale: [0, 2, 4, 6, 7, 9, 11], root: 146.83, bpm: 78, wave: "triangle", cut: 3000, density: 0.5, drone: [0.5, 0.75], tabla: false },
  };

  function init() {
    if (ctx || typeof Sfx === "undefined" || !Sfx.ctx) return;
    ctx = Sfx.ctx;
    gain = ctx.createGain(); gain.gain.value = 0; gain.connect(Sfx.master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // a plucked note: an oscillator through a low-pass filter with a quick decay
  function pluck(f, t, dur, wave, vol, cut) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), e = ctx.createGain();
    o.type = wave; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.setValueAtTime(cut, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, cut * 0.25), t + dur);
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.012); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(e); e.connect(gain); o.start(t); o.stop(t + dur + 0.05);
  }
  // a long soft note (a drone or a flute): a slow swell and fade, with a little vibrato
  function pad(f, t, dur, vol, vib) {
    const o = ctx.createOscillator(), e = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = "sine"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 1400;
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(e); e.connect(gain); o.start(t); o.stop(t + dur + 0.05);
  }
  // a light drum hit (a filtered burst of noise)
  function hit(t, f, vol) {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), e = ctx.createGain();
    s.buffer = noiseBuf; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 3;
    e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(bp); bp.connect(e); e.connect(gain); s.start(t); s.stop(t + 0.15);
  }

  function mood() {
    const c = typeof city !== "undefined" ? city : "rome", ea = typeof era !== "undefined" ? era : "ancient";
    const st = STYLES[`${c}-${ea}`] || STYLES["rome-ancient"];
    const rain = typeof Weather !== "undefined" ? Math.max(Weather.rain, Weather.snow, Weather.hail) : 0;
    const night = typeof Time !== "undefined" && Time.isNight ? 1 : 0;
    const feast = typeof Festival !== "undefined" && Festival.active ? 1 : 0;
    return { st, rain, night, feast, bpm: st.bpm * (1 - 0.18 * rain - 0.12 * night + 0.22 * feast), dens: st.density * (1 - 0.35 * rain - 0.25 * night + 0.25 * feast) };
  }

  function playStep(t, m) {
    const st = m.st, n = st.scale.length, base = st.root * (m.feast ? 2 : 1);
    const hz = (d) => base * Math.pow(2, (st.scale[((d % n) + n) % n] + 12 * Math.floor(d / n)) / 12);
    if (step % 16 === 0) {                                               // each bar: the drone, and sometimes a long flute note
      const dur = (60 / m.bpm) * 4 * 2;
      for (const k of st.drone) pad(base * k * 0.5, t, dur, 0.09, false);
      if (st.flute && Math.random() < 0.6) pad(hz(deg + 7), t + 0.3, dur * 0.8, 0.06, true);
      bar++;
    }
    if (Math.random() < m.dens) {                                        // the melody: a wandering line that likes to come back to the middle
      deg += Math.random() < 0.5 ? 1 : -1; if (Math.random() < 0.15) deg += Math.random() < 0.5 ? 2 : -2;
      if (deg > 9) deg -= 2; if (deg < 0) deg += 2;
      pluck(hz(deg + n), t, 0.9 + Math.random() * 0.8, st.wave, 0.11, st.cut);
      if (step % 8 === 0 && Math.random() < 0.5) pluck(hz(deg + n) * 1.5, t + 0.02, 1.0, st.wave, 0.05, st.cut * 0.8);   // a fifth above
    }
    if (st.tabla && !m.rain) {                                           // a soft tabla: a low and a high hit in a loop of eight
      const pat = step % 8;
      if (pat === 0) hit(t, 140, 0.16); else if (pat === 3 || pat === 5) hit(t, 900, 0.07); else if (pat === 6 && Math.random() < 0.5) hit(t, 520, 0.06);
    }
    step++;
  }

  function update(dt, active) {
    if (!ctx) { init(); if (!ctx) return; }
    const want = on && active && Sfx.on ? 1 : 0;
    level += (want - level) * Math.min(1, dt * 0.6);
    gain.gain.value = 0.55 * level * (typeof Weather !== "undefined" ? 1 - 0.3 * Math.min(1, Weather.rain) : 1);
    if (level < 0.02 || ctx.state !== "running") { nextT = 0; return; }
    const m = mood(), t = ctx.currentTime;
    if (nextT < t) nextT = t + 0.1;
    while (nextT < t + 0.6) { playStep(nextT, m); nextT += 60 / m.bpm / 2; }
  }

  return {
    update,
    get on() { return on; },
    toggle() { on = !on; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* ignore */ } return on; },
  };
})();
