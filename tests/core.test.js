import test from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  addDays,
  parseSet,
  normalizeRecord,
  nextModule,
  restCandidate,
  analyse,
  iso,
} from "../src/core.js";
test("dates survive year rollover and reject invalid dates", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dateKey("6.28"), "2026-06-28");
  assert.throws(() => dateKey("2.30"));
  assert.equal(iso(new Date("2026-10-01T16:01:00Z")), "2026-10-02");
});
test("compressed sets and timed/bodyweight data retain count", () => {
  assert.deepEqual(parseSet("15kg×12×3"), {
    kg: 15,
    reps: 12,
    count: 3,
    sec: 0,
  });
  assert.equal(parseSet("80s*3").count, 3);
  assert.equal(parseSet("12*3").kg, 0);
  assert.throws(() => parseSet("-5kg*12"));
  assert.throws(() => parseSet("invalid"));
});
const r = (date, name, sets = []) =>
  normalizeRecord({ date, items: [{ name, sets }] });
test("basketball/rest/unknown exercises do not advance PPL", () => {
  const rs = [
    r("2026-09-29", "平板卧推", ["15kg*8"]),
    r("2026-09-30", "篮球"),
    r("2026-10-01", "休息"),
  ];
  assert.equal(nextModule(rs), "Pull");
  rs.push(r("2026-10-02", "自定义动作", ["12"]));
  assert.equal(nextModule(rs), "Pull");
});
test("auto-rest boundary and edited-only draft protection", () => {
  const rs = [r("2026-09-30", "休息")];
  assert.equal(restCandidate(rs, null, new Date("2026-10-01T15:59:00Z")), null);
  assert.equal(
    restCandidate(rs, null, new Date("2026-10-01T16:01:00Z")).date,
    "2026-10-01",
  );
  assert.equal(
    restCandidate(
      rs,
      { rows: { a: { edited: true } } },
      new Date("2026-10-01T16:01:00Z"),
    ),
    null,
  );
  assert.equal(restCandidate([], null, new Date("2026-10-01T16:01:00Z")), null);
});
test("analysis isolates recent volume from timed/bodyweight work", () => {
  const a = analyse(
    [
      r("2026-09-29", "平板卧推", ["15kg*8*3"]),
      r("2026-09-30", "平板支撑", ["80s*3"]),
      r("2026-10-01", "俯卧撑", ["12*2"]),
      r("2025-01-01", "平板卧推", ["25kg*8"]),
    ],
    "2026-10-02",
  );
  assert.equal(a.sets, 8);
  assert.equal(a.volume, 360);
  assert.equal(a.seconds, 240);
  assert.equal(a.pr["平板卧推"], 25 * (1 + 8 / 30));
});
test("scheduled rest starts from enabled date without historical backfill", () => {
  const now = new Date("2026-10-02T16:06:00Z");
  assert.equal(
    restCandidate([], null, now, "Australia/Brisbane", "2026-10-02").date,
    "2026-10-02",
  );
  assert.equal(
    restCandidate([], null, now, "Australia/Brisbane", "2026-10-03"),
    null,
  );
});
