"use strict";
// Your character: a name, a class and a look. Saved in the browser for now (key "rome-character").
//
// Everything goes through load() / set() / owns(), so a server account can replace them later. When real
// players meet (live fights and races) the server, not the browser, must decide your class bonuses and which
// paid cosmetics you own: anything checked only here can be edited by the player.

const Character = (() => {
  const KEY = "rome-character";

  const COLORS = {
    skin: [0xefc9a3, 0xe0b38a, 0xd9a273, 0xc9956b, 0xa8724c, 0x7a5033],
    hair: [0x1c140e, 0x3a2a1a, 0x6b4a2b, 0xa8763a, 0xc9a24a, 0x8c8c8c],
    toga: [0xf3e6c8, 0xd8d2c0, 0x4f6f8f, 0x7d8f5b, 0xb0473a, 0x6a1b5e, 0xd4a82a],
    sash: [0x9c3a2e, 0x2f6b8f, 0x3d7a4a, 0x2a2118, 0xe0c070, 0x6a1b5e],
  };
  // Premium cosmetics (Tyrian purple, imperial gold): shown as locked until paid extras exist.
  const PREMIUM = { skin: [], hair: [], toga: [5, 6], sash: [5] };
  const PREMIUM_NAMES = { toga: { 5: "Tyrian purple toga", 6: "Imperial gold toga" }, sash: { 5: "Tyrian purple sash" } };

  // Where the "Get Premium" button sends people. Leave `checkoutUrl` empty until payments are set up; paste a
  // Stripe Payment Link (https://buy.stripe.com/...) here to turn the button on. Unlocking after payment still
  // needs a server (accounts + a Stripe webhook), because anything the browser decides can be edited.
  const SHOP = { price: "", checkoutUrl: "" };

  // `mods` are multipliers (1 = no change) read by the fights and races.
  const CLASSES = {
    gladiator: {
      name: "Gladiator", blurb: "A fighter of the arena.",
      perks: ["+25% sword damage", "10% less damage taken", "Chariot a little slower (-3%)"],
      mods: { melee: 1.25, taken: 0.9, racespeed: 0.97 },
    },
    charioteer: {
      name: "Charioteer", blurb: "A star of the Circus Maximus.",
      perks: ["Horses tire 20% slower", "Chariot a little faster (+3%)", "Weaker sword (-10%), takes 5% more damage"],
      mods: { tire: 0.8, racespeed: 1.03, melee: 0.9, taken: 1.05 },
    },
    venator: {
      name: "Venator", blurb: "A hunter of beasts, with the bow.",
      perks: ["+30% arrow damage", "Weaker sword (-10%)"],
      mods: { arrow: 1.3, melee: 0.9 },
    },
    merchant: {
      name: "Merchant", blurb: "Makes money wherever there is a crowd.",
      perks: ["+25% denarii from purses and prizes", "Race entry 25% cheaper", "Weaker sword (-15%), takes 10% more damage"],
      mods: { coin: 1.25, fee: 0.75, melee: 0.85, taken: 1.1 },
    },
  };

  const DEFAULT = { name: "", cls: "gladiator", look: { skin: 1, hair: 1, toga: 0, sash: 0 } };

  const cleanName = (v) => String(v == null ? "" : v).replace(/[^A-Za-z0-9 '\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  const owns = (part, i) => !PREMIUM[part].includes(i); // later: also true if the account bought it
  const validIndex = (part, i) => Number.isInteger(i) && i >= 0 && i < COLORS[part].length && owns(part, i);

  // Anything that is not valid falls back to the default, so edited or corrupted storage cannot do harm.
  function sanitize(raw) {
    const out = { name: cleanName(raw && raw.name), cls: DEFAULT.cls, look: { ...DEFAULT.look } };
    if (raw && Object.prototype.hasOwnProperty.call(CLASSES, raw.cls)) out.cls = raw.cls;
    for (const part of Object.keys(COLORS)) {
      const i = raw && raw.look ? raw.look[part] : undefined;
      if (validIndex(part, i)) out.look[part] = i;
    }
    return out;
  }

  let s = sanitize(null), saved = false;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && raw.v === 1) { s = sanitize(raw); saved = s.name.length >= 2; }
  } catch (e) { /* storage unavailable */ }

  return {
    COLORS, CLASSES, PREMIUM, PREMIUM_NAMES, SHOP, cleanName, owns,
    get exists() { return saved; },
    get name() { return s.name; },
    get cls() { return s.cls; },
    get className() { return CLASSES[s.cls].name; },
    get look() { return s.look; },
    color: (part, i) => COLORS[part][validIndex(part, i) ? i : 0],
    mod: (key) => { const m = CLASSES[s.cls].mods[key]; return m === undefined ? 1 : m; },
    set(next) {
      s = sanitize(next);
      saved = s.name.length >= 2;
      try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...s })); } catch (e) { /* ignore */ }
      return saved;
    },
  };
})();
