"use strict";
// Story quests: 📖 Story in the menu. Each city has a story told in five chapters: Rome "The Lost Scroll", Old Delhi "The Emperor's Jewel", Cancún "The Serpent's Shadow", Beijing "The Jade Seal". Each chapter sends you
// to a famous place; when you stand there the next part of the story is told and you are paid. Finishing a story pays a big reward. The 📖 box shows your chapter and can lead you there
// (the same walking directions as G). Progress is kept in the browser and with your account.
// Depends on vitals.js, the landmarks of each city (by id) and the globals of game.js (LANDMARKS, city, player, startDirections, Narrator).

const Story = (() => {
  const KEY = "rome-story";
  const STORIES = {
    rome: { name: "The Lost Scroll", end: 300, ch: [
      ["forum", "A scribe in the Forum is in tears: a scroll that could change a senator's fate has vanished from his satchel. 'A herald took it to the Rostra,' he says. 'Find out why.'", 40],
      ["rostra", "At the Rostra the herald shrugs. 'A senator in a purple-edged toga snatched it. He went into the Curia.' Follow him.", 50],
      ["curia", "In the Curia Julia a clerk whispers that the senator was afraid of what the scroll said, and passed it to the Vestals to be locked away. Go to the Temple of Vesta.", 60],
      ["vesta", "The Vestals keep their secrets. But one gives you a hint: 'It was not safe here. A priest carried it to the greatest temple of all, on the Capitoline hill.'", 80],
      ["capitolium", "At the Temple of Jupiter you find the scroll beneath the altar. It names the real thief of the senator's gold. Take it to the one place where Rome decides such things: the Colosseum.", 150],
    ] },
    delhi: { name: "The Emperor's Jewel", end: 300, ch: [
      ["d-lahori", "At the Lahori Gate the guards are in uproar: the emperor's favourite jewel has gone from the Red Fort. A guard saw a veiled figure heading to the Chhatta Chowk bazaar.", 40],
      ["d-chhatta", "Among the jewellers of Chhatta Chowk, an old merchant remembers a stranger who asked for the Diwan-i-Aam, 'where the emperor hears his people'.", 50],
      ["d-diwanaam", "The pillared hall is empty, but a servant has found a torn scrap of silk caught on the throne alcove, with a note: 'The Diwan-i-Khas, the hall of private audience'.", 60],
      ["d-diwankhas", "Under the ceiling painted in gold you find the veiled figure's trail: a dropped glove marked with the mark of the Jama Masjid's builders. The thief hides in the great mosque.", 80],
      ["d-jama", "On the steps of the Jama Masjid you find the jewel, left by a repentant young courtier who could not bear to sell it. You return it, and the emperor himself hears your name.", 150],
    ] },
    cancun: { name: "The Serpent's Shadow", end: 300, ch: [
      ["c-castillo", "At El Castillo a priest says that at the equinox the serpent of light still crawls down the stairs, but this year its shadow has stopped halfway. 'Something blocks the sun. Ask at the Great Ball Court.'", 40],
      ["c-ballcourt", "A player at the Ball Court laughs: 'Look up. A loose stone on the temple wall casts the shadow.' But it was removed by someone: the astronomers at El Caracol borrowed it.", 50],
      ["c-caracol", "At the Caracol the astronomers sheepishly admit they took a stone to measure Venus. 'It is at the Sacred Cenote, in the offering we made.'", 60],
      ["c-cenote", "At the Sacred Cenote a diver's cord tugs; the stone sits at the bottom, wrapped with a jade bead. But the offering must be returned by water: 'Take the bead to the cleanest water, Cenote Azul.'", 80],
      ["c-azul", "In Cenote Azul the water glows turquoise as you drop the jade bead. The serpent's shadow slips back down the great stair, and the whole city cheers your name.", 150],
    ] },
    beijing: { name: "The Jade Seal", end: 300, ch: [
      ["b-tiananmen", "At the Gate of Heavenly Peace the guards are whispering: the Emperor's jade seal, without which no edict is valid, has vanished from the palace. A young eunuch was seen hurrying toward the throne hall. Follow him to the Hall of Supreme Harmony.", 40],
      ["b-harmony", "On the marble terrace an old sweeper leans on his broom. 'The boy ran past me, white as rice. He was heading up Jingshan hill, behind the palace. A strange place to run to.'", 50],
      ["b-jingshan", "At the top of Coal Hill you find a dropped cap and a scrap of paper: 'I cannot let him use it.' The wind has blown a second scrap down toward the grey lanes. Look for the hutongs.", 60],
      ["b-hutong", "In a courtyard house a woman admits the boy is her brother. 'He did not steal the seal. He hid it from the minister, who wanted to sign false edicts. Tomorrow at dawn the Emperor prays at the Temple of Heaven. My brother will be there.'", 80],
      ["b-heaven", "At dawn, in front of the whole court, the young eunuch kneels and hands the seal to the Emperor's steward, and names the minister who plotted to forge the edicts. The minister is led away, and you are thanked in front of everyone.", 150],
    ] },
  };
  let prog = { rome: 0, delhi: 0, cancun: 0, beijing: 0 };
  const clean = (raw) => { const o = { rome: 0, delhi: 0, cancun: 0, beijing: 0 }; if (raw && typeof raw === "object") for (const c of Object.keys(o)) o[c] = Math.max(0, Math.min(STORIES[c].ch.length, Math.floor(Number(raw[c])) || 0)); return o; };
  try { prog = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) { /* ignore */ } };
  const $s = (id) => document.getElementById(id);
  const lmOf = (id) => LANDMARKS.find((l) => l.id === id);
  const done = (c) => prog[c] >= STORIES[c].ch.length;

  function say(text) { toast(text.length > 160 ? text.slice(0, 157) + "..." : text); try { Narrator.say(text, { interrupt: true }); } catch (e) { /* ignore */ } }

  function render() {
    const st = STORIES[city] || STORIES.rome, c = STORIES[city] ? city : "rome", n = prog[c];
    $s("st-title").textContent = `📖 ${st.name} (${n} of ${st.ch.length})`;
    const box = $s("st-text"); box.replaceChildren();
    for (let i = 0; i < Math.min(n + 1, st.ch.length); i++) {
      const p = document.createElement("p"); p.className = i < n ? "st-old" : "st-now"; p.textContent = `${i + 1}. ${st.ch[i][1]}`; box.append(p);
    }
    const go = $s("st-go"), lm = n < st.ch.length ? lmOf(st.ch[n][0]) : null;
    go.hidden = !lm; if (lm) go.textContent = `Show me the way to ${lm.name}`;
    $s("st-done").hidden = n < st.ch.length; $s("st-done").textContent = n >= st.ch.length ? `You have finished this story (the reward was ${st.end} denarii).` : "";
  }
  function open() { render(); openPanel("#story"); }

  function update() {
    if (typeof started === "undefined" || !started) return;
    const st = STORIES[city]; if (!st || done(city)) return;
    const n = prog[city], lm = lmOf(st.ch[n][0]); if (!lm) return;
    if (mode !== "walk" && mode !== "drive") return;
    const d = Math.hypot(player.x - lm.x, player.z - lm.z), st2 = lm.stand ? Math.hypot(player.x - lm.stand[0], player.z - lm.stand[1]) : Infinity;
    if (d > (lm.r || 20) + 6 && st2 > 14) return;                                           // (near the place, or at the spot the directions lead to)
    const reward = st.ch[n][2];
    prog[city] = n + 1; save(); Vitals.coins += reward; Sfx.play("discover");
    if (prog[city] >= st.ch.length) {
      Vitals.coins += st.end; Sfx.play("medal");
      say(`${st.ch[n][1]} The story "${st.name}" is finished: +${reward + st.end} denarii!`);
    } else say(`${st.ch[Math.min(n + 1, st.ch.length - 1)][1]} (+${reward} denarii)`);
    if ($s("story").classList.contains("show")) render();
  }

  function bind() {
    const b = $s("btn-story"); if (b) b.addEventListener("click", open);
    $s("st-go").addEventListener("click", () => {
      const st = STORIES[city]; if (!st || done(city)) return;
      const lm = lmOf(st.ch[prog[city]][0]); closePanels(); if (lm && typeof startDirections === "function") { try { startDirections(lm); } catch (e) { /* ignore */ } }
    });
  }
  return {
    bind, update, open, STORIES,
    snapshot: () => ({ ...prog }),
    restore(raw) { prog = clean(raw); save(); },
    merge(raw) { const o = clean(raw); for (const c of Object.keys(prog)) prog[c] = Math.max(prog[c], o[c]); save(); },
    get finished() { return Object.keys(prog).filter((c) => done(c)).length; }, _prog: () => prog,
  };
})();
