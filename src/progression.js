import { canon, parseSet } from "./core.js";
// No automatic weight change; require two recent exposures plus explicit self-check.
export function progressionAdvice(records, name, target, today) {
  const hits = records
    .filter(
      (r) =>
        r.date <= today && r.items.some((i) => canon(i.name) === canon(name)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2);
  if (hits.length < 2)
    return { ready: false, text: "先保持参考重量，积累两次同动作记录" };
  const upper = Number(target.match(/\d+[–-](\d+)/)?.[1]);
  const required = Number(target[0]);
  if (!upper) return { ready: false, text: "先提高动作控制，不追求硬撑时长" };
  const parsed = hits.map((r) =>
    r.items
      .find((i) => canon(i.name) === canon(name))
      .sets.flatMap((s) => {
        try {
          const p = parseSet(s);
          return Array.from({ length: Math.min(p.count, 100) }, () => ({
            ...p,
            weighted: /kg/i.test(s),
          }));
        } catch {
          return [{ invalid: true }];
        }
      }),
  );
  if (
    parsed.some(
      (sets) =>
        sets.length < required ||
        sets.some((s) => !s.weighted || s.reps < upper),
    )
  )
    return { ready: false, text: "保持重量，先逐步完成次数范围上限" };
  const kg = parsed[0][0]?.kg;
  if (!kg || parsed.some((sets) => sets.some((s) => s.kg !== kg)))
    return { ready: false, text: "重量口径或组间负荷不同，先保持并核对" };
  const age = (Date.parse(today) - Date.parse(hits[1].date)) / 86400000;
  if (age > 28) return { ready: false, text: "记录间隔较长，先确认本次状态" };
  return {
    ready: true,
    text: `${name === "保加利亚分腿蹲" || name === "地面哑铃臀桥" ? "腿部维持目标不必主动加重。" : ""}连续两次已达次数上限：无痛、动作稳定且仍有约2次余力时，才考虑最小档位；单次先控制在约2–5%以内，器械最小档位跳幅过大就先保持。不是每三天固定加重。`,
    referenceKg: kg,
    dates: hits.map((r) => r.date),
  };
}
