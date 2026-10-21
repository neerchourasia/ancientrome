"use strict";
// Weapons for the gladiator arena, sold by the armourer's stall at the edge of the arena (stalls.js, market.js). You fight with the gladius
// unless you have bought and equipped another weapon. Each one changes how hard you hit, how far you reach, how fast you swing and how
// much a swing tires you. They work against the arena bots in Rome and in duels and team battles against real people (the game server has
// the same numbers: WEAPONS in server/server.py). Depends on three.js; market.js decides what you own.

const Weapons = (() => {
  const T = THREE;
  // dmg: damage multiplier, reach: metres, time: how long a swing takes (1 = the gladius), cost: stamina a swing costs (1 = the gladius)
  const LIST = {
    gladius: { name: "Gladius", dmg: 1, reach: 3.1, time: 1, cost: 1 },
    dagger: { name: "Sica (dagger)", dmg: 0.7, reach: 2.5, time: 0.65, cost: 0.6 },
    spear: { name: "Hasta (spear)", dmg: 1, reach: 4.3, time: 1.25, cost: 1.1 },
    trident: { name: "Fuscina (trident)", dmg: 1.15, reach: 3.9, time: 1.15, cost: 1.1 },
    axe: { name: "Securis (battle axe)", dmg: 1.55, reach: 3, time: 1.45, cost: 1.4 },
    spatha: { name: "Champion's greatsword", dmg: 1.35, reach: 3.4, time: 1.2, cost: 1.25 },
  };
  const get = (id) => LIST[id] || LIST.gladius;
  const cur = () => get(typeof Market !== "undefined" ? Market.weapon : null);

  const B = new T.BoxGeometry(1, 1, 1);
  const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
  const steel = lam(0xd5d8de), iron = lam(0x8a8f98), gold = lam(0xdcb444, { emissive: 0x3d2f05 }), leather = lam(0x5a3a22), wood = lam(0x7a5a34);
  const bx = (m, w, h, d, x, y, z) => { const o = new T.Mesh(B, m); o.scale.set(w, h, d); o.position.set(x, y, z); o.castShadow = true; return o; };

  // a weapon, with the hilt at the origin and the business end along +y (the way the first-person sword is built)
  function model(id) {
    const g = new T.Group();
    switch (id) {
      case "dagger":
        g.add(bx(steel, 0.06, 0.46, 0.02, 0, 0.36, 0), bx(gold, 0.2, 0.04, 0.06, 0, 0.11, 0), bx(leather, 0.05, 0.2, 0.05, 0, 0, 0));
        break;
      case "spear":
        g.add(bx(wood, 0.05, 1.9, 0.05, 0, 0.6, 0), bx(steel, 0.13, 0.34, 0.02, 0, 1.72, 0), bx(gold, 0.1, 0.05, 0.07, 0, 1.52, 0));
        break;
      case "trident":
        g.add(bx(wood, 0.05, 1.6, 0.05, 0, 0.55, 0), bx(iron, 0.36, 0.05, 0.05, 0, 1.36, 0));
        for (const x of [-0.16, 0, 0.16]) g.add(bx(iron, 0.04, x === 0 ? 0.36 : 0.3, 0.04, x, x === 0 ? 1.56 : 1.53, 0));
        break;
      case "axe":
        g.add(bx(wood, 0.05, 1.2, 0.05, 0, 0.46, 0), bx(iron, 0.34, 0.3, 0.04, 0.16, 0.96, 0), bx(steel, 0.05, 0.38, 0.03, 0.35, 0.96, 0), bx(iron, 0.1, 0.2, 0.05, -0.06, 0.96, 0));
        break;
      case "spatha":
        g.add(bx(steel, 0.1, 1.3, 0.025, 0, 0.82, 0), bx(gold, 0.38, 0.06, 0.08, 0, 0.14, 0), bx(leather, 0.055, 0.32, 0.055, 0, -0.02, 0), bx(gold, 0.1, 0.08, 0.08, 0, -0.2, 0));
        break;
      default:                                                  // the gladius
        g.add(bx(steel, 0.07, 0.95, 0.02, 0, 0.6, 0), bx(gold, 0.3, 0.05, 0.07, 0, 0.12, 0), bx(leather, 0.05, 0.22, 0.05, 0, 0, 0));
    }
    return g;
  }

  // The first-person weapon in the arena (fight.js): swap what is inside its group.
  function mountFp(group, id) {
    while (group.children.length) group.remove(group.children[0]);
    const m = model(id);
    while (m.children.length) group.add(m.children[0]);
    group.scale.setScalar(id === "spear" || id === "trident" ? 0.62 : 1);   // long weapons are drawn shorter in first person
    group.traverse((c) => { c.frustumCulled = false; });
  }

  // The weapon in a figure's hand (a player seen in a duel): its hand holds the weapon pointing down the arm, so it is turned over.
  function setFigure(fig, id) {
    const s = fig && fig.sword;
    if (!s) return;
    if (!s.userData.orig) s.userData.orig = s.children.slice();
    for (const c of s.children.slice()) s.remove(c);
    if (!id || !LIST[id] || id === "gladius") { for (const c of s.userData.orig) s.add(c); return; }
    const w = new T.Group();
    w.rotation.x = Math.PI; w.position.y = -0.4;
    w.add(model(id));
    s.add(w);
  }

  // what each one does, in words (the shop shows it)
  function describe(id) {
    const w = get(id), pct = (v) => `${Math.round(v * 100)}%`;
    return `Damage ${pct(w.dmg)}, reach ${w.reach.toFixed(1)} m, ${w.time < 0.9 ? "fast" : w.time > 1.1 ? "slow" : "normal"} swing, ${w.cost < 0.9 ? "light on stamina" : w.cost > 1.1 ? "tiring" : "normal stamina"}.`;
  }

  return { LIST, get, cur, model, mountFp, setFigure, describe, IDS: Object.keys(LIST).filter((k) => k !== "gladius") };
})();
