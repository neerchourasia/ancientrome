// Content for the site. Years: negative = BC, positive = AD.
const ERAS = {
  kingdom: { label: "Kingdom", range: "753–509 BC" },
  republic: { label: "Republic", range: "509–27 BC" },
  empire: { label: "Empire", range: "27 BC – 476 AD" },
  late: { label: "Late Antiquity", range: "284 AD onward" },
};

const TIMELINE = [
  { year: -753, era: "kingdom", title: "Founding of Rome", text: "Traditional date for the founding of the city by Romulus, on the Palatine Hill." },
  { year: -509, era: "republic", title: "The Republic begins", text: "The last king, Tarquin the Proud, is expelled. Power passes to two annually elected consuls and the Senate." },
  { year: -264, era: "republic", title: "First Punic War", text: "Rome fights Carthage over Sicily and builds its first large navy. The war lasts until 241 BC." },
  { year: -218, era: "republic", title: "Hannibal crosses the Alps", text: "The Second Punic War opens. Hannibal wins at Cannae in 216 BC, but Scipio defeats him at Zama in 202 BC." },
  { year: -146, era: "republic", title: "Carthage and Corinth destroyed", text: "Rome ends the Third Punic War by razing Carthage, and the same year sacks Corinth. It is now the dominant Mediterranean power." },
  { year: -49, era: "republic", title: "Caesar crosses the Rubicon", text: "Julius Caesar leads his army into Italy, starting a civil war against Pompey and the Senate." },
  { year: -44, era: "republic", title: "Caesar assassinated", text: "On the Ides of March, senators led by Brutus and Cassius stab Caesar, soon after he was named dictator for life." },
  { year: -31, era: "republic", title: "Battle of Actium", text: "Octavian defeats Mark Antony and Cleopatra in a naval battle off western Greece, and Egypt falls to Rome the next year." },
  { year: -27, era: "empire", title: "Augustus becomes first emperor", text: "The Senate grants Octavian the title Augustus. The Republic gives way to the Principate." },
  { year: 64, era: "empire", title: "Great Fire of Rome", text: "A fire destroys much of the city during Nero's reign. Nero blamed Christians, and the first persecutions followed." },
  { year: 79, era: "empire", title: "Vesuvius erupts", text: "Pompeii and Herculaneum are buried under ash. The Colosseum opens the next year." },
  { year: 117, era: "empire", title: "Empire at its greatest extent", text: "Under Trajan, Rome controls territory from Britain to Mesopotamia, roughly 5 million km²." },
  { year: 212, era: "empire", title: "Edict of Caracalla", text: "Citizenship is extended to nearly all free inhabitants of the empire." },
  { year: 293, era: "late", title: "Tetrarchy", text: "Diocletian splits rule among four men, two senior Augusti and two junior Caesares, to make the empire governable." },
  { year: 313, era: "late", title: "Edict of Milan", text: "Constantine and Licinius grant religious tolerance, ending official persecution of Christians." },
  { year: 330, era: "late", title: "Constantinople dedicated", text: "Constantine moves the imperial capital east to the old Greek city of Byzantium." },
  { year: 395, era: "late", title: "Permanent division", text: "After the death of Theodosius I, the empire is split into eastern and western halves for good." },
  { year: 476, era: "late", title: "Fall of the Western Empire", text: "Odoacer deposes the boy emperor Romulus Augustulus. The last western emperor is gone." },
  { year: 1453, era: "late", title: "Fall of Constantinople", text: "The Ottomans capture the capital of the Eastern (Byzantine) Empire, ending the Roman state after more than 2,000 years." },
];

const PEOPLE = [
  { name: "Scipio Africanus", dates: "236–183 BC", era: "republic", role: "General", text: "Defeated Hannibal at Zama in 202 BC, ending the Second Punic War." },
  { name: "Cicero", dates: "106–43 BC", era: "republic", role: "Orator and statesman", text: "Rome's greatest orator. Exposed the Catilinarian conspiracy and was killed on Mark Antony's orders." },
  { name: "Julius Caesar", dates: "100–44 BC", era: "republic", role: "General and dictator", text: "Conquered Gaul, won the civil war, and reformed the calendar. His assassination triggered the end of the Republic." },
  { name: "Augustus", dates: "63 BC – 14 AD", era: "empire", role: "First emperor", text: "Ended a century of civil war and ruled for over 40 years, founding the Pax Romana." },
  { name: "Nero", dates: "37–68 AD", era: "empire", role: "Emperor", text: "The last of the Julio-Claudian dynasty. His reign ended in revolt and suicide, followed by the Year of the Four Emperors." },
  { name: "Trajan", dates: "53–117 AD", era: "empire", role: "Emperor", text: "Conquered Dacia and Mesopotamia, taking the empire to its peak size. He is remembered as one of the Five Good Emperors." },
  { name: "Hadrian", dates: "76–138 AD", era: "empire", role: "Emperor", text: "Consolidated the frontiers, built Hadrian's Wall in Britain, and rebuilt the Pantheon." },
  { name: "Marcus Aurelius", dates: "121–180 AD", era: "empire", role: "Emperor and philosopher", text: "The last of the Five Good Emperors. Wrote the Meditations, a work of Stoic philosophy, during campaigns on the Danube." },
  { name: "Diocletian", dates: "c. 244–311 AD", era: "late", role: "Emperor", text: "Ended the Crisis of the Third Century and reorganized the empire under the Tetrarchy. Retired voluntarily in 305." },
  { name: "Constantine the Great", dates: "c. 272–337 AD", era: "late", role: "Emperor", text: "Reunited the empire, favoured Christianity, and founded Constantinople." },
];

// Each question: answer is the index into options.
const QUIZ = [
  { q: "According to tradition, who founded Rome?", options: ["Aeneas", "Romulus", "Numa Pompilius", "Tarquin"], answer: 1, note: "Romulus, in 753 BC by tradition. Aeneas is the Trojan ancestor in Virgil's myth." },
  { q: "Which general defeated Hannibal at Zama?", options: ["Scipio Africanus", "Pompey", "Fabius Maximus", "Sulla"], answer: 0, note: "Scipio won in 202 BC. Fabius wore Hannibal down earlier with delaying tactics." },
  { q: "What did Caesar cross in 49 BC, starting the civil war?", options: ["The Tiber", "The Danube", "The Rubicon", "The Rhine"], answer: 2, note: "Crossing the Rubicon with an army broke the law against bringing troops into Italy." },
  { q: "Who was Rome's first emperor?", options: ["Julius Caesar", "Augustus", "Tiberius", "Nero"], answer: 1, note: "Caesar was dictator but never emperor. Octavian took the name Augustus in 27 BC." },
  { q: "Which emperor took the empire to its greatest territorial extent?", options: ["Hadrian", "Augustus", "Trajan", "Constantine"], answer: 2, note: "Trajan, around 117 AD." },
  { q: "What event buried Pompeii in 79 AD?", options: ["An earthquake", "The eruption of Vesuvius", "A flood of the Sarno", "The Great Fire"], answer: 1, note: "Vesuvius buried Pompeii under ash and pumice and Herculaneum under volcanic surges." },
  { q: "Which emperor moved the capital to Constantinople?", options: ["Diocletian", "Theodosius", "Constantine", "Justinian"], answer: 2, note: "Constantine dedicated the city in 330 AD." },
  { q: "When did the Western Roman Empire traditionally end?", options: ["410 AD", "455 AD", "476 AD", "533 AD"], answer: 2, note: "476 AD, when Odoacer deposed Romulus Augustulus. Rome was sacked by the Visigoths in 410." },
];
