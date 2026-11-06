"use strict";
// Mysteries: 🔎 Mystery in the menu. Each city has a whodunit besides its story (story.js): Rome "The Poisoned Amphora", Old Delhi "The Stolen Saffron", Cancún "The Missing Jade Mask", Beijing "The Vanished
// Painting". Three clues wait at three famous places (in any order): stand there and a witness tells you one thing about the culprit. Then you have four suspects, each described in full, and exactly one of
// them fits all three clues. Accuse the right one for a big reward; a wrong accusation costs 20 denarii and clears that suspect. Solve the first case and a harder second one opens in the same city (Rome *The Loosened
// Wheel*, Delhi *The Poisoned Chai*, Cancún *The Missing Calendar Stone*, Beijing *The Forged Edict*): four clues, five suspects, and every wrong suspect fits three of the four. Progress is kept in the browser (rome-mystery) and the saved game.
// Depends on vitals.js, the landmarks of each city (by id) and the globals of game.js (LANDMARKS, city, player, startDirections, Narrator, openPanel, closePanels).

const Mystery = (() => {
  const KEY = "rome-mystery", FINE = 20;
  // clues: [landmark id, the witness's words, the trait it shows (0 to 2)]; traits: each suspect has [a, b, c] as 0/1 (1 = fits the clue), the culprit fits all three
  const EASY = {
    rome: { name: "The Poisoned Amphora", reward: 250, intro: "A wine seller has been taken ill after drinking from an amphora that was left at his stall in the Forum. The guards say it was poisoned, and that a stranger bought the amphora and put it there. Find out who.",
      clues: [
        ["forum", "A baker in the Forum saw the stranger buy the amphora: 'His fingers were stained deep red, like a dyer's.'", "stained red fingers"],
        ["colosseum", "At the Colosseum a ticket-seller remembers a man leaving in a hurry: 'The hobnails of his boots rang on the stones.'", "hobnailed boots"],
        ["circus", "At the Circus Maximus a charioteer chatted with the man: 'He spoke Latin with a Greek accent, I would swear to it.'", "a Greek accent"],
      ],
      suspects: [
        ["Dionysios, the wine merchant", "Red-stained fingers from tasting new wine, hobnailed boots from the vineyards, born in Athens.", [1, 1, 1], "Dionysios wanted to ruin his rival's stall and take his place in the Forum."],
        ["Quintus, the dyer", "Red-stained fingers from his vats, hobnailed boots, speaks the purest Latin of the Palatine.", [1, 1, 0], ""],
        ["Theon, the physician", "Fingers stained red by his medicines, soft sandals, a Greek accent.", [1, 0, 1], ""],
        ["Marcus, the legionary", "Clean hands, hobnailed boots, and an accent from Athens, where he served.", [0, 1, 1], ""],
      ] },
    delhi: { name: "The Stolen Saffron", reward: 250, intro: "A whole chest of saffron, worth more than a house, has vanished from a spice merchant's shop in Chandni Chowk overnight. The lock was not forced. Somebody who knew the shop did this.",
      clues: [
        ["d-chandni", "A tea seller in Chandni Chowk saw someone leave the lane at dawn: 'A green turban, bright as a parrot.'", "a green turban"],
        ["d-katra", "In the Katra a cloth merchant heard the thief pass: 'Tap, tap, tap: a cane with a brass handle.'", "a brass-handled cane"],
        ["d-jama", "On the steps of the Jama Masjid a scribe remembers the man asking the way in Persian, the language of the court.", "Persian speech"],
      ],
      suspects: [
        ["Rustam, the carpet seller", "Wears a green turban, walks with a brass-handled cane, and speaks Persian at home.", [1, 1, 1], "Rustam's debts had piled up, and saffron is easy to sell in a city of cooks."],
        ["Hari, the chai seller", "A green turban and a brass-handled cane, but he speaks only Hindi.", [1, 1, 0], ""],
        ["Zafar, the poet", "A green turban and Persian verses, but he walks with a plain bamboo stick.", [1, 0, 1], ""],
        ["Imran, the jeweller", "A brass-handled cane and the finest Persian in the bazaar, but he wears a white turban.", [0, 1, 1], ""],
      ] },
    cancun: { name: "The Missing Jade Mask", reward: 250, intro: "The jade mask of the temple of Kukulcán, kept for the equinox ceremony, has gone from its alcove at Chichén Itzá. The equinox is near, and the priests are in despair. Somebody took it.",
      clues: [
        ["c-castillo", "A priest at El Castillo noticed a feather on the stair: 'A quetzal feather, green as the jungle: only a noble wears it.'", "a quetzal-feather headdress"],
        ["c-warriors", "At the Temple of the Warriors a guard saw the thief run past: 'Blue paint on the face, like the rain god's priests.'", "blue face paint"],
        ["c-venus", "At the Platform of Venus a child saw the man hide something: 'He had the mark of a snake on his arm.'", "a serpent tattoo"],
      ],
      suspects: [
        ["Chaac-Mo, the noble", "Quetzal-feather headdress, blue face paint for the rain ceremonies, a serpent tattoo.", [1, 1, 1], "Chaac-Mo hoped that without the mask the priests would turn to him to lead the equinox."],
        ["Ix Chel, the weaver", "Quetzal feathers woven into her hair and blue paint, but no tattoo.", [1, 1, 0], ""],
        ["Balam, the ball player", "A serpent tattoo and a quetzal headdress he won, but his face is painted red.", [1, 0, 1], ""],
        ["Kinich, the priest", "Blue paint and a serpent tattoo, but only a plain cotton headband.", [0, 1, 1], ""],
      ] },
    beijing: { name: "The Vanished Painting", reward: 250, intro: "A famous scroll painting of mountains and mist has disappeared from the study of an official in the Forbidden City's lanes. The window was open, and nothing else was touched. A person who loves painting did this.",
      clues: [
        ["b-meridian", "A guard at the Meridian Gate recalls a visitor at dusk: 'His sleeves were black with ink to the elbow.'", "ink-stained sleeves"],
        ["b-drum", "At the Drum Tower a watchman heard footsteps: 'One foot fell lighter than the other. A limp, a bad one.'", "a limp"],
        ["b-summer", "At the Summer Palace a boatman remembers a passenger asking about pearls: 'A white jade ring on his thumb.'", "a white jade ring"],
      ],
      suspects: [
        ["Master Gu, the calligrapher", "Ink-stained sleeves to the elbow, a limp from an old fall, a white jade ring on his thumb.", [1, 1, 1], "Master Gu had always believed the painting was his by right: his teacher's last work."],
        ["Lin, the scholar", "Ink-stained sleeves and a limp, but no ring: he sold it last winter.", [1, 1, 0], ""],
        ["Madam Wu, the collector", "Ink on her sleeves from her seals, a white jade ring, but she walks lightly and well.", [1, 0, 1], ""],
        ["Feng, the antiques dealer", "A limp and a white jade ring, but his sleeves are always clean.", [0, 1, 1], ""],
      ] },
  };

  // the second case of each city is harder: four clues, five suspects, and each clue is a thing seen or heard rather than a name; each wrong suspect fails exactly one of them. It opens when the first case is solved.
  const HARD = {
    rome: { name: "The Loosened Wheel", reward: 400, intro: "Before the great race at the Circus Maximus, someone loosened the wheel of the favourite's chariot, and the driver was hurt. The racing stable wants the culprit found before the next race.",
      clues: [
        ["circus", "A groom at the Circus Maximus smelled olive oil on the hands of someone by the stable gate: 'Thick on his fingers, as if he had been pouring it all morning.'", "hands slippery with olive oil"],
        ["colosseum", "A guard at the Colosseum noticed a hooded man hurrying away: 'He dragged his left leg, every second step.'", "a limp in the left leg"],
        ["forum", "A moneychanger in the Forum remembers a man who paid with an old bronze coin of Nero: 'Nobody pays with those any more.'", "an old coin of Nero"],
        ["vesta", "A Vestal outside the Temple of Vesta heard him swear: 'By Mithras!' It is the oath of soldiers.", "an oath to Mithras"],
      ],
      suspects: [
        ["Cassius, the oil seller who was a soldier", "Sells oil by the jar, limps from an old wound in the left leg, keeps Nero's coins as keepsakes, and swears by Mithras like his old comrades.", [1, 1, 1, 1], "Cassius had bet his savings against the favourite, and a limping soldier knows exactly how a wheel pin comes out."],
        ["Brutus, the oil merchant", "Pours oil all day, limps on the left leg, collects old coins of Nero, but is a devoted follower of Jupiter.", [1, 1, 1, 0], ""],
        ["Livius, the stable master", "Oils the wheels, drags his left leg since a kick from a horse, swears by Mithras, but pays only in new coins.", [1, 1, 0, 1], ""],
        ["Nero Ofilius, the coin dealer", "Oily hands from a lamp he mends, swears by Mithras, deals in old coins of Nero, but walks without a limp.", [1, 0, 1, 1], ""],
        ["Gnaeus, the retired legionary", "Limps on the left leg, swears by Mithras and pays in old coins of Nero, but his hands are dry and clean.", [0, 1, 1, 1], ""],
      ] },
    delhi: { name: "The Poisoned Chai", reward: 400, intro: "A cup of chai served to a Mughal officer in Chandni Chowk was poisoned. The officer lived, but the whole bazaar is frightened. Somebody who knew his daily habits did it.",
      clues: [
        ["d-lahori", "A guard at the Lahori Gate saw the person leave: 'He spat red on the ground: betel, the paan of the markets.'", "teeth stained by betel"],
        ["d-fatehpuri", "At the Fatehpuri mosque a gardener noticed a ring: 'A silver ring with a lotus on it, flashing as he reached for the cup.'", "a silver lotus ring"],
        ["d-serai", "In the caravanserai a camel driver heard the stranger ask for water: 'He spoke like a man from Rajasthan.'", "a Rajasthani accent"],
        ["d-rangmahal", "At the Rang Mahal a servant remembers a red cloth bag he never put down: 'He held it close, like a child.'", "a red cloth bag"],
      ],
      suspects: [
        ["Bhanu, the herb seller", "Chews betel all day, wears a silver lotus ring, speaks with a Rajasthani accent, and carries his herbs in a red cloth bag.", [1, 1, 1, 1], "Bhanu had been paid by a rival spice merchant to frighten the officer's favourite chaiwala out of business."],
        ["Chandu, the paan seller", "Betel-stained teeth, a silver lotus ring and a Rajasthani accent, but he keeps his goods in a brown basket.", [1, 1, 1, 0], ""],
        ["Mohan, the silversmith", "Betel-stained teeth, a red cloth bag, a Rajasthani accent, but he wears a plain gold band.", [1, 0, 1, 1], ""],
        ["Rekha, the cloth trader", "A silver lotus ring, a red bag and a Rajasthani accent, but her teeth are white and clean.", [0, 1, 1, 1], ""],
        ["Wajid, the Lucknow cook", "Betel-stained teeth, a silver lotus ring, a red bag, but he speaks the soft Urdu of Lucknow.", [1, 1, 0, 1], ""],
      ] },
    cancun: { name: "The Missing Calendar Stone", reward: 400, intro: "A small carved stone that the astronomers use to keep the count of days has vanished from the Caracol at Chichén Itzá. Without it the priests cannot announce the date of the next festival.",
      clues: [
        ["c-caracol", "At the Caracol an astronomer found jade dust on the floor: 'Someone with jade ear plugs knocked the case.'", "jade ear plugs"],
        ["c-columns", "Among the Thousand Columns a sweeper saw a flash of red: 'A cape of red cotton, the colour of the sun god's priests.'", "a red cotton cape"],
        ["c-sacbe", "On the white road a trader met the thief: 'He had the accent of the coast, from Tulum.'", "the accent of Tulum"],
        ["c-tzompantli", "At the Tzompantli a child saw him hide something and make a sign of the jaguar with his hand.", "the jaguar sign"],
      ],
      suspects: [
        ["Itzamna, the scribe", "Jade ear plugs, a red cotton cape, the accent of Tulum, and he makes the sign of the jaguar when he is nervous.", [1, 1, 1, 1], "Itzamna wanted the calendar stone for himself: whoever keeps the count of days keeps the power over the festivals."],
        ["Yaxche, the stone carver", "Jade ear plugs, a red cotton cape and the accent of Tulum, but he makes the sign of the eagle.", [1, 1, 1, 0], ""],
        ["Ahau, the trader", "Jade ear plugs, the accent of Tulum and the jaguar sign, but his cape is blue.", [1, 0, 1, 1], ""],
        ["Ixchel, the weaver", "A red cotton cape, the accent of Tulum and the jaguar sign, but no ear plugs at all.", [0, 1, 1, 1], ""],
        ["Kukul, the runner", "Jade ear plugs, a red cotton cape and the jaguar sign, but he speaks like the people of the high country.", [1, 1, 0, 1], ""],
      ] },
    beijing: { name: "The Forged Edict", reward: 400, intro: "An edict with the Emperor's seal appeared in the Forbidden City ordering a grain store to be opened to a stranger. The seal was real; the handwriting was copied. Someone with a very skilled brush did this.",
      clues: [
        ["b-heaven", "A priest at the Temple of Heaven noticed the courier's hand: 'A hard callus on his middle finger: the mark of years of holding a brush.'", "a calligrapher's callus"],
        ["b-hutong", "In a hutong a neighbour smelled him pass: 'Sandalwood, the kind scholars burn when they write.'", "the scent of sandalwood"],
        ["b-bell", "At the Bell Tower the keeper heard the courier ask for the time: 'The soft speech of Suzhou in the south.'", "the soft speech of Suzhou"],
        ["b-bridge", "On the marble bridge a boy saw a hand with the tip of the little finger missing, holding a seal case.", "a missing little fingertip"],
      ],
      suspects: [
        ["Shen, the retired clerk", "A callus on his middle finger, a scent of sandalwood, the speech of Suzhou, and the tip of his little finger lost to a gate.", [1, 1, 1, 1], "Shen had been dismissed without a pension, and he wanted the grain store opened to a friend who would pay him well."],
        ["Wen, the court painter", "A callus, sandalwood and the speech of Suzhou, but all ten fingers whole.", [1, 1, 1, 0], ""],
        ["Qiu, the incense seller", "Sandalwood, the speech of Suzhou and a missing fingertip, but no writer's callus: he cannot write.", [0, 1, 1, 1], ""],
        ["Lu, the northern scribe", "A callus, sandalwood and a missing fingertip, but he speaks the hard speech of the north.", [1, 1, 0, 1], ""],
        ["Mei, the fan maker", "A callus, the speech of Suzhou and a missing fingertip, but she smells of lacquer, not sandalwood.", [1, 0, 1, 1], ""],
      ] },
  };
  const CASES = {};
  for (const c of Object.keys(EASY)) CASES[c] = [EASY[c], HARD[c]];

  // progress: per city, one entry per case: { c: [clue found 0/1...], ok: solved, no: suspects cleared }
  const blank = (c) => CASES[c].map((k) => ({ c: k.clues.map(() => 0), ok: 0, no: [] }));
  let prog = {}, sel = {};
  function clean(raw) {
    const out = {};
    for (const k of Object.keys(CASES)) {
      const r = raw && raw[k] ? raw[k] : null, list = Array.isArray(r) ? r : r ? [r] : [];             // (the first version kept one case per city as an object)
      out[k] = CASES[k].map((cs, n) => {
        const e = list[n] || {};
        return { c: cs.clues.map((_, i) => (Array.isArray(e.c) && e.c[i] ? 1 : 0)), ok: e.ok ? 1 : 0, no: Array.isArray(e.no) ? e.no.filter((x) => Number.isInteger(x) && x >= 0 && x < cs.suspects.length).slice(0, cs.suspects.length) : [] };
      });
    }
    return out;
  }
  try { prog = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { prog = clean(null); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) { /* ignore */ } };
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const $s = (id) => document.getElementById(id);
  const lmOf = (id) => LANDMARKS.find((l) => l.id === id);
  const cityOf = () => (CASES[city] ? city : "rome");
  const open1 = (c) => (prog[c][0].ok ? 1 : 0);                       // the hard case opens when the first is solved
  const curIdx = (c) => Math.min(sel[c] === undefined ? (prog[c][0].ok && !prog[c][1].ok ? 1 : 0) : sel[c], open1(c));
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  function say(text) { toast(text.length > 160 ? text.slice(0, 157) + "..." : text); try { Narrator.say(text, { interrupt: true }); } catch (e) { /* ignore */ } }

  // the suspects are shown in a fixed order that does not give the culprit away (the data lists the culprit first)
  const suspectOrder = (c, n) => {
    const idx = CASES[c][n].suspects.map((_, i) => i), key = `${c}${n}`; let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    for (let i = idx.length - 1; i > 0; i--) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (idx[0] === 0) idx.push(idx.shift());
    return idx;
  };
  function render() {
    const c = cityOf(), n = curIdx(c), cs = CASES[c][n], p = prog[c][n], body = $s("my-body"); if (!body) return;
    $s("my-title").textContent = `🔎 ${tr(cs.name)}`;
    const rows = [];
    const tabs = el("div", undefined, "pm-tabs");
    CASES[c].forEach((k, i) => { const b = el("button", tr(i === 0 ? "Case 1" : open1(c) ? "Case 2: harder" : "Case 2 🔒")); b.type = "button"; if (i === n) b.className = "on"; b.disabled = i > open1(c); b.addEventListener("click", () => { sel[c] = i; render(); }); tabs.append(b); });
    rows.push(tabs, el("p", tr(cs.intro), "dnote"));
    cs.clues.forEach((cl, i) => {
      const lm = lmOf(cl[0]);
      if (p.c[i]) rows.push(el("p", `✓ ${tr(cl[1])}`, "st-old"));
      else {
        const row = el("p", `❓ ${lm ? tr(lm.name) : cl[0]}: ${tr("a witness may know something.")}`, "st-now");
        if (lm) { const b = el("button", tr("Show me the way")); b.type = "button"; b.addEventListener("click", () => { closePanels(); if (typeof startDirections === "function") { try { startDirections(lm); } catch (e) { /* ignore */ } } }); row.append(" ", b); }
        rows.push(row);
      }
    });
    const found = p.c.filter(Boolean).length, total = cs.clues.length;
    if (p.ok) rows.push(el("p", `${tr("Case closed:")} ${tr(cs.suspects.find((s) => s[2].every((v) => v))[3])}`, "sk-note"));
    else if (found < total) rows.push(el("p", `${found} ${tr("of")} ${total} ${tr("clues found. Walk to the places above: the witnesses will find you.")}`, "dnote"));
    else {
      rows.push(el("h3", tr("Who did it?")));
      rows.push(el("p", `${tr("All the clues are in:")} ${cs.clues.map((cl) => tr(cl[2])).join(", ")}. ${tr("Only one suspect fits them all. A wrong accusation costs 20 denarii.")}`, "dnote"));
      const ul = el("ul", undefined, "mk-items");
      suspectOrder(c, n).forEach((i) => {
        const s = cs.suspects[i], li = el("li"), txt = el("span"), b = el("button", tr(p.no.includes(i) ? "Cleared" : "Accuse")); b.type = "button"; b.disabled = p.no.includes(i); b.addEventListener("click", () => accuse(i));
        txt.append(el("strong", tr(s[0])), el("small", tr(s[1]))); if (p.no.includes(i)) li.style.opacity = "0.5";
        li.append(txt, b); ul.append(li);
      });
      rows.push(ul);
    }
    body.replaceChildren(...rows);
  }
  function accuse(i) {
    const c = cityOf(), n = curIdx(c), cs = CASES[c][n], p = prog[c][n];
    if (p.ok || p.c.some((v) => !v)) return;
    const s = cs.suspects[i];
    if (s[2].every((v) => v)) {
      p.ok = 1; save(); Vitals.coins += cs.reward; Sfx.play("medal");
      say(`${tr(s[0])} ${tr("is the culprit!")} ${tr(s[3])} ${tr("The case is closed:")} +${cs.reward} ${tr("denarii")}.${n === 0 ? ` ${tr("A harder case is now open.")}` : ""}`);
    } else {
      if (!p.no.includes(i)) p.no.push(i);
      Vitals.coins = Math.max(0, Vitals.coins - FINE); save(); Sfx.play("oof");
      toast(`${tr(s[0])} ${tr("has an alibi: wrong! −20 denarii. Think again about the clues.")}`);
    }
    render();
  }
  function open() { render(); openPanel("#mystery"); }

  // a clue is told when you stand at its place (the clues of the case you are working on, and of the first case until it is solved)
  function update() {
    if (typeof started === "undefined" || !started || (mode !== "walk" && mode !== "drive")) return;
    const c = CASES[city] ? city : null; if (!c) return;
    const n = curIdx(c), p = prog[c][n]; if (p.ok) return;
    CASES[c][n].clues.forEach((cl, i) => {
      if (p.c[i]) return;
      const lm = lmOf(cl[0]); if (!lm) return;
      const d = Math.hypot(player.x - lm.x, player.z - lm.z), st2 = lm.stand ? Math.hypot(player.x - lm.stand[0], player.z - lm.stand[1]) : Infinity;
      if (d > (lm.r || 20) + 6 && st2 > 14) return;
      p.c[i] = 1; save(); Vitals.coins += 10; Sfx.play("page"); Sfx.play("discover");
      say(`🔎 ${tr(cl[1])} (${p.c.filter(Boolean).length} ${tr("of")} ${p.c.length} ${tr("clues")}, +10 ${tr("denarii")})`);
      if ($s("mystery").classList.contains("show")) render();
    });
  }
  function bind() { const b = $s("btn-mystery"); if (b) b.addEventListener("click", open); }
  return {
    bind, update, open, CASES,
    snapshot: () => JSON.parse(JSON.stringify(prog)),
    restore(raw) { prog = clean(raw); save(); },
    get solved() { return Object.values(prog).reduce((n, list) => n + list.filter((e) => e.ok).length, 0); }, _prog: () => prog,
  };
})();
