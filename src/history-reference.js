import { canon, iso, parseSet } from "./core.js";
// User data stays in the account store; never seed personal loads into templates.
export function historyReference(records, name, today = iso()) {
  for (const record of records
    .filter((r) => r.date <= today)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))) {
    const item = record.items.find((i) => canon(i.name) === canon(name));
    if (!item) continue;
    const entries = [];
    let invalid = 0;
    for (const raw of item.sets) {
      try {
        const p = parseSet(raw);
        for (let i = 0; i < Math.min(p.count, 100); i++)
          entries.push({ ...p, weighted: /kg/i.test(raw) });
      } catch {
        invalid++;
      }
    }
    const ageDays = Math.round(
      (Date.parse(today + "T00:00:00Z") -
        Date.parse(record.date + "T00:00:00Z")) /
        86400000,
    );
    return {
      date: record.date,
      rawSets: item.sets,
      entries,
      ageDays,
      canPrefill: ageDays <= 28 && entries.length > 0,
      invalid,
    };
  }
  return null;
}
export function historyPreset(reference, index, mode) {
  if (!reference?.canPrefill) return {};
  const exact = reference.entries[index],
    p = exact || reference.entries.at(-1);
  if (mode === "weighted-seconds")
    return p.weighted && p.sec > 0
      ? { kg: p.kg, ...(exact ? { reps: p.sec } : {}) }
      : {};
  if (mode === "seconds") return exact && p.sec > 0 ? { reps: p.sec } : {};
  if (mode === "weighted")
    return p.weighted ? { kg: p.kg, ...(exact ? { reps: p.reps } : {}) } : {};
  return exact && !p.weighted && p.reps > 0 ? { reps: p.reps } : {};
}
export function measurementHint(name) {
  if (name === "壶铃摆动") return "kg填整只壶铃重量：本计划10kg；双手共握一只，不乘2。次数填写实际完成次数，提前停组按实际记录。";
  if (name === "直臂支撑交替触肩")
    return "次数填每侧触肩次数，两侧完成记1组，不把左右相加。固定手部支撑高度；高位与地面版本在备注区分，不直接比较。无需负重。";
  if (["站姿绳索抗旋转推", "站姿绳索斜向下拉"].includes(name))
    return "kg填配重片标示重量，次数按每侧；左右都完成后记1组。首次不猜重量，从最轻可控档位试起。";
  if (name === "站姿单侧哑铃静止保持")
    return "kg填单只哑铃重量，秒数按每侧；左右都完成后记1组。新动作先自选轻重量，不套用其他动作负重。";
  if (name === "保加利亚分腿蹲")
    return "kg填单只哑铃重量，不填双手相加值。次数按每侧，完成两侧后勾选1组。";
  if (name === "地面哑铃臀桥")
    return "沿用你的原记录kg口径，器械数量不自动乘2；记录重量不等于已知的总外部负荷。";
  if (name === "单臂哑铃划船")
    return "每只哑铃重量、每侧次数；与双臂划船分别记录。";
  if (name === "屈膝侧桥") return "秒数按每侧填写，两侧都完成后勾选1组。";
  return "与上次保持相同器械和填写口径；参考值需要按本次实际完成情况修改。";
}
