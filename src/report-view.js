const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const clean = (s) =>
  s
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);

// Extractive preview only: never manufacture new advice from an archived report.
export function reportDigest(content) {
  const text = String(content || "");
  const sections = {};
  let heading = "";
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^\s*#{1,3}\s+(.+?)\s*$/);
    if (h) {
      heading = clean(h[1]);
      sections[heading] ||= [];
    } else if (line.trim()) (sections[heading] ||= []).push(clean(line));
  }
  const find = (re) =>
    Object.entries(sections).find(([k]) => re.test(k))?.[1] || [];
  const compact = Object.hasOwn(sections, "结论");
  const summary =
    find(/^(结论|本周期简述)$/)[0] ||
    Object.values(sections).flat()[0] ||
    "本期暂无文字分析。";
  const changes = find(/^(变化|与上一完整周期同动作对比)$/)
    .filter((s) => compact || /由|降|增加|减少|新增|缺少|未记录/.test(s))
    .slice(0, compact ? 3 : 2)
    .map((s) => clip(s, compact ? 130 : 80));
  let next = find(/^(下次|下周期具体建议)$/).filter(
    (s) => !/^(Push|Pull|腿＋核心)$/.test(s),
  );
  if (!compact)
    next = next.filter((s) => /不加重|先|平板支撑|核心|姿势/.test(s));
  const attention = find(/^(留意|记录缺口与证据限制)$/)[0] || "";
  return {
    summary: clip(summary, compact ? 110 : 65),
    changes,
    next: next
      .slice(0, compact ? 3 : 2)
      .map((s) => clip(s, compact ? 125 : 80)),
    attention: clip(attention, compact ? 95 : 65),
    compact,
  };
}

export function reportCard(report, { open = false, fresh = true } = {}) {
  const d = reportDigest(report.content);
  const list = (title, lines) =>
    lines.length
      ? `<div class="report-brief-section"><h3>${title}</h3><ul>${lines.map((s) => `<li>${escape(s)}</li>`).join("")}</ul></div>`
      : "";
  return `<details class="report-card ai-report" ${open ? "open" : ""}>
    <summary><span><small>${escape(report.period_start)} — ${escape(report.period_end)}</small><b>本轮重点</b></span><span>${fresh ? "AI解读" : "快照"}</span></summary>
    <div class="report-content report-brief">
      ${fresh ? "" : '<p class="note">历史快照 · 数据已变动或尚未联网核验。</p>'}
      <p class="report-conclusion">${escape(d.summary)}</p>
      ${list("值得注意", d.changes)}${list("下次重点", d.next)}
      ${d.attention ? `<p class="note">${escape(d.attention)}</p>` : ""}
      <details class="report-full"><summary>查看完整分析与依据</summary><p class="ai-content">${escape(report.content)}</p></details>
      <small>生成：${escape(report.generated_at)}</small>
    </div></details>`;
}
