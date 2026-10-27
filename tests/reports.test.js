import test from "node:test";
import assert from "node:assert/strict";
import { summarize, calendarDays } from "../src/reports.js";
import {
  PLAN,
  LEGACY_PLAN,
  V50_PLAN,
  V51_PLAN,
  V52_PLAN,
  V53_PLAN,
  V59_PLAN,
  V60_PLAN,
  templateFor,
  loggingMode,
} from "../src/catalog.js";
const record = (date, name = "平板卧推", sets = ["20kg*8*3"]) => ({
  date,
  items: [{ name, sets }],
});
test("report separates basketball, rest, missing days, timing and unparseable data", () => {
  const result = summarize(
    [
      record("2026-10-01"),
      record("2026-10-02", "篮球", []),
      record("2026-10-03", "休息", []),
    ],
    "2026-10-01",
    "2026-10-03",
  );
  assert.equal(result.strength, 1);
  assert.equal(result.rest, 1);
  assert.equal(result.basketball, 1);
  assert.equal(result.unlogged, 0);
  assert.equal(result.volume, 480);
  const sparse = summarize(
    [record("2026-10-01", "平板支撑", ["40s*2", "bad"])],
    "2026-10-01",
    "2026-10-03",
  );
  assert.equal(sparse.seconds, 80);
  assert.equal(sparse.unknown, 1);
  assert.equal(sparse.unlogged, 2);
  assert.equal(sparse.rest, 0);
});
test("history corrections recompute metrics without merging single and double arm", () => {
  const rows = [
    record("2026-10-01", "双臂哑铃俯身划船"),
    record("2026-10-02", "单臂哑铃划船", ["15kg*10*3"]),
  ];
  const result = summarize(rows, "2026-10-01", "2026-10-03");
  assert.equal(Object.keys(result.exercises).length, 2);
  assert.equal(summarize(rows.slice(0, 1), "2026-10-01", "2026-10-03").sets, 3);
});
test("new template replaces double arm rows and preserves in-progress legacy semantics", () => {
  assert(PLAN.Pull.items.some((x) => x[0] === "单臂哑铃划船"));
  assert(!PLAN.Pull.items.some((x) => x[0] === "双臂哑铃俯身划船"));
  assert(PLAN.Push.items.some((x) => x[0] === "站姿哑铃侧平举"));
  assert(PLAN.Pull.items.some((x) => x[0] === "坐姿俯身反向飞鸟"));
  assert(PLAN.Legs.items.some((x) => x[0] === "平板支撑"));
  assert.equal(
    templateFor({
      module: "Pull",
      rows: { "2-0": { edited: true, kg: "20" } },
    }),
    LEGACY_PLAN.Pull,
  );
  assert.equal(
    templateFor({
      module: "Pull",
      planVersion: 50,
      rows: { "2-0": { edited: true } },
    }),
    V50_PLAN.Pull,
  );
  assert.equal(templateFor({ module: "Pull", rows: {} }), PLAN.Pull);
});
test("calendar distinguishes missing dates from explicit rest", () => {
  const days = calendarDays(
    [record("2026-10-17", "休息", [])],
    "2026-10-18",
    2,
  );
  assert.deepEqual(
    days.map((x) => x.module),
    ["Rest", "Unlogged"],
  );
});

test("leg plus core plan separates bodyweight reps and per-side seconds, preserving V50 drafts", () => {
  assert.equal(
    PLAN.Legs.items.reduce((sum, x) => sum + Number(x[1][0]), 0),
    10,
  );
  assert.equal(
    PLAN.Legs.items.slice(0, 2).reduce((sum, x) => sum + Number(x[1][0]), 0),
    4,
  );
  assert.equal(loggingMode("死虫式"), "bodyweight");
  assert.equal(loggingMode("屈膝侧桥"), "seconds");
  assert.equal(
    templateFor({
      module: "Legs",
      planVersion: 50,
      rows: { "1-0": { done: true } },
    }),
    V50_PLAN.Legs,
  );
  assert.equal(
    templateFor({
      module: "Legs",
      planVersion: 53,
      rows: { "1-0": { done: true } },
    }),
    V53_PLAN.Legs,
  );
  assert(V50_PLAN.Legs.items.some((x) => x[0] === "高脚杯深蹲"));
});

test("retain Bulgarian and plank without remapping an unfinished V51 draft", () => {
  assert(PLAN.Legs.items.some((x) => x[0] === "保加利亚分腿蹲"));
  assert.equal(loggingMode("自重保加利亚分腿蹲"), "bodyweight");
  assert.equal(
    templateFor({
      module: "Legs",
      planVersion: 51,
      rows: { "3-0": { done: true } },
    }),
    V51_PLAN.Legs,
  );
  assert.equal(V51_PLAN.Legs.items[3][0], "死虫式");
  assert.equal(PLAN.Legs.items[1][0], "平板支撑");
});

test("V60 removes floor side bridge and static suitcase hold without rewriting an active V59 draft", () => {
  const names = V60_PLAN.Legs.items.map((x) => x[0]);
  assert(names.includes("站姿绳索抗旋转推"));
  assert(names.includes("站姿绳索斜向下拉"));
  assert(!names.includes("屈膝侧桥"));
  assert(!names.includes("站姿单侧哑铃静止保持"));
  assert.equal(loggingMode("站姿绳索抗旋转推"), "weighted");
  assert.equal(
    templateFor({
      module: "Legs",
      planVersion: 59,
      rows: { "3-0": { done: true } },
    }),
    V59_PLAN.Legs,
  );
});

test("weighted new plan never rewrites a V52 bodyweight draft", () => {
  assert.equal(
    templateFor({
      module: "Legs",
      planVersion: 52,
      rows: { "0-0": { done: true } },
    }),
    V52_PLAN.Legs,
  );
  assert.equal(loggingMode(PLAN.Legs.items[1][0]), "seconds");
  assert.equal(loggingMode(PLAN.Legs.items[2][0]), "weighted");
});
