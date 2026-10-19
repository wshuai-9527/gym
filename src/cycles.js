import { moduleOf, iso, parseSet } from "./core.js";
import { summarize } from "./reports.js";
export function trainingCycles(records, today = iso()) {
  const completed = [];
  let pending = null;
  for (const r of records
    .filter((r) => r.date <= today)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const m = moduleOf(r.items);
    if (
      ["Push", "Pull", "Legs"].includes(m) &&
      !r.items.some((i) =>
        i.sets.some((raw) => {
          try {
            const p = parseSet(raw);
            return p.count > 0 && (p.reps > 0 || p.sec > 0);
          } catch {
            return false;
          }
        }),
      )
    )
      continue;
    if (m === "Push") pending = { Push: r.date };
    else if (m === "Pull" && pending?.Push) pending.Pull = r.date;
    else if (m === "Legs" && pending?.Push && pending?.Pull) {
      const dates = { ...pending, Legs: r.date };
      completed.push({
        id: `ppl:${dates.Push}:${dates.Pull}:${dates.Legs}`,
        start: dates.Push,
        end: dates.Legs,
        dates,
        ...summarize(records, dates.Push, dates.Legs),
      });
      pending = null;
    }
  }
  return { completed: completed.reverse(), pending };
}
