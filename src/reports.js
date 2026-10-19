import { addDays, iso, moduleOf, parseSet, canon } from "./core.js";
const dayDiff = (a, b) =>
  Math.round(
    (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
export function summarize(records, start, end) {
  const days = records.filter((r) => r.date >= start && r.date <= end);
  const exercises = {};
  let sets = 0,
    weightedSets = 0,
    timedSets = 0,
    bodySets = 0,
    seconds = 0,
    volume = 0,
    unknown = 0;
  for (const r of days)
    for (const item of r.items)
      for (const raw of item.sets) {
        try {
          const p = parseSet(raw),
            name = canon(item.name);
          sets += p.count;
          if (p.sec) timedSets += p.count;
          else if (/kg/i.test(raw)) weightedSets += p.count;
          else bodySets += p.count;
          seconds += p.sec * p.count;
          volume += p.kg * p.reps * p.count;
          const e = (exercises[name] ||= { sets: 0, maxKg: 0, volume: 0 });
          e.sets += p.count;
          e.maxKg = Math.max(e.maxKg, p.kg);
          e.volume += p.kg * p.reps * p.count;
        } catch {
          unknown++;
        }
      }
  const strength = days.filter((r) =>
    ["Push", "Pull", "Legs"].includes(moduleOf(r.items)),
  );
  const modules = Object.fromEntries(
    ["Push", "Pull", "Legs"].map((m) => [
      m,
      strength.filter((r) => moduleOf(r.items) === m).length,
    ]),
  );
  return {
    start,
    end,
    logged: new Set(days.map((r) => r.date)).size,
    strength: strength.length,
    rest: days.filter((r) => moduleOf(r.items) === "Rest").length,
    basketball: days.filter((r) => moduleOf(r.items) === "Basketball").length,
    unlogged: Math.max(
      0,
      dayDiff(end, start) + 1 - new Set(days.map((r) => r.date)).size,
    ),
    sets,
    weightedSets,
    timedSets,
    bodySets,
    seconds,
    volume,
    unknown,
    modules,
    exercises,
  };
}
export function calendarDays(records, today = iso(), length = 14) {
  return Array.from({ length }, (_, i) => {
    const date = addDays(today, i - length + 1),
      r = records.find((r) => r.date === date);
    return { date, module: r ? moduleOf(r.items) : "Unlogged" };
  });
}
