import { JSDOM } from "jsdom";
import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
test("real UI handlers preserve draft, edit history and escape user content", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: new Date("2026-10-08T13:18:00Z"),
  });
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, { url: "http://localhost/" });
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
  localStorage.setItem(
    "gym-vault-v49:guest",
    JSON.stringify({
      schema: 49,
      docs: {
        "settings:main": {
          version: 1,
          value: {
            autoRest: true,
            enabledFrom: "2026-10-02",
            timezone: "Australia/Brisbane",
          },
        },
      },
      pending: [],
      conflicts: {},
      deleted: {},
      legacyLoaded: true,
    }),
  );
  // No SDK: exercise genuine app handlers and persistence without touching cloud.
  await import("../src/app.js");
  const $ = (s) => document.querySelector(s);
  const click = (s) => $(s).click();
  assert.equal($("#plan-date").value, "2026-10-08");
  assert.match($("#date-chip").textContent, /2026-10-08.*Brisbane/);
  assert.equal($("#auto-rest-toggle").checked, false);
  assert.equal(document.querySelectorAll("[data-edit]").length, 0);
  const originalRow = $(".set-row");
  assert.equal($(".plan-img"), null);
  click('[data-go="archive"]');
  click('[data-go="check"]');
  t.mock.timers.tick(15000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal($(".set-row"), originalRow);

  assert.equal(document.querySelectorAll(".set-row").length, 12);
  $(".kg").value = "15";
  $(".kg").dispatchEvent(new window.Event("input", { bubbles: true }));
  $(".reps").value = "8";
  $(".reps").dispatchEvent(new window.Event("input", { bubbles: true }));
  click(".set-check");
  assert.equal(document.querySelectorAll(".checked").length, 1);
  click('[data-go="archive"]');
  click('[data-go="check"]');
  assert.equal(document.querySelectorAll(".checked").length, 1);
  assert.equal($(".kg").value, "15");
  click("#finish-day");
  assert.equal($("#plan-date").value, "2026-10-08");
  click('[data-go="archive"]');
  assert.equal(document.querySelectorAll("[data-edit]").length, 1);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  click("[data-edit]");
  $("#edit-text").value = "平板卧推\n20kg*8*3";
  click("#edit-save");
  assert.ok($("#archive-list").textContent.includes("20kg*8*3"));
  click('[data-go="analysis"]');
  assert.ok($("#analysis-body").textContent.includes("480"));
  click('[data-go="archive"]');
  $("#manual-input").value = "2020-10-01\n<img src=x onerror=alert(1)>\n12";
  click("#manual-add");
  assert.equal($("#archive-list img"), null);
  assert.ok($("#archive-list").textContent.includes("<img"));
  click("[data-delete]");
  assert.ok(document.querySelector("[data-restore]"));
  click("[data-restore]");
  assert.equal(document.querySelectorAll("[data-edit]").length, 2);
  $("#archive-search").value = "2020-10-01";
  $("#archive-search").dispatchEvent(
    new window.Event("input", { bubbles: true }),
  );
  assert.equal(document.querySelectorAll("[data-edit]").length, 1);
  $("#archive-search").value = "";
  $("#archive-search").dispatchEvent(
    new window.Event("input", { bubbles: true }),
  );
  assert.equal(document.querySelectorAll("[data-edit]").length, 2);
  $("#archive-module").value = "Pull";
  $("#archive-module").dispatchEvent(
    new window.Event("change", { bubbles: true }),
  );
  assert.equal(document.querySelectorAll("[data-edit]").length, 0);
  assert.ok($("#archive-list").textContent.includes("没有匹配"));
  $("#plan-module").value = "Legs";
  $("#plan-module").dispatchEvent(
    new window.Event("change", { bubbles: true }),
  );
  click('[data-go="check"]');
  const legRows = [...document.querySelectorAll(".set-row")];
  assert.equal(legRows.length, 10);
  assert.equal(document.querySelectorAll(".kg:disabled").length, 10);
  assert.equal(legRows[6].querySelector(".reps").value, "30");
  assert.equal(
    legRows[8].querySelector(".reps").getAttribute("aria-label"),
    "秒数",
  );
  assert.equal(legRows[8].querySelector(".reps").value, "20");
  legRows[4].querySelector(".set-check").click();
  legRows[6].querySelector(".set-check").click();
  legRows[8].querySelector(".set-check").click();
  click("#finish-day");
  const saved = JSON.parse(localStorage.getItem("gym-vault-v49:guest")).docs[
    "record:2026-10-08"
  ].value;
  assert.deepEqual(
    saved.items.map((i) => i.sets),
    [["10"], ["30s"], ["20s"]],
  );
  const keys = Object.keys(
    JSON.parse(localStorage.getItem("gym-vault-v49:guest")).docs,
  );
  assert.ok(keys.includes("draft:active"));
  dom.window.close();
});
