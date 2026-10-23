import { canon, parseSet } from "./core.js";
import { loggingMode } from "./catalog.js";
export const FEEDBACK = {
  easy: { rir: 3, quality: null, pain: null },
  steady: { rir: 2, quality: null, pain: null },
  hard: { rir: 1, quality: null, pain: null },
  form: { rir: 0, quality: false, pain: false },
  pain: { rir: 0, quality: false, pain: true },
};
export function feedbackValue(value, state = "", mode = "weighted") {
  const f = FEEDBACK[value] ? { ...FEEDBACK[value], rating: value } : null;
  if (!f && !state) return null;
  const result = f || { rir: null, quality: null, pain: null };
  if (mode.endsWith("seconds")) result.rir = null;
  // A reported symptom takes priority over a conflicting positive selector.
  if (result.pain === true) return { ...result, confirmed: true };
  if (result.quality === false && state === "stable")
    return { ...result, confirmed: true };
  if (state === "stable")
    Object.assign(result, { quality: true, pain: false, confirmed: true });
  if (state === "form")
    Object.assign(result, { quality: false, pain: false, confirmed: true });
  if (state === "pain")
    Object.assign(result, { quality: false, pain: true, confirmed: true });
  return result;
}
function exposures(records, name, today) {
  return records
    .filter(
      (r) =>
        r.date <= today && r.items.some((i) => canon(i.name) === canon(name)),
    )
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((r) => {
      const i = r.items.find((i) => canon(i.name) === canon(name));
      const sets = [];
      let invalid = false;
      for (const raw of i.sets)
        try {
          const p = parseSet(raw);
          for (let n = 0; n < Math.min(p.count, 100); n++)
            sets.push({ ...p, weighted: /kg/i.test(raw) });
        } catch {
          invalid = true;
        }
      return { date: r.date, sets, feedback: i.feedback, invalid };
    });
}
export function adaptiveItems(records, items, module, today) {
  return items.map((ex) => {
    const n = parseInt(ex[1]),
      mode = loggingMode(ex[0]);
    const bounds = ex[1].match(/(\d+)[–-](\d+)/);
    const timed = mode.endsWith("seconds");
    const lo = bounds ? +bounds[1] : timed ? 20 : 8,
      hi = bounds ? +bounds[2] : timed ? 60 : 12;
    const hits = exposures(records, ex[0], today);
    const last = hits[0];
    const fresh =
      last && (Date.parse(today) - Date.parse(last.date)) / 86400000 <= 28;
    let sets = n,
      kg = null,
      reps = null,
      perSet = [],
      message = "参考最近记录，按本次状态确认";
    if (fresh && last.sets.length && !last.invalid) {
      perSet = last.sets.slice(0, n).map((p) => ({
        kg: p.weighted ? p.kg : null,
        reps: timed ? p.sec : p.reps,
      }));
      kg = perSet[0].kg;
      reps = perSet[0].reps;
    }
    // Never skip the latest incomplete/invalid exposure to find older successes.
    const valid = hits
      .slice(0, 2)
      .filter(
        (h) =>
          !h.invalid &&
          h.sets.length >= n &&
          (Date.parse(today) - Date.parse(h.date)) / 86400000 <= 42,
      );
    const f = last?.feedback;
    if (fresh && f?.pain) {
      message = "上次报告疼痛：暂停该动作，恢复后再确认负荷";
    } else if (
      fresh &&
      f &&
      (f.quality === false ||
        (valid.slice(0, 2).length === 2 &&
          valid
            .slice(0, 2)
            .every(
              (h) =>
                (timed
                  ? h.feedback?.rating === "hard"
                  : Number.isFinite(h.feedback?.rir) && h.feedback.rir <= 1) &&
                h.sets.every((s) => (s.sec || s.reps) < lo),
            )))
    ) {
      sets = Math.max(timed ? 1 : 2, n - 1);
      if (kg > 0) {
        kg = Math.floor(kg * 0.9 * 2) / 2;
        perSet = perSet.map((p) => ({
          ...p,
          kg: p.kg > 0 ? Math.floor(p.kg * 0.9 * 2) / 2 : p.kg,
        }));
      }
      message = "先降低负荷与组数，恢复动作控制";
    } else if (
      fresh &&
      f?.confirmed &&
      f.quality &&
      f.pain === false &&
      (timed
        ? ["easy", "steady"].includes(f.rating)
        : Number.isFinite(f.rir) && f.rir >= 2)
    ) {
      const two = valid.slice(0, 2);
      const same =
        two.length === 2 &&
        kg > 0 &&
        two.every(
          (h) =>
            h.feedback?.quality &&
            h.feedback?.confirmed === true &&
            !h.feedback?.pain &&
            h.feedback?.rir >= 2 &&
            h.sets.every((s) => s.weighted && s.kg === kg && s.reps >= hi),
        );
      if (same && mode === "weighted" && 0.5 / kg <= 0.05) {
        message = `连续两次达标；器械支持时可手动试${kg + 0.5}kg、回到${lo}次。当前预填保持原重`;
      } else if (timed) {
        perSet = perSet.map((p) => ({
          ...p,
          reps: p.reps < hi ? Math.min(hi, p.reps + 5) : p.reps,
        }));
        message = "保持呼吸与姿势；稳定后小幅增加时间";
      } else if (perSet.some((p) => p.reps < hi)) {
        perSet = perSet.map((p) => ({ ...p, reps: Math.min(hi, p.reps + 1) }));
        message = "保持重量，各组先增加1次，最多到范围上限";
      } else {
        message = "维持重量和组数；器械没有合适小档位时继续巩固动作";
      }
    }
    if (
      module === "Legs" &&
      mode === "weighted" &&
      message === "参考最近记录，按本次状态确认"
    )
      message = "腿部以维持为主，保留当前负重，优先动作质量";
    return [
      ex[0],
      ex[1].replace(/^\d+/, String(sets)),
      ex[2],
      ex[3],
      {
        perSet,
        message,
        sets,
        paused: !!(fresh && f?.pain),
        referenceDate: last?.date || null,
      },
    ];
  });
}
