// Landmarks of Rome, c. 128 AD (the reign of Hadrian).
// Coordinates are metres: x = east, z = south (north is -z). Not to scale between districts.
// `r` is the discovery radius; `stand` is where "Go there" drops you (you face the landmark).

const LANDMARKS = [
  {
    id: "home", home: true, name: "Your House", sub: "Domus Mea · your home in Rome",
    x: 255, z: 50, r: 9, stand: [255, 36],
    text: "A small house just south of the road to the Colosseum. Inside are your bed, a chest and a lamp. When night falls, come home and press Z to sleep until morning.",
    fact: "Most Romans lived in crowded apartment blocks (insulae). A whole house of your own, a domus, was a sign of wealth.",
  },
  {
    id: "forum", name: "The Roman Forum", sub: "Civic heart of Rome · c. 600 BC onward",
    x: 30, z: 0, r: 95, stand: [165, 6],
    text: "A paved plaza ringed by temples, law courts and the Senate House. Elections, trials, funerals and triumphal processions all passed through here along the Via Sacra, the 'Sacred Way'.",
    fact: "The valley was originally a marsh. The Cloaca Maxima, one of the world's earliest sewers, was built to drain it.",
  },
  {
    id: "colosseum", name: "The Colosseum", sub: "Flavian Amphitheatre · opened 80 AD",
    x: 430, z: 30, r: 125, stand: [285, 30],
    text: "Begun by Emperor Vespasian around 70 AD and opened by his son Titus in 80 AD. It could seat an estimated 50,000 spectators for gladiator fights, animal hunts and staged spectacles. Walk in through the gate, climb the seats, or step into the arena to fight gladiators (F), hunt animals (U), face a lion (L) or command a ship in a flooded naval battle (N), or watch the games from the seats (V): an animal hunt, myth dramas and gladiator matches.",
    fact: "A giant canvas awning, the velarium, could be pulled over the crowd. Sailors from the imperial fleet operated it.",
  },
  {
    id: "colossus", name: "Colossus of the Sun", sub: "Colossus Solis · moved by Hadrian, c. 128 AD",
    x: 288, z: -36, r: 60, stand: [288, 14],
    text: "A gilded bronze statue about 30 metres tall, once a portrait of Nero in his Golden House and later re-dedicated to Sol, the sun god, with a crown of rays. Around 128 AD Hadrian had it moved upright to stand beside the amphitheatre, and planned a matching colossus of the Moon goddess Luna. Climb the steps of its base and look up.",
    fact: "According to the Historia Augusta, the architect Decrianus moved it using 24 elephants. Many people think the name 'Colosseum' comes from this giant statue standing beside it.",
  },
  {
    id: "titus", name: "Arch of Titus", sub: "Triumphal arch · c. 81 AD",
    x: 200, z: 0, r: 38, stand: [255, 0],
    text: "Erected soon after Titus's death to honour his victories, especially the capture of Jerusalem in 70 AD. Reliefs inside the passage show Roman soldiers carrying spoils from the Temple, including the menorah.",
    fact: "Because this was the Via Sacra's high point, triumphal parades passed right beneath this arch.",
  },
  {
    id: "curia", name: "Curia Julia", sub: "The Senate House · completed 29 BC",
    x: -10, z: -52, r: 42, stand: [-10, -12],
    text: "Where the Senate met. Begun by Julius Caesar and finished by Augustus, it held several hundred senators sitting on tiered benches.",
    fact: "The brick building visitors see today is a later rebuild. It survived only because it was turned into a church in the 7th century.",
  },
  {
    id: "rostra", name: "The Rostra", sub: "Speakers' platform · 338 BC",
    x: -72, z: -16, r: 30, stand: [-72, 16],
    text: "The great orators' platform, decorated with the bronze ship prows (rostra) captured from the town of Antium in 338 BC. It gave us the word 'rostrum'.",
    fact: "After Cicero was murdered in 43 BC, his head and hands were displayed here.",
  },
  {
    id: "saturn", name: "Temple of Saturn", sub: "State treasury · founded 497 BC",
    x: -105, z: -52, r: 40, stand: [-98, -6],
    text: "One of Rome's oldest temples. Its vaults housed the aerarium, the state treasury, along with the standards of the legions and important state documents.",
    fact: "The winter festival Saturnalia began here, with a public banquet, gift-giving and a general suspension of normal rules.",
  },
  {
    id: "julia", name: "Basilica Julia", sub: "Law courts · begun 54 BC",
    x: -40, z: 55, r: 58, stand: [-40, 12],
    text: "A vast hall begun by Julius Caesar and finished by Augustus, used for civil court cases. Lawyers, litigants and gossiping onlookers filled its aisles.",
    fact: "Bored visitors scratched game boards into its marble steps. You can still find them today.",
  },
  {
    id: "castor", name: "Temple of Castor and Pollux", sub: "Founded 484 BC",
    x: 30, z: 55, r: 34, stand: [30, 12],
    text: "Built to honour the divine twins who, by legend, helped Rome win the Battle of Lake Regillus. Its high podium served as a speaker's platform and as an office for weights and measures.",
    fact: "Three tall columns from this temple are still standing in Rome today.",
  },
  {
    id: "vesta", name: "Temple of Vesta", sub: "Home of the sacred flame",
    x: 78, z: 52, r: 26, stand: [78, 14],
    text: "A small round temple where the sacred fire of Rome was kept burning. It was tended by the Vestal Virgins, six priestesses who served for thirty years.",
    fact: "The flame was believed to be tied to Rome's survival, and if it went out, that was a terrible omen.",
  },
  {
    id: "milestone", name: "The Golden Milestone", sub: "Milliarium Aureum · 20 BC",
    x: -58, z: 6, r: 16, stand: [-58, 30],
    text: "A gilded bronze column set up by Augustus. It is said to have listed the distances from Rome to the chief cities of the empire, and it stands behind the saying 'all roads lead to Rome'.",
    fact: "Rome's roads eventually covered roughly 80,000 km of paved highway across the empire.",
  },
  {
    id: "palatine", name: "The Palatine Hill", sub: "Imperial palace · Domitian, c. 92 AD",
    x: 40, z: 260, r: 105, stand: [40, 168],
    text: "According to legend Romulus founded Rome here. Augustus lived on the hill, and later emperors built palaces on it. Domitian's vast complex gave us the word 'palace'.",
    fact: "The Romans believed Romulus's hut was preserved on this hill, and they kept it repaired for centuries.",
  },
  {
    id: "capitolium", name: "Temple of Jupiter Optimus Maximus", sub: "Capitoline Hill · dedicated 509 BC",
    x: -235, z: -50, r: 70, stand: [-235, -2],
    text: "Rome's most sacred temple, dedicated to Jupiter, Juno and Minerva. Victorious generals ended their triumphal processions by climbing to this hill and giving thanks to Jupiter.",
    fact: "The temple burned down several times, in 83 BC, 69 AD and 80 AD, and was rebuilt each time.",
  },
  {
    id: "circus", name: "Circus Maximus", sub: "Chariot racing · 6th century BC",
    x: -230, z: 430, r: 190, stand: [-230, 150],
    text: "Rome's biggest racetrack, about 600 metres long. Teams of horses pulled chariots seven laps around the central barrier, the spina, while well over 100,000 spectators roared. Climb the stands and press V to watch a race, or step onto the track and press R to race a chariot.",
    fact: "The star charioteer Diocles retired in the 2nd century with 1,462 recorded wins and a vast fortune.",
  },
  {
    id: "trajan", name: "Trajan's Column", sub: "Dedicated 113 AD",
    x: -150, z: -360, r: 45, stand: [-150, -203],
    text: "A marble column about 30 metres tall, wrapped in a spiral relief that tells the story of Trajan's conquest of Dacia, with some 2,500 carved figures. It stands in Trajan's Forum, the last and grandest of the imperial forums.",
    fact: "Trajan's ashes were placed inside the base of the column.",
  },
  {
    id: "servian", name: "Servian Wall", sub: "Rome's old city wall · 4th century BC",
    x: 120, z: -465, r: 80, stand: [120, -430],
    text: "Rome's first great defensive wall, built of volcanic tuff after the Gauls sacked the city in 390 BC. By Hadrian's time the city had long since grown past it in every direction, so it now stands deep inside the built-up city rather than around its edge, its old gates still used as street crossings. Climb the stairs beside the gate to walk along the top.",
    fact: "The wall was about 11 kilometres long and up to 10 metres high in places. A stretch of it can still be seen today outside Rome's Termini railway station.",
  },
  {
    id: "pantheon", name: "The Pantheon", sub: "Temple to all the gods · c. 126 AD",
    x: -480, z: -380, r: 55, stand: [-480, -462],
    text: "Rebuilt by Hadrian (an earlier one was built by Agrippa, whose name is still on the front). Its dome is 43 metres across and open at the top in a circular oculus. Step inside.",
    fact: "It is still the largest unreinforced concrete dome in the world. When it rains, water falls through the oculus and drains through holes in the floor.",
  },
];
