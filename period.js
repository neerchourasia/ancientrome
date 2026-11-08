"use strict";
// A third time for every city: K now goes ancient → middle → modern → ancient. The middle times are Renaissance Rome (c. 1550), Delhi under the British Raj (c. 1911), Spanish Yucatán (c. 1700) and
// Republican Beijing (c. 1930). It is a "period look" on top of the city's older layout (the streets and buildings are the old ones; there are no new buildings): an old-photograph colour grade
// with a dark edge (not in light graphics), the people dressed for the time (Citizens palette in city.js), the guards in the soldiers of the time (guards.js), the names on the screen, and a note
// "In c. 1550: ..." on the history card of the sights that have one. game.js keeps the state (`skin`: true in the middle time, with `era` staying "ancient" so every rule of the game stays as it
// was). Depends on game.js (city, era, skin, $) and classmode.js (low).

const Period = (() => {
  const NAMES = { rome: "Renaissance Rome", delhi: "Delhi under the British Raj", cancun: "Spanish Yucatán", beijing: "Republican Beijing" };
  const YEARS = { rome: "c. 1550", delhi: "c. 1911", cancun: "c. 1700", beijing: "c. 1930" };
  const BADGE = { rome: "Renaissance Rome", delhi: "Raj Delhi", cancun: "Spanish Yucatán", beijing: "Republican Beijing" };
  const SAY = {
    rome: "Renaissance Rome, around 1550: the popes rebuild the city among the ruins",
    delhi: "Delhi under the British Raj, around 1911: the year the capital moves here from Calcutta",
    cancun: "Spanish Yucatán, around 1700: the Maya cities lie under the forest",
    beijing: "Republican Beijing, around 1930: the emperor is gone and the palace is a museum",
  };
  const NOTES = {
    forum: "The Forum is a cow pasture called the Campo Vaccino, with columns half buried in the earth. The popes' builders take its marble for new churches and palaces.",
    colosseum: "A quarry for the city. Popes and noble families carry off its travertine and marble to build palaces and St Peter's, and part of the outer wall fell long ago in an earthquake.",
    pantheon: "The Pantheon is the church of Santa Maria ad Martyres, in use since the year 609. The painter Raphael was buried here in 1520.",
    capitolium: "On the Capitoline Hill Michelangelo is designing a new square, the Piazza del Campidoglio, with the ancient bronze statue of Marcus Aurelius at its centre.",
    trajan: "Trajan's Column has survived the Middle Ages. In 1587 Pope Sixtus V puts a statue of Saint Peter on its top, in place of the emperor.",
    castor: "Only three tall columns of this temple still stand, a landmark in the Campo Vaccino.",
    palatine: "On the Palatine the Farnese family lay out the Orti Farnesiani, beautiful gardens built over the ruins of the emperors' palaces.",
    circus: "The great racecourse is a long grassy valley of gardens and vineyards.",
    "d-lahori": "After the uprising of 1857 the British turned the Red Fort into an army garrison and pulled down many Mughal buildings inside it to build barracks.",
    "d-diwanaam": "The British army fills the Red Fort with barracks. In December 1911 King George V holds a great durbar near Delhi and announces that India's capital will move here from Calcutta.",
    "d-chandni": "Chandni Chowk now has a tramway (since 1908) and a Town Hall with a clock tower, built in the 1860s. The new capital is about to rise to the south.",
    "d-jama": "After 1857 the mosque was held by troops. It was given back to the Muslims of Delhi in 1862.",
    "d-fatehpuri": "After 1857 the mosque was sold to a Hindu merchant, Lala Chunna Mal, for 19,000 rupees. The government bought it back for the community in 1877.",
    "c-castillo": "El Castillo lies half buried in forest. The Spanish have founded the town of Valladolid nearby (1543), built partly from stones of the old Maya city of Zací.",
    "c-cenote": "In the 1560s the Spanish friar Diego de Landa writes that Maya pilgrims still throw offerings into this sacred cenote.",
    "c-ballcourt": "The forest covers the Great Ballcourt. The ritual ball game is no longer played here.",
    "c-beach": "There is no Cancún yet: this coast is jungle and a few fishing villages. English and Dutch pirates hide in the coves of the Caribbean coast.",
    "b-tiananmen": "The Gate of Heavenly Peace faces a square where, on 4 May 1919, students began the May Fourth Movement. Beijing is now a provincial city called Beiping: the government is in Nanjing.",
    "b-meridian": "The last emperor, Puyi, was sent out of the palace in 1924. Since 1925 the Forbidden City has been the Palace Museum, and ordinary people may walk through the gates.",
    "b-heaven": "The Temple of Heaven, where emperors prayed for harvests, was opened to the public as a park in 1918.",
    "b-summer": "With the empire gone the Summer Palace is a public park, and people come out from the city to row on the lake.",
    "b-jingshan": "Jingshan, the hill behind the Forbidden City, became a public park in 1928.",
    "b-wall": "A railway from Beijing to Zhangjiakou, finished in 1909, carries visitors to the Great Wall at Badaling.",
    "b-hutong": "Rickshaws crowd the alleys, and since 1924 electric trams run along the main streets.",
  };
  // the people's colours (8 each, like ROBES_ANCIENT in city.js) and the guards' dress
  const ROBES = {
    rome: [0x7a1f2b, 0x1f3b6b, 0x2b2b2b, 0xb08d3a, 0x4a3b6b, 0x6b2b1f, 0xd8c39a, 0x2f5b3b],
    delhi: [0xf2efe6, 0xd8cfb0, 0x8a7a55, 0xb23b3b, 0x2b3a55, 0xf2efe6, 0xc9b27a, 0x4a4a4a],
    cancun: [0xf4efe0, 0xe8dcc0, 0x2b4a7a, 0x7a5a3a, 0xb04a3a, 0xf4efe0, 0x3a6a4a, 0xd9b26a],
    beijing: [0x3a4a6a, 0x2b2b2b, 0x5a6a7a, 0x6b5a3a, 0x3a3a3a, 0x4a5a4a, 0x8a8a7a, 0xb0473a],
  };
  const GUARDS = {                                                            // body, cloak, hat: "helmet" (a steel morion with a plume), "pith" (a white sun helmet) or "cap"
    rome: { body: 0x2a4a9a, cloak: 0xe3b72b, hat: "helmet", plume: 0xc0262b },
    delhi: { body: 0xb3262b, cloak: 0xf0ead6, hat: "pith", plume: 0 },
    cancun: { body: 0x6a3a2a, cloak: 0x3a3a3a, hat: "helmet", plume: 0xe8e4d6 },
    beijing: { body: 0x6a6f5a, cloak: 0x3a5a9a, hat: "cap", plume: 0 },
  };
  const small = (c) => `${BADGE[c] || ""} · ${YEARS[c] || ""}`;
  function apply(on) {
    document.body.classList.toggle("mid", on);
    document.body.classList.toggle("midfilm", on && !(window.CLASSMODE && CLASSMODE.low));
  }
  return { NAMES, YEARS, BADGE, SAY, apply, small, note: (id) => NOTES[id] || "", robes: (c) => (ROBES[c] || ROBES.rome).map((h) => new THREE.Color(h)), guard: (c) => GUARDS[c] || GUARDS.rome };
})();
