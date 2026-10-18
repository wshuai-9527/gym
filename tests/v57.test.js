import test from "node:test";
import assert from "node:assert/strict";
import { progressionAdvice } from "../src/progression.js";
import { exerciseVisual } from "../src/exercise-visuals.js";
import { reportFresh } from "../src/report-inbox.js";
import { PLAN } from "../src/catalog.js";
import { summarize } from "../src/reports.js";
const record = (date, sets, name = "平板卧推") => ({
  date,
  items: [{ name, sets }],
});
test("load review needs two exposures with same load and full target reps, never auto changes kg", () => {
  const rs = [
    record("2025-06-08", ["20kg*12*3"]),
    record("2025-06-12", ["20kg*12*3"]),
  ];
  const snapshot = JSON.stringify(rs);
  assert.equal(
    progressionAdvice(rs, "平板卧推", "3 × 8–12", "2025-06-15").ready,
    true,
  );
  assert.equal(JSON.stringify(rs), snapshot);
  assert.equal(
    progressionAdvice([rs[0]], "平板卧推", "3 × 8–12", "2025-06-15").ready,
    false,
  );
  assert.equal(
    progressionAdvice(
      [rs[0], record("2025-06-12", ["20kg*11*3"])],
      "平板卧推",
      "3 × 8–12",
      "2025-06-15",
    ).ready,
    false,
  );
  assert.equal(
    progressionAdvice(
      [rs[0], record("2025-06-12", ["22.5kg*12*3"])],
      "平板卧推",
      "3 × 8–12",
      "2025-06-15",
    ).ready,
    false,
  );
  assert.equal(
    progressionAdvice(rs, "单臂哑铃划船", "3 × 8–12", "2025-06-15").ready,
    false,
  );
  assert.equal(
    progressionAdvice(rs, "平板卧推", "3 × 8–12", "2025-08-15").ready,
    false,
  );
});
test("all current movements have two-pose illustrations and no external tracking images", () => {
  for (const p of Object.values(PLAN))
    for (const [name] of p.items) {
      const svg = exerciseVisual(name);
      assert.match(svg, /<svg/);
      assert.match(svg, /role="img"/);
      assert(!svg.includes("<image"));
    }
  assert.equal(exerciseVisual("<img onerror=alert(1)>"), "");
});
test("AI snapshots become stale after edits, additions, deletions or pending local changes", () => {
  const report = {
    source_start: "2025-06-01",
    period_end: "2025-06-03",
    source_versions: { "record:2025-06-02": 2 },
  };
  const store = {
    state: {
      docs: { "record:2025-06-02": { version: 2 } },
      pending: [],
      conflicts: {},
    },
  };
  assert.equal(reportFresh(report, store), true);
  store.state.pending = [{ key: "record:2025-06-02" }];
  assert.equal(reportFresh(report, store), false);
  store.state.pending = [];
  store.state.docs["record:2025-06-02"].version = 3;
  assert.equal(reportFresh(report, store), false);
  store.state.docs["record:2025-06-02"].version = 2;
  store.state.docs["record:2025-06-01"] = { version: 1 };
  assert.equal(reportFresh(report, store), false);
});
test("period metrics separate weighted, bodyweight and time sets", () => {
  const r = summarize(
    [
      {
        date: "2025-06-02",
        items: [
          { name: "平板卧推", sets: ["20kg*10*3"] },
          { name: "仰卧小幅卷腹", sets: ["12*2"] },
          { name: "平板支撑", sets: ["45s*2"] },
        ],
      },
    ],
    "2025-06-01",
    "2025-06-03",
  );
  assert.deepEqual(
    [r.weightedSets, r.bodySets, r.timedSets, r.sets],
    [3, 2, 2, 7],
  );
});
