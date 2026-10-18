import test from "node:test";
import assert from "node:assert/strict";
import { threeDayReports, summarize, calendarDays } from "../src/reports.js";
import {
  PLAN,
  LEGACY_PLAN,
  V50_PLAN,
  templateFor,
  loggingMode,
} from "../src/catalog.js";
const record = (date, name = "平板卧推", sets = ["20kg*8*3"]) => ({
  date,
  items: [{ name, sets }],
});
test("three-day reports have stable complete non-overlapping calendar periods", () => {
  const reports = threeDayReports([], "2026-10-18");
  const [latest, previous] = reports.completed;
  assert.equal(Date.parse(latest.end) - Date.parse(latest.start), 2 * 86400000);
  assert.equal(Date.parse(latest.start) - Date.parse(previous.end), 86400000);
  assert.equal(
    Date.parse(reports.current.start) - Date.parse(latest.end),
    86400000,
  );
  assert(latest.end < "2026-10-18");
  assert.equal(reports.current.complete, false);
  const samePeriod = threeDayReports([record(latest.start)], "2026-10-18");
  assert.equal(samePeriod.completed[0].start, latest.start);
  assert.equal(samePeriod.completed[0].strength, 1);
  assert.equal(latest.unlogged, 3);
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
test("history corrections recompute reports; single and double arm are not merged", () => {
  const window = threeDayReports([], "2026-10-18").completed[0];
  const records = [
    record(window.start, "双臂哑铃俯身划船"),
    record(window.end, "单臂哑铃划船", ["15kg*10*3"]),
  ];
  const report = threeDayReports(records, "2026-10-18").completed[0];
  assert.equal(Object.keys(report.exercises).length, 2);
  assert.equal(report.comparable.length, 0);
  assert.equal(
    threeDayReports([records[0]], "2026-10-18").completed[0].sets,
    3,
  );
});
test("new template replaces double arm rows and preserves in-progress legacy semantics", () => {
  assert(PLAN.Pull.items.some((x) => x[0] === "单臂哑铃划船"));
  assert(!PLAN.Pull.items.some((x) => x[0] === "双臂哑铃俯身划船"));
  assert(PLAN.Push.items.some((x) => x[0] === "站姿哑铃侧平举"));
  assert(PLAN.Pull.items.some((x) => x[0] === "坐姿俯身反向飞鸟"));
  assert(PLAN.Legs.items.some((x) => x[0] === "死虫式"));
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
    PLAN.Pull,
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
      planVersion: 51,
      rows: { "1-0": { done: true } },
    }),
    PLAN.Legs,
  );
  assert(V50_PLAN.Legs.items.some((x) => x[0] === "高脚杯深蹲"));
});
