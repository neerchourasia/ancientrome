"use strict";
// The Latin word journal: 📖 Latin words in the menu. With Latin names on (latin.js) and in ancient Rome, every Latin word you meet is written in your journal with its English meaning: the words of the
// sights you walk up to (forum, amphitheatrum...), of the shops you walk into (pistrinum, caupona...), of what the keepers say, and of the shopkeeper's menu (emere, vendere...). The journal lists the
// words you have met (and shows the English of each, or hides it so you can test yourself), and the teacher's dashboard counts them. Kept in the browser (rome-words). The Latin is the author's own
// and is to be checked by a Latin teacher (see latin.js): the meanings are the usual dictionary ones. Depends on latin.js, game.js (toast, openPanel) and shopkeep.js/interiors.js (they call it).

const Journal = (() => {
  const KEY = "rome-words";
  // [lemma, what it is, English]
  const WORDS = [
    ["forum", "noun, n.", "marketplace, public square"], ["Romanus", "adjective", "Roman"], ["amphitheatrum", "noun, n.", "amphitheatre"], ["Flavius", "name", "Flavian: of the Flavian emperors"],
    ["aedes", "noun, f.", "temple, shrine"], ["Hercules", "name", "Hercules"], ["victor", "noun, m.", "winner, conqueror"], ["theatrum", "noun, n.", "theatre"], ["Pompeius", "name", "Pompey"],
    ["colossus", "noun, m.", "giant statue"], ["sol", "noun, m.", "sun"], ["arcus", "noun, m.", "arch"], ["Titus", "name", "Titus"], ["Saturnus", "name", "Saturn, the god of farming"],
    ["Castor et Pollux", "names", "Castor and Pollux, the twin gods"], ["et", "conjunction", "and"], ["Vesta", "name", "Vesta, goddess of the hearth"], ["milliarium", "noun, n.", "milestone"], ["aureus", "adjective", "golden"],
    ["mons", "noun, m.", "mountain, hill"], ["Palatinus", "adjective", "of the Palatine"], ["Iuppiter", "name", "Jupiter, king of the gods"], ["optimus", "adjective", "best"], ["maximus", "adjective", "greatest, biggest"],
    ["columna", "noun, f.", "column"], ["Traianus", "name", "Trajan"], ["murus", "noun, m.", "wall"], ["Servianus", "adjective", "of Servius (the king who built it)"], ["carcer", "noun, m.", "prison"],
    ["taberna", "noun, f.", "shop, stall, tavern"], ["pistrinum", "noun, n.", "bakery"], ["pistor", "noun, m.", "baker"], ["caupona", "noun, f.", "inn, tavern"], ["caupo", "noun, m.", "innkeeper"],
    ["officina", "noun, f.", "workshop"], ["faber", "noun, m.", "craftsman, smith"], ["vestiarius", "noun, m.", "clothes dealer"], ["olearius", "adjective", "of oil (oil-)"], ["figlina", "noun, f.", "pottery, potter's workshop"],
    ["figulus", "noun, m.", "potter"], ["mercator", "noun, m.", "merchant"], ["tabernarius", "noun, m.", "shopkeeper"],
    ["panis", "noun, m.", "bread"], ["recens", "adjective", "fresh"], ["amicus", "noun, m.", "friend"], ["redire", "verb", "to go back, to come back"], ["esurire", "verb", "to be hungry"],
    ["vinum", "noun, n.", "wine"], ["collis", "noun, m.", "hill"], ["sedes", "noun, f.", "seat"], ["tepidus", "adjective", "warm"], ["sedere", "verb", "to sit"], ["quamdiu", "adverb", "as long as"], ["velle", "verb", "to want, to wish"],
    ["cavere", "verb", "to beware of"], ["instrumentum", "noun, n.", "tool"], ["omnis", "adjective", "all, every"], ["hic", "adverb", "here"], ["manus", "noun, f.", "hand"], ["facere", "verb", "to make, to do"],
    ["lana", "noun, f.", "wool"], ["linum", "noun, n.", "linen, flax"], ["color", "noun, m.", "colour, dye"], ["esse", "verb", "to be"],
    ["oleum", "noun, n.", "oil, olive oil"], ["gustare", "verb", "to taste"], ["olla", "noun, f.", "pot, jar"], ["lucerna", "noun, f.", "lamp"], ["poculum", "noun, n.", "cup"], ["singuli", "adjective", "each, one by one"], ["diversus", "adjective", "different"],
    ["emere", "verb", "to buy"], ["vendere", "verb", "to sell"], ["merx", "noun, f.", "goods, wares (pl. merces)"], ["pretium", "noun, n.", "price"], ["tabula", "noun, f.", "board, tablet"], ["nuntius", "noun, m.", "news, messenger"],
    ["mandatum", "noun, n.", "errand, order"], ["valere", "verb", "to be well (vale: goodbye)"], ["venalis", "adjective", "for sale"], ["mensa", "noun, f.", "table"],
  ];
  const IDX = Object.fromEntries(WORDS.map((w, i) => [w[0], i]));
  // where each word is met
  const LANDMARK = {
    carcer: ["carcer"], hercules: ["aedes", "Hercules", "victor"], pompey: ["theatrum", "Pompeius"], forum: ["forum", "Romanus"], colosseum: ["amphitheatrum", "Flavius"], colossus: ["colossus", "sol"], titus: ["arcus", "Titus"],
    saturn: ["aedes", "Saturnus"], castor: ["aedes", "Castor et Pollux", "et"], vesta: ["aedes", "Vesta"], milestone: ["milliarium", "aureus"], palatine: ["mons", "Palatinus"], capitolium: ["aedes", "Iuppiter", "optimus", "maximus"],
    trajan: ["columna", "Traianus"], servian: ["murus", "Servianus"],
  };
  const SHOP = {
    "Bakery": ["pistrinum", "pistor", "panis", "recens", "amicus", "redire", "esurire"], "Tavern": ["caupona", "caupo", "vinum", "collis", "sedes", "tepidus", "sedere", "quamdiu", "velle", "mensa"],
    "Workshop": ["officina", "faber", "cavere", "instrumentum", "omnis", "hic", "manus", "facere"], "Cloth shop": ["taberna", "vestiarius", "lana", "linum", "color", "optimus", "hic", "esse"],
    "Oil seller": ["taberna", "olearius", "mercator", "oleum", "optimus", "gustare", "hic", "esse"], "Potter": ["figlina", "figulus", "olla", "lucerna", "poculum", "singuli", "diversus", "hic", "esse"],
  };
  const MENU = ["emere", "vendere", "merx", "pretium", "tabula", "nuntius", "mandatum", "valere", "venalis", "tabernarius"];

  let known = new Set();
  try { const r = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(r)) known = new Set(r.filter((l) => l in IDX)); } catch (e) { /* storage unavailable */ }
  const $j = (id) => document.getElementById(id);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...known])); } catch (e) { /* ignore */ } };
  const active = () => typeof Latin !== "undefined" && Latin.active;

  function meet(list) {
    if (!active()) return;
    const fresh = list.filter((l) => l in IDX && !known.has(l));
    if (!fresh.length) return;
    for (const l of fresh) known.add(l);
    save();
    const w = WORDS[IDX[fresh[0]]];
    toast(`📖 New Latin word: ${w[0]} (${w[2].split(",")[0]})${fresh.length > 1 ? ` and ${fresh.length - 1} more` : ""}. ${known.size} of ${WORDS.length} in your journal.`);
    if ($j("words").classList.contains("show")) render();
  }
  const landmark = (id) => meet(LANDMARK[id] || []);
  const shop = (kind) => meet(SHOP[kind] || []);
  const menu = () => meet(MENU);

  let hide = false;
  function render() {
    const body = $j("wd-body"); body.replaceChildren();
    const intro = document.createElement("p"); intro.className = "dnote";
    intro.textContent = !(typeof Latin !== "undefined" && Latin.on) ? "Switch on Latin names (the 🏛️ Latin names button at the bottom of the screen in a class, or ?latin=1 in the address) and every Latin word you meet in ancient Rome is written here." : `${known.size} of ${WORDS.length} words. Walk up to the sights, into the shops and talk to the keepers to find more.`;
    const tools = document.createElement("label"); tools.className = "stk-check";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = hide; cb.addEventListener("change", () => { hide = cb.checked; render(); });
    tools.append(cb, document.createTextNode(" Hide the English (test yourself)"));
    const ul = document.createElement("ul"); ul.className = "wd-list";
    for (const w of WORDS) {
      if (!known.has(w[0])) continue;
      const li = document.createElement("li"), la = document.createElement("strong"), kind = document.createElement("em"), en = document.createElement("span");
      la.textContent = w[0]; kind.textContent = ` ${w[1]} `; en.textContent = hide ? "?" : w[2];
      if (hide) { en.className = "wd-hidden"; en.title = "Click to show"; en.addEventListener("click", () => { en.textContent = w[2]; en.className = ""; }); }
      li.append(la, kind, en); ul.append(li);
    }
    if (!ul.children.length) { const li = document.createElement("li"); li.className = "dim"; li.textContent = "No words yet."; ul.append(li); }
    body.append(intro, tools, ul);
  }
  function open() { render(); openPanel("#words"); }
  function bind() { const b = $j("btn-words"); if (b) b.addEventListener("click", open); }
  return { bind, open, landmark, shop, menu, get count() { return known.size; }, get total() { return WORDS.length; }, WORDS };
})();
