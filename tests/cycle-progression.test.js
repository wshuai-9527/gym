import test from "node:test";
import assert from "node:assert/strict";
import { nextCycleItems } from "../src/cycle-progression.js";
import { feedbackValue } from "../src/adaptive.js";
import { PLAN } from "../src/catalog.js";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
const ex = PLAN.Push.items[0];
const r = (day, name, sets, feedback) => ({
  date: `2026-10-${day}`,
  items: [{ name, sets, ...(feedback ? { feedback } : {}) }],
});
const cycles = (
  first = ["20kg*12*3"],
  second = first,
  f = feedbackValue("steady", "stable"),
) => [
  r("02", ex[0], first, f),
  r("03", "高位下拉", ["30kg*12*3"]),
  r("05", "平板支撑", ["60s*2"]),
  r("10", ex[0], second, f),
  r("11", "高位下拉", ["30kg*12*3"]),
  r("13", "平板支撑", ["70s*2"]),
];
const advice = (records, item = ex, module = "Push") =>
  nextCycleItems(records, [item], module, "2026-10-14")[0][4];
test("complete-cycle feedback progresses reps; incomplete cycle and missing feedback never invent progress", () => {
  let a = advice(
    cycles(
      ["20kg*8", "20kg*10", "20kg*10"],
      undefined,
      feedbackValue("steady"),
    ),
  );
  assert.deepEqual(
    a.perSet.map((p) => p.reps),
    [9, 10, 10],
  );
  assert.equal(a.action, "reps");
  a = advice(
    cycles(["20kg*8", "20kg*10", "20kg*12"], undefined, feedbackValue("easy")),
  );
  assert.deepEqual(
    a.perSet.map((p) => p.reps),
    [9, 11, 12],
  );
  a = advice(cycles(["20kg*8*3"], undefined, null));
  assert.deepEqual(
    a.perSet.map((p) => p.reps),
    [8, 8, 8],
  );
  a = advice([r("10", ex[0], ["20kg*8*3"], feedbackValue("easy"))]);
  assert.equal(a.action, "hold");
  assert.equal(a.perSet[0].reps, 8);
});
test("weight increase requires consecutive complete exposures with independent quality and available small increment", () => {
  const a = advice(cycles());
  assert.equal(a.action, "weight");
  assert.equal(a.perSet[0].kg, 20);
  assert.deepEqual(a.weightProposal[0], { kg: 20.5, reps: 8 });
  for (const f of [
    feedbackValue("easy"),
    { rir: 3, rating: "easy", quality: true, pain: false },
  ]) {
    assert.equal(advice(cycles(undefined, undefined, f)).weightProposal, null);
  }
  assert.equal(advice(cycles(["5kg*12*3"])).weightProposal, null);
  assert.equal(advice(cycles(["20kg*12*3"], ["20kg*12"])).weightProposal, null);
  assert.equal(advice(cycles(["20kg*12*3"], ["bad"])).weightProposal, null);
  const interrupted = cycles();
  interrupted.push(
    r("09", ex[0], ["20kg*7*3"], feedbackValue("hard", "stable")),
  );
  assert.equal(advice(interrupted).weightProposal, null);
});
test("latest unfinished-cycle records and pain take priority; timing is never auto extended", () => {
  const records = cycles();
  records.push(r("14", ex[0], ["18kg*9*3"], feedbackValue("easy", "stable")));
  assert.equal(advice(records).perSet[0].kg, 18);
  assert.equal(advice(records).action, "hold");
  records.at(-1).items[0].feedback = feedbackValue("pain");
  assert(advice(records).paused);
  const timed = PLAN.Legs.items[0];
  const a = advice(cycles(), timed, "Legs");
  assert.equal(a.perSet[0].reps, 70);
  assert.equal(a.weightProposal, null);
});
test("one tap adopts a supported proposal into draft only; it does not complete sets or rewrite source records", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: new Date("2026-10-14T02:00:00Z"),
  });
  const dom = new JSDOM(
    await readFile(new URL("../index.html", import.meta.url), "utf8"),
    { url: "https://example.test/" },
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
  const docs = Object.fromEntries(
    cycles().map((value) => ["record:" + value.date, { value, version: 1 }]),
  );
  localStorage.setItem(
    "gym-vault-v49:guest",
    JSON.stringify({
      schema: 49,
      docs,
      pending: [],
      conflicts: {},
      deleted: {},
      legacyLoaded: true,
    }),
  );
  await import("../src/app.js?cycle-progression-ui");
  assert.equal(document.querySelector(".kg").value, "20");
  const btn = document.querySelector('[data-cycle-weight="0"]');
  assert(btn);
  btn.click();
  assert.equal(document.querySelector(".kg").value, "20.5");
  assert.equal(document.querySelector(".reps").value, "8");
  assert.equal(document.querySelectorAll(".set-row.checked").length, 0);
  const saved = JSON.parse(localStorage.getItem("gym-vault-v49:guest"));
  for (const key of Object.keys(docs))
    assert.deepEqual(saved.docs[key], docs[key]);
  assert.equal(saved.docs["draft:active"].value.rows["0-0"].kg, "20.5");
  assert(saved.pending.every((p) => p.key === "draft:active"));
  // Reload uses the frozen active snapshot and edited rows rather than reapplying.
  await import("../src/app.js?cycle-progression-ui-reload");
  assert.equal(document.querySelector(".kg").value, "20.5");
  assert.equal(document.querySelector('[data-cycle-weight="0"]'), null);
  dom.window.close();
});
