"use strict";
// Pets that help. The companion you wear (bought in the Market) does a small job for you while you walk about:
//   hound:   digs up a few denarii every five minutes or so        cat:     catches a snack now and then (a little food)
//   eagle:   spots a sparkling treasure carrier and tells you where  parrot:  repeats gossip and tips
//   monkey:  grabs half your money back when a thief steals it      peacock: charms citizens: quests pay 15% more
//   owl:     tells you tomorrow's weather every morning            lion cub: scares off thieves that come near
// Depends on market.js (what you wear), relics.js, weather.js, thieves.js, vitals.js and the globals of game.js.

const PetPerks = (() => {
  const KINDS = ["hound", "cat", "eagle", "parrot", "monkey", "peacock", "owl", "cub"];
  const TIPS = [
    "Press G for walking directions to any place.", "Citizens with a yellow ! have a quest for you.", "A sparkling citizen carries a rare treasure: trade with them.",
    "Finish the pyramid in Cancún with other players and everyone gets paid.", "Thieves cannot catch you if you sprint with Shift.", "Rent out houses to earn money every morning.",
    "The exchange prices move all day: buy low, sell high.", "A storm grounds the planes, and floods the streets.", "Gold medals in the race events pay 300 denarii.",
    "Guild members share a treasury and a chat.", "Take the metro and drive it yourself for a reward.", "Sleep in your bed at night: it passes the time safely.",
  ];
  let timer = 100 + Math.random() * 100, lastDay = 0;
  const mine = () => { try { return Market.snapshot().worn.find((id) => KINDS.includes(id)) || null; } catch (e) { return null; } };
  const dirName = (dx, dz) => ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];

  function work(kind) {
    switch (kind) {
      case "hound": { const n = 10 + Math.floor(Math.random() * 26); Vitals.coins += n; Sfx.play("coin"); toast(`🐕 Your hound dug up ${n} denarii!`); break; }
      case "cat": Vitals.eat(0, 12); toast("🐈 Your cat brings you a snack."); break;
      case "parrot": toast(`🦜 "${TIPS[Math.floor(Math.random() * TIPS.length)]}"`); break;
      case "eagle": {
        const list = typeof Relics !== "undefined" ? Relics._carriers().filter((c) => !c.taken) : [];
        let best = null, bd = Infinity;
        for (const c of list) { const d = Math.hypot(c.p.x - player.x, c.p.z - player.z); if (d < bd) { bd = d; best = c; } }
        toast(best ? `🦅 Your eagle spotted a sparkling citizen ${Math.round(bd)} m to the ${dirName(best.p.x - player.x, best.p.z - player.z)}.` : "🦅 Your eagle sees no sparkling citizens nearby.");
        break;
      }
      default: break;
    }
  }

  function update(dt) {
    if (typeof started === "undefined" || !started || mode !== "walk") return;
    const kind = mine(); if (!kind) return;
    if (kind === "owl" && typeof Time !== "undefined" && Time.day !== lastDay) {                 // each new game day
      if (lastDay) { const w = Weather.forecast(city, Time.day + 1, 12); toast(`🦉 Your owl hoots: tomorrow looks ${w.kind === "clear" ? "sunny" : w.kind}.`); }
      lastDay = Time.day;
    }
    timer -= dt;
    if (timer > 0) return;
    timer = kind === "parrot" ? 170 + Math.random() * 90 : 260 + Math.random() * 160;
    work(kind);
  }

  return {
    update, KINDS, mine,
    mul: (what) => (what === "quest" && mine() === "peacock" ? 1.15 : 1),
    recover: (n) => (mine() === "monkey" ? Math.floor(n / 2) : 0),                           // a monkey grabs half of a stolen purse back
    scares: () => mine() === "cub",
    _work: work,
  };
})();
