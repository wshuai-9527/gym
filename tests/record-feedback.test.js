import { JSDOM } from "jsdom";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("quick records confirm their date in place, survive reopening and do not repeat writes; cancelled replacements stay unchanged", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: new Date("2026-10-24T00:00:00+10:00"),
  });
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, { url: "https://example.test/" });
  const { window } = dom;
  let scrolls = 0;
  window.scrollTo = () => {
    scrolls++;
  };
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
  await import("../src/app.js?record-feedback");
  const $ = (s) => document.querySelector(s);
  const state = () => JSON.parse(localStorage.getItem("gym-vault-v49:guest"));
  $("#plan-date").value = "2026-10-23";
  $("#plan-date").dispatchEvent(new window.Event("change"));
  $("#basketball-day").click();
  assert.match(
    $("#day-record-status").textContent,
    /2026-10-23.*已记录篮球／有氧/,
  );
  assert.match($("#day-record-status").textContent, /本机已保存.*登录后同步/);
  assert.equal($("#basketball-day").getAttribute("aria-pressed"), "true");
  assert.equal(scrolls, 0);
  const saved = localStorage.getItem("gym-vault-v49:guest");
  $("#basketball-day").click();
  assert.equal(localStorage.getItem("gym-vault-v49:guest"), saved);
  globalThis.confirm = () => false;
  $("#rest-day").click();
  assert.equal(localStorage.getItem("gym-vault-v49:guest"), saved);
  assert.match($("#day-record-status").textContent, /篮球／有氧/);
  globalThis.confirm = () => true;
  $("#rest-day").click();
  assert.equal(state().docs["record:2026-10-23"].value.items[0].name, "休息");
  assert.equal($("#rest-day").getAttribute("aria-pressed"), "true");
  $("#plan-date").value = "2026-10-24";
  $("#plan-date").dispatchEvent(new window.Event("change"));
  $("#rest-day").click();
  t.mock.timers.tick(4000);
  assert.equal($("#toast").classList.contains("show"), false);
  assert.equal($("#day-record-status").hidden, false);
  assert.match($("#day-record-status").textContent, /2026-10-24.*休息/);
  await import("../src/app.js?record-feedback-reopen");
  assert.match($("#day-record-status").textContent, /2026-10-24.*休息/);
  assert.equal($("#rest-day").getAttribute("aria-pressed"), "true");
  assert.equal(scrolls, 0);
  window.close();
});
