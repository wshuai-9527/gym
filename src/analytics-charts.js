import { addDays, canon, iso, parseSet } from "./core.js";
import { EX } from "./catalog.js";
import { trainingCycles } from "./cycles.js";

const CORE = new Set([
  "平板支撑",
  "平板支撑肩触碰",
  "屈膝侧桥",
  "站姿单侧哑铃静止保持",
  "站姿绳索抗旋转推",
  "直臂支撑交替触肩",
  "站姿绳索斜向下拉",
  "仰卧小幅卷腹",
  "死虫式",
]);
const CATEGORIES = [
  { key: "Push", label: "推", color: "#167e73" },
  { key: "Pull", label: "拉", color: "#4263c7" },
  { key: "Legs", label: "腿", color: "#9553ab" },
  { key: "Core", label: "核心", color: "#b07820" },
];
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const emptyCounts = () => ({ Push: 0, Pull: 0, Legs: 0, Core: 0 });
function validSets(item) {
  const result = [];
  for (const raw of item.sets || []) {
    try {
      const p = parseSet(raw);
      if (
        p.count < 1 ||
        p.count > 100 ||
        p.kg > 1000 ||
        p.reps > 1000 ||
        p.sec > 86400 ||
        (!p.reps && !p.sec)
      )
        continue;
      const weighted = /kg/i.test(raw),
        timed = p.sec > 0;
      result.push({
        ...p,
        weighted,
        timed,
        loadKey: `${weighted ? "weighted" : "body"}:${timed ? "seconds" : "reps"}:${p.kg}`,
      });
    } catch {}
  }
  return result;
}
function countRange(records, start, end) {
  const counts = emptyCounts();
  let unclassified = 0;
  for (const r of records.filter((r) => r.date >= start && r.date <= end)) {
    for (const item of r.items || []) {
      const name = canon(item.name),
        group = CORE.has(name) ? "Core" : EX[name]?.m;
      for (const p of validSets(item)) {
        if (Object.hasOwn(counts, group)) counts[group] += p.count;
        else unclassified += p.count;
      }
    }
  }
  return { counts, unclassified };
}
export function chartData(records, today = iso()) {
  const current = records
    .filter((r) => r.date <= today)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const start = addDays(today, -41);
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const from = addDays(start, i * 7),
      to = addDays(from, 6);
    return { start: from, end: to, ...countRange(current, from, to) };
  });
  const cycles = trainingCycles(current, today)
    .completed.slice(0, 2)
    .reverse()
    .map((c) => ({ ...c, ...countRange(current, c.start, c.end) }));
  const exercises = {};
  for (const r of current.filter((r) => r.date >= start)) {
    const perDate = new Map();
    for (const item of r.items || []) {
      const name = canon(item.name),
        sets = validSets(item);
      if (!sets.length) continue;
      const e = perDate.get(name) || {
        name,
        date: r.date,
        sets: [],
        invalid: false,
      };
      // Do not call a later set the first work set when the first entry is corrupt.
      if (
        !e.sets.length &&
        !validSets({ sets: (item.sets || []).slice(0, 1) }).length
      )
        e.invalid = true;
      e.sets.push(...sets);
      perDate.set(name, e);
    }
    for (const e of perDate.values()) {
      e.count = e.sets.reduce((n, p) => n + p.count, 0);
      e.first = e.invalid ? null : e.sets[0];
      (exercises[e.name] ||= []).push(e);
    }
  }
  return { start, today, weeks, cycles, exercises };
}
const legend = () =>
  `<div class="chart-legend">${CATEGORIES.map((c) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join("")}</div>`;
const svg = (label, body, height = 230) =>
  `<svg class="data-chart" viewBox="0 0 360 ${height}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${body}</svg>`;
function weeklyChart(data) {
  const max = Math.max(
    1,
    ...data.weeks.map((w) =>
      Object.values(w.counts).reduce((a, b) => a + b, 0),
    ),
  );
  const top = Math.max(4, Math.ceil(max / 4) * 4),
    scale = 150 / top;
  let body = "";
  for (const tick of [0, top / 2, top]) {
    const y = 175 - tick * scale;
    body += `<line x1="32" x2="352" y1="${y}" y2="${y}" class="chart-grid"/><text x="25" y="${y + 5}" text-anchor="end">${tick}</text>`;
  }
  data.weeks.forEach((w, i) => {
    const x = 45 + i * 51,
      total = Object.values(w.counts).reduce((a, b) => a + b, 0);
    let y = 175;
    for (const c of CATEGORIES) {
      const value = w.counts[c.key],
        h = value * scale;
      y -= h;
      body += `<rect x="${x}" y="${y}" width="30" height="${h}" fill="${c.color}"><title>${w.start}—${w.end} ${c.label} ${value}组</title></rect>`;
    }
    body += `<text x="${x + 15}" y="${Math.max(16, y - 7)}" text-anchor="middle" class="chart-value">${total}</text><text x="${x + 15}" y="198" text-anchor="middle">${shortDate(w.start)}</text>`;
  });
  const unknown = data.weeks.reduce((n, w) => n + w.unclassified, 0);
  return `<article class="glass card chart-card"><h2>近 6 周 · 记录组数</h2><p class="chart-subtitle">每柱为 7 天，腿部与核心分开看</p>${legend()}${svg("过去六个七天区间的推、拉、腿和核心记录组数，纵轴单位为组", body)}<p class="chart-note">空白只表示没有记录，不等于休息。计时动作按记录组数计；单侧不翻倍。${unknown ? `另有 ${unknown} 组未分类，未计入柱图。` : ""}</p><details class="chart-data"><summary>查看数值</summary><div class="chart-table-wrap"><table><thead><tr><th>日期</th>${CATEGORIES.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead><tbody>${data.weeks.map((w) => `<tr><th>${shortDate(w.start)}–${shortDate(w.end)}</th>${CATEGORIES.map((c) => `<td>${w.counts[c.key]}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details></article>`;
}
function cycleChart(data) {
  if (data.cycles.length < 2)
    return `<article class="glass card chart-card"><h2>周期训练量对比</h2><p class="chart-note">完成两轮 Push → Pull → Legs 后显示对比；篮球、休息顺延，不按三个自然日计算。</p></article>`;
  const [previous, latest] = data.cycles,
    max = Math.max(1, ...data.cycles.flatMap((c) => Object.values(c.counts))),
    scale = 220 / max;
  let body = "";
  CATEGORIES.forEach((c, i) => {
    const y = 15 + i * 55;
    body += `<text x="4" y="${y + 19}">${c.label}</text>`;
    [previous, latest].forEach((cycle, j) => {
      const value = cycle.counts[c.key],
        yy = y + j * 21;
      body += `<rect x="48" y="${yy}" width="${value * scale}" height="14" rx="3" fill="${c.color}" opacity="${j ? 1 : 0.3}"><title>${j ? "最近一轮" : "前一轮"} ${c.label} ${value}组</title></rect><text x="${56 + value * scale}" y="${yy + 12}">${value}</text>`;
    });
  });
  return `<article class="glass card chart-card"><h2>最近两轮 · 组数对比</h2><p class="chart-subtitle">浅色：${shortDate(previous.start)}–${shortDate(previous.end)}　深色：${shortDate(latest.start)}–${shortDate(latest.end)}</p>${svg("前一轮浅色与最近一轮深色的实际记录工作组对比，单位为组", body, 240)}<p class="chart-note">只比较记录训练量；周期天数或组数不同，不能直接判断力量进退。</p></article>`;
}
export function trendModel(data, exercise, loadKey) {
  const names = Object.keys(data.exercises).sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  if (!names.length) return { names, entries: [], points: [], loads: [] };
  const chosen = names.includes(exercise)
    ? exercise
    : names.includes("平板卧推")
      ? "平板卧推"
      : names[0];
  const entries = data.exercises[chosen];
  const loads = [
    ...new Map(
      entries.filter((e) => e.first).map((e) => [e.first.loadKey, e.first]),
    ).values(),
  ];
  const load = loads.find((p) => p.loadKey === loadKey) || loads.at(-1);
  const points = entries
    .filter((e) => e.first && load && e.first.loadKey === load.loadKey)
    .map((e) => ({ ...e, value: e.first.timed ? e.first.sec : e.first.reps }));
  return { names, exercise: chosen, entries, loads, load, points };
}
const loadLabel = (p) =>
  `${p.weighted ? p.kg + " kg" : "自重"} · ${p.timed ? "秒数" : "次数"}`;
function trendChart(model) {
  const { names, entries, points, loads, load } = model;
  if (!names.length)
    return `<article class="glass card chart-card"><h2>动作表现趋势</h2><p class="chart-note">最近 42 天还没有可解析的工作组；同步历史后会自动显示。</p></article>`;
  const options = names
    .map(
      (n) =>
        `<option ${n === model.exercise ? "selected" : ""}>${escape(n)}</option>`,
    )
    .join("");
  const controls = `<div class="chart-controls"><label>动作<select id="chart-exercise">${options}</select></label><label>记录负重<select id="chart-load">${loads.map((p) => `<option value="${escape(p.loadKey)}" ${p === load ? "selected" : ""}>${loadLabel(p)}</option>`).join("")}</select></label></div>`;
  if (!load || !points.length)
    return `<article class="glass card chart-card"><h2>同负重 · 首组表现</h2>${controls}<p class="chart-note">首组记录无法解析，请核对历史；不会改用后续组冒充首组。</p></article>`;
  const top = Math.max(
      4,
      Math.ceil(Math.max(...points.map((p) => p.value)) / 4) * 4,
    ),
    y = (v) => 175 - (v / top) * 145;
  const firstDate = Date.parse(entries[0].date),
    span = Date.parse(entries.at(-1).date) - firstDate;
  const x = (d) =>
    span ? 42 + ((Date.parse(d) - firstDate) / span) * 292 : 188;
  let body = "",
    path = "",
    drawing = false;
  for (const tick of [0, top / 2, top])
    body += `<line x1="35" x2="347" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid"/><text x="28" y="${y(tick) + 5}" text-anchor="end">${tick}</text>`;
  for (const e of entries) {
    if (e.first?.loadKey !== load.loadKey) {
      drawing = false;
      continue;
    }
    const value = e.first.timed ? e.first.sec : e.first.reps;
    path += `${drawing ? "L" : "M"}${x(e.date)},${y(value)} `;
    drawing = true;
  }
  body += `<path d="${path}" fill="none" stroke="#167e73" stroke-width="3"/>`;
  points.forEach((p) => {
    const caption = `${p.date} · ${loadLabel(load)} · 首组 ${p.value}${load.timed ? " 秒" : " 次"} · 当次共 ${p.count} 记录组`;
    body += `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="7" fill="#167e73" stroke="white" stroke-width="2"/><circle cx="${x(p.date)}" cy="${y(p.value)}" r="20" fill="transparent" tabindex="0" role="button" data-chart-caption="${escape(caption)}" aria-label="${escape(caption)}"><title>${escape(caption)}</title></circle>`;
  });
  const indices = [
    ...new Set([0, Math.floor((entries.length - 1) / 2), entries.length - 1]),
  ];
  indices.forEach(
    (i) =>
      (body += `<text x="${x(entries[i].date)}" y="199" text-anchor="middle">${shortDate(entries[i].date)}</text>`),
  );
  const last = points.at(-1);
  return `<article class="glass card chart-card"><h2>同负重 · 首组表现</h2><p class="chart-subtitle">最近 42 天 · ${load.timed ? "纵轴：秒" : "纵轴：次数"}</p>${controls}${svg(`${model.exercise} ${loadLabel(load)}首个工作组表现`, body)}<p id="chart-point-detail" class="chart-point-detail" aria-live="polite">${last.date} · 首组 ${last.value}${load.timed ? " 秒" : " 次"} · 当次 ${last.count} 组${points.length === 1 ? "；仅 1 次记录，暂不形成趋势" : "；点图查看每次记录"}</p><details class="chart-data"><summary>口径与逐次数据</summary><p class="chart-note">仅显示同动作、同记录负重的首组，其他负重处断线。不同器械、动作幅度与质量仍需你确认；曲线上升不等于整体力量或肌肉增长。计时动作不换算次数。</p><div class="chart-table-wrap"><table><thead><tr><th>日期</th><th>首组${load.timed ? "秒数" : "次数"}</th><th>当次组数</th></tr></thead><tbody>${points.map((p) => `<tr><th>${p.date}</th><td>${p.value}</td><td>${p.count}</td></tr>`).join("")}</tbody></table></div></details></article>`;
}
export function renderAnalytics(records, today = iso(), selection = {}) {
  const data = chartData(records, today),
    model = trendModel(data, selection.exercise, selection.loadKey);
  return {
    selection: { exercise: model.exercise, loadKey: model.load?.loadKey },
    html: trendChart(model) + cycleChart(data) + weeklyChart(data),
  };
}
