"use strict";
// Mysteries: 🔎 Mystery in the menu. Each city has a whodunit besides its story (story.js): Rome "The Poisoned Amphora", Old Delhi "The Stolen Saffron", Cancún "The Missing Jade Mask", Beijing "The Vanished
// Painting". Three clues wait at three famous places (in any order): stand there and a witness tells you one thing about the culprit. Then you have four suspects, each described in full, and exactly one of
// them fits all three clues. Accuse the right one for a big reward; a wrong accusation costs 20 denarii and clears that suspect. Progress is kept in the browser (rome-mystery) and the saved game.
// Depends on vitals.js, the landmarks of each city (by id) and the globals of game.js (LANDMARKS, city, player, startDirections, Narrator, openPanel, closePanels).

const Mystery = (() => {
  const KEY = "rome-mystery", FINE = 20;
  // clues: [landmark id, the witness's words, the trait it shows (0 to 2)]; traits: each suspect has [a, b, c] as 0/1 (1 = fits the clue), the culprit fits all three
  const CASES = {
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
  let prog = { rome: { c: [0, 0, 0], ok: 0, no: [] }, delhi: { c: [0, 0, 0], ok: 0, no: [] }, cancun: { c: [0, 0, 0], ok: 0, no: [] }, beijing: { c: [0, 0, 0], ok: 0, no: [] } };
  function clean(raw) {
    const out = {};
    for (const k of Object.keys(CASES)) {
      const r = raw && raw[k] ? raw[k] : {};
      out[k] = { c: [0, 1, 2].map((i) => (Array.isArray(r.c) && r.c[i] ? 1 : 0)), ok: r.ok ? 1 : 0, no: Array.isArray(r.no) ? r.no.filter((n) => Number.isInteger(n) && n >= 0 && n < CASES[k].suspects.length).slice(0, 4) : [] };
    }
    return out;
  }
  try { prog = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { prog = clean(null); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) { /* ignore */ } };
  const $s = (id) => document.getElementById(id);
  const lmOf = (id) => LANDMARKS.find((l) => l.id === id);
  const caseOf = () => (CASES[city] ? city : "rome");
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  function say(text) { toast(text.length > 160 ? text.slice(0, 157) + "..." : text); try { Narrator.say(text, { interrupt: true }); } catch (e) { /* ignore */ } }

  function render() {
    const c = caseOf(), cs = CASES[c], p = prog[c], body = $s("my-body"); if (!body) return;
    $s("my-title").textContent = `🔎 ${cs.name}`;
    const rows = [el("p", cs.intro, "dnote")];
    cs.clues.forEach((cl, i) => {
      const lm = lmOf(cl[0]);
      if (p.c[i]) rows.push(el("p", `✓ ${cl[1]}`, "st-old"));
      else {
        const row = el("p", `❓ ${lm ? lm.name : cl[0]}: a witness may know something.`, "st-now");
        if (lm) { const b = el("button", "Show me the way"); b.type = "button"; b.addEventListener("click", () => { closePanels(); if (typeof startDirections === "function") { try { startDirections(lm); } catch (e) { /* ignore */ } } }); row.append(" ", b); }
        rows.push(row);
      }
    });
    const found = p.c.filter(Boolean).length;
    if (p.ok) rows.push(el("p", `Case closed: ${cs.suspects.find((s) => s[2].every((v) => v))[3]}`, "sk-note"));
    else if (found < 3) rows.push(el("p", `${found} of 3 clues found. Walk to the places above: the witnesses will find you.`, "dnote"));
    else {
      rows.push(el("h3", "Who did it?"));
      rows.push(el("p", `All three clues are in: ${cs.clues.map((cl) => cl[2]).join(", ")}. Only one suspect fits them all. A wrong accusation costs ${FINE} denarii.`, "dnote"));
      const ul = el("ul", undefined, "mk-items");
      cs.suspects.forEach((s, i) => {
        const li = el("li"), txt = el("span"), b = el("button", p.no.includes(i) ? "Cleared" : "Accuse"); b.type = "button"; b.disabled = p.no.includes(i); b.addEventListener("click", () => accuse(i));
        txt.append(el("strong", s[0]), el("small", s[1])); if (p.no.includes(i)) li.style.opacity = "0.5";
        li.append(txt, b); ul.append(li);
      });
      rows.push(ul);
    }
    body.replaceChildren(...rows);
  }
  function accuse(i) {
    const c = caseOf(), cs = CASES[c], p = prog[c];
    if (p.ok || p.c.some((v) => !v)) return;
    const s = cs.suspects[i];
    if (s[2].every((v) => v)) {
      p.ok = 1; save(); Vitals.coins += cs.reward; Sfx.play("medal");
      say(`${s[0]} is the culprit! ${s[3]} The case is closed: +${cs.reward} denarii.`);
    } else {
      if (!p.no.includes(i)) p.no.push(i);
      Vitals.coins = Math.max(0, Vitals.coins - FINE); save(); Sfx.play("oof");
      toast(`${s[0]} has an alibi: wrong! −${FINE} denarii. Think again about the clues.`);
    }
    render();
  }
  function open() { render(); openPanel("#mystery"); }

  // a clue is told when you stand at its place
  function update() {
    if (typeof started === "undefined" || !started || (mode !== "walk" && mode !== "drive")) return;
    const c = CASES[city] ? city : null; if (!c) return;
    const p = prog[c]; if (p.ok) return;
    CASES[c].clues.forEach((cl, i) => {
      if (p.c[i]) return;
      const lm = lmOf(cl[0]); if (!lm) return;
      const d = Math.hypot(player.x - lm.x, player.z - lm.z), st2 = lm.stand ? Math.hypot(player.x - lm.stand[0], player.z - lm.stand[1]) : Infinity;
      if (d > (lm.r || 20) + 6 && st2 > 14) return;
      p.c[i] = 1; save(); Vitals.coins += 10; Sfx.play("discover");
      say(`🔎 ${cl[1]} (${p.c.filter(Boolean).length} of 3 clues, +10 denarii)`);
      if ($s("mystery").classList.contains("show")) render();
    });
  }
  function bind() { const b = $s("btn-mystery"); if (b) b.addEventListener("click", open); }
  return {
    bind, update, open, CASES,
    snapshot: () => JSON.parse(JSON.stringify(prog)),
    restore(raw) { prog = clean(raw); save(); },
    get solved() { return Object.keys(prog).filter((c) => prog[c].ok).length; }, _prog: () => prog,
  };
})();
