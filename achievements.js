"use strict";
// Achievements and titles: 🏅 Achievements (under You in the menu). The game watches what you do and ticks off badges (a gold medal, a pyramid, a guild, a big fortune...). Each one
// is worth a little money the moment you earn it, and some give a title you can wear: it shows in square brackets after your guild tag in the main chat. Earned badges are kept in
// the browser and with your account. Depends on the other modules of the game (each is checked only if it is there), vitals.js and the globals of game.js.

const Achievements = (() => {
  const KEY = "rome-ach";
  // [id, icon, name, what to do, title worn when earned (or ""), reward in denarii, test]
  const medals = (m) => { try { return Object.values(Events.snapshot()).filter((v) => v.medal === m).length; } catch (e) { return 0; } };
  const LIST = [
    ["day7", "📅", "A week in", "Play until day 7.", "", 20, () => Time.day >= 7],
    ["day30", "🗓", "A month in", "Play until day 30.", "Veteran", 100, () => Time.day >= 30],
    ["rich1", "💰", "Comfortable", "Hold 1,000 denarii.", "", 20, () => Vitals.coins >= 1000],
    ["rich2", "🏦", "Wealthy", "Hold 10,000 denarii.", "Tycoon", 200, () => Vitals.coins >= 10000],
    ["rich3", "👑", "Fabulously rich", "Hold 50,000 denarii.", "Magnate", 1000, () => Vitals.coins >= 50000],
    ["quest1", "📜", "Errand runner", "Finish a quest for a citizen.", "", 15, () => typeof Quests !== "undefined" && Quests.total >= 1],
    ["quest2", "✉", "Trusted courier", "Finish 25 quests.", "Courier", 150, () => typeof Quests !== "undefined" && Quests.total >= 25],
    ["relic1", "💎", "Treasure hunter", "Trade for your first rare treasure.", "", 25, () => typeof Relics !== "undefined" && Relics.owned.length >= 1],
    ["relic2", "🏺", "Collector", "Own 6 of the 12 treasures.", "Collector", 200, () => typeof Relics !== "undefined" && Relics.owned.length >= 6],
    ["relic3", "🏛", "Museum piece", "Own all 12 treasures.", "Curator", 1000, () => typeof Relics !== "undefined" && Relics.owned.length >= 12],
    ["land1", "🏠", "Landlord", "Buy a house to rent out.", "", 25, () => typeof Estate !== "undefined" && Estate.count >= 1],
    ["land2", "🏘", "Property baron", "Own 5 rental houses.", "Landlord", 250, () => typeof Estate !== "undefined" && Estate.count >= 5],
    ["biz1", "🏢", "Businessperson", "Buy a business.", "", 25, () => typeof Ventures !== "undefined" && Ventures.count >= 1],
    ["biz2", "🏭", "Entrepreneur", "Own 3 businesses or museums.", "Entrepreneur", 250, () => typeof Ventures !== "undefined" && Ventures.count >= 3],
    ["home3", "🏡", "Moving up", "Upgrade a house three times.", "", 40, () => { const o = Market.snapshot(); return Math.max(o.house, o.dhouse, o.chouse || 0, o.bhouse || 0) >= 3; }],
    ["home7", "🏰", "A palace", "Own the finest house in Cancún.", "Palace Owner", 500, () => (Market.snapshot().chouse || 0) >= 7],
    ["share", "📈", "Shareholder", "Buy shares on the exchange.", "", 20, () => typeof Exchange !== "undefined" && Exchange.count > 0],
    ["gold1", "🥇", "On the podium", "Win a gold medal in a race event.", "", 50, () => medals(1) >= 1],
    ["gold3", "🏁", "Champion", "Win gold on all three courses of a city.", "Champion", 400, () => medals(1) >= 3],
    ["roof1", "🏢", "Rooftop landing", "Land an aircraft on a roof.", "", 30, () => typeof Car !== "undefined" && Car.roofs.n >= 1],
    ["roof2", "🌆", "Skyscraper pilot", "Land an aircraft on a roof 100 m above the street (the towers of Beijing).", "Sky Pilot", 200, () => typeof Car !== "undefined" && Car.roofs.max >= 100],
    ["guild", "🛡", "Joiner", "Join or found a guild.", "", 20, () => typeof Guilds !== "undefined" && Guilds.inGuild],
    ["sea", "⛵", "Sea legs", "Arrive in a city by sea.", "", 20, () => typeof Voyage !== "undefined" && Voyage.count >= 1],
    ["sea3", "🧭", "Explorer", "Arrive in all three cities by sea.", "Explorer", 200, () => typeof Voyage !== "undefined" && Voyage.count >= 3],
    ["dive", "🤿", "Treasure diver", "Open a sunken chest in Cancún.", "", 25, () => typeof Cancun !== "undefined" && Cancun.stats.chests >= 1],
    ["dive2", "🏴‍☠️", "Wreck raider", "Open 25 sunken chests.", "Diver", 300, () => typeof Cancun !== "undefined" && Cancun.stats.chests >= 25],
    ["pyr1", "🔺", "Stonemason", "Lay a block of the pyramid.", "", 15, () => typeof Cancun !== "undefined" && Cancun.stats.laid >= 1],
    ["pyr2", "🗿", "Pyramid builder", "Lay 50 blocks.", "Builder", 200, () => typeof Cancun !== "undefined" && Cancun.stats.laid >= 50],
    ["fish1", "🎣", "Angler", "Catch a fish.", "", 10, () => typeof Fishing !== "undefined" && Fishing.caught >= 1],
    ["fish2", "🐟", "Master angler", "Catch 100 fish.", "Angler", 200, () => typeof Fishing !== "undefined" && Fishing.caught >= 100],
    ["story1", "📖", "Storyteller", "Finish the story of a city.", "Storyteller", 100, () => typeof Story !== "undefined" && Story.finished >= 1],
    ["story3", "📚", "Chronicler", "Finish the stories of all four cities.", "Chronicler", 600, () => typeof Story !== "undefined" && Story.finished >= 4],
    ["fest1", "🎊", "Festival-goer", "Find all eight festival tokens in one festival hunt.", "Reveller", 100, () => typeof FestHunt !== "undefined" && FestHunt.found >= 1],
    ["thief", "🥷", "Thief taker", "Catch a pickpocket.", "", 20, () => typeof Thieves !== "undefined" && Thieves.caught >= 1],
    ["thief2", "🚔", "Lawman", "Catch 10 pickpockets.", "Lawman", 150, () => typeof Thieves !== "undefined" && Thieves.caught >= 10],
  ];
  let state = { done: {}, title: "" };
  const clean = (raw) => {
    const o = { done: {}, title: "" };
    if (raw && typeof raw === "object") {
      if (raw.done && typeof raw.done === "object") for (const [k, v] of Object.entries(raw.done)) if (LIST.some((a) => a[0] === k) && Number.isFinite(v)) o.done[k] = v;
      if (typeof raw.title === "string" && LIST.some((a) => a[4] === raw.title && o.done[a[0]])) o.title = raw.title;
    }
    return o;
  };
  try { state = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  const $a = (id) => document.getElementById(id);
  const sendTitle = () => { if (typeof Online !== "undefined" && Online.connected && typeof Account !== "undefined" && Account.loggedIn) Online.navalSend({ t: "social", a: "title", title: state.title }); };

  function check() {
    if (typeof started === "undefined" || !started) return;
    let any = false;
    for (const [id, icon, name, , title, reward, test] of LIST) {
      if (state.done[id]) continue;
      let ok = false;
      try { ok = !!test(); } catch (e) { ok = false; }
      if (!ok) continue;
      state.done[id] = Date.now(); any = true;
      if (reward) Vitals.coins += reward;
      Sfx.play("unlock");
      toast(`${icon} Achievement: ${name}!${reward ? ` +${reward} denarii` : ""}${title ? ` · you can now wear the title "${title}"` : ""}`);
    }
    if (any) { save(); if ($a("ach").classList.contains("show")) render(); }
  }

  function render() {
    const ul = $a("ach-list"); ul.replaceChildren();
    const n = LIST.filter((a) => state.done[a[0]]).length;
    $a("ach-count").textContent = `${n} of ${LIST.length} earned · wearing: ${state.title ? `"${state.title}"` : "no title"}`;
    for (const [id, icon, name, what, title, reward] of LIST) {
      const li = document.createElement("li"), got = !!state.done[id];
      li.className = got ? "got" : "lock";
      const t = document.createElement("span"), b = document.createElement("strong"), sm = document.createElement("small");
      b.textContent = `${icon} ${got ? name : "???"}`; sm.textContent = `${what}${reward ? ` (${reward} denarii)` : ""}${title ? ` · title: ${title}` : ""}`;
      t.append(b, sm); li.append(t);
      if (got && title) {
        const w = document.createElement("button"), on = state.title === title; w.type = "button"; w.textContent = on ? "Take off" : "Wear title";
        w.addEventListener("click", () => { state.title = on ? "" : title; save(); sendTitle(); render(); });
        li.append(w);
      }
      ul.append(li);
    }
  }
  const open = () => { check(); render(); openPanel("#ach"); };

  function bind() {
    const b = $a("btn-ach"); if (b) b.addEventListener("click", open);
    setInterval(check, 2500);
    setTimeout(sendTitle, 9000);
  }
  return {
    bind, open, check, LIST,
    snapshot: () => JSON.parse(JSON.stringify(state)),
    restore(raw) { state = clean(raw); save(); },
    merge(raw) { const o = clean(raw); for (const [k, v] of Object.entries(o.done)) state.done[k] = Math.min(v, state.done[k] || v); if (!state.title) state.title = o.title; save(); },
    get title() { return state.title; }, get count() { return Object.keys(state.done).length; },
  };
})();
