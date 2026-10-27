import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { trainingCycles } from "../src/cycles.js";
import { adaptiveItems, feedbackValue } from "../src/adaptive.js";
import { PLAN, templateFor } from "../src/catalog.js";
import { normalizeRecord } from "../src/core.js";
import { Store } from "../src/storage.js";
import { RestNotifications } from "../src/notifications.js";
const record = (date, name, sets = ["20kg*12*3"], rating) => ({
  date,
  items: [
    {
      name,
      sets,
      ...(rating
        ? {
            feedback: feedbackValue(
              rating,
              ["form", "pain"].includes(rating) ? rating : "stable",
            ),
          }
        : {}),
    },
  ],
});
const mem = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, v) };
};
test("cycle completes across basketball/rest, ignores empty sets and future records, history deletion reopens it", () => {
  const records = [
    record("2026-01-01", "平板卧推"),
    record("2026-01-02", "篮球", []),
    record("2026-01-03", "高位下拉"),
    record("2026-01-04", "休息", []),
    record("2026-01-05", "保加利亚分腿蹲"),
    record("2026-01-06", "平板卧推", []),
  ];
  const c = trainingCycles(records, "2026-01-06");
  assert.equal(c.completed.length, 1);
  assert.equal(c.completed[0].end, "2026-01-05");
  assert.equal(c.completed[0].basketball, 1);
  assert.equal(c.pending, null);
  assert.equal(trainingCycles(records, "2026-01-04").completed.length, 0);
  const edited = trainingCycles(
    records.filter((r) => r.date !== "2026-01-03"),
    "2026-01-06",
  );
  assert.equal(edited.completed.length, 0);
  assert.deepEqual(edited.pending, { Push: "2026-01-01" });
});
test("new Push resets an incomplete cycle; a Pull alone never creates a report", () => {
  const c = trainingCycles(
    [
      record("2026-01-01", "高位下拉"),
      record("2026-01-02", "保加利亚分腿蹲"),
      record("2026-01-03", "平板卧推"),
      record("2026-01-04", "平板卧推"),
      record("2026-01-05", "高位下拉"),
      record("2026-01-06", "保加利亚分腿蹲"),
    ],
    "2026-01-06",
  );
  assert.equal(c.completed.length, 1);
  assert.equal(c.completed[0].start, "2026-01-04");
});
test("adaptive loads require two complete quality exposures; no feedback never raises loads", () => {
  for (const module of ["Push", "Pull", "Legs"]) {
    const ex = PLAN[module].items.find((x) => x[0] !== "平板支撑" && x[0] !== "壶铃摆动"),
      n = parseInt(ex[1]);
    const records = [
      record("2026-01-01", ex[0], [`20kg*12*${n}`], "steady"),
      record("2026-01-05", ex[0], [`20kg*12*${n}`], "steady"),
    ];
    const a = adaptiveItems(records, [ex], module, "2026-01-06")[0];
    assert.equal(a[4].perSet[0].kg, 20);
    assert.equal(a[4].perSet[0].reps, 12);
    assert.match(a[4].message, /20.5kg/);
    assert.equal(a[4].sets, n);
    records.forEach((r) => delete r.items[0].feedback);
    assert.equal(
      adaptiveItems(records, [ex], module, "2026-01-06")[0][4].perSet[0].kg,
      20,
    );
  }
});
test("reps advance before weight; form problems reduce load, pain never raises it, small dumbbells do not jump over 5%", () => {
  const ex = PLAN.Push.items[0];
  let a = adaptiveItems(
    [record("2026-01-05", ex[0], ["20kg*9*3"], "steady")],
    [ex],
    "Push",
    "2026-01-06",
  )[0];
  assert.equal(a[4].perSet[0].kg, 20);
  assert.equal(a[4].perSet[0].reps, 10);
  a = adaptiveItems(
    [record("2026-01-05", ex[0], ["20kg*9*3"], "form")],
    [ex],
    "Push",
    "2026-01-06",
  )[0];
  assert.equal(a[4].perSet[0].kg, 18);
  assert.equal(a[4].sets, 2);
  a = adaptiveItems(
    [record("2026-01-05", ex[0], ["20kg*9*3"], "pain")],
    [ex],
    "Push",
    "2026-01-06",
  )[0];
  assert.match(a[4].message, /暂停/);
  assert.equal(a[4].perSet[0].kg, 20);
  const small = [
    record("2026-01-01", ex[0], ["5kg*12*3"], "steady"),
    record("2026-01-05", ex[0], ["5kg*12*3"], "steady"),
  ];
  assert.equal(
    adaptiveItems(small, [ex], "Push", "2026-01-06")[0][4].perSet[0].kg,
    5,
  );
});
test("feedback roundtrips and active snapshots preserve exercise and set mapping", () => {
  const r = normalizeRecord(
    record("2026-01-05", "平板卧推", ["20kg*9"], "steady"),
  );
  assert.equal(r.items[0].feedback.rir, 2);
  const snapshot = adaptiveItems([r], PLAN.Push.items, "Push", "2026-01-06");
  const d = {
    module: "Push",
    planVersion: 58,
    planSnapshot: snapshot,
    rows: { "0-0": { done: true } },
  };
  assert.equal(templateFor(d).items, snapshot);
});
test("guest records merge once without overwriting account versions; choosing imported record queues upload", () => {
  const m = mem(),
    g = new Store(m),
    a = new Store(m, "owner");
  const key = "record:2026-01-05";
  g.put(key, record("2026-01-05", "平板卧推"));
  a.merge([
    { key, value: record("2026-01-05", "平板卧推", ["10kg*8"]), version: 4 },
  ]);
  assert.equal(a.importGuest(g), 1);
  assert.equal(a.importGuest(g), 0);
  assert.equal(a.get(key).items[0].sets[0], "10kg*8");
  a.resolve(key, false);
  assert.equal(a.state.pending.length, 1);
  assert.equal(a.state.pending[0].base, 4);
  assert.equal(g.get(key).items[0].sets[0], "20kg*12*3");
});
test("push permission, enrollment and schedule use owner-bound RPC contracts; pause follows start", async () => {
  const m = mem(),
    calls = [];
  let owner = "owner";
  let requested = 0;
  const client = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return {
        data: name === "gym_push_public_config" ? { publicKey: "AQID" } : true,
        error: null,
      };
    },
  };
  const env = {
    Notification: {
      requestPermission: async () => {
        requested++;
        return "granted";
      },
    },
    PushManager: class {},
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => null,
            subscribe: async (o) => {
              assert.equal(o.userVisibleOnly, true);
              return {
                toJSON: () => ({ endpoint: "https://web.push.apple.com/test" }),
              };
            },
          },
        }),
      },
    },
  };
  const p = new RestNotifications(client, () => owner, m, env);
  await p.enable();
  assert.equal(requested, 1);
  assert.equal(calls[1][0], "gym_push_enroll");
  assert(calls[1][1].p_device);
  const deadline = Date.now() + 90000;
  await Promise.all([p.schedule(deadline), p.schedule(null)]);
  assert.equal(calls.at(-2)[1].p_due, new Date(deadline).toISOString());
  assert.equal(calls.at(-1)[1].p_due, null);
  owner = "guest";
  assert.equal(await p.schedule(deadline), false);
  await assert.rejects(p.enable(), /恢复账号/);
});
test("PWA caches every shell module atomically and reads cached navigation/assets without network; push opens app", async () => {
  const events = {},
    added = [],
    shown = [];
  let network = 0;
  const scope = "https://example.test/gym/";
  const cache = {
    addAll: async (requests) => added.push(...requests.map((r) => r.url)),
    match: async (path) => ({ cached: String(path) }),
  };
  const self = {
    location: { origin: "https://example.test" },
    registration: { scope, showNotification: async (...a) => shown.push(a) },
    addEventListener: (name, fn) => (events[name] = fn),
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [],
      openWindow: async (url) => url,
    },
  };
  // Browser-relative Request accepts local paths; Node requires an absolute URL.
  class SWRequest extends Request {
    constructor(url, opts) {
      super(new URL(url, scope), opts);
    }
  }
  vm.runInNewContext(
    await readFile(new URL("../sw.js", import.meta.url), "utf8"),
    {
      self,
      caches: {
        open: async () => cache,
        keys: async () => [],
        delete: async () => {},
      },
      Request: SWRequest,
      URL,
      Response,
      fetch: async () => {
        network++;
        throw Error("offline");
      },
    },
  );
  let work;
  events.install({ waitUntil: (p) => (work = p) });
  await work;
  assert(added.includes(scope + "src/adaptive.js"));
  assert(added.includes(scope + "src/notifications.js"));
  for (const url of added) {
    const path = new URL(url).pathname.slice(5) || "index.html";
    await readFile(new URL("../" + path, import.meta.url));
  }
  events.fetch({
    request: {
      url: scope + "index.html?v=57",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => (work = p),
  });
  assert.match((await work).cached, /index.html/);
  assert.equal(network, 0);
  events.fetch({
    request: { url: scope + "src/app.js?v=58", method: "GET", mode: "cors" },
    respondWith: (p) => (work = p),
  });
  assert.match((await work).cached, /src\/app.js/);
  assert.equal(network, 0);
  events.push({
    data: { json: () => ({ title: "休息结束" }) },
    waitUntil: (p) => (work = p),
  });
  await work;
  assert.equal(shown[0][0], "休息结束");
  events.notificationclick({
    notification: { close: () => {} },
    waitUntil: (p) => (work = p),
  });
  assert.equal(await work, scope);
});
