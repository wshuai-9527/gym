import { canon, parseSet } from "./core.js";
import { loggingMode } from "./catalog.js";
export const FEEDBACK = {
  easy: { rir: 3, quality: true, pain: false },
  steady: { rir: 2, quality: true, pain: false },
  hard: { rir: 1, quality: true, pain: false },
  form: { rir: 0, quality: false, pain: false },
  pain: { rir: 0, quality: false, pain: true },
};
export function feedbackValue(value) {
  return FEEDBACK[value] ? { ...FEEDBACK[value], rating: value } : null;
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
  let extra = 0;
  return items.map((ex) => {
    const n = parseInt(ex[1]),
      mode = loggingMode(ex[0]);
    const bounds = ex[1].match(/(\d+)[–-](\d+)/);
    const lo = bounds ? +bounds[1] : mode === "seconds" ? 20 : 8,
      hi = bounds ? +bounds[2] : mode === "seconds" ? 120 : 12;
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
        reps: mode === "seconds" ? p.sec : p.reps,
      }));
      kg = perSet[0].kg;
      reps = perSet[0].reps;
    }
    const valid = hits.filter(
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
      (!f.quality ||
        (valid.slice(0, 2).length === 2 &&
          valid
            .slice(0, 2)
            .every(
              (h) =>
                h.feedback?.rir <= 1 &&
                h.sets.every((s) => (s.sec || s.reps) < lo),
            )))
    ) {
      sets = Math.max(mode === "seconds" ? 1 : 2, n - 1);
      if (kg > 0) {
        kg = Math.floor(kg * 0.9 * 2) / 2;
        perSet = perSet.map((p) => ({
          ...p,
          kg: p.kg > 0 ? Math.floor(p.kg * 0.9 * 2) / 2 : p.kg,
        }));
      }
      message = "先降低负荷与组数，恢复动作控制";
    } else if (fresh && f?.quality && f.rir >= 2) {
      const two = valid.slice(0, 2);
      const same =
        two.length === 2 &&
        kg > 0 &&
        two.every(
          (h) =>
            h.feedback?.quality &&
            !h.feedback?.pain &&
            h.feedback?.rir >= 2 &&
            h.sets.every((s) => s.weighted && s.kg === kg && s.reps >= hi),
        );
      if (same && mode === "weighted" && 0.5 / kg <= 0.05) {
        kg = Math.round((kg + 0.5) * 2) / 2;
        reps = lo;
        perSet = Array.from({ length: n }, () => ({ kg, reps }));
        message =
          "连续达标，建议加0.5kg并回到次数下限；器械不支持此小档位就维持原重";
      } else if (mode === "seconds") {
        perSet = perSet.map((p) => ({
          ...p,
          reps: p.reps < 60 ? Math.min(60, p.reps + 5) : p.reps,
        }));
        message = "保持呼吸与姿势；稳定后小幅增加时间";
      } else if (perSet.some((p) => p.reps < hi)) {
        perSet = perSet.map((p) => ({ ...p, reps: Math.min(hi, p.reps + 1) }));
        message = "保持重量，各组先增加1次，最多到范围上限";
      } else if (
        module !== "Legs" &&
        valid.length === 3 &&
        valid.every(
          (h) =>
            h.feedback?.rating === "easy" && h.sets.every((s) => s.reps >= hi),
        ) &&
        n < 4 &&
        extra < 2 &&
        (!kg || 0.5 / kg > 0.05)
      ) {
        sets = n + 1;
        extra++;
        message = "连续三次轻松达标，先增加1组；本次不同时加重量";
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
