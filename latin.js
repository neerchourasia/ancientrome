"use strict";
// Latin names for Ancient Rome: 🏛️ in the class bar (class mode), or ?latin=1 in the link. While it is on (and you are in ancient Rome), the landmark names, the shop names, the keepers and what
// the keepers say are shown in Latin with the English beside them, and the signs over the shop doors are Latin only, in capitals with V for U as on an inscription. It works through i18n.js:
// wherever a piece of text is exactly one of the English names below (or contains one of the landmark names), i18n.js asks Latin.map for the Latin. The Latin is the author's own and has been
// not been checked by a Latin teacher yet (a few of the words came from one): CHECK THE WORDS BELOW before using them with a class.
// Names: the classical names of the buildings (aedes Saturni, arcus Titi...). Shops: pistrinum (a bakery), caupona (an inn or tavern), officina (a workshop), taberna vestiaria (a clothes shop),
// taberna olearia (an oil shop), figlina (a pottery). Keepers: pistor, caupo, faber, vestiarius (a clothes seller), mercator, figulus, and tabernarius (a shopkeeper).

const Latin = (() => {
  const KEY = "rome-latin";
  const NAMES = [
    ["The Carcer (Mamertine Prison)", "Carcer Tullianum"], ["Temple of Hercules Victor", "Aedes Herculis Victoris"], ["Theatre of Pompey", "Theatrum Pompei"],
    ["The Roman Forum", "Forum Romanum"], ["The Colosseum", "Amphitheatrum Flavium"], ["Colossus of the Sun", "Colossus Solis"], ["Arch of Titus", "Arcus Titi"],
    ["Temple of Saturn", "Aedes Saturni"], ["Temple of Castor and Pollux", "Aedes Castoris et Pollucis"], ["Temple of Vesta", "Aedes Vestae"], ["The Golden Milestone", "Milliarium Aureum"],
    ["The Palatine Hill", "Mons Palatinus"], ["Temple of Jupiter Optimus Maximus", "Aedes Iovis Optimi Maximi"], ["Trajan's Column", "Columna Traiani"], ["Servian Wall", "Murus Servianus"],
  ];
  const SHOPS = { "Bakery": "Pistrinum", "Tavern": "Caupona", "Workshop": "Officina", "Cloth shop": "Taberna vestiaria", "Oil seller": "Taberna olearia", "Potter": "Figlina" };
  const KEEPERS = { "The baker": "Pistor", "The innkeeper": "Caupo", "The smith": "Faber", "The clothier": "Vestiarius", "The merchant": "Mercator", "The potter": "Figulus", "The shopkeeper": "Tabernarius" };
  const LINES = {
    "Fresh bread, friend! Come back when you are hungry.": "Panis recens, amice! Redi, cum esurieris.",
    "Wine from the hills and a warm seat. Sit as long as you like.": "Vinum e collibus et sedes tepida. Sede quamdiu vis.",
    "Mind the tools. Everything here is made by hand.": "Cave instrumenta. Omnia hic manu facta sunt.",
    "Wool, linen and the best dyes in the district.": "Lana, linum et optimi colores huius regionis.",
    "Olive oil by the jar. Taste it: you will not find better.": "Oleum in amphoris. Gusta: meliorem non invenies.",
    "Jars, lamps and cups. Every one is different.": "Ollae, lucernae, pocula. Singula diversa sunt.",
  };
  const longest = NAMES.slice().sort((a, b) => b[0].length - a[0].length);
  let on = false;
  try { on = localStorage.getItem(KEY) === "1" || (typeof CLASSMODE !== "undefined" && CLASSMODE.latin); } catch (e) { /* storage unavailable */ }
  const active = () => on && typeof city !== "undefined" && city === "rome" && typeof era !== "undefined" && era === "ancient";

  // the Latin for a text (the English kept in brackets), or undefined when there is none
  function map(key) {
    if (!active()) return undefined;
    for (const table of [SHOPS, KEEPERS]) if (table[key]) return `${table[key]} (${key})`;
    if (LINES[key]) return `${LINES[key]} (${key})`;
    for (const [en, la] of NAMES) if (key === en) return `${la} (${en})`;
    let out = key, hit = false;
    for (const [en, la] of longest) if (out.includes(en) && !out.includes(la)) { out = out.split(en).join(`${la} (${en})`); hit = true; }
    return hit ? out : undefined;
  }
  // the Latin for a shop sign: capitals, V for U, no English
  const sign = (kind) => (active() && SHOPS[kind] ? SHOPS[kind].toUpperCase().replace(/U/g, "V") : undefined);

  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
    if (typeof I18n !== "undefined" && I18n.refresh) I18n.refresh();
    if (typeof Interiors !== "undefined" && Interiors.refreshSigns) Interiors.refreshSigns();
  }
  return { map, sign, set, get on() { return on; }, get active() { return active(); } };
})();
