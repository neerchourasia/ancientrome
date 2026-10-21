"use strict";
// The sights of Cancún and Chichén Itzá, in the Yucatán. Coordinates are metres around the Temple of Kukulcán (El Castillo), the big
// pyramid at the middle of Chichén Itzá, which stands at CANCUN_X (far east of Rome and Delhi in the game's world): x = east, z = south.
// The Caribbean coast (Tulum's temple in Maya days, the Hotel Zone today) is shown about 800 m east of the pyramid, much closer than in life.
// `only` limits a place to one era ("ancient" = the Maya city c. 1000 AD, "modern" = today). `r` is the discovery radius; `stand` is where
// "Go there" drops you. Loaded before delhi-data.js, which adds these to ALL_LANDMARKS.

const CANCUN_X = 12000;
const cn = (o) => ({ ...o, x: CANCUN_X + o.x, stand: [CANCUN_X + o.stand[0], o.stand[1]] });

const CANCUN_LANDMARKS = [
  cn({
    id: "c-casita", home: true, name: "Your House", sub: "Your casita near the plaza",
    x: -70, z: 95, r: 14, stand: [-70, 112],
    text: "A small palm-roofed house (a casita) just south-west of the great plaza. Inside are your bed and a hammock. When night falls, come home and press Z to sleep until morning.",
    fact: "Yucatec Maya families have slept in hammocks for centuries: they keep you cool and off the floor.",
  }),
  cn({
    id: "c-castillo", name: "El Castillo (Temple of Kukulcán)", sub: "The Maya pyramid of Chichén Itzá · c. 1000 AD",
    x: 0, z: 0, r: 62, stand: [0, 64],
    text: "A stepped pyramid 24 metres high, with nine terraces and a stairway on each of its four sides: 91 steps on each, and with the platform at the top, 365 in all, one for each day of the year. A temple to the feathered serpent god Kukulcán crowns it. You can climb it.",
    fact: "At the spring and autumn equinox the setting sun makes a zigzag of light and shadow slide down the north stairway, like a serpent crawling down towards the carved snake head at its foot.",
    modern: "Climbing the pyramid has been forbidden since 2006. A hand clap at the foot of the stairs comes back as a chirp, like the call of the quetzal bird.",
  }),
  cn({
    id: "c-ballcourt", name: "The Great Ball Court", sub: "The largest ball court in Mesoamerica",
    x: -150, z: -35, r: 50, stand: [-100, 20],
    text: "Two long parallel walls, 8 metres high, enclose a playing alley 70 metres long. High on each wall is a stone ring. Teams played a heavy rubber ball, using hips, knees and elbows, and the ring was the hardest target of all.",
    fact: "A whisper at one end of the court can be heard clearly at the other, 135 metres away.",
  }),
  cn({
    id: "c-warriors", name: "Temple of the Warriors", sub: "A stepped temple with carved columns",
    x: 105, z: -45, r: 46, stand: [62, -45],
    text: "A temple on a stepped platform, with a stairway on its west side. At its top a reclining Chac Mool figure holds a bowl for offerings. Rows of columns carved with warriors stand in front.",
    fact: "The temple looks much like one at Tula, far away in central Mexico, which shows how widely the cities of Mesoamerica traded and borrowed ideas.",
  }),
  cn({
    id: "c-columns", name: "Group of the Thousand Columns", sub: "Colonnades beside the Temple of the Warriors",
    x: 110, z: 8, r: 34, stand: [75, 20],
    text: "Rows of square and round stone columns, once holding up a roof of beams and plaster, run south and east of the Temple of the Warriors. Merchants and priests probably met in the shade here.",
    fact: "There are not really a thousand: about 200 columns are still standing in the group.",
  }),
  cn({
    id: "c-caracol", name: "El Caracol", sub: "The observatory with a spiral stair",
    x: -75, z: -135, r: 36, stand: [-75, -108],
    text: "A round tower on two platforms. A spiral stair inside, a caracol in Spanish, gives it its name. Slits in the upper chamber line up with the rising and setting of Venus and the sun at the equinoxes.",
    fact: "The Maya followed Venus closely: they could predict its cycle of 584 days with great accuracy.",
  }),
  cn({
    id: "c-cenote", name: "The Sacred Cenote", sub: "A natural sinkhole at the end of the white road",
    x: 0, z: -235, r: 58, stand: [0, -185],
    text: "The limestone of the Yucatán has no rivers on top; water lies in caves below. Here the roof of a cave fell in and left a sinkhole, a cenote, about 60 metres across with sheer walls. The Maya thought of it as a doorway to the underworld and threw offerings into it.",
    fact: "Divers have brought up jade, gold, pottery and incense from the bottom of the cenote. The name Chichén Itzá means \"at the mouth of the well of the Itzá\".",
  }),
  cn({
    id: "c-sacbe", name: "The Sacbé (the white road)", sub: "A raised causeway from the plaza to the cenote",
    x: 0, z: -115, r: 28, stand: [0, -90],
    text: "A road of limestone, built up above the jungle floor, runs from the great plaza north to the sacred cenote. Sacbé means \"white road\" in the Maya language. Stone-paved roads like this joined cities across the Yucatán.",
    fact: "Maya builders made lime plaster by burning limestone, and used it to pave roads and cover walls, sometimes painted in bright colours.",
  }),
  cn({
    id: "c-venus", name: "Platform of Venus", sub: "A small square platform near the pyramid",
    x: 50, z: 62, r: 20, stand: [50, 82],
    text: "A low square platform with a stairway on each side, decorated with feathered serpents and with symbols of Venus, the morning star.",
    fact: "Maya rulers timed wars and ceremonies by the movements of Venus.",
  }),
  cn({
    id: "c-tzompantli", name: "The Tzompantli", sub: "The platform of the skull rack",
    x: -48, z: -32, r: 20, stand: [-48, -8],
    text: "A low platform beside the ball court is carved all round with rows of skulls on racks. A tzompantli was a rack where the skulls of defeated enemies were displayed.",
    fact: "Similar skull racks are known from the Aztec capital, Tenochtitlan, far away in the highlands.",
  }),
  cn({
    id: "c-tulum", only: "ancient", name: "The coast: Tulum", sub: "A walled Maya port above the Caribbean",
    x: 770, z: 0, r: 70, stand: [715, 0],
    text: "On a cliff above a turquoise sea stands a little walled city and its temple, El Castillo of Tulum. Canoes pulled up on the beach carried cacao, cotton, salt and honey up and down the coast, and out to islands such as Cozumel.",
    fact: "Tulum was still a busy trading port when the first Spanish ships sailed past in 1518. The sailors wrote that it was as big as Seville.",
  }),
  cn({
    id: "c-hotelzone", only: "modern", name: "Cancún Hotel Zone", sub: "Kukulcán Boulevard, hotels and beaches",
    x: 770, z: 0, r: 80, stand: [715, 0],
    text: "A long narrow strip of land between the Caribbean and a lagoon, with hotels, beach clubs and shops along Kukulcán Boulevard. In 1970 this was a few fishermen's huts: a computer chose the place for a planned resort.",
    fact: "Cancún means \"nest of snakes\" in Maya. The boulevard is named for Kukulcán, the feathered serpent of Chichén Itzá.",
  }),
  cn({
    id: "c-beach", name: "The Caribbean beach", sub: "White sand and turquoise water",
    x: 880, z: 130, r: 55, stand: [840, 130],
    text: "A beach of fine white sand, made of tiny pieces of coral and shell. The sea beyond is clear turquoise over the sand and deep blue over the reef.",
    fact: "The Mesoamerican Reef, just offshore, is the second longest barrier reef in the world.",
  }),
  cn({
    id: "c-reef", name: "The Coral Reef", sub: "Snorkelling off the beach",
    x: 1050, z: 0, r: 120, stand: [880, 0],
    text: "Out beyond the shallows, the sea floor is covered in coral, sea fans and grass, and fish swim in schools over it. Wade in, press F to put your face in the water, and swim out: parrotfish, angelfish, a sea turtle and even a ray glide past. You need snorkel gear today (hire it at the hut on the beach).",
    fact: "Coral looks like rock or a plant, but it is a colony of tiny animals, polyps, that build themselves a hard skeleton of limestone.",
  }),
  cn({
    id: "c-azul", name: "Cenote Azul", sub: "A swimming sinkhole in the jungle",
    x: -330, z: 215, r: 40, stand: [-296, 215],
    text: "An open cenote: a round sinkhole 26 metres across where the limestone roof fell in, with clear blue water, vines hanging down and a shaft of sunlight. Walk onto the wooden dock and into the water to swim, and press F to look at the little fish below.",
    fact: "The water in cenotes is filtered by the rock and is so clear that divers can see for 50 metres. There are thousands of cenotes across the Yucatán.",
  }),
  cn({
    id: "g-hire", only: "modern", game: true, name: "Snorkel Hire", sub: "A hut on the beach",
    x: 860, z: 130, r: 12, stand: [860, 112],
    text: "A beach hut that rents snorkel gear for 15 denarii. Press F by the hut to hire a mask, a snorkel and fins, then wade into the sea and press F again.",
    fact: "Snorkelling needs only a mask and a breathing tube: you float at the surface and look down at the reef.",
  }),
  cn({
    id: "g-market", game: true, name: "The Market", sub: "Food, clothes, rides, a builder and a healer",
    x: 0, z: 150, r: 26, stand: [0, 128],
    text: "A paved square south of the great plaza with a well in the middle and five stalls along its south side: a food stall, a clothier, animals and rides, a builder and a healer. Walk up to a stall and press F to shop.",
    fact: "Maya markets traded cacao beans as money, and maize, beans, chilli, salt, honey, cotton cloth and feathers.",
  }),
];
