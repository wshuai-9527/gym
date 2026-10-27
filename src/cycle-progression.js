import { adaptiveItems } from "./adaptive.js";
import { canon, parseSet } from "./core.js";
import { loggingMode } from "./catalog.js";
import { trainingCycles } from "./cycles.js";

function history(records, name, today) {
  return records
    .filter(
      (r) =>
        r.date <= today && r.items.some((i) => canon(i.name) === canon(name)),
    )
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => {
      const item = r.items.find((i) => canon(i.name) === canon(name)),
        sets = [];
      let invalid = false;
      for (const raw of item.sets) {
        try {
          const p = parseSet(raw);
          if (
            p.count < 1 ||
            p.count > 100 ||
            (!p.reps && !p.sec) ||
            p.kg > 1000 ||
            p.reps > 1000 ||
            p.sec > 86400
          ) {
            invalid = true;
            continue;
          }
          for (let i = 0; i < p.count; i++)
            sets.push({ ...p, weighted: /kg/i.test(raw) });
        } catch {
          invalid = true;
        }
      }
      return { date: r.date, sets, invalid, feedback: item.feedback };
    });
}
const age = (today, date) => (Date.parse(today) - Date.parse(date)) / 86400000;
export function nextCycleItems(records, items, module, today) {
  const cycles = trainingCycles(records, today).completed;
  const latest = cycles[0],
    previous = cycles[1];
  return adaptiveItems(records, items, module, today).map((ex, index) => {
    const n = parseInt(items[index][1]),
      mode = loggingMode(ex[0]),
      timed = mode.endsWith("seconds");
    const bounds = items[index][1].match(/(\d+)[–-](\d+)/),
      lo = bounds ? +bounds[1] : 8,
      hi = bounds ? +bounds[2] : 12;
    const hits = history(records, ex[0], today),
      actual = hits[0];
    const meta = {
      ...ex[4],
      action: "hold",
      cycleId: latest?.id || null,
      weightProposal: null,
    };
    const finish = () => [ex[0], ex[1], ex[2], ex[3], meta];
    // A new warning always wins, even when the current cycle is incomplete.
    if (
      actual &&
      age(today, actual.date) <= 28 &&
      (actual.feedback?.pain ||
        actual.feedback?.quality === false ||
        meta.sets < n)
    ) {
      meta.action = meta.paused || actual.feedback?.pain ? "pause" : "reduce";
      return finish();
    }
    if (ex[0] === "壶铃摆动") return finish();
    // Start from recorded loads/reps; old eager per-exposure progression is not
    // applied before a complete cycle. Never reinterpret an active draft here.
    if (actual && age(today, actual.date) <= 28 && !actual.invalid) {
      meta.perSet = actual.sets.slice(0, n).map((s) => ({
        kg: s.weighted ? s.kg : null,
        reps: timed ? s.sec : s.reps,
      }));
    }
    meta.message = latest
      ? "保持最近有效负重；本轮证据不足时先巩固"
      : "完成一轮三分化后，结合逐组记录和反馈生成下轮建议";
    if (!latest || !actual || actual.invalid || age(today, actual.date) > 28)
      return finish();
    const completedHits = hits.filter((h) => h.date <= latest.end),
      last = completedHits[0];
    // If this movement has already been performed in the unfinished next cycle,
    // do not reapply an old increase or replace its more recent recorded load.
    if (
      actual.date > latest.end ||
      !last ||
      last.date < latest.start ||
      last.invalid ||
      last.sets.length !== n
    ) {
      meta.message =
        actual.date > latest.end
          ? "本轮已记录，先沿用最新实际表现；完整周期结束后再调整"
          : "本周期该动作未完整记录，先保持重量并补齐工作组";
      return finish();
    }
    const f = last.feedback;
    if (timed) {
      meta.message =
        "沿用最近各组实际时长；先保持呼吸和姿势，不自动延长或把秒数当次数";
      return finish();
    }
    const hasEffort = f && ["easy", "steady", "hard"].includes(f.rating);
    if (!hasEffort) {
      meta.message =
        "缺少这次感觉反馈，暂不加重；下次选合适／轻松／吃力以便调整";
      return finish();
    }
    if (f.rating === "hard") {
      meta.message =
        "上轮吃力：保持负重和次数，先保证休息与动作控制，不继续加量";
      return finish();
    }
    const sameLast = last.sets.every(
      (s) =>
        s.weighted === last.sets[0].weighted &&
        s.kg === last.sets[0].kg &&
        s.reps > 0,
    );
    if (!sameLast) {
      meta.message =
        "组间负重不同：保留逐组重量与次数，先稳定完成，不按最高重量整场加重";
      return finish();
    }
    const kg = last.sets[0].kg;
    const pair = completedHits.slice(0, 2);
    const ready =
      previous &&
      pair.length === 2 &&
      pair[1].date >= previous.start &&
      pair[1].date <= previous.end &&
      pair.every(
        (h) =>
          !h.invalid &&
          h.sets.length === n &&
          age(today, h.date) <= 42 &&
          h.feedback?.confirmed === true &&
          h.feedback.quality === true &&
          h.feedback.pain === false &&
          Number.isFinite(h.feedback.rir) &&
          h.feedback.rir >= 2 &&
          h.sets.every((s) => s.weighted && s.kg === kg && s.reps >= hi),
      );
    if (ready && mode === "weighted" && kg > 0 && 0.5 / kg <= 0.05) {
      meta.action = "weight";
      meta.weightProposal = Array.from({ length: n }, () => ({
        kg: kg + 0.5,
        reps: lo,
      }));
      meta.message = `最近两轮全组达标且动作状态明确：器械支持时可采用 ${kg + 0.5}kg × ${lo}次 × ${n}组；先试练，不合适就回原重`;
      // Equipment availability is not known. One explicit tap confirms that
      // this increment exists before it is copied into uncompleted input rows.
      return finish();
    }
    const eligible = meta.perSet
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.reps > 0 && p.reps < hi)
      .sort((a, b) => a.p.reps - b.p.reps);
    if (eligible.length) {
      const i = eligible[0].i;
      meta.perSet = meta.perSet.map((p, j) =>
        (f.rating === "easy" || j === i) && p.reps < hi
          ? { ...p, reps: p.reps + 1 }
          : p,
      );
      meta.action = "reps";
      meta.message =
        f.rating === "easy"
          ? `上轮轻松：重量保持，未到上限的各组增加 1 次；动作可控、无痛时尝试`
          : `上轮合适：重量保持，先把第 ${i + 1} 组增加 1 次（${meta.perSet[i].reps}次），其余组沿用；动作可控、无痛时尝试`;
    } else {
      meta.message =
        kg > 0 && 0.5 / kg > 0.05
          ? "已到次数上限；0.5kg超过5%，不跳档或自动加组，先巩固或使用更小配重"
          : "已到次数上限；连续两轮全组达标并独立确认动作稳定、无痛后再考虑加重";
    }
    return finish();
  });
}
