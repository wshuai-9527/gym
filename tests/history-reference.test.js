import test from "node:test";
import assert from "node:assert/strict";
import { historyReference, historyPreset } from "../src/history-reference.js";
const r = (date, name, sets) => ({ date, items: [{ name, sets }] });
test("uses latest same exercise, excluding future and all-time high, expands compressed sets", () => {
  const history = [
    r("2025-06-01", "保加利亚分腿蹲", ["40kg*8"]),
    r("2025-06-08", "保加利亚分腿蹲", ["17.5kg*9*3"]),
    r("2025-06-12", "保加利亚分腿蹲", ["50kg*10"]),
  ];
  const ref = historyReference(history, "保加利亚分腿蹲", "2025-06-10");
  assert.equal(ref.date, "2025-06-08");
  assert.equal(ref.entries.length, 3);
  assert.deepEqual(historyPreset(ref, 1, "weighted"), { kg: 17.5, reps: 9 });
});
test("preserves per-set loads and recorded timing, without doubling", () => {
  const ref = historyReference(
    [r("2025-06-09", "保加利亚分腿蹲", ["10kg*10", "12.5kg*8"])],
    "保加利亚分腿蹲",
    "2025-06-10",
  );
  assert.deepEqual(historyPreset(ref, 0, "weighted"), { kg: 10, reps: 10 });
  assert.deepEqual(historyPreset(ref, 1, "weighted"), { kg: 12.5, reps: 8 });
  const timed = historyReference(
    [r("2025-06-09", "平板支撑", ["45s", "35s"])],
    "平板支撑",
    "2025-06-10",
  );
  assert.deepEqual(historyPreset(timed, 0, "seconds"), { reps: 45 });
  assert.deepEqual(historyPreset(timed, 1, "seconds"), { reps: 35 });
});
test("stale history stays visible but is not automatically filled", () => {
  const ref = historyReference(
    [r("2025-04-01", "地面哑铃臀桥", ["20kg*12"])],
    "地面哑铃臀桥",
    "2025-06-10",
  );
  assert.equal(ref.canPrefill, false);
  assert.equal(ref.date, "2025-04-01");
  assert.deepEqual(historyPreset(ref, 0, "weighted"), {});
});
test("no transfer from bilateral to unilateral or from weighted to bodyweight variants", () => {
  const rs = [
    r("2025-06-09", "双臂哑铃俯身划船", ["20kg*12"]),
    r("2025-06-09", "地面哑铃臀桥", ["20kg*12"]),
  ];
  assert.equal(historyReference(rs, "单臂哑铃划船", "2025-06-10"), null);
  assert.equal(historyReference(rs, "自重臀桥", "2025-06-10"), null);
});
test("does not silently fall back to older loads when latest matching data is invalid", () => {
  const ref = historyReference(
    [
      r("2025-06-09", "地面哑铃臀桥", ["bad"]),
      r("2025-06-08", "地面哑铃臀桥", ["30kg*12"]),
    ],
    "地面哑铃臀桥",
    "2025-06-10",
  );
  assert.equal(ref.date, "2025-06-09");
  assert.equal(ref.invalid, 1);
  assert.deepEqual(historyPreset(ref, 0, "weighted"), {});
});
