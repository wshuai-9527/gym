import test from "node:test";
import assert from "node:assert/strict";
import { dailyPreparation, preparationCard } from "../src/preparation.js";
import { PLAN } from "../src/catalog.js";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";

test("preparation follows actual exercises and aliases, not a fixed module label", () => {
  const push = dailyPreparation(PLAN.Push.items),
    pull = dailyPreparation(PLAN.Pull.items),
    legs = dailyPreparation(PLAN.Legs.items);
  assert(push.cooldown.some((s) => s.name.includes("胸部")));
  assert(!pull.cooldown.some((s) => s.name.includes("胸部")));
  assert(pull.cooldown.some((s) => s.name.includes("背阔")));
  assert(legs.warmup.some((s) => s.name.includes("髋铰链")));
  assert(legs.warmup.some((s) => s.name.includes("姿势试练")));
  assert.equal(legs.cooldown.length, 4);
  assert(!JSON.stringify(legs).match(/仰卧|死虫|地面臀桥/));
  const single = dailyPreparation([{ name: "哑铃侧平举", sets: [] }]);
  assert(single.cooldown.some((s) => s.name.includes("后肩")));
  assert(!single.cooldown.some((s) => s.name.includes("胸部")));
  assert(!preparationCard(PLAN.Push.items).includes("set-row"));
  assert(preparationCard(PLAN.Legs.items).includes("约 8–15 分钟"));
});

test("opening guidance never saves work; cooldown follows completed work after archive and reload", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: new Date("2026-10-27T02:00:00Z"),
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
  await import("../src/app.js?preparation-ui");
  const before = localStorage.getItem("gym-vault-v49:guest");
  document.querySelector("#daily-warmup > details > summary").click();
  document.querySelector("#daily-cooldown > details > summary").click();
  assert.equal(localStorage.getItem("gym-vault-v49:guest"), before);
  document.querySelector(".kg").value = "15";
  document.querySelector(".reps").value = "10";
  document.querySelector(".set-check").click();
  assert.match(
    document.querySelector("#daily-cooldown").textContent,
    /胸部拉伸/,
  );
  assert(
    !document.querySelector("#daily-cooldown").textContent.includes("三头拉伸"),
  );
  document.querySelector("#finish-day").click();
  const state = JSON.parse(localStorage.getItem("gym-vault-v49:guest"));
  assert.deepEqual(
    state.docs["record:2026-10-27"].value.items.map((i) => i.name),
    ["平板卧推"],
  );
  assert.deepEqual(state.docs["record:2026-10-27"].value.items[0].sets, [
    "15kg*10",
  ]);
  assert.equal(document.querySelector("#plan-module").value, "Pull");
  assert.match(
    document.querySelector("#daily-cooldown").textContent,
    /胸部拉伸/,
  );
  assert(
    !document
      .querySelector("#daily-cooldown")
      .textContent.includes("背阔肌拉伸"),
  );
  // A fresh module instance restores the same archived-day cooldown.
  await import("../src/app.js?preparation-ui-reload");
  assert.match(
    document.querySelector("#daily-cooldown").textContent,
    /胸部拉伸/,
  );
  dom.window.close();
});
