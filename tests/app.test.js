import { JSDOM } from "jsdom";
import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
test("real UI handlers preserve draft, edit history and escape user content", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, { url: "http://localhost/" });
  const { window } = dom;
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
  // No SDK: exercise genuine app handlers and persistence without touching cloud.
  await import("../src/app.js");
  const $ = (s) => document.querySelector(s);
  const click = (s) => $(s).click();
  assert.equal(document.querySelectorAll(".set-row").length, 16);
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
  const keys = Object.keys(
    JSON.parse(localStorage.getItem("gym-vault-v49:guest")).docs,
  );
  assert.ok(keys.includes("draft:active"));
  dom.window.close();
});
