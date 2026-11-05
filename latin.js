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
  // Latin spelling notes: aedes (a temple), Iovis (of Jupiter), V for U on signs only.
  const SHOPS = { "Bakery": "Pistrinum", "Tavern": "Caupona", "Workshop": "Officina", "Cloth shop": "Taberna vestiaria", "Oil seller": "Taberna olearia", "Potter": "Figlina" };
  const KEEPERS = { "The baker": "Pistor", "The innkeeper": "Caupo", "The smith": "Faber", "The clothier": "Vestiarius", "The merchant": "Mercator", "The potter": "Figulus", "The shopkeeper": "Tabernarius" };
  const LINES = {
    "Fresh bread, friend! Come back when you are hungry.": "Panis recens est, amice! Redi, si esuris.",
    "Wine from the hills and a warm seat. Sit as long as you like.": "Vinum e collibus et sedes tepida. Sede quamdiu vis.",
    "Mind the tools. Everything here is made by hand.": "Cave instrumenta! Faber omnia manu facit.",
    "Wool, linen and the best dyes in the district.": "Lana, linum et colores optimi hic sunt.",
    "Olive oil by the jar. Taste it: you will not find better.": "Oleum optimum hic est. Gusta!",
    "Jars, lamps and cups. Every one is different.": "Ollae, lucernae, pocula hic sunt. Singula diversa sunt.",
  };
  // goods of the Roman shops and the words on the shopkeeper's menu (shown with the English in brackets)
  const WORDS = {
    "Box of iron nails": "Capsa clavorum", "Smith's hammer": "Malleus fabri", "Bronze mirror": "Speculum aeneum", "Olive oil jar": "Amphora olei", "Lamp oil": "Oleum lucernae",
    "Scented soap": "Sapo odoratus", "Clay lamp": "Lucerna fictilis", "Painted cup": "Poculum pictum", "Fine amphora": "Amphora optima", "Perfumed lamp": "Lucerna odorata",
    "Engraved mirror": "Speculum caelatum", "Saffron oil": "Oleum crocinum", "Saffron": "Crocus", "Black pepper": "Piper", "Silver ring": "Anulus argenteus", "Gold bangle": "Armilla aurea",
    "Pearl strand": "Monile margaritarum",
    "🛒 Buy": "🛒 Emere", "💰 Sell your goods": "💰 Vendere merces", "📊 Price board": "📊 Tabula pretiorum", "🗣️ Ask about the neighbourhood": "🗣️ Quid novi?",
    "📦 Any work for me?": "📦 Habesne aliquid negotii mihi?", "👋 Goodbye": "👋 Vale", "← Back": "← Redi", "For sale": "Venalia", "Your goods": "Merces tuae", "The news": "Nuntii",
    "Errands": "Mandata", "At the table": "Ad mensam", "🏪 Manage your shop": "🏪 Tabernam tuam administrare",
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
    if (WORDS[key]) return `${WORDS[key]} (${key.replace(/^[^A-Za-z]+/, "")})`;                  // (the emoji of a button is not repeated in the brackets)
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
