# Walk Ancient Rome

A walkable 3D Ancient Rome, seen at street level, as it stood around 128 AD under Hadrian. Explore it like Street View, discover 16 landmarks and read the history behind each one.

Built with plain HTML/JS and [Three.js](https://threejs.org) (loaded from a CDN). No build step, no install.

## Play

Serve the folder and open it in a browser:

```bash
ruby -run -e httpd . -p 8123
# or: python3 -m http.server 8123
```

Then visit http://localhost:8123. Because it is static, it also works on GitHub Pages as-is.

## Controls

| Action | Keys |
| --- | --- |
| Walk / strafe | Arrow keys or `W` `A` `S` `D` |
| Run | `Shift` |
| Look | Drag the mouse (double-click to lock the mouse) |
| Turn | `Q` `E` |
| Map (click to teleport) | `M` |
| List of places | `P` |
| Time of day | `T` |
| Fight (in the Colosseum arena) | `F` to start. `Space` or click attacks, hold `Shift` or right-click blocks, `WASD` moves, `Esc` leaves |
| Animal hunt (in the arena) | `U`. Bow and arrows: hold `Space` or the mouse to draw, release to shoot, `Shift` dodge roll, `WASD` move |
| Lion (in the arena) | `L`. A lion on its own, hunted with the bow (same controls as the animal hunt) |
| Naval battle (in the arena) | `N`. The arena floods and you command a galley. `W` `S` sail, `A` `D` steer, `Q` / `E` fire port / starboard cannons, `Space` or click fires at the nearest enemy |
| Watch (Colosseum or Circus stands) | `V` to start or stop. In the Colosseum it shows the day's programme: `N` skips to the next act, `1`-`5` picks one. `C` switches to a cinematic camera, `WASD` lets you walk around the stands |
| Race (on the Circus Maximus track) | `R` to start. `W` gas, `S` brake, `A` `D` steer (hold `Shift` for fine steering), `Q` `E` hop a lane, `1`-`9` speed level (1 slowest, 9 gallop), `Space` whip, `X` cruise control, `C` cycle camera, hold `B` to look back, `Esc` leaves |

## What you can do

- Walk the Via Sacra through the Forum, up the steps of the temples, and into the Colosseum (climb the seats) and the Pantheon
- Discover landmarks by walking near them. Progress is saved in your browser
- Jump anywhere from the map or the Places list
- **Directions:** click the big yellow **Directions** button (or press `G`) and pick a place. You get a walking route around the buildings, drawn on the minimap and map, gold markers on the ground, a light beam at the destination and a card with the distance, walking time and turn-by-turn text. `G` also opens the panel; there is a "nearest place I haven't seen" shortcut. Click a pin on the map for directions too
- **Sound:** everything is synthesised, no audio files. Places make sound you can hear from a distance (the crowds of the Colosseum and the Circus, market chatter in the Forum, birds and wind on the hills, water in the naval battle). It gets louder as you approach, pans to the side it comes from and is muffled when it is behind you. Footsteps change with the ground, and there are effects for swords, roars, cannons, hooves and more. `O` turns sound on and off
- **Crashes:** run into a building, a wall or a column and you crash: the screen flashes and shakes, you stagger, you are knocked back a step and you lose some health (more if you were running). Run into a citizen and you knock them over. The Circus Maximus has a podium wall between the track and the seats (use the stair entrances to climb up) and a tall wall behind the stands, so running into them hurts too. Walking into things is only a gentle bump. **Days and nights:** a day lasts 20 minutes (50 seconds per hour) with a real sunrise, sunset, moon and stars; the clock is at the top. After dark, go to Your House (near the Colosseum road, in Places and Directions), step inside and press Z to sleep: you wake at dawn fully healed and the horses gain a little. Stay awake until 4 am and you collapse, wake in your bed and lose 15 denarii. T skips ahead in the day, but not through the night (it stops at 4 am and you collapse); from 10:30 pm the clock warns you that you are sleepy. **Camera:** you start in a close third-person view so you can see your own character walk around. Press C to cycle the views (close behind, far behind, side, front, bird's-eye, first person; Shift+C goes back) and scroll the mouse wheel to zoom; your choice is remembered. **Walking speed:** keys 1-9 set how fast you walk (1 slow stroll, 4 normal, 9 sprint); Shift still runs. **Scraping:** grinding along the side of a house or wall slows you down and drains health for as long as you keep scraping (faster = more damage), so step away from it
- **Voice:** a narrator reads captions aloud using your browser's built-in text-to-speech (nothing is downloaded or sent anywhere): the subtitles of the Colosseum shows, the history card of each landmark you reach, the result screens and the turn-by-turn directions. Press `J` or the Voice button to turn it on or off
- **Rest and heal:** you can't play forever. Your health and your racing horses' stamina carry over between games and recover slowly on their own whenever you are not in a game (about 3.5 minutes to get from 20 to full health just by walking around). Press `Z` to sit and rest (move to stand up): that is about four times faster, and the horses only recover quickly at the Circus stables. Fights, hunts and naval battles need health 35 or more, and races need rested horses.
- **Stakes:** you start with 100 denarii. Races cost 20 to enter and pay 100 for 1st and 40 for 2nd. Beating opponents in the arena and the naval battle earns purses. A defeat costs you money and leaves you badly wounded, so it really is possible to lose. Everything is saved in your browser
- Switch between morning, midday and sunset
- **Fight as a gladiator:** stand in the Colosseum arena and press `F` for a three-round duel against a Murmillo, a Thraex and a Champion. Watch for the glow and raised arm that warn of a strike, block it, or step out of range. Stamina limits how often you can swing
- **Race a chariot:** stand on the Circus Maximus track and press `R` for a three-lap race against the Blues, Reds and Whites. You choose one of nine speed levels with the number keys `1`-`9` and must manage the horses' stamina: the top levels tire them, and exhausted horses can only manage a fast trot until they recover. Corners limit your speed, and wide lanes let you carry more of it. The rivals' horses get tired too: they gallop while fresh, slow down as they wear out and ease off to recover (the standings list shows "(resting)"), so a steady pace beats a burst of speed. The rivals are tougher than they look: they pick good lanes and two out of three will cut across to block you, the tightest inside lane is slow, and if a rival crosses the line first the race is over and you lose. Collisions cost you: bumping another chariot (or scraping the spina or the stands) knocks your speed down and slows the horses for a couple of seconds. Hop between lanes with `Q` and `E`, use the whip for short bursts, and switch between four camera views (chase, high, driver, overhead)
- **Lion hunt:** stand in the arena and press `L` to hunt a single lion with the bow. It crouches, then pounces, so keep your distance and use the dodge roll
- **Naval battle:** press `N` in the arena. The Colosseum floods, and you command a galley with three cannons per side against two waves of enemy ships. Sail so your broadside faces the enemy, ram them if you dare, and keep away from their guns. (Cannons are a game invention. Real Roman naval fights used rams, boarding and catapults)
- **Animal hunt (bow and arrows):** stand in the arena and press `U` to hunt a wild boar, a bear and then a lion with a bow. Hold `Space` or the mouse to draw, release to shoot: a full draw is strong and accurate, a quick draw is weak and wobbly, and headshots do extra damage. The aim helps by turning toward the animal and leading a moving target, but you still have to time your shots. `Shift` is a dodge roll that lets you slip past a charge. You get a quiver of 30 arrows for each animal in the hunt (14 for the lone lion) and pick up a few spent ones over time. Boars charge fast, bears hit hard and slowly
- **Watch the games:** press `V` in the Colosseum to watch a programme like the real games. It starts with a *venatio* (animal hunt among staged trees and rocks, with hunters, deer and ostriches), then three staged myth dramas (Orpheus charming the beasts, Daedalus and Icarus flying over the arena, Hercules wrestling the Nemean Lion), then gladiator matches (the first is Priscus vs Verus, who really did fight to a draw at the opening games). `N` skips to the next act, `1`-`5` picks one, `C` switches to a cinematic camera. In the Circus stands, `V` shows a chariot race instead
- Crowds of spectators fill the stands and cheer while you play

## Layout

| File | Purpose |
| --- | --- |
| `index.html`, `walk.css` | Page and HUD |
| `game.js` | Controls, minimap, map, discovery cards |
| `physics.js` | Terrain, walkable steps and solid obstacles |
| `world.js` | Landmark models (Forum, Colosseum, Pantheon, Circus and more) |
| `fight.js` | Gladiator duels and the lion |
| `naval.js` | Flooded arena and the ship-and-cannon battle |
| `show.js` | Animal models, the animal hunt and the myth dramas |
| `watch.js` | Spectator mode: the Colosseum programme and chariot races |
| `race.js` | Chariot race |
| `spectators.js` | Crowds in the stands |
| `vitals.js` | Your health, horses and money (saved in the browser) |
| `nav.js` | Route finding and directions |
| `narrator.js` | Reads captions aloud (text-to-speech) |
| `audio.js` | Positional ambience, footsteps and sound effects |
| `city.js` | Ground, sky, apartment blocks, trees and citizens |
| `landmarks.js` | Landmark text, positions and teleport spots. Edit this to change the content |
| `guide/` | Earlier static history guide with a timeline, figures, numeral converter and quiz |
| `ideas/` | Unused card-game content ("Imperator") kept for later |

The city is stylized and not to scale between districts. Distances between the Forum, Pantheon and Circus Maximus are compressed.
