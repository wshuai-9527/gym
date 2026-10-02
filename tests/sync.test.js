import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage.js";
import { Sync } from "../src/sync.js";
function fixture() {
  const m = new Map(),
    storage = {
      getItem: (k) => m.get(k) || null,
      setItem: (k, v) => m.set(k, v),
    };
  const s = new Store(storage, "user-a");
  s.transaction((x) => (x.legacyLoaded = true));
  let remote = [],
    calls = [],
    fail = false;
  const receipts = new Map();
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-a" } } }) },
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: async () => ({ data: remote, error: null }),
      };
      return q;
    },
    rpc: async (name, p) => {
      calls.push(p);
      if (receipts.has(p.p_mutation))
        return { data: receipts.get(p.p_mutation) };
      const old = remote.find((x) => x.key === p.p_key),
        v = old?.version || 0;
      if (v !== p.p_expected)
        return { data: { conflict: true, document: old } };
      const document = { key: p.p_key, value: p.p_value, version: v + 1 },
        data = { conflict: false, document };
      remote = remote.filter((x) => x.key !== p.p_key).concat(document);
      receipts.set(p.p_mutation, data);
      if (fail) {
        fail = false;
        return { error: { message: "response lost" } };
      }
      return { data };
    },
  };
  return {
    s,
    client,
    calls,
    setRemote: (v) => (remote = v),
    loseResponse: () => (fail = true),
  };
}
test("guest saves remain local without authentication requests", async () => {
  const f = fixture();
  const s = new Store(f.s.storage, "guest");
  s.put("draft:active", { rows: { a: { done: true } } });
  let authCalls = 0,
    message;
  f.client.auth.getUser = async () => {
    authCalls++;
    throw Error("unexpected auth");
  };
  await new Sync(f.client, s, (m) => {
    message = m;
  }).run();
  assert.equal(authCalls, 0);
  assert.equal(s.state.pending.length, 1);
  assert.match(message, /登录后/);
});
test("network retry uses same mutation and acknowledges exactly once", async () => {
  const f = fixture(),
    status = [];
  f.s.put("draft:active", { rows: { a: { done: true } } });
  const id = f.s.state.pending[0].id;
  f.loseResponse();
  const sync = new Sync(f.client, f.s, (m) => status.push(m));
  await sync.run();
  assert.equal(f.s.state.pending.length, 1);
  await sync.run();
  assert.equal(f.s.state.pending.length, 0);
  assert.equal(f.calls[0].p_mutation, id);
  assert.equal(f.calls[1].p_mutation, id);
  assert.equal(f.s.state.docs["draft:active"].version, 1);
});
test("cloud conflict preserves local version without upload", async () => {
  const f = fixture();
  f.s.put("record:2026-10-02", { local: true });
  f.setRemote([
    { key: "record:2026-10-02", value: { remote: true }, version: 3 },
  ]);
  await new Sync(f.client, f.s, () => {}).run();
  assert.equal(f.calls.length, 0);
  assert.equal(f.s.get("record:2026-10-02").local, true);
  assert.equal(f.s.state.conflicts["record:2026-10-02"].version, 3);
});
test("missing schema reports pending migration and retains queue", async () => {
  const f = fixture(),
    status = [];
  f.s.put("draft:active", {});
  f.client.from = () => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      range: async () => ({
        data: null,
        error: { code: "42P01", message: "missing" },
      }),
    };
    return q;
  };
  await new Sync(f.client, f.s, (m) => status.push(m)).run();
  assert.equal(f.s.state.pending.length, 1);
  assert.ok(status[0].includes("待审核"));
});
test("account mismatch never sends another users queue", async () => {
  const f = fixture();
  f.s.put("draft:active", {});
  f.client.auth.getUser = async () => ({ data: { user: { id: "user-b" } } });
  await new Sync(f.client, f.s, () => {}).run();
  assert.equal(f.calls.length, 0);
});
