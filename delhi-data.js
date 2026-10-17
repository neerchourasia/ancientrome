"use strict";
// The sights of Old Delhi (Shahjahanabad), Shah Jahan's walled capital, c. 1650. Coordinates are metres around the
// Lahori Gate of the Red Fort, which stands at DELHI_X (far east of Rome in the game's world): x = east, z = south.
// `only` limits a place to one era ("modern": it does not exist in Shah Jahan's day). `r` is the discovery radius;
// `stand` is where "Go there" drops you.

const ROME_LANDMARKS = LANDMARKS.slice(); // game.js swaps the live LANDMARKS list between the cities
const DELHI_X = 6000;
const dl = (o) => ({ ...o, x: DELHI_X + o.x, stand: [DELHI_X + o.stand[0], o.stand[1]] });

const DELHI_LANDMARKS = [
  dl({
    id: "d-haveli", home: true, name: "Your House", sub: "Your plot off Chandni Chowk",
    x: -100, z: -50, r: 22, stand: [-100, -8],
    text: "A walled plot just north of Chandni Chowk. You start with a small one-room house; as you earn denarii, the Market sells you a bigger house, then a grand haveli and finally a mahal with a tower. Come home after dark and press Z in your bedroom to sleep until morning.",
    fact: "The French doctor François Bernier, who lived in Delhi in the 1660s, described good houses with courtyards, gardens, trees, basins of water and cool cellars with large fans.",
  }),
  dl({
    id: "d-lahori", name: "Lahori Gate", sub: "Main gate of the Red Fort (Lal Qila) · c. 1648",
    x: 0, z: 0, r: 40, stand: [-34, 0],
    text: "The great western gate of Shah Jahan's fortress-palace, named for the road to Lahore. It is flanked by octagonal towers, and Chandni Chowk runs straight away from it to the west. The fort was begun in 1638-39 and finished around 1648; its architect is said to be Ustad Ahmad Lahori, who also worked on the Taj Mahal.",
    fact: "Later, Aurangzeb added a curved bastion in front of this gate, which hid it from the street. Shah Jahan's original view straight down Chandni Chowk was lost.",
    modern: "Since 1947 the Prime Minister raises the national flag above this gate every Independence Day. After the 1857 uprising, the British demolished many of the fort's pavilions and used it as a barracks.",
  }),
  dl({
    id: "d-chhatta", name: "Chhatta Chowk and the Naubat Khana", sub: "The covered arcade and the drum house",
    x: 45, z: 0, r: 42, stand: [16, 0],
    text: "Inside the Lahori Gate a vaulted arcade of shops, Chhatta Chowk, sold silks, jewels and fine goods to the court. At its end stands the Naubat Khana, the drum house, where musicians played to announce the emperor and important visitors.",
    fact: "The fort is called the Red Fort, Lal Qila, after the red sandstone of its walls.",
    modern: "The arcade still sells souvenirs to visitors, and the drum house now holds a museum.",
  }),
  dl({
    id: "d-diwanaam", name: "Diwan-i-Aam", sub: "Hall of Public Audience",
    x: 158, z: 0, r: 46, stand: [112, 0],
    text: "A long hall of red sandstone columns where the emperor sat in a marble alcove, high above the courtyard, to hear petitions, give justice and receive visitors.",
    fact: "Mughal emperors showed themselves to the people every day, a custom called jharokha darshan, so that subjects could see for themselves that the emperor was alive and well.",
    modern: "The marble throne alcove still stands at the back of the hall.",
  }),
  dl({
    id: "d-diwankhas", name: "Diwan-i-Khas", sub: "Hall of Private Audience · white marble",
    x: 280, z: -88, r: 32, stand: [250, -88],
    text: "The most precious building of the palace: a pavilion of white marble, once carved, gilded and inlaid with coloured stones. Here the emperor met his ministers and favoured nobles, and the jewelled Peacock Throne stood here.",
    fact: "The Peacock Throne was carried off to Persia by Nadir Shah in 1739. A verse said to be inscribed here claims: if there is a paradise on earth, it is this.",
    modern: "The marble hall still stands.",
  }),
  dl({
    id: "d-rangmahal", name: "Rang Mahal and the Stream of Paradise", sub: "The Palace of Colours · Nahr-i-Bihisht",
    x: 280, z: 28, r: 38, stand: [252, 28],
    text: "The Rang Mahal, the Palace of Colours, was home to the emperor's wives and was brightly painted and decorated with mirror mosaic. A narrow canal, the Nahr-i-Bihisht or Stream of Paradise, flowed through the riverside pavilions, cooling them in the summer heat.",
    fact: "Another canal, also fed with water from the Yamuna, ran down the middle of Chandni Chowk.",
    modern: "The canal channel is dry today.",
  }),
  dl({
    id: "d-burj", name: "Muthamman Burj", sub: "The octagonal tower over the river",
    x: 296, z: -30, r: 26, stand: [268, -30],
    text: "An eight-sided tower attached to the emperor's apartment, the Khas Mahal. From its balcony, high on the fort's river wall, the emperor appeared before crowds who gathered on the bank of the Yamuna below.",
    fact: "Watching the emperor appear at this window was part of daily life for Delhi's people.",
    modern: "The Yamuna has moved away, and the riverbank below is now a road and parkland.",
  }),
  dl({
    id: "d-chandni", name: "Chandni Chowk", sub: "The Moonlight Square · laid out c. 1650",
    x: -310, z: 0, r: 70, stand: [-262, 0],
    text: "Shah Jahan's daughter Jahanara Begum had this great avenue laid out, running west from the Lahori Gate for about 1.5 km. A shallow canal from the Yamuna ran down its middle and widened into a pool that mirrored the moonlight, which gave the place its name. It was divided into bazaars, among them Urdu Bazaar near the fort, Johri Bazaar (the jewellers) and Fatehpuri Bazaar.",
    fact: "Sayyid Ahmad Khan wrote that in the evenings princes and nobles came here to stroll and be entertained.",
    modern: "The canal is long gone (trams ran along its line from 1911). Since a redevelopment finished around 2021 the street has been mostly pedestrian, shared with cycle rickshaws.",
  }),
  dl({
    id: "d-serai", name: "Begum ki Serai", sub: "Jahanara's grand caravanserai",
    x: -240, z: -62, r: 48, stand: [-240, -14],
    text: "A two-storey inn built around a courtyard, with about ninety rooms, for merchants and travellers from across Asia. Princess Jahanara paid for it. Bernier admired the great caravanserai of Delhi, where rich Persian, Uzbek and other foreign merchants stayed.",
    fact: "Jahanara also built a hammam nearby. She is credited with planning Chandni Chowk and Urdu Bazaar.",
    modern: "The caravanserai was pulled down in the 1860s and replaced by the British-built Town Hall.",
  }),
  dl({
    id: "d-katra", name: "Katra Neel", sub: "The market of the indigo dyers",
    x: -420, z: -24, r: 30, stand: [-420, -10],
    text: "A katra is a walled market lane where traders of one kind both lived and worked. This one belonged to the indigo dyers, Their trade gave the lane its name: neel means indigo.",
    fact: "Many katras still give their names to Old Delhi's lanes and markets, which is how you can trace the old trades.",
  }),
  dl({
    id: "d-fatehpuri", name: "Fatehpuri Masjid", sub: "The mosque at the end of Chandni Chowk",
    x: -660, z: 0, r: 60, stand: [-594, 0],
    text: "A red sandstone mosque with a single great dome that closes the western end of Chandni Chowk, built by one of Shah Jahan's wives, Fatehpuri Begum. Standing at the Lahori Gate and looking down the street, this mosque is the end of the view.",
    fact: "Some accounts credit different builders for it, so its exact history is told in more than one way.",
    modern: "Chandni Chowk's busy wholesale markets stretch around it.",
  }),
  dl({
    id: "d-jama", name: "Jama Masjid", sub: "Masjid-i Jahan Numa · built 1650-56",
    x: -240, z: 270, r: 95, stand: [-138, 270],
    text: "Shah Jahan's last great building, and India's largest mosque. It stands on a rocky rise so that it towers over the city, reached by tall flights of steps. Its courtyard, about a hundred metres across, could hold some 25,000 worshippers. Three white marble domes and two 40-metre minarets of red sandstone and white marble crown it.",
    fact: "Its name means the mosque that shows the world. From the top of the steps you can see across all of Shahjahanabad.",
    modern: "It is still a working mosque. Visitors climb the same steps and look out over the markets.",
  }),
  dl({
    id: "d-indiagate", only: "modern", name: "India Gate", sub: "War memorial · completed 1931",
    x: -100, z: 900, r: 70, stand: [-165, 900],
    text: "A 42-metre arch of sandstone on a granite base, at the eastern end of New Delhi's great ceremonial avenue. It was designed by Edwin Lutyens and finished in 1931, as a memorial to the Indian soldiers who died in the First World War and the Third Anglo-Afghan War. The names of more than 13,000 of them are carved into its walls.",
    fact: "It is often compared with the Arc de Triomphe in Paris. An eternal flame burned under the arch from 1972, until it was merged with the flame at the nearby National War Memorial in 2022.",
  }),
  dl({
    id: "d-kartavya", only: "modern", name: "Kartavya Path", sub: "The ceremonial avenue, once Rajpath",
    x: -280, z: 900, r: 60, stand: [-300, 900],
    text: "The great ceremonial avenue of New Delhi, between long canals and wide lawns. It was called Kingsway and then Rajpath, and in 2022 it was renamed Kartavya Path, the Path of Duty. The Republic Day parade marches along it every 26 January.",
    fact: "When Shah Jahan built his capital this ground was open country. New Delhi was laid out here only after 1911.",
  }),
  dl({
    id: "d-metro", only: "modern", name: "Chandni Chowk Metro Station", sub: "Yellow Line · opened 2005",
    x: -212, z: 30, r: 22, stand: [-212, 12],
    text: "An underground station of the Delhi Metro, near the Red Fort, opened on 3 July 2005. A tunnel links it to Delhi Junction railway station. It carries visitors to Old Delhi far faster than the street ever could.",
    fact: "The station is underground, with a single island platform between the tracks.",
  }),

  // the places for the games (press F there to play; they are on the map and in Directions, but are not sights to discover)
  dl({
    id: "g-akhara", game: true, name: "The Akhara", sub: "Kushti wrestling pit",
    x: -45, z: 35, r: 12, stand: [-45, 20],
    text: "A mud pit on the open square before the Lahori Gate. Press F to wrestle in the Indian style, kushti: take hold of your rival and fight for the throw.",
    fact: "Kushti is practised in an akhara, a training ground with a pit of soft earth. Wrestlers train there from early morning.",
  }),
  dl({
    id: "g-race", game: true, name: "The Race Start", sub: "Chandni Chowk race",
    x: -572, z: 0, r: 18, stand: [-558, 0],
    text: "The start arch at the Fatehpuri Masjid end of Chandni Chowk. Press F to race down the avenue to the finish arch at the Lahori Gate, on a rickshaw or an elephant.",
    fact: "The avenue ran about 1.5 kilometres from the Lahori Gate of the Red Fort to the Fatehpuri Masjid.",
  }),
  dl({
    id: "g-cannon", game: true, name: "The Cannon", sub: "On the Red Fort rampart",
    x: 4, z: 45, r: 10, stand: [4, 38],
    text: "A cannon on top of the Red Fort's west wall, next to the Lahori Gate. Climb the long ramp inside the wall, then press F to man it and defend the gate from raiders.",
    fact: "The fort's red sandstone walls rise about 18 metres on the river side and 33 metres on the city side.",
  }),
  dl({
    id: "g-kites", game: true, name: "The Kite Stall", sub: "Kite fights",
    x: -18, z: -42, r: 9, stand: [-18, -32],
    text: "A stall selling paper kites on the open square. Press F to fly one and try to cut the strings of the other kites.",
    fact: "Kite flying, patangbazi, is a long Old Delhi tradition, and the sky fills with kites around Independence Day.",
  }),
  dl({
    id: "g-pachisi", game: true, name: "The Pachisi Pavilion", sub: "A board game of cowrie shells",
    x: 112, z: -45, r: 10, stand: [112, -33],
    text: "A pavilion in the Red Fort courtyard with the painted cloth of pachisi laid out. Press F to play against a rival.",
    fact: "Pachisi is an ancient Indian game played with cowrie shells and pawns. It is said that the Mughal emperor Akbar once played it with living pieces on a courtyard board at Fatehpur Sikri.",
  }),
  dl({
    id: "g-bazaar", game: true, name: "The Bazaar Stall", sub: "A trading game",
    x: -352, z: -12, r: 9, stand: [-352, -3],
    text: "A trader's stall beside the pool on Chandni Chowk. Press F to buy goods where they are cheap and sell them where they are dear.",
    fact: "Chandni Chowk was divided into bazaars, among them Urdu Bazaar near the fort, Johri Bazaar (the jewellers) and Fatehpuri Bazaar.",
  }),
  dl({
    id: "g-market", game: true, name: "The Market", sub: "Food, clothes, rides, houses and a healer",
    x: -50, z: 60, r: 26, stand: [-50, 40],
    text: "A market square before the Lahori Gate with a well in the middle and five stalls along its south side: a food stall, a clothier, animals and rides, a builder and a healer. Walk up to a stall and press F to shop.",
    fact: "Old Delhi's bazaars each had their own trade, and the sweetmeat and cloth sellers of Chandni Chowk were famous across India.",
  }),
  dl({
    id: "g-chaat", game: true, name: "The Chaat Stall", sub: "A food delivery run",
    x: -215, z: 13, r: 8, stand: [-215, 5],
    text: "A street food stall on Chandni Chowk. Press F to take a tray of hot chaat and deliver it to three customers before it goes cold.",
    fact: "Chandni Chowk is famous for its street food, and the area has long been known for its old food shops.",
  }),
];

const ALL_LANDMARKS = [...LANDMARKS, ...DELHI_LANDMARKS];
