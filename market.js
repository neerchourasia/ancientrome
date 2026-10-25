"use strict";
// The Market: spend your denarii on a better house, things to wear, a companion, decorations, supplies and training.
// What you own is saved in the browser (and with your account's cloud save). Denarii are a game currency earned in
// fights and races, not real money. Depends on game.js, home.js, pets.js and vitals.js at run time.

const Market = (() => {
  const KEY = "rome-owned";

  // Your home, from the small house you start with. `rest` is how much faster you heal when resting at home.
  const HOUSES = [
    { name: "Small house", price: 0, rest: 1, rent: 0, perk: "Where you start. Sleep here after dark." },
    { name: "House with a garden", price: 150, rest: 1.5, rent: 0, perk: "A walled garden with a fountain, hedges and cypress trees. Resting at home heals 1.5 times faster." },
    { name: "Grand domus", price: 400, rest: 2, rent: 15, perk: "Two wings, a colonnade and a statue. Resting heals twice as fast, and your tenants pay you 15 denarii each morning." },
    { name: "Villa with a tower", price: 1000, rest: 3, rent: 40, perk: "A tower, a pool behind the house and a gilded pavilion. Resting heals 3 times faster, and rent is 40 denarii each morning." },
    { name: "Patrician palace", price: 2500, rest: 4, rent: 90, perk: "A great hall behind the villa, with a columned portico, four corner towers and a dome. Resting heals 4 times faster, and rent is 90 denarii each morning." },
    { name: "Imperial palace", price: 6000, rest: 5, rent: 200, perk: "Golden roofs and domes, a triumphal gate at the road and statues along the path. Resting heals 5 times faster, and rent is 200 denarii each morning." },
  ];

  // Your home in Old Delhi: a small house on a plot off Chandni Chowk that you build up the same way.
  const HOUSES_D = [
    { name: "Small house", price: 0, rest: 1, rent: 0, perk: "A one-room house in a walled plot off Chandni Chowk. Sleep here after dark." },
    { name: "House with a garden", price: 150, rest: 1.5, rent: 0, perk: "A bigger house with a veranda, a garden with trees and a fountain. Resting at home heals 1.5 times faster." },
    { name: "Grand haveli", price: 400, rest: 2, rent: 15, perk: "A haveli built round a courtyard, with a fountain and carved ranges. Resting heals twice as fast, and your tenants pay you 15 denarii each morning." },
    { name: "Mahal with a tower", price: 1000, rest: 3, rent: 40, perk: "A tower with a golden dome, a marble pavilion in a pool and a gate. Resting heals 3 times faster, and rent is 40 denarii each morning." },
    { name: "Shahi palace", price: 2500, rest: 4, rent: 90, perk: "A red sandstone Diwan-i-Aam behind the mahal: a long pillared hall with a throne alcove and corner chhatris. Resting heals 4 times faster, and rent is 90 denarii each morning." },
    { name: "Imperial Qila", price: 6000, rest: 5, rent: 200, perk: "Four minarets, golden domes and a grand marble pavilion. Resting heals 5 times faster, and rent is 200 denarii each morning." },
  ];
  // Your home in Cancún: one small casita (the builder has nothing bigger to sell you there)
  const HOUSES_C = [{ name: "Casita", price: 0, rest: 1, rent: 0, perk: "A small lime-plastered house with a hammock, west of the great plaza. Sleep here after dark." }];
  const homes = () => (typeof city !== "undefined" && city === "delhi" ? HOUSES_D : typeof city !== "undefined" && city === "cancun" ? HOUSES_C : HOUSES);
  const tier = () => (typeof city !== "undefined" && city === "delhi" ? s.dhouse : typeof city !== "undefined" && city === "cancun" ? 0 : s.house);

  // type: wear (worn on your character, one per slot), pet (a companion, one at a time), decor (decorates your house),
  // supply (used up at once) or perk (a permanent bonus in single-player games).
  const ITEMS = {
    wreath: { type: "wear", slot: "head", name: "Laurel wreath", price: 60, note: "The crown of a victor." },
    helmet: { type: "wear", slot: "head", name: "Crested helmet", price: 120, note: "Bronze, with a crimson crest." },
    crown: { type: "wear", slot: "head", name: "Golden crown", price: 250, note: "Fit for an emperor." },
    cloak: { type: "wear", slot: "back", name: "Crimson cloak", price: 90, note: "Fastened with a gold clasp." },
    royalcloak: { type: "wear", slot: "back", name: "Royal purple cloak", price: 140, note: "Tyrian purple: once only emperors could wear it." },
    cuirass: { type: "wear", slot: "body", name: "Gilded breastplate", price: 180, note: "Armour fit for a champion." },
    armbands: { type: "wear", slot: "arms", name: "Gold armbands", price: 70, note: "Worn by gladiators who have won their freedom." },
    boots: { type: "wear", slot: "feet", name: "Hobnailed boots", price: 50, note: "Legionary boots, built for long marches." },
    shield: { type: "wear", slot: "hand", name: "Round shield", price: 110, note: "Painted red, with a bronze boss." },
    dagger: { type: "weapon", slot: "weapon", name: "Sica (dagger)", price: 60, note: "A quick little blade for the arena." },
    spear: { type: "weapon", slot: "weapon", name: "Hasta (spear)", price: 130, note: "Reaches far, but slow to thrust." },
    trident: { type: "weapon", slot: "weapon", name: "Fuscina (trident)", price: 200, note: "The net-fighter's weapon." },
    axe: { type: "weapon", slot: "weapon", name: "Securis (battle axe)", price: 220, note: "Heavy and slow, and it hits very hard." },
    spatha: { type: "weapon", slot: "weapon", name: "Champion's greatsword", price: 320, note: "A long, broad blade made for champions." },
    hound: { type: "pet", slot: "pet", name: "Hound", price: 150, note: "A loyal dog that trots along behind you." },
    eagle: { type: "pet", slot: "pet", name: "Eagle", price: 220, note: "The eagle of Rome, circling above you." },
    cat: { type: "pet", slot: "pet", name: "Cat", price: 90, note: "A sleek tabby that pads along behind you." },
    parrot: { type: "pet", slot: "pet", name: "Parrot", price: 130, note: "A bright green parrot that flutters around your head." },
    monkey: { type: "pet", slot: "pet", name: "Monkey", price: 140, note: "A cheeky monkey with long arms that scampers after you." },
    peacock: { type: "pet", slot: "pet", name: "Peacock", price: 160, note: "A blue and green peacock, its long tail fanning out behind it." },
    owl: { type: "pet", slot: "pet", name: "Owl", price: 170, note: "The owl of Minerva, gliding in slow circles above you." },
    cub: { type: "pet", slot: "pet", name: "Lion cub", price: 260, note: "A golden lion cub that trots at your heel." },
    bicycle: { type: "car", name: "Bicycle", price: 60, note: "Pedal-powered and cheap. Top speed 27 km/h." },
    motorcycle: { type: "car", name: "Motorcycle", price: 350, note: "A fast, light motorbike. Top speed 122 km/h." },
    taxi: { type: "car", name: "Taxi", price: 450, note: "A yellow cab with a lit sign on the roof. Top speed 90 km/h." },
    suv: { type: "car", name: "SUV", price: 700, note: "A tall, heavy four-by-four. Top speed 100 km/h." },
    truck: { type: "car", name: "Delivery truck", price: 600, note: "A white box truck: big and slow to turn. Top speed 72 km/h." },
    bus: { type: "car", name: "Bus", price: 900, note: "A long red city bus. Top speed 61 km/h. It takes a lot of road." },
    chariot: { type: "mount", name: "Chariot", price: 280, note: "A light two-wheeled chariot with a horse in harness. Top speed 76 km/h." },
    scooter: { type: "car", name: "Vespa scooter", price: 250, note: "Quick and nimble. Top speed 54 km/h." },
    citycar: { type: "car", name: "City car", price: 500, note: "A blue runabout. Top speed 86 km/h." },
    plane: { type: "car", name: "Light plane", price: 3500, note: "A small propeller plane for the modern cities. Build up speed on a long straight street, hold Space above about 100 km/h to take off, and land gently. Fly to the edge of a city and press F to fly on to the next one. Top speed 223 km/h." },
    sportscar: { type: "car", name: "Sports car", price: 1200, note: "Low, red and fast. Top speed 130 km/h." },
    rickshaw: { type: "car", name: "Cycle rickshaw", price: 200, note: "Pedal-powered, in bright colours. Top speed 25 km/h." },
    oxcart: { type: "mount", name: "Bullock cart", price: 150, note: "A wooden cart pulled by an ox. Top speed 18 km/h." },
    horse: { type: "mount", name: "Horse", price: 300, note: "A fast brown horse with a saddle. Top speed 65 km/h." },
    camel: { type: "mount", name: "Camel", price: 220, note: "A tall camel with a red saddle cloth, from the caravans. Top speed 40 km/h, and you ride high above the crowd." },
    donkey: { type: "mount", name: "Donkey", price: 70, note: "A hardy little donkey: slow but cheap. Top speed 29 km/h." },
    elephant: { type: "mount", name: "Elephant", price: 800, note: "A tall elephant with a red and gold howdah. Top speed 50 km/h, and you can see over the crowd." },
    banners: { type: "decor", name: "Door banners", price: 60, note: "Two crimson banners either side of your front door." },
    mosaic: { type: "decor", name: "Mosaic floor", price: 90, note: "A patterned floor of coloured tiles inside your house." },
    salve: { type: "supply", name: "Healing salve", price: 40, note: "Heals 40 health at once." },
    fodder: { type: "supply", name: "Fodder for the horses", price: 40, note: "Restores 40 points of your horses' fitness at once." },
    horses: { type: "perk", name: "Well-bred horses", price: 350, note: "Your racing horses tire 15% more slowly." },
    training: { type: "perk", name: "Gladiator training", price: 400, note: "Your sword hits 10% harder against the arena's gladiators (not in duels against real people)." },
  };
  // Food from the food stall. Each dish belongs to one city and era. `heal` is health at once; eating also leaves you "fed",
  // which speeds up how fast you heal on your own for a few minutes.
  const F = (name, price, heal, note, where) => ({ type: "food", name, price, heal, note, where });
  const FOODS = {
    f_bread: F("Fresh bread", 6, 10, "A warm round loaf from the baker's oven.", ["rome", "ancient"]),
    f_olives: F("Olives and cheese", 9, 14, "Salty olives with a wedge of sheep's cheese.", ["rome", "ancient"]),
    f_honey: F("Honey cakes", 14, 20, "Sweet cakes soaked in honey, a Roman treat.", ["rome", "ancient"]),
    f_pork: F("Roast pork", 28, 36, "Slow-roasted, with herbs and a little garum.", ["rome", "ancient"]),
    f_pizza: F("Pizza slice", 8, 14, "Hot from the oven, with melted cheese.", ["rome", "modern"]),
    f_gelato: F("Gelato", 10, 11, "Two scoops, cold and creamy.", ["rome", "modern"]),
    f_pasta: F("Bowl of pasta", 18, 28, "Carbonara, thick with egg and pepper.", ["rome", "modern"]),
    f_espresso: F("Espresso", 6, 6, "Small, black and strong.", ["rome", "modern"]),
    f_jalebi: F("Jalebi", 8, 12, "Crisp orange spirals soaked in syrup.", ["delhi", "ancient"]),
    f_kebab: F("Seekh kebab", 18, 26, "Spiced meat grilled over charcoal.", ["delhi", "ancient"]),
    f_lassi: F("Lassi", 8, 10, "Cool, thick yoghurt drink in a clay cup.", ["delhi", "ancient"]),
    f_pulao: F("Pulao", 25, 34, "Fragrant rice cooked with spices and nuts.", ["delhi", "ancient"]),
    f_dosa: F("Masala dosa", 12, 16, "A thin, crisp rice pancake rolled round spiced potato, with sambar and chutney.", ["delhi", "ancient"]),
    f_dosa_m: F("Masala dosa", 12, 16, "A thin, crisp rice pancake rolled round spiced potato, with sambar and chutney.", ["delhi", "modern"]),
    f_samosa: F("Samosa", 6, 9, "A crisp pastry with spiced potato and peas.", ["delhi", "modern"]),
    f_chaat: F("Chaat plate", 10, 14, "Tangy, crunchy and sweet all at once.", ["delhi", "modern"]),
    f_chai: F("Cup of chai", 4, 5, "Sweet milky tea.", ["delhi", "modern"]),
    f_momos: F("Plate of momos", 14, 20, "Steamed dumplings with a red chilli sauce.", ["delhi", "modern"]),
    f_butter: F("Butter chicken and naan", 28, 38, "Rich, creamy and filling.", ["delhi", "modern"]),
  };
  // festival dishes: sold only while their festival lasts
  const FD = (name, price, heal, note, where, fest) => ({ ...F(name, price, heal, note, where), fest });
  Object.assign(FOODS, {   // Cancún and Chichén Itzá: Maya cooking in the ancient city, Yucatán dishes today
    f_tamal: F("Tamal", 8, 12, "Maize dough steamed in a banana leaf round beans or turkey.", ["cancun", "ancient"]),
    f_pozol: F("Pozol", 5, 8, "A cool drink of ground maize and cacao, in a gourd.", ["cancun", "ancient"]),
    f_atole: F("Atole", 6, 9, "A thick warm maize drink sweetened with honey.", ["cancun", "ancient"]),
    f_fishc: F("Grilled fish", 18, 26, "Fresh fish from the Caribbean, grilled over a wood fire.", ["cancun", "ancient"]),
    f_cacao: F("Cacao drink", 12, 14, "Bitter, frothy chocolate with chilli: a drink for nobles.", ["cancun", "ancient"]),
    f_turkey: F("Roast turkey with pumpkin seeds", 26, 36, "A feast dish, roasted in a pit.", ["cancun", "ancient"]),
    f_taco: F("Tacos al pastor", 14, 20, "Spiced pork from a spinning spit, with pineapple, in a soft corn tortilla.", ["cancun", "modern"]),
    f_cochinita: F("Cochinita pibil", 24, 34, "Pork slow-cooked in orange juice and achiote: a Yucatán speciality.", ["cancun", "modern"]),
    f_ceviche: F("Ceviche", 20, 28, "Raw fish cured in lime juice, with onion, coriander and chilli.", ["cancun", "modern"]),
    f_elote: F("Elote", 7, 9, "Street corn on a stick, with mayonnaise, cheese and chilli.", ["cancun", "modern"]),
    f_horchata: F("Horchata", 6, 8, "A cold sweet rice and cinnamon drink.", ["cancun", "modern"]),
    f_agua: F("Agua de jamaica", 5, 7, "A cold, tart drink of hibiscus flowers.", ["cancun", "modern"]),
    f_guac: F("Guacamole and tostadas", 12, 16, "Fresh avocado with lime, and crisp tortillas.", ["cancun", "modern"]),
    f_mucbil: FD("Mucbil pollo", 14, 22, "A great festival tamal baked in a pit, for the day of the dead.", ["cancun", "ancient"], "muertos"),
    f_pan: FD("Pan de muerto", 10, 18, "Sweet bread with bone shapes on top, for the Day of the Dead.", ["cancun", "modern"], "muertos"),
    f_maizecake: FD("Maize cake of Kukulcán", 10, 16, "A sweet maize cake for the equinox, in the shape of a serpent.", ["cancun", "ancient"], "equinox"),
    f_maizecakem: FD("Maize cake of Kukulcán", 10, 16, "A sweet maize cake for the equinox, in the shape of a serpent.", ["cancun", "modern"], "equinox"),
  });
  Object.assign(FOODS, {
    f_cake: FD("Saturnalia cake", 12, 22, "A honeyed festival cake with nuts and dried fruit.", ["rome", "ancient"], "saturnalia"),
    f_cakem: FD("Panettone slice", 12, 22, "A slice of sweet festive bread with candied fruit.", ["rome", "modern"], "saturnalia"),
    f_garland: FD("Floralia honey flowers", 9, 14, "Sweet cakes baked in the shape of flowers.", ["rome", "ancient"], "floralia"),
    f_garlandm: FD("Floralia honey flowers", 9, 14, "Sweet cakes baked in the shape of flowers.", ["rome", "modern"], "floralia"),
    f_mithai: FD("Mithai box (gulab jamun)", 14, 24, "Syrup-soaked sweets for Diwali.", ["delhi", "ancient"], "diwali"),
    f_mithaim: FD("Mithai box (gulab jamun)", 14, 24, "Syrup-soaked sweets for Diwali.", ["delhi", "modern"], "diwali"),
    f_thandai: FD("Thandai", 10, 16, "A cold spiced milk drink for Holi.", ["delhi", "ancient"], "holi"),
    f_thandaim: FD("Thandai", 10, 16, "A cold spiced milk drink for Holi.", ["delhi", "modern"], "holi"),
  });
  // medicines from the healer: each cures some illnesses (see disease.js); where: the city that sells it
  const CURES = {
    c_tea: { type: "cure", name: "Hot honey and herb drink", price: 10, note: "Cures a cold.", cures: ["cold"], where: ["rome"] },
    c_tonic: { type: "cure", name: "Bitter bark tonic", price: 40, note: "Cures marsh fever, food poisoning and heatstroke.", cures: ["fever", "poison", "heat"], where: ["rome"] },
    c_theriac: { type: "cure", name: "Theriac", price: 130, note: "The great antidote of Rome: cures any illness, even plague.", cures: ["cold", "fever", "poison", "heat", "plague"], where: ["rome"] },
    c_lime: { type: "cure", name: "Honey and lime tea", price: 10, note: "A hot tea of lime leaves and honey that cures a cold.", cures: ["cold"], where: ["cancun"] },
    c_soursop: { type: "cure", name: "Soursop leaf tonic", price: 40, note: "Cures fever, food poisoning and heatstroke.", cures: ["fever", "poison", "heat"], where: ["cancun"] },
    c_chilam: { type: "cure", name: "The h-men's great remedy", price: 130, note: "The strongest cure of the Maya healers: cures any illness, even plague.", cures: ["cold", "fever", "poison", "heat", "plague"], where: ["cancun"] },
    c_kadha: { type: "cure", name: "Tulsi and ginger kadha", price: 10, note: "A hot herbal drink that cures a cold.", cures: ["cold"], where: ["delhi"] },
    c_neem: { type: "cure", name: "Neem and giloy tonic", price: 40, note: "Cures fever, food poisoning and heatstroke.", cures: ["fever", "poison", "heat"], where: ["delhi"] },
    c_rasa: { type: "cure", name: "Ayurvedic rasayana", price: 130, note: "The strongest medicine of the vaidyas: cures any illness, even plague.", cures: ["cold", "fever", "poison", "heat", "plague"], where: ["delhi"] },
  };
  Object.assign(ITEMS, CURES);
  Object.assign(ITEMS, FOODS);
  const foodHere = (it) => it.where[0] === (typeof city !== "undefined" ? city : "rome") && it.where[1] === (typeof era !== "undefined" ? era : "ancient") && (!it.fest || (typeof Festival !== "undefined" && Festival.id === it.fest));   // festival dishes only on their festival

  // Each stall in the market sells some kinds of thing (the builder also sells houses)
  const STALLS = {
    food: { title: "Food stall", types: ["food"] },
    clothes: { title: "Clothier", types: ["wear"] },
    pets: { title: "Animals and rides", types: ["pet", "car", "mount"] },
    builder: { title: "Builder and decorator", types: ["decor"], house: true },
    healer: { title: "Healer and trainer", types: ["cure", "supply", "perk"] },
    garage: { title: "Your garage", types: ["car", "mount"], ownedOnly: true, empty: "You do not own any of these yet. Buy one at the animals and rides stall in the market square." },
    menagerie: { title: "Your menagerie", types: ["pet"], ownedOnly: true, empty: "You do not own any animals yet. Buy one at the animals and rides stall in the market square, and it will live here. Press Bring along to take one with you." },
    weapons: { title: "Armourer: weapons for the arena", types: ["weapon"], note: "You fight with the gladius (damage 100%, reach 3.1 m) unless you equip another weapon. Weapons work in the arena against the bots, and in duels and team battles against real people." },
    dresser: { title: "Your dresser", types: ["wear"], ownedOnly: true, empty: "You do not own anything to wear yet. The clothier in the market square sells hats, cloaks, armour and boots. You cannot buy things here." },
  };
  let stall = "food";
  const SECTIONS = [
    ["Hot food and drink", "food"], ["Medicines (for illness)", "cure"], ["Things to wear", "wear"], ["Weapons for the arena", "weapon"], ["Companions", "pet"], ["Cars, bikes, buses and rickshaws (modern cities only)", "car"], ["Animals to ride and carts (ancient cities only)", "mount"], ["Decorate your house", "decor"], ["Supplies", "supply"], ["Training and horses", "perk"],
  ];
  const PERKS = { horses: { tire: 0.85 }, training: { melee: 1.1 } };

  let s = { house: 0, dhouse: 0, items: [], worn: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) s = sanitize(raw);
  } catch (e) { /* storage unavailable */ }

  // Anything odd in saved data (edited, or from an older version) is dropped.
  function sanitize(raw) {
    const out = { house: 0, dhouse: 0, items: [], worn: [] };
    if (raw && Number.isInteger(raw.house) && raw.house >= 0 && raw.house < HOUSES.length) out.house = raw.house;
    if (raw && Number.isInteger(raw.dhouse) && raw.dhouse >= 0 && raw.dhouse < HOUSES_D.length) out.dhouse = raw.dhouse;
    const items = Array.isArray(raw && raw.items) ? raw.items : [], worn = Array.isArray(raw && raw.worn) ? raw.worn : [];
    out.items = [...new Set(items.filter((id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(ITEMS, id) && ITEMS[id].type !== "supply" && ITEMS[id].type !== "food"))];
    const slots = new Set();
    for (const id of worn) {
      if (typeof id !== "string" || !out.items.includes(id) || !ITEMS[id].slot || slots.has(ITEMS[id].slot)) continue;
      slots.add(ITEMS[id].slot); out.worn.push(id);
    }
    return out;
  }

  // People who hate you (you missed the tax) charge 25% more
  const mark = (p) => Math.round(p * (typeof Tax !== "undefined" ? Tax.priceMul : 1));
  const markFood = (p, it) => (it && it.type === "food" && typeof Festival !== "undefined" ? Math.round(mark(p) * Festival.foodMul) : mark(p));   // festival days: food a quarter cheaper
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const $m = (id) => document.getElementById(id);

  // Put what you own on show: the house, what is in it, what you wear and who follows you.
  function applyAll() {
    Home.setTier(s.house);
    Delhi.setTier(s.dhouse);
    Home.setDecor({ banners: s.items.includes("banners"), mosaic: s.items.includes("mosaic") });
    if (avFig) applyAccessories(avFig, s.worn.filter((id) => ITEMS[id].type === "wear"));
    Pets.set(s.worn.find((id) => ITEMS[id].type === "pet"));
    if (typeof avFig !== "undefined" && avFig) Weapons.setFigure(avFig, s.worn.find((id) => ITEMS[id].type === "weapon"));
    render();
  }

  function buyHouse() {
    const next = homes()[tier() + 1];
    if (!next) return;
    if (Vitals.coins < mark(next.price)) { toast(`You need ${mark(next.price)} denarii for the ${next.name.toLowerCase()} (you have ${Vitals.coins}).`); return; }
    Vitals.coins -= mark(next.price);
    if (homes() === HOUSES_D) s.dhouse += 1; else s.house += 1;
    save(); applyAll(); Sfx.play("coin");
    toast(homes() === HOUSES_D ? `You bought the ${next.name.toLowerCase()}! It stands on your plot off Chandni Chowk.` : `You bought the ${next.name.toLowerCase()}! Go and see it near the Colosseum road.`);
    Narrator.say(`You bought the ${next.name}.`, { interrupt: true });
  }

  function buyItem(id) {
    const it = ITEMS[id];
    if (!it || (it.type !== "supply" && it.type !== "food" && s.items.includes(id))) return;
    if (Vitals.coins < markFood(it.price, it)) { toast(`The ${it.name.toLowerCase()} costs ${markFood(it.price, it)} denarii (you have ${Vitals.coins}).`); return; }
    if (it.type === "cure") {
      if (it.where[0] !== (typeof city !== "undefined" ? city : "rome")) return;
      if (!it.cures.some((k) => Disease.has(k))) { toast("You are not ill with anything this cures."); return; }
      Vitals.coins -= mark(it.price);
      Disease.cure(it.cures); Sfx.play("coin"); render();
      toast(`${it.name}: you feel better already.`); Narrator.say("The medicine works. You feel better.", { interrupt: true });
      return;
    }
    if (it.type === "food") {
      if (!foodHere(it)) return;
      if (Vitals.hunger >= 90 && Vitals.hp >= 99) { toast("You are not hungry."); return; }
      Vitals.coins -= markFood(it.price, it);
      Vitals.eat(it.heal, it.heal * 2.5);
      { const hb = document.getElementById("v-hunger"); if (hb) { hb.classList.add("ate"); setTimeout(() => hb.classList.remove("ate"), 700); } }
      Sfx.play("coin"); render();
      toast(`${it.name}: delicious. Hunger ${Math.round(Vitals.hunger)}/100, health ${Math.round(Vitals.hp)}/100.`);
      if (["f_lassi", "f_chai", "f_thandai", "f_thandaim", "f_gelato", "f_horchata", "f_pozol", "f_agua"].includes(id)) Disease.cure(["heat"]);          // a cool drink
      if (["f_tea"].includes(id)) Disease.cure(["cold"]);
      if (Math.random() < 0.01 + (typeof Weather !== "undefined" && Weather.season === 1 ? 0.02 : 0)) { Disease.catchIt("poison", "that street food was off"); Vitals.hunger = Math.max(0, Vitals.hunger - 35); Vitals.hp = Math.max(5, Vitals.hp - 8); }   // street food is sometimes bad, more often in summer
      return;
    }
    if (it.type === "supply") {
      if (id === "salve" ? Vitals.hp >= 99 : Vitals.horses >= 99) { toast(id === "salve" ? "You are already in good health." : "Your horses are already fit."); return; }
      Vitals.coins -= mark(it.price);
      if (id === "salve") Vitals.hp = Vitals.hp + 40; else Vitals.horses = Vitals.horses + 40;
      Sfx.play("coin"); render();
      toast(id === "salve" ? `The salve heals you. Health ${Math.round(Vitals.hp)}/100.` : `Your horses feel stronger. Fitness ${Math.round(Vitals.horses)}/100.`);
      return;
    }
    Vitals.coins -= mark(it.price);
    s.items.push(id); save(); Sfx.play("coin");
    if (it.type === "car" || it.type === "mount") { applyAll(); closePanels(); Car.deploy(id); return; } // it appears next to you
    if (it.slot) wear(id); else applyAll();
    toast(it.type === "perk" ? `${it.name}: yours for good.` : it.type === "decor" ? `You decorated your house with the ${it.name.toLowerCase()}.` : `You bought the ${it.name.toLowerCase()} and took it with you.`);
  }

  // Wear (or take off) something, or bring a companion along (or send it home)
  function wear(id) {
    const it = ITEMS[id];
    if (!it || !it.slot || !s.items.includes(id)) return;
    if (s.worn.includes(id)) s.worn = s.worn.filter((w) => w !== id);
    else s.worn = [...s.worn.filter((w) => ITEMS[w].slot !== it.slot), id]; // replaces what you had in that slot
    save(); applyAll();
  }

  function render() {
    const box = $m("market");
    if (!box) return;
    const def = STALLS[stall] || STALLS.food;
    $m("mk-title").textContent = def.title;
    $m("mk-house-box").hidden = !def.house;
    $m("mk-purse").hidden = !!def.ownedOnly;
    $m("mk-coins").textContent = Vitals.coins;
    const cur = homes()[tier()], next = homes()[tier() + 1];
    $m("mk-house-name").textContent = cur.name;
    $m("mk-house-perk").textContent = cur.perk;
    $m("mk-house-buy").hidden = !next;
    $m("mk-house-next").hidden = !next;
    if (next) {
      $m("mk-house-next").textContent = `Next: ${next.name}. ${next.perk}`;
      $m("mk-house-buy").textContent = `Buy for ${mark(next.price)} denarii`;
      $m("mk-house-buy").disabled = Vitals.coins < mark(next.price);
    } else $m("mk-house-perk").textContent += homes() === HOUSES_D ? " It is the finest house in Old Delhi." : homes() === HOUSES_C ? " (The Rome and Delhi houses are bigger: your Rome and Delhi houses stay as they were.)" : " It is the finest house in Rome.";

    const intro = def.note ? [Object.assign(document.createElement("p"), { className: "mk-note", textContent: def.note })] : [];
    $m("mk-sections").replaceChildren(...intro, ...SECTIONS.filter(([, type]) => def.types.includes(type)).flatMap(([title, type]) => {
      const h = document.createElement("h3"), ul = document.createElement("ul");
      h.textContent = title; ul.className = "mk-items";
      const need = type === "car" ? "modern" : type === "mount" ? "ancient" : null;
      if (need && era !== need && def.ownedOnly) return []; // your garage only lists what exists in this era
      if (need && era !== need) { // these only exist in one era
        const li = document.createElement("li"), note = document.createElement("small");
        note.textContent = need === "modern" ? "Cars and rickshaws only exist in the modern cities. Press K to go there, then come back to buy one." : "Carts and the animals you ride (horse, camel, donkey, elephant) only live in the ancient cities (Ancient Rome and Mughal Delhi). Press K to go there, then come back to buy one.";
        li.append(note); ul.append(li);
        return [h, ul];
      }
      for (const [id, it] of Object.entries(ITEMS).filter(([fid, x]) => x.type === type && (type !== "food" || foodHere(x)) && (type !== "cure" || x.where[0] === (typeof city !== "undefined" ? city : "rome")) && (!def.ownedOnly || s.items.includes(fid)))) {
        const li = document.createElement("li"), txt = document.createElement("span"), b = document.createElement("button");
        const name = document.createElement("strong"), note = document.createElement("small");
        name.textContent = it.name; note.textContent = it.type === "weapon" ? `${it.note} ${Weapons.describe(id)}` : it.note;
        txt.append(name, note);
        b.type = "button";
        const owned = s.items.includes(id);
        if (it.type === "supply" || it.type === "food" || !owned) { b.textContent = `Buy · ${markFood(it.price, it)}${it.type === "food" && typeof Festival !== "undefined" && Festival.active ? " (festival price)" : ""}`; b.disabled = Vitals.coins < markFood(it.price, it); b.addEventListener("click", () => buyItem(id)); }
        else if (it.type === "car" || it.type === "mount") { const out = Car.current === id; b.textContent = out ? "Park it away" : "Take it out"; b.classList.toggle("on", out); b.addEventListener("click", () => { if (out) { Car.stow(); render(); } else { closePanels(); Car.deploy(id); } }); }
        else if (it.slot) { b.textContent = s.worn.includes(id) ? (it.type === "pet" ? "Send home" : it.type === "weapon" ? "Put away" : "Take off") : (it.type === "pet" ? "Bring along" : it.type === "weapon" ? "Equip" : "Wear"); b.classList.toggle("on", s.worn.includes(id)); b.addEventListener("click", () => wear(id)); }
        else { b.textContent = "Owned"; b.disabled = true; b.classList.add("on"); }
        li.append(txt, b);
        ul.append(li);
      }
      if (def.ownedOnly && !ul.children.length) { const li = document.createElement("li"), note = document.createElement("small"); note.textContent = def.empty; li.append(note); ul.append(li); }
      return [h, ul];
    }));
  }

  function open(which) {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    stall = STALLS[which] ? which : "food";
    openPanel("#market");
    render();
  }

  function bind() {
    $m("market-close").addEventListener("click", closePanels);
    $m("market").addEventListener("click", (e) => { if (e.target.id === "market") closePanels(); });
    $m("mk-house-buy").addEventListener("click", buyHouse);
    applyAll();
  }

  return {
    bind, open, render, ITEMS, STALLS,
    get house() { return s.house; },
    get worn() { return s.worn.filter((id) => ITEMS[id].type === "wear"); }, // what other players can see
    get pets() { return s.items.filter((id) => ITEMS[id] && ITEMS[id].type === "pet"); },
    itemName: (id) => (ITEMS[id] ? ITEMS[id].name : id),
    get weapon() { return s.worn.find((id) => ITEMS[id] && ITEMS[id].type === "weapon") || null; },
    get pet() { return s.worn.find((id) => ITEMS[id].type === "pet") || null; },
    owns: (id) => s.items.includes(id),
    perk: (key) => s.items.reduce((m, id) => m * ((PERKS[id] && PERKS[id][key]) || 1), 1),
    rent: () => homes()[tier()].rent,
    houseName: () => homes()[tier()].name,
    houseRest: () => homes()[tier()].rest,
    snapshot: () => ({ house: s.house, dhouse: s.dhouse, items: s.items.slice(), worn: s.worn.slice() }),
    restore(raw) { s = sanitize(raw); save(); applyAll(); },
  };
})();
