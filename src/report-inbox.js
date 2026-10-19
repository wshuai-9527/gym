import { trainingCycles } from "./cycles.js";
export function reportFresh(report, store) {
  if (
    report.cycle_id &&
    !trainingCycles(store.records()).completed.some(
      (c) => c.id === report.cycle_id,
    )
  )
    return false;
  const expected = report.source_versions || {};
  const actual = Object.fromEntries(
    Object.entries(store.state.docs)
      .filter(
        ([key]) =>
          key.startsWith("record:") &&
          key.slice(7) >= report.source_start &&
          key.slice(7) <= report.period_end,
      )
      .map(([key, d]) => [key, d.version]),
  );
  const stable = (o) =>
    JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return (
    stable(actual) === stable(expected) &&
    !store.state.pending.some(
      (p) =>
        p.key.startsWith("record:") &&
        p.key.slice(7) >= report.source_start &&
        p.key.slice(7) <= report.period_end,
    ) &&
    !Object.keys(store.state.conflicts).some(
      (key) =>
        key.startsWith("record:") &&
        key.slice(7) >= report.source_start &&
        key.slice(7) <= report.period_end,
    )
  );
}
export async function fetchAIReports(client, owner) {
  const { data, error } = await client
    .from("gym_ai_reports")
    .select(
      "cycle_id,period_start,period_end,source_start,source_versions,title,content,generated_at",
    )
    .eq("user_id", owner)
    .order("period_end", { ascending: false })
    .limit(24);
  if (error) throw error;
  return data || [];
}
