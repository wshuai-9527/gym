import { JSDOM } from "jsdom";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("real UI prefills recorded loads and reps, keeps edits and archives without load conversion", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: new Date("2025-06-10T03:00:00Z"),
  });
  const dom = new JSDOM(
    await readFile(new URL("../index.html", import.meta.url), "utf8"),
    { url: "http://localhost/" },
  );
  const { window } = dom;
  window.scrollTo = () => {};
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  globalThis.confirm = () => true;
  const original = {
    date: "2025-06-08",
    items: [
      { name: "保加利亚分腿蹲", sets: ["17.5kg*9*3"] },
      { name: "地面哑铃臀桥", sets: ["10kg*15*3"] },
      { name: "平板支撑", sets: ["45s", "35s"] },
    ],
  };
  localStorage.setItem(
    "gym-vault-v49:guest",
    JSON.stringify({
      schema: 49,
      legacyLoaded: true,
      pending: [],
      conflicts: {},
      deleted: {},
      docs: {
        "record:2025-06-08": { version: 1, value: original },
        "draft:active": {
          version: 1,
          value: {
            date: "2025-06-10",
            module: "Legs",
            planVersion: 52,
            rows: {},
          },
        },
      },
    }),
  );
  await import("../src/app.js");
  const $ = (s) => document.querySelector(s),
    rows = [...document.querySelectorAll(".set-row")];
  assert.equal(rows[4].querySelector(".kg").value, "17.5");
  assert.equal(rows[5].querySelector(".reps").value, "9");
  assert.equal(rows[2].querySelector(".reps").value, "45");
  assert.match(
    document.querySelectorAll(".history-reference")[2].textContent,
    /2025-06-08.*17.5kg × 9 × 3/,
  );
  rows[4].querySelector(".kg").value = "20";
  rows[4]
    .querySelector(".kg")
    .dispatchEvent(new window.Event("input", { bubbles: true }));
  rows[4].querySelector(".set-check").click();
  rows[2].querySelector(".set-check").click();
  $('[data-feedback="2"]').value = "steady";
  $('[data-feedback="2"]').dispatchEvent(
    new window.Event("input", { bubbles: true }),
  );
  $('[data-go="archive"]').click();
  $('[data-go="check"]').click();
  assert.equal(document.querySelectorAll(".kg")[4].value, "20");
  $("#finish-day").click();
  const state = JSON.parse(localStorage.getItem("gym-vault-v49:guest"));
  assert.deepEqual(
    state.docs["record:2025-06-10"].value.items.map((i) => i.sets),
    [["45s"], ["20kg*9"]],
  );
  assert.deepEqual(state.docs["record:2025-06-08"].value, original);
  assert.equal(state.docs["record:2025-06-10"].value.items[1].feedback.rir, 2);
  assert.equal(
    state.docs["record:2025-06-10"].value.items[1].feedback.quality,
    null,
  );
  dom.window.close();
});
