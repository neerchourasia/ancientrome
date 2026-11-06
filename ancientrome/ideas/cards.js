// Game content for Imperator.
// Meters: s = Senate, a = Army, p = People, t = Treasury (each 0–100).
// Every card is a real historical dilemma; `history` is shown after the player chooses.

const METERS = [
  { key: "s", label: "Senate", icon: "🏛️" },
  { key: "a", label: "Army", icon: "⚔️" },
  { key: "p", label: "People", icon: "👥" },
  { key: "t", label: "Treasury", icon: "🪙" },
];

// Ending when a meter reaches 0 (low) or 100 (high).
const ENDINGS = {
  s_low: { title: "Stabbed in the Senate", text: "The senators had had enough. On the day of the meeting, dozens of them surrounded you with daggers, just as they did to Julius Caesar on the Ides of March, 44 BC." },
  s_high: { title: "A Puppet of the Senate", text: "The Senate loves you so much that it now runs everything. You keep the title, but the real decisions are made by others. Augustus worked hard to avoid exactly this, and to avoid looking too powerful." },
  a_low: { title: "Murdered by the Guard", text: "You lost the soldiers. The Praetorian Guard cut down Caligula in 41 AD and, in 193 AD, murdered Pertinax and auctioned the throne to the highest bidder." },
  a_high: { title: "Replaced by a General", text: "Your army is so loyal to itself that it no longer needs you. In the 3rd century, legions made and unmade some twenty emperors in fifty years." },
  p_low: { title: "Torn Apart by the Mob", text: "Rome starved and rioted, and the crowd turned on you. The city mob was a real political force: it could burn down neighbourhoods and force emperors to flee." },
  p_high: { title: "Too Popular to Live", text: "The crowds adore you, and the elites can't stand it. Popularity made Julius Caesar a hero to the people, and a threat to everyone who feared a king." },
  t_low: { title: "Bankrupt", text: "The treasury is empty and the soldiers are unpaid. Rome's finances collapsed in the 3rd century as emperors debased the silver coinage until it was nearly worthless." },
  t_high: { title: "Killed for Your Gold", text: "Your overflowing coffers have made you a target. Emperors like Nero and Domitian confiscated fortunes, and plenty of rivals wanted to do the same to them." },
};

const WIN = {
  title: "Died in Your Bed",
  text: "You survived twenty years, more than most emperors managed. Of the first 26 emperors after Augustus, only around half died of natural causes. Augustus himself ruled 41 years and died peacefully in 14 AD.",
};

const CARDS = [
  {
    who: "Senator",
    text: "The Senate begs you to accept sweeping powers and the title Augustus.",
    left: { label: "Refuse the power, keep the title", fx: { s: 10, a: -5 }, result: "You play the modest 'first citizen'." },
    right: { label: "Take everything", fx: { a: 10, s: -15 }, result: "The Senate grumbles, but the legions applaud." },
    history: "In 27 BC Octavian accepted the name Augustus and a set of powers, while insisting he was merely princeps, the 'first citizen'. He kept up the fiction of the Republic for decades.",
  },
  {
    who: "Grain Merchant",
    text: "A shortage has hit Rome. The mob is hungry.",
    left: { label: "Buy grain from Egypt", fx: { t: -10, p: 15 }, result: "Ships from Alexandria fill the granaries." },
    right: { label: "Leave it to the market", fx: { t: 5, p: -15 }, result: "Prices soar and tempers flare." },
    history: "Egypt was Rome's breadbasket. Augustus made it his personal possession and barred senators from entering it, so that nobody could threaten Rome's food supply.",
  },
  {
    who: "Veteran",
    text: "Retired legionaries demand land and pay after twenty years of service.",
    left: { label: "Settle them in colonies", fx: { a: 15, t: -5, p: -5 }, result: "Veteran colonies spread across the provinces." },
    right: { label: "Refuse", fx: { a: -15, t: 5 }, result: "The men mutter about mutiny." },
    history: "Augustus founded a military treasury (the aerarium militare) in 6 AD so that discharge bonuses were paid from a dedicated fund, ending the old habit of generals bribing their own troops with land.",
  },
  {
    who: "Fire Watch",
    text: "Fires keep flattening entire districts of Rome.",
    left: { label: "Raise a city fire brigade", fx: { t: -10, p: 10 }, result: "Seven thousand freedmen patrol the streets." },
    right: { label: "Blame landlords", fx: { p: -10, s: 5 }, result: "Nothing changes. Fires continue." },
    history: "Augustus set up the vigiles in 6 AD, about 7,000 men who acted as firefighters and night police. A great fire still destroyed much of Rome under Nero in 64 AD.",
  },
  {
    who: "Editor of the Games",
    text: "The crowds want spectacle. Gladiators, beasts and blood.",
    left: { label: "Stage lavish games", fx: { p: 15, t: -15 }, result: "The arena roars for days." },
    right: { label: "Keep it modest", fx: { p: -10, t: 10 }, result: "The crowd feels cheated." },
    history: "The poet Juvenal complained that Romans had given up caring about politics and now wanted only 'bread and circuses'. The Colosseum opened in 80 AD with 100 days of games.",
  },
  {
    who: "Border Legate",
    text: "Restless tribes gather beyond the Rhine.",
    left: { label: "Strike across the river", fx: { a: 10, t: -10, s: -5 }, result: "Your legions march into the forests." },
    right: { label: "Hold the frontier", fx: { a: -5, t: 5 }, result: "You keep the river as a border." },
    history: "In 9 AD the Germanic leader Arminius destroyed three legions in the Teutoburg Forest. Augustus is said to have cried out for his lost legions, and Rome never again tried to conquer Germany beyond the Rhine.",
  },
  {
    who: "Spymaster",
    text: "A senator has been caught plotting your assassination.",
    left: { label: "Execute him", fx: { s: -15, a: 5 }, result: "Other senators start to look nervous." },
    right: { label: "Pardon him", fx: { s: 10, a: -5 }, result: "Your mercy is talked about in every villa." },
    history: "Augustus, according to Seneca, pardoned the conspirator Cinna and even made him consul, a famous act of clemency. His successors would often be less merciful.",
  },
  {
    who: "Governor Pliny",
    text: "A new sect refuses to worship you as a god. What should be done?",
    left: { label: "Hunt them down", fx: { s: 10, p: -10 }, result: "Arrests begin." },
    right: { label: "Don't seek them out", fx: { p: 5, s: -10 }, result: "Punish only those formally accused." },
    history: "Around 112 AD, Pliny the Younger asked Trajan how to treat Christians. Trajan replied that they should not be hunted, but that those who were denounced and refused to sacrifice should be punished.",
  },
  {
    who: "Treasurer",
    text: "The army wants pay, and the vaults are thin. We could mix cheaper metal into the silver coins.",
    left: { label: "Debase the coinage", fx: { t: 15, a: 5, p: -10 }, result: "There's more money, but it buys less." },
    right: { label: "Keep the silver pure", fx: { t: -10, a: -10 }, result: "The soldiers grumble." },
    history: "Emperors from Nero onward slowly debased the silver denarius. By the mid-3rd century, coins had almost no silver left, and prices soared out of control.",
  },
  {
    who: "Physician",
    text: "A deadly plague has arrived with soldiers returning from the East.",
    left: { label: "Fund relief for the cities", fx: { p: 10, t: -15 }, result: "Wagons of grain and medicine roll out." },
    right: { label: "Carry on the war", fx: { a: 5, p: -15 }, result: "The dying pile up in the streets." },
    history: "The Antonine Plague (165 AD onward), probably smallpox, killed a large share of the population, perhaps millions. It struck under Marcus Aurelius, who wrote his Meditations on campaign.",
  },
  {
    who: "Architect",
    text: "Build a great domed temple to all the gods?",
    left: { label: "Build it", fx: { p: 10, s: 5, t: -15 }, result: "A magnificent dome rises over the Campus Martius." },
    right: { label: "Save the money", fx: { t: 10, p: -5 }, result: "The site remains empty." },
    history: "The Pantheon was rebuilt by Hadrian around 126 AD. Its unreinforced concrete dome, 43 metres across, was the largest in the world until the 15th century.",
  },
  {
    who: "General",
    text: "Should Rome keep expanding eastward, or fortify the borders?",
    left: { label: "Fortify the frontier", fx: { t: -10, a: 10 }, result: "Forts and walls appear along the border." },
    right: { label: "Keep conquering", fx: { a: 5, t: -15, s: -5 }, result: "Overstretched legions push on." },
    history: "Hadrian gave up Trajan's newest eastern conquests and built Hadrian's Wall in Britain from 122 AD. Trajan had taken the empire to its largest size, around 117 AD, and Hadrian chose to secure it instead.",
  },
  {
    who: "Praetorian Prefect",
    text: "The Guard demands a bonus for having put you on the throne.",
    left: { label: "Pay them", fx: { a: 15, t: -15 }, result: "The Guard shouts your name." },
    right: { label: "Refuse", fx: { a: -20 }, result: "Your bodyguard looks at you coldly." },
    history: "After Claudius was hauled from behind a curtain and proclaimed emperor in 41 AD, he paid each guardsman a huge sum. In 193 AD the Guard went further and sold the throne outright to Didius Julianus.",
  },
  {
    who: "Victorious General",
    text: "A popular commander returns from a triumphant campaign. He wants a triumph.",
    left: { label: "Grant it", fx: { a: 10, p: 10, s: -10 }, result: "He parades through Rome to cheers." },
    right: { label: "Deny it", fx: { s: 10, a: -15 }, result: "He goes home resentful." },
    history: "Under Augustus, triumphs became a monopoly of the imperial family. Emperors feared that a general with a big parade and loyal legions might start thinking of the throne.",
  },
  {
    who: "Advisor",
    text: "The empire is too large for one man to run.",
    left: { label: "Share power with a co-ruler", fx: { a: 10, s: -10, t: -5 }, result: "Two rulers, twice the bureaucracy." },
    right: { label: "Rule alone", fx: { a: -10, t: 5 }, result: "Everything lands on your desk." },
    history: "In 293 AD Diocletian created the Tetrarchy, four rulers sharing the empire: two senior Augusti and two junior Caesares. It calmed the empire for a while but collapsed into civil war after he retired.",
  },
  {
    who: "Merchant",
    text: "Prices are out of control. Merchants are hoarding.",
    left: { label: "Fix maximum prices", fx: { p: 10, t: -5, s: -5 }, result: "Prices are fixed by law." },
    right: { label: "Trust the market", fx: { p: -10, t: 5 }, result: "Prices keep climbing." },
    history: "Diocletian's Edict on Maximum Prices (301 AD) set price caps on over a thousand goods, with death as the penalty for breaking it. It failed, and goods simply vanished into the black market.",
  },
  {
    who: "Dream-Seer",
    text: "On the eve of a great battle, your priests urge you to trust an unfamiliar god.",
    left: { label: "Follow the new god", fx: { p: 10, a: 5, s: -10 }, result: "You paint a strange symbol on your soldiers' shields." },
    right: { label: "Sacrifice to the old gods", fx: { s: 10, p: -10 }, result: "The senators nod in approval." },
    history: "Before the Battle of the Milvian Bridge (312 AD), Constantine is said to have seen a sign and had it painted on his soldiers' shields. After winning, he ended persecution with the Edict of Milan in 313.",
  },
  {
    who: "Slave Overseer",
    text: "A band of escaped gladiators has taken Mount Vesuvius, and more slaves flock to them.",
    left: { label: "Send the legions", fx: { a: 10, t: -10, s: 5 }, result: "Legions trap the rebels." },
    right: { label: "Ignore them", fx: { s: -10, p: -10 }, result: "The rebels raid the countryside." },
    history: "Spartacus led a slave revolt from 73 to 71 BC and defeated several Roman armies. Crassus crushed it, and 6,000 captives were crucified along the Appian Way.",
  },
  {
    who: "Tax Collector",
    text: "The provinces are wealthy, and your empty coffers need filling.",
    left: { label: "Raise provincial taxes", fx: { t: 15, p: -10 }, result: "Tax collectors fan out." },
    right: { label: "Keep them light", fx: { t: -5, p: 5 }, result: "The provinces stay quiet." },
    history: "Augustus ordered censuses across the empire to count taxpayers. Tax collectors (publicani) had a terrible reputation, since under the Republic they bid to collect taxes for profit.",
  },
  {
    who: "Urban Prefect",
    text: "Rome is a poor place to rule from. Found a great new city in the East?",
    left: { label: "Build a new capital", fx: { t: -20, a: 5, s: -10, p: -5 }, result: "Construction begins at Byzantium." },
    right: { label: "Stay in Rome", fx: { s: 5, t: 5 }, result: "Rome remains the capital." },
    history: "Constantine dedicated Constantinople in 330 AD. It stayed capital of the Eastern Empire for over a thousand years, long after the Western half fell.",
  },
  {
    who: "Jurist",
    text: "Should all free provincials be made Roman citizens?",
    left: { label: "Yes, extend citizenship", fx: { p: 10, s: -10, t: 10 }, result: "Millions of new citizens." },
    right: { label: "No, keep it exclusive", fx: { s: 10, p: -5 }, result: "The old elites are relieved." },
    history: "Caracalla's edict of 212 AD made nearly all free inhabitants citizens. It probably also widened the tax base, since citizens paid inheritance and other taxes.",
  },
  {
    who: "Danube Legate",
    text: "Thousands of Goths, fleeing the Huns, beg to settle inside the empire.",
    left: { label: "Let them in", fx: { a: 10, t: -10, p: -5 }, result: "Tens of thousands cross the river." },
    right: { label: "Turn them away", fx: { a: -5, p: 5 }, result: "They camp on the far bank." },
    history: "In 376 AD the Goths were allowed to cross the Danube, but were treated so badly that they rebelled. At Adrianople in 378 AD they annihilated an eastern Roman army and killed Emperor Valens.",
  },
  {
    who: "Engineer",
    text: "A network of paved roads could connect every corner of the empire.",
    left: { label: "Build the roads", fx: { t: -10, a: 5, p: 5 }, result: "Legions march on new stone highways." },
    right: { label: "Not now", fx: { t: 5, a: -5 }, result: "The empire relies on old tracks." },
    history: "Rome eventually built some 80,000 km of major paved roads. Roads made troop movements, trade and the imperial post system possible, and many are still used today.",
  },
  {
    who: "Admiral",
    text: "Pirates are choking Mediterranean shipping and starving Rome of grain.",
    left: { label: "Give one general sweeping powers", fx: { a: 10, s: -15, p: 10 }, result: "One man commands every fleet." },
    right: { label: "Raise a regular fleet", fx: { t: -15, p: 5, s: 5 }, result: "Shipyards hum for months." },
    history: "In 67 BC Pompey was given extraordinary command against the pirates and cleared the Mediterranean in about three months. Critics feared such powers were dangerous for the Republic, and they were right.",
  },
  {
    who: "Prefect of Campania",
    text: "Vesuvius has erupted. Pompeii and Herculaneum lie under ash.",
    left: { label: "Send aid to survivors", fx: { p: 10, t: -10 }, result: "Wealth is sent south for rebuilding." },
    right: { label: "Leave them to it", fx: { t: 5, p: -10 }, result: "Survivors are left to fend for themselves." },
    history: "In 79 AD, Titus set up a commission to aid survivors and even gave his own property. Rome had also suffered a great fire the year after, and he helped there too.",
  },
  {
    who: "Aqueduct Curator",
    text: "Rome's population has passed a million. Clean water is running short.",
    left: { label: "Build new aqueducts", fx: { t: -10, p: 10 }, result: "Arches march across the countryside." },
    right: { label: "Ration the water", fx: { t: 5, p: -10 }, result: "Public fountains run dry." },
    history: "Eleven aqueducts supplied ancient Rome with perhaps a million cubic metres of water a day, feeding baths, fountains and latrines. Frontinus, water commissioner in 97 AD, wrote a book on them.",
  },
];
