"use strict";
// The sights of Beijing. Coordinates are metres around the middle of Tiananmen Square (BEIJING_X in the game's world, far east of Cancún): x = east, z = south, so the
// Forbidden City is up the page (north) behind the Gate of Heavenly Peace and the Temple of Heaven is south. Not to scale: the Summer Palace and the Great Wall are really
// 15 km and 70 km out, and are brought in close here. `only` limits a place to one era ("ancient" = the Ming capital c. 1420, "modern" = today). `r` is the discovery radius;
// `stand` is where "Go there" drops you. Loaded before delhi-data.js, which adds these to ALL_LANDMARKS.

const BEIJING_X = 18000;
const bj = (o) => ({ ...o, x: BEIJING_X + o.x, stand: [BEIJING_X + o.stand[0], o.stand[1]] });

const BEIJING_LANDMARKS = [
  bj({
    id: "b-home", home: true, name: "Your House", sub: "Your courtyard house in the hutong",
    x: -250, z: 85, r: 14, stand: [-250, 100],
    text: "A small grey-brick courtyard house, a siheyuan, in a quiet lane west of the great square. Four low rooms stand round a little yard with a date tree. Your bed is in the north room. When night falls, come home and press Z to sleep until morning.",
    fact: "In a siheyuan the family's rooms face inwards onto the yard, so the street side is a plain wall: all the life of the house is hidden from the lane.",
  }),
  bj({
    id: "b-tiananmen", name: "Tiananmen, the Gate of Heavenly Peace", sub: "The great red gate of the Imperial City · built 1420",
    x: 0, z: -62, r: 62, stand: [0, 0],
    text: "A huge red gate with a double roof of golden tiles, standing on a white marble terrace with five arched doorways. Beyond it lies the Imperial City, and behind that the Forbidden City itself. Edicts of the emperor were lowered from the gate in a gilded phoenix.",
    fact: "Tiananmen means \"Gate of Heavenly Peace\". The middle doorway was for the emperor alone: everyone else went in by the side doors.",
    modern: "Today a huge portrait of Mao Zedong hangs above the central door. In 1949 he proclaimed the People's Republic of China from this gate.",
  }),
  bj({
    id: "b-meridian", name: "The Meridian Gate", sub: "The front gate of the Forbidden City",
    x: 0, z: -168, r: 50, stand: [0, -120],
    text: "The grandest gate of the palace is shaped like a horseshoe: two wings reach forward from a tall central tower, so that anyone in the courtyard is surrounded on three sides. A drum and a bell sounded when the emperor passed through.",
    fact: "Armies came back here to present their prisoners to the emperor after a victory. The Meridian Gate is also called the Wu Men, the Noon Gate.",
  }),
  bj({
    id: "b-harmony", name: "Hall of Supreme Harmony", sub: "The throne hall of the Forbidden City",
    x: 0, z: -290, r: 60, stand: [0, -232],
    text: "On a three-tier marble terrace, carved with dragons, stands the largest wooden hall in China, with a double roof of yellow tiles, the imperial colour. Inside, the Dragon Throne stands on a platform under a golden ceiling. Emperors were crowned and received the world here.",
    fact: "The Forbidden City was built between 1406 and 1420 by up to a million workers. Twenty-four emperors of the Ming and Qing dynasties lived in it over 500 years. Common people could not enter, which is how it got its name.",
  }),
  bj({
    id: "b-jingshan", name: "Jingshan Hill", sub: "The Coal Hill behind the palace",
    x: 0, z: -660, r: 80, stand: [0, -575],
    text: "A hill 45 metres high, made from the earth dug out of the palace moat, with five pavilions on its summit. From the top you can look back over every golden roof of the Forbidden City, and to the north see the Drum Tower and the Bell Tower.",
    fact: "In 1644 the last Ming emperor, Chongzhen, hanged himself from a tree on this hill as rebel armies took Beijing.",
  }),
  bj({
    id: "b-heaven", name: "Temple of Heaven", sub: "Where the emperor prayed for the harvest · 1420",
    x: 0, z: 560, r: 80, stand: [0, 470],
    text: "At the middle of a park of old cypresses stands a round temple with a triple roof of deep blue tiles, set on three marble terraces. Round is the shape of heaven; the square of the earth is the park around it. Each year the emperor came here, fasted, and prayed to Heaven for a good harvest.",
    fact: "The Hall of Prayer for Good Harvests is 38 metres tall and has no nails: it is held together by wooden joints and four great pillars for the four seasons.",
  }),
  bj({
    id: "b-drum", name: "The Drum Tower", sub: "The city's clock · 1272, rebuilt 1420",
    x: 0, z: -800, r: 40, stand: [0, -765],
    text: "A tall tower of red walls and a grey tiled roof. Inside stood 24 great drums. They beat the night watches, a drum for each of the double-hours, so the whole city knew the time.",
    fact: "Before clocks, a city needed a great drum and a great bell to tell the people the time. The Drum Tower and the Bell Tower stand one behind the other on the north end of the central axis.",
  }),
  bj({
    id: "b-bell", name: "The Bell Tower", sub: "The great bell of Beijing",
    x: 0, z: -865, r: 36, stand: [0, -830],
    text: "A stone-built tower with a roof of grey tiles. High inside hangs a bronze bell weighing 42 tonnes. Its deep note, rung at the end of each night watch, could be heard over the whole city.",
    fact: "The bell's note was said to carry 20 kilometres. It rang 108 times each night, the number of strokes in many old Buddhist and Chinese customs.",
  }),
  bj({
    id: "b-hutong", name: "The Hutongs", sub: "Lanes of grey courtyard houses",
    x: -280, z: -320, r: 70, stand: [-280, -250],
    text: "Narrow lanes run between rows of grey-brick courtyard houses, each with its gate, its yard and its tree. People chat on doorsteps, play chess on little tables and push bicycles through the lanes. Roof tiles are the same grey as the walls.",
    fact: "The word hutong probably comes from a Mongol word for a well. The lanes can be as narrow as 40 centimetres, and some are only 9 metres long.",
  }),
  bj({
    id: "b-summer", name: "The Summer Palace", sub: "The emperor's lakeside garden",
    x: -760, z: -880, r: 90, stand: [-700, -780],
    text: "A palace of pavilions, covered walks and gardens on the shore of a lake, below a hill topped by a tall tower. The long covered corridor has thousands of painted scenes under its beams. Qing emperors came here to escape the summer heat of the city.",
    fact: "The Empress Dowager Cixi rebuilt the palace in the 1890s. The Marble Boat on the shore was built with money meant for the navy.",
  }),
  bj({
    id: "b-lake", name: "Kunming Lake", sub: "A lake dug by hand",
    x: -700, z: -740, r: 100, stand: [-700, -690],
    text: "A wide lake of calm green water, with willows along its banks and little islands with pavilions. In summer, boats of every kind row over it, and in winter the lake freezes and people skate. Dragon boats race here at the Dragon Boat Festival.",
    fact: "Kunming Lake was dug out by hand, and the earth piled up to make Longevity Hill. About three-quarters of the Summer Palace is water.",
  }),
  bj({
    id: "b-bridge", name: "The Seventeen-Arch Bridge", sub: "A stone bridge to the island",
    x: -520, z: -760, r: 50, stand: [-480, -760],
    text: "A long stone bridge of seventeen arches crosses the lake to the Dragon King Temple island. Each of the 544 balusters is carved with a different lion, and at sunset the arches turn gold.",
    fact: "Once a year, at the winter solstice, the sun shines through all seventeen arches in line.",
  }),
  bj({
    id: "b-wall", name: "The Great Wall at Badaling", sub: "The Ming wall north of the city",
    x: 80, z: -1140, r: 110, stand: [80, -1060],
    text: "A wall of grey stone and brick climbs the ridges of the mountains in both directions, as far as you can see, with a watchtower every few hundred metres. The path along the top is wide enough for five horses side by side, and the steps are steep.",
    fact: "The Great Wall is not one wall but many, built over 2,000 years: the long Ming wall alone is about 8,800 kilometres. The tale that it can be seen from space is not true.",
  }),
  bj({
    id: "b-square", only: "modern", name: "Tiananmen Square", sub: "The largest city square in the world",
    x: 0, z: 110, r: 100, stand: [0, 70],
    text: "A vast open square of grey paving, 880 metres long, with the Monument to the People's Heroes in the middle and the great halls of government down its sides. On national days the square fills with people and flags.",
    fact: "The square can hold about half a million people. It was created in the 1950s by clearing away old streets and walls: in Ming days it was a walled, narrow court.",
  }),
  bj({
    id: "b-cbd", only: "modern", name: "The CBD towers", sub: "Skyscrapers of the new Beijing",
    x: 560, z: 250, r: 110, stand: [470, 250],
    text: "East of the old city rise glass skyscrapers, among them the 528-metre China Zun tower, shaped like a ceremonial wine vessel. Offices, hotels and shopping malls fill the towers, and ten-lane roads run between them.",
    fact: "Beijing grew from about 2 million people in 1950 to over 21 million today.",
  }),
  bj({
    id: "b-xiangqi", game: true, name: "The Xiangqi Pavilion", sub: "Chinese chess under a little blue roof",
    x: -170, z: 215, r: 14, stand: [-170, 232],
    text: "A stone table with a board carved on it, two stools and a small pavilion roof. Press F to play xiangqi, Chinese chess, against a practice bot, or use Play online in the PvP menu to play a real person. A general sits in a palace at each end of the board, and a river runs across the middle.",
    fact: "Xiangqi is more than a thousand years old and is played by hundreds of millions of people. In the hutongs and parks of Beijing you can still see old men playing it on little tables, with a crowd watching and advising.",
  }),
  bj({
    id: "b-market", game: true, name: "The Market", sub: "Food, clothes, rides, a builder and a healer",
    x: 250, z: 110, r: 26, stand: [250, 88],
    text: "A paved square east of the great square with a well in the middle and five stalls along its south side: a food stall, a clothier, animals and rides, a builder and a healer. Walk up to a stall and press F to buy.",
    fact: "In Ming Beijing, every trade had its own street: you went to one lane for tea, another for silk, another for paper, and so on.",
  }),
];
