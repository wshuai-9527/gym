import { JSDOM } from "jsdom";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("three feeling buttons persist without replacing controls; safety remains optional", async (t) => {
  t.mock.timers.enable({
    apis: ["setInterval", "setTimeout", "Date"],
    now: new Date("2026-10-26T08:00:00Z"),
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
  await import("../src/app.js?simple-feedback");
  const group = document.querySelector(".feeling-buttons");
  assert.deepEqual(
    [...group.children].map((b) => b.textContent),
    ["合适", "轻松", "吃力"],
  );
  group.children[1].click();
  assert.equal(group.children[1].getAttribute("aria-pressed"), "true");
  const saved = JSON.parse(localStorage.getItem("gym-vault-v49:guest"));
  assert.equal(saved.docs["draft:active"].value.feedback[0], "easy");
  assert.equal(saved.docs["draft:active"].value.quality[0], "");
  window.dispatchEvent(
    new window.StorageEvent("storage", { key: "gym-vault-v49:guest" }),
  );
  assert.equal(document.querySelector(".feeling-buttons"), group);
  group.children[0].click();
  assert.equal(group.children[1].getAttribute("aria-pressed"), "false");
  assert.equal(group.children[0].getAttribute("aria-pressed"), "true");
  group.children[0].click();
  assert.equal(document.querySelector("[data-feedback]").value, "");
  assert.equal(document.querySelector(".feedback-safety").open, false);
  dom.window.close();
});
