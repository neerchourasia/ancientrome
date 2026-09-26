"use strict";
// Reads captions aloud with the browser's built-in text-to-speech (no audio files, nothing is sent anywhere).
// It speaks the subtitles of the Colosseum shows, the history cards of the landmarks, the result screens and the
// turn-by-turn directions. The Voice button (or J) turns it on and off.

const Narrator = (() => {
  const KEY = "rome-voice";
  const synth = window.speechSynthesis || null;
  let on = true, voice = null, last = "", lastAt = 0;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (e) { /* storage unavailable */ }

  // Prefer a clear English voice if the computer has one.
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    voice = voices.find((v) => /^en[-_](GB|US)/i.test(v.lang) && /(Daniel|Google UK English Male|Alex|Samantha|Google US English|Microsoft (David|Mark|George)|Aaron)/i.test(v.name))
      || voices.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  // Make text sound right when spoken.
  function clean(text) {
    return String(text)
      .replace(/[·•]/g, ",")
      .replace(/\bc\.\s*(\d)/g, "circa $1")
      .replace(/(\d)\s*km²/g, "$1 square kilometres")
      .replace(/\bBC\b/g, "B C")
      .replace(/\bAD\b/g, "A D")
      .replace(/\s+/g, " ")
      .trim();
  }

  function say(text, opts = {}) {
    if (!on || !synth || !text) return;
    text = clean(text);
    if (!text) return;
    if (!opts.repeat && text === last && performance.now() - lastAt < 15000) return; // don't repeat the same line
    last = text; lastAt = performance.now();
    if (opts.interrupt) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-GB";
    u.rate = opts.rate || 0.98; u.pitch = 0.95; u.volume = 1;
    synth.speak(u);
  }

  function stop() { if (synth) synth.cancel(); }

  return {
    say, stop,
    get on() { return on; },
    get supported() { return !!synth; },
    toggle() {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* ignore */ }
      if (!on) stop();
      return on;
    },
  };
})();
