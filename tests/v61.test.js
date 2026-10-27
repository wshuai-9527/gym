import test from "node:test";
import assert from "node:assert/strict";
import { PLAN, V60_PLAN, templateFor, loggingMode } from "../src/catalog.js";
import { currentPlan, moduleOf } from "../src/core.js";
import { nextCycleItems } from "../src/cycle-progression.js";
import { exerciseVisual } from "../src/exercise-visuals.js";
import { exerciseWarmupCue } from "../src/preparation.js";

test("no-cable plan starts shoulder taps independently of ambiguous legacy counts", () => {
  const names = PLAN.Legs.items.map((x) => x[0]);
  assert.deepEqual(names, [
    "壶铃摆动",
    "平板支撑",
    "保加利亚分腿蹲",
    "罗马尼亚硬拉",
    "直臂支撑交替触肩",
  ]);
  const records = [
    { date: "2026-10-26", items: [{ name: "平板支撑肩触碰", sets: ["20*3"] }] },
  ];
  const taps = nextCycleItems(
    records,
    PLAN.Legs.items,
    "Legs",
    "2026-10-27",
  )[4];
  assert.equal(loggingMode(taps[0]), "bodyweight");
  assert.equal(moduleOf([{ name: taps[0], sets: ["6*2"] }]), "Legs");
  assert(exerciseVisual(taps[0]).includes("<svg"));
  assert.match(exerciseWarmupCue(taps[0], PLAN.Legs.items), /手腕/);
  assert(!JSON.stringify(taps).includes('"reps":20'));
});

test("swing stays at prescribed 10kg 2x10 despite old high-rep history and respects pain", () => {
  const rows = [
    {
      date: "2026-10-26",
      items: [
        {
          name: "壶铃摆动",
          sets: ["20kg*20*4"],
          feedback: {
            rating: "easy",
            rir: 3,
            quality: true,
            pain: false,
            confirmed: true,
          },
        },
      ],
    },
  ];
  const get = () =>
    nextCycleItems(rows, PLAN.Legs.items, "Legs", "2026-10-27")[0];
  assert.deepEqual(get()[4].perSet, [
    { kg: 10, reps: 10 },
    { kg: 10, reps: 10 },
  ]);
  assert.equal(get()[4].weightProposal, null);
  rows[0].items[0].feedback.pain = true;
  assert.equal(get()[4].paused, true);
  assert.equal(get()[4].action, "pause");
});

test("V60 in-progress cable draft retains its original row meanings while fresh plan is V61", () => {
  const draft = {
    date: "2026-10-27",
    module: "Legs",
    planVersion: 60,
    rows: { "3-0": { edited: true, kg: 5, reps: 8 } },
  };
  assert.equal(currentPlan([], draft, "2026-10-27").planVersion, 60);
  assert.equal(templateFor(draft), V60_PLAN.Legs);
  assert.equal(
    currentPlan([], { ...draft, rows: {} }, "2026-10-27").planVersion,
    61,
  );
});

test("feedback-only legacy draft keeps its exercise mapping without a snapshot", () => {
  for (const state of [
    { feedback: { 3: "steady" } },
    { quality: { 3: "stable" } },
  ]) {
    const draft = {
      date: "2026-10-27",
      module: "Legs",
      planVersion: 60,
      rows: {},
      ...state,
    };
    assert.equal(currentPlan([], draft, "2026-10-27").planVersion, 60);
    assert.equal(templateFor(draft), V60_PLAN.Legs);
    assert.equal(templateFor(draft).items[3][0], "站姿绳索抗旋转推");
  }
});

test("loss of swing form pauses fixed-load work even without reported pain", () => {
  const records = [
    {
      date: "2026-10-26",
      items: [
        {
          name: "壶铃摆动",
          sets: ["10kg*6"],
          feedback: {
            quality: false,
            pain: false,
            confirmed: true,
            rating: "hard",
            rir: 1,
          },
        },
      ],
    },
  ];
  const meta = nextCycleItems(
    records,
    PLAN.Legs.items,
    "Legs",
    "2026-10-27",
  )[0][4];
  assert.equal(meta.paused, true);
  assert.equal(meta.action, "pause");
  assert.equal(meta.weightProposal, null);
  assert.match(meta.message, /暂停/);
});
