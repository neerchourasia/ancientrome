"use strict";
// Your condition: health, and the fitness of your racing horses. Games wear both down and rest restores them,
// so you can't just keep playing. Saved in the browser between visits.

const Vitals = (() => {
  const KEY = "rome-vitals";
  const START_COINS = 300; // what a new game starts with
  const MIN_FIGHT_HP = 35, MIN_RACE_HORSES = 40, RACE_ENTRY = 20;
  const s = { hp: 100, horses: 100, coins: START_COINS, hunger: 100 };
  const HUNGER_SECONDS = 960, STARVE_HP = 0.6; // full to empty in 16 minutes; at empty you lose health and stop healing
  let resting = false, saveT = 0, fed = 0;

  const clamp = (v) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 100));
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v) { s.hp = clamp(v.hp); s.horses = clamp(v.horses); s.coins = Number.isFinite(v.coins) ? Math.max(0, v.coins) : 100; if (Number.isFinite(v.hunger)) s.hunger = clamp(v.hunger); }
  } catch (e) { /* storage unavailable */ }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  return {
    get hp() { return s.hp; }, set hp(v) { s.hp = clamp(v); },
    get horses() { return s.horses; }, set horses(v) { s.horses = clamp(v); },
    get coins() { return s.coins; }, set coins(v) { s.coins = Math.max(0, Math.round(v)); },
    get resting() { return resting; },
    get fed() { return fed; },
    get hunger() { return s.hunger; }, set hunger(v) { s.hunger = clamp(v); },
    eat(heal, fill) { s.hp = clamp(s.hp + heal); s.hunger = clamp(s.hunger + (fill === undefined ? heal * 2.5 : fill)); fed = Math.min(420, fed + heal * 6 + 40); }, // a meal heals at once and speeds up healing for a few minutes
    MIN_FIGHT_HP, MIN_RACE_HORSES, RACE_ENTRY,
    canFight: () => s.hp >= MIN_FIGHT_HP,
    canRace: () => s.horses >= MIN_RACE_HORSES,
    needsRest: (atStables) => s.hp < 90 || (atStables && s.horses < 90),

    startRest() { resting = true; },
    stopRest() { resting = false; },

    // ctx: { mode, atStables }. Nothing heals while you are in a game.
    update(dt, ctx) {
      if (ctx.mode === "walk" || ctx.mode === "watch") {
        const rest = resting && ctx.mode === "walk";
        // You always recover a little while you are not in a game; resting is about four times faster.
        // From 20 health: about 55 s resting, or about 3.5 minutes just walking around. Horses are slower: about 90 s from 30 to full resting at the stables, and many minutes on their own.
        s.hp = clamp(s.hp + (rest ? 1.45 * (ctx.restBoost || 1) : 0.38) * (s.hunger <= 0.01 ? 0 : fed > 0 ? 1.8 : 1) * dt); // a better house heals you faster, and so does a good meal
        s.horses = clamp(s.horses + (rest && ctx.atStables ? 0.8 : 0.06) * dt);
        if (rest && s.hp >= 99.5 && (!ctx.atStables || s.horses >= 99.5)) { resting = false; return "refreshed"; }
      }
      if (fed > 0) fed = Math.max(0, fed - dt);
      // hunger: food is a must. It runs down while you play; at empty you stop healing and starve
      if (ctx.mode === "walk" || ctx.mode === "watch" || ctx.mode === "drive") {
        s.hunger = clamp(s.hunger - (100 / HUNGER_SECONDS) * dt);
        if (s.hunger <= 0.01 && ctx.mode !== "watch") s.hp = clamp(s.hp - STARVE_HP * dt);
      }
      saveT += dt;
      if (saveT > 2) { saveT = 0; save(); }
      return null;
    },
    save,
    reset() { s.hp = 100; s.horses = 100; s.coins = START_COINS; s.hunger = 100; save(); },
  };
})();
