import { JSDOM } from "jsdom";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("restores saved session without password, hides login, preserves UI on refresh and signs out locally", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
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
  let options,
    authEvent,
    signOutOptions,
    passwordCalls = 0;
  let session = { user: { id: "synthetic-owner" } };
  window.localStorage.setItem(
    "gym-vault-v49:synthetic-owner",
    JSON.stringify({
      schema: 49,
      docs: {},
      pending: [],
      conflicts: {},
      deleted: {},
      legacyLoaded: true,
    }),
  );
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session?.user }, error: null }),
      onAuthStateChange: (cb) => {
        authEvent = cb;
      },
      signInWithPassword: async () => {
        passwordCalls++;
        return { error: null };
      },
      signOut: async (opts) => {
        signOutOptions = opts;
        session = null;
        return { error: null };
      },
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: async () => ({ data: [], error: null }),
      };
      return q;
    },
  };
  window.supabase = {
    createClient: (_url, _key, opts) => {
      options = opts;
      return client;
    },
  };
  await import("../src/app.js");
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  await flush();
  const $ = (s) => document.querySelector(s);
  assert.equal(options.auth.persistSession, true);
  assert.equal(options.auth.autoRefreshToken, true);
  assert.equal(passwordCalls, 0);
  assert.equal($("#login-fields").hidden, true);
  assert.equal($("#logout").hidden, false);
  assert.match($("#account-state").textContent, /下次打开自动恢复/);
  const row = $(".set-row");
  authEvent("TOKEN_REFRESHED", session);
  t.mock.timers.tick(1);
  await flush();
  assert.equal($(".set-row"), row);
  $("#logout").click();
  await flush();
  assert.deepEqual(signOutOptions, { scope: "local" });
  assert.equal($("#login-fields").hidden, false);
  assert.equal($("#logout").hidden, true);
  assert.equal($("#password").value, "");
  dom.window.close();
});
