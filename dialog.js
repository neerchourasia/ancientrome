"use strict";
// Ask-and-confirm boxes inside the game. The browser's own pop-ups (prompt and confirm) do not work everywhere (the side pane of some apps blocks them, so a button
// that used one just did nothing), so the game draws its own:   Dialog.ask("How many?", "100").then((text) => ...)   (text is null if cancelled)
//                                                              Dialog.confirm("Sure?").then((yes) => ...)

const Dialog = (() => {
  let el = null, busy = false;
  function build() {
    el = document.createElement("div");
    el.id = "dialog"; el.hidden = true;
    el.innerHTML = '<div class="box" role="dialog" aria-modal="true"><p id="dlg-text"></p><input id="dlg-input" type="text" maxlength="40" autocomplete="off"><div class="dbtns"><button id="dlg-ok" type="button">OK</button><button id="dlg-cancel" type="button">Cancel</button></div></div>';
    document.body.append(el);
  }
  function show(text, asking, value) {
    if (!el) build();
    return new Promise((resolve) => {
      if (busy) { resolve(asking ? null : false); return; }
      busy = true;
      const input = el.querySelector("#dlg-input"), ok = el.querySelector("#dlg-ok"), cancel = el.querySelector("#dlg-cancel");
      el.querySelector("#dlg-text").textContent = text;
      input.hidden = !asking; input.value = asking ? String(value == null ? "" : value) : "";
      el.hidden = false;
      if (document.pointerLockElement) document.exitPointerLock();
      (asking ? input : ok).focus(); if (asking) input.select();
      const done = (yes) => {
        el.hidden = true; busy = false;
        removeEventListener("keydown", onKey, true); ok.onclick = cancel.onclick = null;
        resolve(asking ? (yes ? input.value : null) : yes);
      };
      const onKey = (e) => {                                                           // Enter says OK and Escape cancels, and neither reaches the game
        if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); e.stopPropagation(); done(true); }
        else if (e.code === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
        else e.stopPropagation();                                                      // (typing a number must not walk the character about)
      };
      addEventListener("keydown", onKey, true);
      ok.onclick = () => done(true); cancel.onclick = () => done(false);
    });
  }
  return { ask: (text, value) => show(text, true, value), confirm: (text) => show(text, false) };
})();
