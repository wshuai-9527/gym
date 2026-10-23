import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { adaptiveItems, feedbackValue } from "../src/adaptive.js";
import { PLAN, V58_PLAN, templateFor, loggingMode } from "../src/catalog.js";
import { normalizeRecord, parseSet, validateWorkSet } from "../src/core.js";
import { Store } from "../src/storage.js";
import { Sync } from "../src/sync.js";
import { reportDigest, reportCard } from "../src/report-view.js";

const ex = PLAN.Push.items[0];
const rec = (day, sets, feedback = feedbackValue("steady", "stable")) => ({
  date: `2026-10-${day}`,
  items: [{ name: ex[0], sets, feedback }],
});
test("effort alone never certifies form or pain; legacy inferred feedback never triggers progression", () => {
  assert.deepEqual(feedbackValue("easy"), {
    rir: 3,
    quality: null,
    pain: null,
    rating: "easy",
  });
  const legacy = { rir: 3, quality: true, pain: false, rating: "easy" };
  for (const f of [feedbackValue("easy"), legacy]) {
    const a = adaptiveItems(
      [rec("18", ["20kg*12*3"], f), rec("22", ["20kg*12*3"], f)],
      [ex],
      "Push",
      "2026-10-23",
    )[0][4];
    assert.doesNotMatch(a.message, /手动试/);
    assert.equal(a.perSet[0].kg, 20);
  }
  const r = normalizeRecord(rec("22", ["20kg*12"], feedbackValue("steady")));
  assert.equal(r.items[0].feedback.quality, null);
});
test("an incomplete or invalid most recent exposure interrupts the two-success sequence", () => {
  for (const latest of [["20kg*12"], ["bad"]]) {
    const records = [
      rec("13", ["20kg*12*3"]),
      rec("18", ["20kg*12*3"]),
      rec("22", latest),
    ];
    const a = adaptiveItems(records, [ex], "Push", "2026-10-23")[0][4];
    assert.doesNotMatch(a.message, /手动试/);
  }
});
test("eligible increase is advice, not a silent new weight; unavailable small increments never add sets", () => {
  const a = adaptiveItems(
    [rec("18", ["20kg*12*3"]), rec("22", ["20kg*12*3"])],
    [ex],
    "Push",
    "2026-10-23",
  )[0][4];
  assert.match(a.message, /20.5kg/);
  assert.equal(a.perSet[0].kg, 20);
  assert.equal(a.sets, 3);
  const light = ["13", "18", "22"].map((d) =>
    rec(d, ["5kg*12*3"], feedbackValue("easy", "stable")),
  );
  assert.equal(adaptiveItems(light, [ex], "Push", "2026-10-23")[0][4].sets, 3);
});
test("small-mat plan removes supine movements, preserves completed V58 mappings and weighted timing", () => {
  assert.equal(PLAN.Legs.items[0][0], "平板支撑");
  assert(!PLAN.Legs.items.some(([n]) => /仰卧|臀桥|死虫/.test(n)));
  assert.equal(
    templateFor({
      module: "Legs",
      planVersion: 58,
      rows: { "3-0": { done: true } },
    }),
    V58_PLAN.Legs,
  );
  assert.equal(V58_PLAN.Legs.items[3][0], "仰卧小幅卷腹");
  const name = "站姿单侧哑铃静止保持";
  assert.equal(loggingMode(name), "weighted-seconds");
  assert.throws(() => validateWorkSet({ kg: "", reps: 20 }, loggingMode(name)));
  const r = normalizeRecord({
    date: "2026-10-22",
    items: [{ name, sets: ["5kg*20s*2"] }],
  });
  assert.equal(r.module, "Legs");
  assert.deepEqual(parseSet(r.items[0].sets[0]), {
    kg: 5,
    reps: 0,
    sec: 20,
    count: 2,
  });
});
test("current history and pending uploads survive unavailable legacy tables; tombstones prevent re-import", async () => {
  const m = new Map();
  const s = new Store(
    { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) },
    "owner",
  );
  const calls = [],
    uploads = [];
  s.put("draft:active", { rows: { "0-0": { edited: true } } });
  const remote = [
    { key: "record:2026-10-22", version: 2, value: rec("22", ["20kg*12*3"]) },
  ];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: async () => {
          calls.push(table);
          return table === "gym_documents"
            ? { data: remote }
            : { error: Error("legacy unavailable") };
        },
      };
      return q;
    },
    rpc: async (_, p) => {
      uploads.push(p);
      return {
        data: { document: { key: p.p_key, value: p.p_value, version: 1 } },
      };
    },
  };
  let status;
  const sync = new Sync(client, s, (v) => (status = v));
  await sync.run();
  assert.equal(calls[0], "gym_documents");
  assert.equal(s.records().length, 1);
  assert.equal(sync.historyState, "ready");
  assert.equal(uploads.length, 1);
  assert.equal(s.state.pending.length, 0);
  assert.match(status, /旧档案导入待重试/);
  assert.equal(s.state.legacyLoaded, false);
  await sync.run();
  assert.equal(calls.filter((x) => x === "training_days").length, 1);
});
test("old report preview excludes unchanged comparisons and nests full source closed; unsafe HTML is escaped", () => {
  const content =
    "## 本周期简述\n完成一轮。\n## 与上一完整周期同动作对比\n- 卧推：与上轮相同。\n- 划船：由1组增加到2组。\n## 下周期具体建议\n- 下拉：30kg，先维持。\n## 记录缺口与证据限制\n无核心记录，不能判断是否训练。\n<script>alert(1)</script>";
  const d = reportDigest(content);
  assert.equal(d.changes.length, 1);
  assert.match(d.changes[0], /划船/);
  const dom = new JSDOM(
    reportCard(
      { content, period_start: "2026-10-18", period_end: "2026-10-21" },
      { open: true },
    ),
  );
  assert.equal(dom.window.document.querySelector("script"), null);
  assert.equal(dom.window.document.querySelector(".report-full").open, false);
  assert(
    dom.window.document
      .querySelector(".ai-content")
      .textContent.includes("与上轮相同"),
  );
  dom.window.close();
});
