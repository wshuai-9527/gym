import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkSet } from "../src/core.js";
import { restSeconds } from "../src/catalog.js";
test("completed sets require valid measurements, not only a tick", () => {
  for (const kg of ["", " ", "bad", "-1", "1001"])
    assert.throws(() => validateWorkSet({ kg, reps: "12" }, "weighted"));
  for (const reps of ["", "0", "-1", "1.5", "1001", "NaN"])
    assert.throws(() => validateWorkSet({ kg: "15", reps }, "weighted"));
  assert.doesNotThrow(() =>
    validateWorkSet({ kg: "15", reps: "12" }, "weighted"),
  );
  assert.doesNotThrow(() =>
    validateWorkSet({ kg: "", reps: "10" }, "bodyweight"),
  );
  assert.doesNotThrow(() => validateWorkSet({ kg: "", reps: "60" }, "seconds"));
});
test("rest defaults distinguish heavy split squats, isolation and core", () => {
  assert.equal(restSeconds("保加利亚分腿蹲"), 150);
  assert.equal(restSeconds("单臂哑铃划船"), 150);
  assert.equal(restSeconds("地面哑铃臀桥"), 90);
  assert.equal(restSeconds("平板支撑"), 60);
});
