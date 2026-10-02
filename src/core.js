import { ALIAS, EX } from "./catalog.js";
export const canon = (n) =>
  ALIAS[String(n || "").trim()] || String(n || "").trim();
export function iso(date = new Date(), zone = "Australia/Brisbane") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function validDate(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function dateKey(s, year = 2026) {
  if (validDate(s)) return s;
  const m = String(s).match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!m) throw Error("日期须为 YYYY-MM-DD 或 M.D");
  const d = `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (!validDate(d)) throw Error("无效日期");
  return d;
}
export function addDays(d, n) {
  return new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function parseSet(raw) {
  const s = String(raw).replace(/\s/g, "").replace(/×/g, "*");
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)kg\*(\d+)(?:\*(\d+))?$/i)))
    return { kg: +m[1], reps: +m[2], count: +(m[3] || 1), sec: 0 };
  if ((m = s.match(/^(\d+(?:\.\d+)?)s(?:\*(\d+))?$/i)))
    return { kg: 0, reps: 0, count: +(m[2] || 1), sec: +m[1] };
  if ((m = s.match(/^(\d+)(?:\*(\d+))?$/)))
    return { kg: 0, reps: +m[1], count: +(m[2] || 1), sec: 0 };
  throw Error("无效组格式：" + raw);
}
export function moduleOf(items) {
  if (items.some((i) => i.name === "休息")) return "Rest";
  if (items.some((i) => i.name === "篮球" || i.name === "有氧"))
    return "Basketball";
  const score = { Push: 0, Pull: 0, Legs: 0 };
  for (const i of items) if (EX[canon(i.name)]) score[EX[canon(i.name)].m]++;
  return (
    Object.keys(score)
      .sort((a, b) => score[b] - score[a])
      .find((k) => score[k] > 0) || "Other"
  );
}
export function normalizeRecord(r, year = 2026) {
  const date = dateKey(r.date, year);
  if (!Array.isArray(r.items) || !r.items.length) throw Error("记录不能为空");
  const items = r.items.map((i) => {
    const name = canon(i.name);
    if (!name || name.length > 120) throw Error("动作名称无效");
    if (!Array.isArray(i.sets) || i.sets.length > 100) throw Error("组数无效");
    const sets = i.sets.map((raw) => {
      const p = parseSet(raw);
      if (
        p.count > 100 ||
        p.count < 1 ||
        p.reps > 1000 ||
        p.kg > 1000 ||
        p.sec > 86400 ||
        (!p.sec && !p.reps)
      )
        throw Error("组数值超出范围");
      return String(raw).trim();
    });
    if (!sets.length && !["休息", "篮球", "有氧"].includes(name))
      throw Error("动作至少需要一组");
    return { name, sets };
  });
  return {
    date,
    items,
    module: moduleOf(items),
    source: r.source || "manual",
    ...(r.note ? { note: String(r.note) } : {}),
    ...(r.legacy ? { legacy: r.legacy } : {}),
  };
}
export function parseText(text, date) {
  let items = [],
    cur;
  for (const line of text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (/^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2})$/.test(line)) {
      date = dateKey(line, new Date().getFullYear());
      continue;
    }
    if (/^\d/.test(line) && cur) {
      cur.sets.push(...line.split(/\s*\/\s*/));
    } else {
      cur = { name: canon(line), sets: [] };
      items.push(cur);
    }
  }
  return normalizeRecord({ date, items }, new Date().getFullYear());
}
export function nextModule(records) {
  const last = [...records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .reverse()
    .find((r) => ["Push", "Pull", "Legs"].includes(moduleOf(r.items)));
  const seq = ["Push", "Pull", "Legs"];
  return seq[(seq.indexOf(last ? moduleOf(last.items) : "Legs") + 1) % 3];
}
export function hasProgress(d) {
  return !!d && Object.values(d.rows || {}).some((x) => x.done || x.edited);
}
export function restCandidate(
  records,
  draft,
  now = new Date(),
  zone = "Australia/Brisbane",
  enabledFrom = null,
) {
  const hour = +new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const y = addDays(iso(now, zone), -1);
  if (hour < 2 || records.some((r) => r.date === y) || hasProgress(draft))
    return null;
  // No backfill before onboarding or across an unobserved absence.
  const last = [...records].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (enabledFrom) {
    if (enabledFrom > y) return null;
  } else if (last?.date !== addDays(y, -1) && draft?.date !== y) return null;
  return {
    date: y,
    items: [{ name: "休息", sets: [] }],
    module: "Rest",
    source: "auto-rest",
  };
}
export function analyse(records, today = iso()) {
  const week = records.filter(
    (r) => r.date >= addDays(today, -6) && r.date <= today,
  );
  let sets = 0,
    seconds = 0,
    volume = 0,
    modules = { Push: 0, Pull: 0, Legs: 0 },
    pr = {},
    unknown = 0;
  for (const r of records)
    for (const i of r.items) {
      const e = EX[canon(i.name)];
      for (const raw of i.sets) {
        let p;
        try {
          p = parseSet(raw);
        } catch {
          unknown++;
          continue;
        }
        if (week.includes(r)) {
          sets += p.count;
          seconds += p.sec * p.count;
          volume += p.kg * p.reps * p.count;
          if (e) modules[e.m] += p.count;
        }
        if (
          p.kg > 0 &&
          p.reps > 0 &&
          p.reps <= 10 &&
          e &&
          [
            "平板卧推",
            "上斜卧推",
            "坐姿推肩",
            "高位下拉",
            "上斜划船",
            "罗马尼亚硬拉",
          ].includes(canon(i.name))
        ) {
          const v = p.kg * (1 + p.reps / 30);
          pr[canon(i.name)] = Math.max(pr[canon(i.name)] || 0, v);
        }
      }
    }
  return { sets, seconds, volume, modules, pr, unknown, days: week.length };
}
