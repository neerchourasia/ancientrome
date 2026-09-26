"use strict";

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function formatYear(y) {
  return y < 0 ? `${-y} BC` : `${y} AD`;
}

const eraColor = (era) => `var(--era-${era})`;

// ---- Era filters, shared by the timeline and people sections ----

function setupFilters(target, render) {
  const box = document.querySelector(`.filters[data-target="${target}"]`);
  const options = [["all", "All"], ...Object.entries(ERAS).map(([k, v]) => [k, v.label])];
  options.forEach(([key, label]) => {
    const btn = el("button", { type: "button", textContent: label });
    btn.setAttribute("aria-pressed", String(key === "all"));
    btn.addEventListener("click", () => {
      box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      render(key);
    });
    box.append(btn);
  });
}

const matches = (item, era) => era === "all" || item.era === era;

function renderTimeline(era = "all") {
  const list = $("#timeline-list");
  list.replaceChildren(
    ...TIMELINE.filter((e) => matches(e, era)).map((e) => {
      const li = el("li");
      li.style.setProperty("--dot", eraColor(e.era));
      li.append(
        el("span", { className: "year", textContent: formatYear(e.year) }),
        el("h3", { textContent: e.title }),
        el("p", { textContent: e.text })
      );
      return li;
    })
  );
}

function renderPeople(era = "all") {
  const list = $("#people-list");
  list.replaceChildren(
    ...PEOPLE.filter((p) => matches(p, era)).map((p) => {
      const card = el("article", { className: "card" });
      card.style.setProperty("--dot", eraColor(p.era));
      card.append(
        el("h3", { textContent: p.name }),
        el("p", { className: "meta", textContent: `${p.role} · ${p.dates}` }),
        el("p", { textContent: p.text })
      );
      return card;
    })
  );
}

// ---- Roman numerals ----

const NUMERALS = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function toRoman(n) {
  let out = "";
  for (const [value, sym] of NUMERALS) {
    while (n >= value) { out += sym; n -= value; }
  }
  return out;
}

function fromRoman(s) {
  let total = 0;
  let i = 0;
  for (const [value, sym] of NUMERALS) {
    while (s.startsWith(sym, i)) { total += value; i += sym.length; }
  }
  // Only accept canonical forms (rejects "IIII", "VX", etc.)
  return i === s.length && toRoman(total) === s ? total : null;
}

function convertNumeral(raw) {
  const text = raw.trim().toUpperCase();
  if (!text) return { text: "" };
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (n < 1 || n > 3999) return { error: "Enter a number from 1 to 3999." };
    return { text: toRoman(n) };
  }
  const n = /^[IVXLCDM]+$/.test(text) ? fromRoman(text) : null;
  return n === null ? { error: "Not a valid number or Roman numeral." } : { text: String(n) };
}

function setupNumerals() {
  const input = $("#numeral-input");
  const output = $("#numeral-output");
  $("#numeral-form").addEventListener("submit", (e) => e.preventDefault());
  input.addEventListener("input", () => {
    const result = convertNumeral(input.value);
    output.className = result.error ? "error" : "";
    output.textContent = result.error ?? result.text;
  });
}

// ---- Quiz ----

function setupQuiz() {
  const box = $("#quiz-box");
  let index = 0;
  let score = 0;

  function showQuestion() {
    const item = QUIZ[index];
    const options = el("div", { className: "options" });
    const note = el("p", { className: "note", hidden: true });
    const next = el("button", {
      className: "primary", type: "button", hidden: true,
      textContent: index === QUIZ.length - 1 ? "See result" : "Next question",
    });

    item.options.forEach((text, i) => {
      const btn = el("button", { type: "button", textContent: text });
      btn.addEventListener("click", () => {
        const right = i === item.answer;
        if (right) score++;
        [...options.children].forEach((b, j) => {
          b.disabled = true;
          if (j === item.answer) b.classList.add("correct");
        });
        if (!right) btn.classList.add("wrong");
        note.textContent = `${right ? "Correct. " : "Not quite. "}${item.note}`;
        note.hidden = false;
        next.hidden = false;
        next.focus();
      });
      options.append(btn);
    });

    next.addEventListener("click", () => {
      index++;
      index < QUIZ.length ? showQuestion() : showResult();
    });

    box.replaceChildren(
      el("p", { className: "progress", textContent: `Question ${index + 1} of ${QUIZ.length}` }),
      el("h3", { textContent: item.q }),
      options, note, next
    );
  }

  function showResult() {
    const restart = el("button", { className: "primary", type: "button", textContent: "Try again" });
    restart.addEventListener("click", () => { index = 0; score = 0; showQuestion(); });
    box.replaceChildren(
      el("p", { className: "progress", textContent: "Your result" }),
      el("p", { className: "score", textContent: `${score} / ${QUIZ.length}` }),
      el("p", { textContent: resultMessage(score / QUIZ.length) }),
      restart
    );
  }

  showQuestion();
}

function resultMessage(ratio) {
  if (ratio === 1) return "Perfect. You are worthy of a triumph.";
  if (ratio >= 0.75) return "Well done, you'd make a fine centurion.";
  if (ratio >= 0.5) return "Not bad. A few more days in the Forum should do it.";
  return "Back to the Senate archives with you. Try again!";
}

// ---- Init ----

setupFilters("timeline", renderTimeline);
setupFilters("people", renderPeople);
renderTimeline();
renderPeople();
setupNumerals();
setupQuiz();
