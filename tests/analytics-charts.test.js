import test from "node:test";
import assert from "node:assert/strict";
import {
  chartData,
  trendModel,
  renderAnalytics,
} from "../src/analytics-charts.js";
const record = (date, name, sets) => ({ date, items: [{ name, sets }] });
const today = "2026-10-27";
test("charts count recorded sets once, separate core, exclude future and invalid sets", () => {
  const d = chartData(
    [
      record("2026-10-25", "单手哑铃划船", ["15kg*12*2"]),
      record("2026-10-26", "保加利亚分腿蹲", ["12.5kg*12*2"]),
      record("2026-10-26", "平板支撑", ["80s*2"]),
      record("2026-10-27", "站姿单侧哑铃静止保持", ["5kg*30s*2", "bad", "0"]),
      record("2026-10-28", "平板卧推", ["20kg*10*100"]),
      record("2026-09-01", "平板卧推", ["20kg*10*100"]),
    ],
    today,
  );
  assert.equal(d.weeks.length, 6);
  assert.deepEqual(d.weeks.at(-1).counts, {
    Push: 0,
    Pull: 2,
    Legs: 2,
    Core: 4,
  });
  const holds = trendModel(d, "站姿单侧哑铃静止保持");
  assert.equal(holds.points[0].value, 30);
  assert.equal(holds.points[0].count, 2);
  assert(holds.load.timed);
  assert(!d.exercises["平板卧推"]);
});
test("trend matches actual first set at one load and never merges single/double arm rows", () => {
  const d = chartData(
    [
      record("2026-10-10", "单臂划船", ["20kg*10", "30kg*5"]),
      record("2026-10-12", "单手哑铃划船", ["15kg*12*2"]),
      record("2026-10-14", "双臂哑铃俯身划船", ["40kg*8"]),
      record("2026-10-16", "单臂哑铃划船", ["15kg*11*3"]),
      record("2026-10-18", "单臂哑铃划船", ["bad", "15kg*13"]),
    ],
    today,
  );
  const m = trendModel(d, "单臂哑铃划船");
  assert.equal(m.load.kg, 15);
  assert.deepEqual(
    m.points.map((p) => p.value),
    [12, 11],
  );
  assert.deepEqual(
    m.points.map((p) => p.count),
    [2, 3],
  );
  assert.equal(
    trendModel(d, "单臂哑铃划船", "weighted:reps:20").points[0].value,
    10,
  );
  assert.equal(m.loads.length, 2); // the later 30kg set is not a first-set load option
  assert(d.exercises["双臂哑铃俯身划船"]);
  assert.equal(
    renderAnalytics(
      [record("2026-10-18", "平板卧推", ["bad", "15kg*13"])],
      today,
    ).selection.loadKey,
    undefined,
  );
});
test("two completed cycles can cross gaps and rest; incomplete third cycle is excluded", () => {
  const d = chartData(
    [
      record("2026-10-01", "平板卧推", ["15kg*10*3"]),
      record("2026-10-02", "篮球", []),
      record("2026-10-04", "高位下拉", ["30kg*12*3"]),
      record("2026-10-06", "保加利亚分腿蹲", ["15kg*12*2"]),
      record("2026-10-10", "平板卧推", ["15kg*11*3"]),
      record("2026-10-12", "高位下拉", ["30kg*12*3"]),
      record("2026-10-14", "平板支撑", ["80s*2"]),
      record("2026-10-20", "平板卧推", ["15kg*12*3"]),
    ],
    today,
  );
  assert.equal(d.cycles.length, 2);
  assert.equal(d.cycles[0].start, "2026-10-01");
  assert.equal(d.cycles[1].end, "2026-10-14");
  assert.equal(d.cycles[1].counts.Core, 2);
  assert.equal(d.cycles[1].counts.Push, 3);
});
test("rendering has empty states, accessible units and escapes user exercise names", () => {
  const empty = renderAnalytics([], today).html;
  assert.match(empty, /没有可解析/);
  assert.match(empty, /完成两轮/);
  const html = renderAnalytics(
    [record(today, "<img src=x onerror=alert(1)>", ["12"])],
    today,
  ).html;
  assert(!html.includes("<img"));
  assert(html.includes("&lt;img"));
  assert(html.includes("aria-label"));
  const timed = renderAnalytics(
    [record(today, "平板支撑", ["80s"])],
    today,
  ).html;
  assert(timed.includes("纵轴：秒"));
  assert(timed.includes("仅 1 次记录"));
});
