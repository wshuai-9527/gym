import {
  PLAN,
  CUES,
  templateFor,
  loggingMode,
  defaultTarget,
  restSeconds,
} from "./catalog.js";
import {
  iso,
  addDays,
  canon,
  parseSet,
  parseText,
  normalizeRecord,
  moduleOf,
  nextModule,
  hasProgress,
  restCandidate,
  analyse,
  currentPlan,
  TIME_ZONE,
  validateWorkSet,
} from "./core.js";
import { Store } from "./storage.js";
import { Sync } from "./sync.js";
import { calendarDays } from "./reports.js";
import { exerciseVisual } from "./exercise-visuals.js";
import { progressionAdvice } from "./progression.js";
import { fetchAIReports, reportFresh } from "./report-inbox.js";
import { reportCard } from "./report-view.js";
import { RestNotifications } from "./notifications.js";
import { trainingCycles } from "./cycles.js";
import { feedbackValue } from "./adaptive.js";
import { preparationCard, exerciseWarmupCue } from "./preparation.js";
import { renderAnalytics } from "./analytics-charts.js";
import { nextCycleItems } from "./cycle-progression.js";
import {
  historyReference,
  historyPreset,
  measurementHint,
} from "./history-reference.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const rangeStart = (target, name) => {
  const match = String(target).match(/(\d+)\s*[–-]\s*\d+/);
  return match ? Number(match[1]) : defaultTarget(name);
};
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let toastTimer;
let lastRecordedDate = null;
function toast(m) {
  $("#toast").textContent = m;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3000);
}
const client = window.supabase?.createClient(
  "https://vmtgtnjaehlslcdvsxru.supabase.co",
  "sb_publishable_Uce1NsooPtwDbZr-9fSA4w_B1KlpWN7",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
let store,
  sync,
  editing = null,
  syncTimeout,
  renderedSig,
  checkFingerprint,
  archiveFingerprint,
  analysisFingerprint,
  restTimer;
let accountRecoveryNeeded = !!client;
let accountRecovery;
let aiInboxSig = null;
let aiRenderedSig = null;
let analysisChartSelection = {};
const status = (m) => {
  $("#cloud-status").textContent = m;
  $("#autosave-text").textContent = m;
  if (store) renderRecordReceipt();
};
function guarded(fn) {
  return async (...a) => {
    try {
      await fn(...a);
    } catch (e) {
      status("操作未完成：" + e.message);
      toast(e.message);
    }
  };
}
function bind(id, fn) {
  $("#" + id).onclick = guarded(fn);
}
const reminders = new RestNotifications(
  client,
  () => store?.owner || "guest",
  localStorage,
);
function startStore(owner) {
  analysisChartSelection = {};
  lastRecordedDate = null;
  store = new Store(localStorage, owner);
  store.migrateLegacy();
  sync = new Sync(client, store, status, () => renderAll());
  renderedSig = null;
  checkFingerprint = archiveFingerprint = analysisFingerprint = null;
  aiInboxSig = null;
  aiRenderedSig = null;
  renderAll();
}
function scheduleSync() {
  status(`已保存在本机 · ${store.state.pending.length} 项待同步`);
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(
    guarded(async () => {
      await sync.run();
      renderAll();
    }),
    900,
  );
}
function put(key, value) {
  store.put(key, value);
  scheduleSync();
}
function plan() {
  const d = currentPlan(store.records(), store.get("draft:active"));
  if (d.planVersion !== 61 || (hasProgress(d) && d.planSnapshot)) return d;
  return {
    ...d,
    planSnapshot: nextCycleItems(
      store.records(),
      PLAN[d.module].items,
      d.module,
      d.date < iso() ? d.date : iso(),
    ),
  };
}
function capture() {
  if (!renderedSig) return;
  const d = plan();
  if (d.date + "|" + d.module !== renderedSig) return;
  const rows = {};
  $$(".set-row").forEach(
    (row) =>
      (rows[row.dataset.key] = {
        done: row.classList.contains("checked"),
        edited: row.dataset.edited === "true",
        kg: row.querySelector(".kg").value,
        reps: row.querySelector(".reps").value,
      }),
  );
  const next = {
    ...d,
    planVersion: d.planVersion ?? (hasProgress(d) ? 49 : 61),
    feedback: Object.fromEntries(
      $$("[data-feedback]").map((el) => [el.dataset.feedback, el.value]),
    ),
    quality: Object.fromEntries(
      $$("[data-quality]").map((el) => [el.dataset.quality, el.value]),
    ),
    rows,
    updatedAt: Date.now(),
  };
  if (
    (hasProgress(next) || hasProgress(d)) &&
    (JSON.stringify(next.rows) !== JSON.stringify(d.rows) ||
      JSON.stringify(next.feedback) !== JSON.stringify(d.feedback || {}) ||
      JSON.stringify(next.quality) !== JSON.stringify(d.quality || {}))
  ) {
    put("draft:active", next);
    // The DOM already represents this local edit. Sync must not replace it.
    checkFingerprint = trainingFingerprint(plan());
  }
  return next;
}
function trainingFingerprint(d) {
  const { updatedAt, ...visible } = d;
  return JSON.stringify([visible, store.records(), iso(), sync.historyState]);
}
function renderCheck(force = false) {
  const d = plan(),
    p = templateFor(d);
  const fingerprint = trainingFingerprint(d);
  if (!force && fingerprint === checkFingerprint) return;
  checkFingerprint = fingerprint;
  renderedSig = d.date + "|" + d.module;
  $("#today-sub").textContent = p.sub + " · 本机自动保存";
  $("#date-chip").textContent = iso() + " · Brisbane";
  $("#focus-title").textContent =
    d.module === "Legs" ? "腿＋核心" : d.module + " 日";
  $("#focus-desc").textContent = `${d.date} · ${p.items.length} 个动作`;
  $("#focus-tags").innerHTML = "<span>V61.0.2</span><span>自动保存</span>";
  $("#plan-date").value = d.date;
  $("#plan-module").value = d.module;
  const seq = ["Push", "Pull", "Legs"];
  $("#schedule").innerHTML = Array.from(
    { length: 3 },
    (_, i) =>
      `<span class="${seq[(seq.indexOf(d.module) + i) % 3]} ${i === 0 ? "current" : ""}"><small>第 ${i + 1} 次力量</small><b>${seq[(seq.indexOf(d.module) + i) % 3]}</b></span>`,
  ).join("");
  let html = "";
  $("#daily-warmup").innerHTML = preparationCard(p.items);
  p.items.forEach((ex, i) => {
    const n =
        d.planVersion >= 50
          ? +ex[1][0]
          : ["侧平举", "上斜划船"].includes(ex[0])
            ? 4
            : +ex[1][0],
      time = loggingMode(ex[0]).endsWith("seconds"),
      body = !loggingMode(ex[0]).startsWith("weighted"),
      previous = historyReference(
        store.records(),
        ex[0],
        d.date < iso() ? d.date : iso(),
      );
    const historyMessage =
      sync.historyState === "loading"
        ? "正在加载云端历史…"
        : sync.historyState === "error"
          ? "云端历史暂未加载，联网后重试"
          : "暂无同动作历史 · 首次负荷请自行确认";
    html += `<article class="glass card exercise-card"><div class="exercise-head"><span class="exercise-index">${String(i + 1).padStart(2, "0")}</span><div><h3 class="ex-name">${ex[0]}</h3><div class="ex-meta">${ex[3]} · ${ex[1]}</div></div></div><p class="history-reference">${previous ? `上次 ${previous.date} · ${previous.rawSets.map((s) => escape(s).replace(/\*/g, " × ")).join(" / ")}${previous.canPrefill ? " · 本次先参考" : " · 记录较早或无法解析，请重新确认"}` : historyMessage}</p><details class="exercise-guide"><summary>动作示意与要点</summary>${exerciseVisual(ex[0])}<p class="mini">动作简图不用于测量角度。<a href="https://www.nasm.org/resource-center/exercise-library" target="_blank" rel="noopener">专业动作库 ↗</a></p><p>${escape(CUES[ex[0]] || "控制动作、保留余力；重量按每只器械填写。")}</p><p>${escape(exerciseWarmupCue(ex[0], p.items))}</p><p>${escape(measurementHint(ex[0]))}${d.module === "Legs" ? "负重分腿蹲每轮两侧做完后休息2–3分钟，左右换侧可按呼吸恢复适当休息；核心约60秒，未恢复可延长。" : "主项休息2–3分钟，孤立动作约60–120秒。"}</p></details>${ex[4]?.paused ? `<p role="alert" class="pain-notice">${escape(ex[4].message)}</p>` : ""}<div class="set-columns"><span>组</span><span>${body ? "负重" : "重量 kg"}</span><span>${time ? "时间 s" : "次数"}</span><span>完成</span></div><div class="set-list">`;
    for (let j = 0; j < n; j++) {
      const key = `${i}-${j}`,
        x = d.rows[key] || {},
        historical = historyPreset(previous, j, loggingMode(ex[0])),
        adjusted = ex[4]?.perSet?.[j],
        preset = adjusted
          ? {
              kg: adjusted.kg ?? historical.kg,
              reps: adjusted.reps ?? historical.reps,
            }
          : historical;
      html += `<div class="set-row ${x.done ? "checked" : ""}" data-key="${key}" data-ex="${i}" data-edited="${!!x.edited}"><button class="set-check" aria-label="完成${ex[0]}第${j + 1}组" aria-pressed="${!!x.done}">✓</button><b>${j + 1}</b><div class="field"><input type="number" inputmode="decimal" min="0" max="1000" step="0.5" class="kg" aria-label="重量" placeholder="${body ? "自重" : "—"}" ${body ? "disabled" : ""} value="${escape(x.kg ?? (body ? "" : (preset.kg ?? "")))}"><span class="unit">${body ? "" : "kg"}</span></div><div class="field"><input type="number" inputmode="numeric" min="1" max="${time ? 86400 : 1000}" class="reps" aria-label="${time ? "秒数" : "次数"}" value="${escape(x.reps ?? preset.reps ?? (d.planVersion >= 60 ? rangeStart(ex[1], ex[0]) : d.planVersion >= 51 ? defaultTarget(ex[0]) : time ? (d.planVersion === 50 ? 40 : d.planVersion === 51 ? defaultTarget(ex[0]) : 80) : 12))}"><span class="unit">${time ? "s" : ""}</span></div></div>`;
    }
    html += `</div><button class="btn full exercise-rest" data-rest="${restSeconds(ex[0])}">组间休息 · ${restSeconds(ex[0])} 秒</button>${["reps", "weight", "reduce", "pause"].includes(ex[4]?.action) ? `<p class="cycle-adjustment">下轮建议 · ${escape(ex[4].message)}</p>` : ""}${ex[4]?.weightProposal && !Object.entries(d.rows).some(([key, x]) => key.startsWith(i + "-") && (x.done || x.edited)) ? `<button class="btn full" data-cycle-weight="${i}">器械可加 0.5kg · 采用加重建议</button>` : ""}<details class="load-advice"><summary>负荷建议</summary><p>${escape(ex[4]?.message || progressionAdvice(store.records(), ex[0], ex[1], iso()).text)}</p></details><label class="feedback-field">这次感觉<select data-feedback="${i}" aria-label="${escape(ex[0])}训练反馈">${[
      ["", "未评价"],
      ["steady", "合适"],
      ["easy", "轻松"],
      ["hard", "吃力"],
      ...(["form", "pain"].includes(d.feedback?.[i])
        ? [[d.feedback[i], "已记录异常"]]
        : []),
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${d.feedback?.[i] === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="feeling-buttons" role="group" aria-label="${escape(ex[0])}这次感觉">${[
      ["steady", "合适"],
      ["easy", "轻松"],
      ["hard", "吃力"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" data-feeling="${i}" data-rating="${value}" aria-pressed="${d.feedback?.[i] === value}">${label}</button>`,
      )
      .join(
        "",
      )}</div><details class="feedback-safety"><summary>动作状态（可选）</summary><label class="feedback-field">动作状态<select data-quality="${i}" aria-label="${escape(ex[0])}动作状态">${[
      ["", "未确认"],
      ["stable", "动作稳定 · 无痛"],
      ["form", "动作失控"],
      ["pain", "出现疼痛"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${d.quality?.[i] === v ? "selected" : ""}>${t}</option>`,
      )
      .join("")}</select></label></details></article>`;
  });
  $("#check-list").innerHTML = html;
  count();
}
function count() {
  const rows = $$(".set-row"),
    done = rows.filter((r) => r.classList.contains("checked")).length,
    p = Math.round((done / rows.length) * 100) || 0;
  $("#set-count").textContent = `${done}/${rows.length} 组`;
  renderCooldown();
  $("#progress-text").textContent = p + "%";
  $("#ring").style.setProperty("--p", p);
}
function renderCooldown() {
  const d = plan(),
    p = templateFor(d);
  const completed = new Set(
    $$(".set-row.checked").map((row) => Number(row.dataset.ex)),
  );
  const saved = !hasProgress(d) && store.get("record:" + d.date);
  const items = completed.size
    ? p.items.filter((_, i) => completed.has(i))
    : saved && ["Push", "Pull", "Legs"].includes(moduleOf(saved.items))
      ? saved.items
      : p.items;
  const html = preparationCard(items, "cooldown");
  // Preserve open instructions during routine saves/sync and unchanged set checks.
  const host = $("#daily-cooldown");
  if (host.dataset.content !== html) {
    host.dataset.content = html;
    host.innerHTML = html;
  }
}
function archive(d) {
  const items = [];
  templateFor(d).items.forEach((ex, i) => {
    const sets = [];
    for (const [key, x] of Object.entries(d.rows))
      if (key.startsWith(i + "-") && x.done) {
        validateWorkSet(x, loggingMode(ex[0]));
        const time = loggingMode(ex[0]).endsWith("seconds"),
          body = loggingMode(ex[0]) === "bodyweight";
        if (!time && !body && (x.kg === "" || Number(x.kg) < 0))
          throw Error("请填写已勾选组的重量");
        sets.push(
          time
            ? `${loggingMode(ex[0]) === "weighted-seconds" ? x.kg + "kg*" : ""}${x.reps}s`
            : body
              ? `${x.reps}`
              : `${x.kg}kg*${x.reps}`,
        );
      }
    if (sets.length)
      items.push({
        name: ex[0],
        sets,
        ...(feedbackValue(d.feedback?.[i], d.quality?.[i], loggingMode(ex[0]))
          ? {
              feedback: feedbackValue(
                d.feedback?.[i],
                d.quality?.[i],
                loggingMode(ex[0]),
              ),
            }
          : {}),
      });
  });
  return normalizeRecord({ date: d.date, items });
}
function record(r) {
  const key = "record:" + r.date;
  if (store.get(key) && !confirm("该日期已有记录，确认替换？")) return false;
  put(key, r);
  return true;
}
function renderAnalysis() {
  void renderAIInbox();
  const fingerprint = JSON.stringify([store.records(), iso()]);
  if (fingerprint === analysisFingerprint) return;
  analysisFingerprint = fingerprint;
  const records = store.records(),
    a = analyse(records),
    cycles = trainingCycles(records);
  renderAnalysisCharts();
  const metric = (label, value, unit = "") =>
    `<div class="stat"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>`;
  const cycleHTML = (c, i) =>
    `<details class="report-card" ${i === 0 ? "open" : ""}><summary><span><small>${i === 0 ? "上一轮" : "历史周期"} · ${c.start} — ${c.end}</small><b>Push → Pull → Legs · ${c.sets} 记录组</b></span><span class="report-arrow">＋</span></summary><div class="report-content"><p>推 ${c.dates.Push} · 拉 ${c.dates.Pull} · 腿 ${c.dates.Legs}</p><p>负重 ${c.weightedSets} 组、自重 ${c.bodySets} 组、计时 ${c.timedSets} 组（${c.seconds}秒）。中间篮球 ${c.basketball} 天、休息 ${c.rest} 天。</p><p>外部负荷 ${Math.round(c.volume)} kg·次，沿用原记录口径。详细AI解读在上方报告收件箱；组数或吨位变化不能单独判定训练效果。</p></div></details>`;
  $("#ana-range").textContent = "按完整三分化周期复盘";
  $("#analysis-body").innerHTML = `
  <article class="glass card report-overview"><h2>完成一轮，再复盘。</h2><p>${cycles.pending ? `已完成：${Object.keys(cycles.pending).join(" → ")}；下一步 ${cycles.pending.Pull ? "腿＋核心" : "Pull"}` : "下一轮从 Push 开始"}</p><p>篮球和休息顺延周期；完成 Push、Pull、Legs 后生成报告。</p></article>
  <div class="section-title"><h2>上一轮周期</h2><span>${cycles.completed.length} 轮已完成</span></div>${cycles.completed[0] ? cycleHTML(cycles.completed[0], 0) : '<div class="empty-state">完成一轮推、拉、腿后，这里会出现周期报告。</div>'}
  <details class="glass card"><summary>最近7天 · 详细数据</summary><div class="metric-grid">${metric("记录组数", a.sets, "组")}${metric("记录负荷", Math.round(a.volume), "kg·次")}${metric("计时训练", a.seconds, "秒")}${metric("下一次力量", nextModule(records))}</div></details>
  <article class="glass card"><div class="section-title"><h2>训练节奏</h2><span>14天</span></div><div class="activity-calendar">${calendarDays(
    records,
  )
    .map(
      (d) =>
        `<div class="calendar-day ${d.module}" title="${d.date}"><span>${d.date.slice(8)}</span><i></i><em>${{ Push: "推", Pull: "拉", Legs: "腿", Basketball: "球", Rest: "休", Unlogged: "—" }[d.module] || "其他"}</em></div>`,
    )
    .join(
      "",
    )}</div><div class="calendar-legend"><span style="--dot:#167e73">推</span><span style="--dot:#4263c7">拉</span><span style="--dot:#9553ab">腿</span><span style="--dot:#d09b48">篮球</span><span style="--dot:#8998a4">休息</span></div></article>
  <div class="section-title"><h2>历史周期报告</h2></div>${cycles.completed
    .slice(1, 25)
    .map((c, i) => cycleHTML(c, i + 1))
    .join("")}
  <details class="glass card"><summary>当前训练与调整方式</summary><p>Push 13组、Pull 12组；腿部力量4组、壶铃摆动2组、核心4组。核心采用平板支撑和直臂支撑交替触肩，无需绳索或整身躺下；目标是抗伸展与抗旋转，不宣称单靠核心动作就能直接提高球技。余力与动作状态分别确认，先巩固次数；加重由你确认，不因器械档位不足自动加组。进行中的草稿保留原计划，下一次新训练使用更新建议。</p><p>恢复允许时，让各主要肌群一周内尽量练到约2次；篮球负荷较高、睡眠不足或尚未恢复时顺延，不为凑频率补练。上肢多数工作组保留约2次余力，腿部以维持与动作控制为主。</p><a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noopener">训练依据 ↗</a></details>`;
}
function renderAnalysisCharts() {
  const result = renderAnalytics(
    store.records(),
    iso(),
    analysisChartSelection,
  );
  analysisChartSelection = result.selection;
  const cycles = trainingCycles(store.records());
  const adjustments = ["Push", "Pull", "Legs"].flatMap((module) =>
    nextCycleItems(store.records(), PLAN[module].items, module, iso())
      .filter((ex) =>
        ["reps", "weight", "pause", "reduce"].includes(ex[4].action),
      )
      .map(
        (ex) =>
          `<li><strong>${escape(ex[0])}</strong><p>${escape(ex[4].message)}</p></li>`,
      ),
  );
  const next = cycles.completed[0];
  $("#analysis-charts").innerHTML =
    result.html +
    (next
      ? `<details class="glass card next-cycle-plan"><summary>下一轮调整 · 来自 ${next.end} 完成周期</summary>${adjustments.length ? `<ul>${adjustments.join("")}</ul>` : "<p>本轮暂未满足调整条件；查看训练页“负荷建议”可见缺少的反馈或记录。</p>"}<p class="chart-note">次数建议会预填到下一次新训练。加重需确认器械有对应档位后点一次采用；进行中的草稿保持原样。</p></details>`
      : "");
}
$("#analysis-charts").addEventListener("change", (e) => {
  if (e.target.id === "chart-exercise")
    analysisChartSelection = { exercise: e.target.value };
  else if (e.target.id === "chart-load")
    analysisChartSelection.loadKey = e.target.value;
  else return;
  const id = e.target.id;
  renderAnalysisCharts();
  $("#" + id)?.focus();
});
function selectChartPoint(e) {
  const point = e.target.closest("[data-chart-caption]");
  if (point) $("#chart-point-detail").textContent = point.dataset.chartCaption;
}
$("#analysis-charts").addEventListener("click", selectChartPoint);
$("#analysis-charts").addEventListener("keydown", (e) => {
  if (
    ["Enter", " "].includes(e.key) &&
    e.target.matches("[data-chart-caption]")
  ) {
    e.preventDefault();
    selectChartPoint(e);
  }
});
async function renderAIInbox() {
  const owner = store.owner;
  const el = $("#ai-reports");
  if (!client || owner === "guest") {
    el.innerHTML =
      '<article class="glass card"><h2>AI 周期复盘</h2><p>登录后查看私人报告。</p></article>';
    return;
  }
  const sig = JSON.stringify([
    owner,
    store.state.docs,
    store.state.pending,
    Math.floor(Date.now() / 60000),
  ]);
  if (sig === aiInboxSig) return;
  aiInboxSig = sig;
  try {
    const reports = await fetchAIReports(client, owner);
    localStorage.setItem("gym-ai-cache:" + owner, JSON.stringify(reports));
    if (owner !== store.owner) return;
    const rendered = JSON.stringify([
      owner,
      reports,
      reports.map((r) => reportFresh(r, store)),
    ]);
    if (rendered === aiRenderedSig) return;
    aiRenderedSig = rendered;
    el.innerHTML = reports.length
      ? `<h2>AI 周期复盘</h2><p class="note">只看变化和下次重点；完整分析可展开。</p>${reports.map((r, i) => reportCard(r, { open: i === 0, fresh: reportFresh(r, store) })).join("")}`
      : '<article class="glass card"><h2>AI 周期复盘</h2><p>暂无已送达报告。</p></article>';
  } catch (error) {
    if (owner !== store.owner) return;
    aiRenderedSig = null;
    const cached = JSON.parse(
      localStorage.getItem("gym-ai-cache:" + owner) || "[]",
    );
    el.innerHTML =
      '<h2>AI 周期复盘</h2><p class="note">离线报告 · 联网后更新</p>' +
      cached
        .map((r, i) => reportCard(r, { open: i === 0, fresh: false }))
        .join("");
  }
}
function renderArchive() {
  const fingerprint = JSON.stringify([
    store.state.docs,
    store.state.conflicts,
    store.state.deleted,
    store.owner,
    $("#archive-search")?.value,
    $("#archive-module")?.value,
  ]);
  if (fingerprint === archiveFingerprint) return;
  archiveFingerprint = fingerprint;
  const query = ($("#archive-search")?.value || "").trim().toLowerCase();
  const selected = $("#archive-module")?.value || "all";
  const rs = store
    .records()
    .slice()
    .reverse()
    .filter(
      (r) =>
        (selected === "all" || moduleOf(r.items) === selected) &&
        (!query ||
          (r.date + " " + r.items.map((i) => i.name).join(" "))
            .toLowerCase()
            .includes(query)),
    );
  $("#auto-rest-toggle").checked =
    !!store.get("settings:main")?.autoRest &&
    store.get("settings:main")?.autoRestConsent === true;
  $("#archive-total").textContent = rs.length + " 天";
  $("#archive-list").innerHTML = rs.length
    ? rs
        .map(
          (r) =>
            `<div class="archive-day"><h3>${r.date} · ${escape(moduleOf(r.items))}</h3><div class="archive-item"><button data-edit="${r.date}">编辑</button><button data-delete="${r.date}">删除整天</button>${r.items.map((i) => `<p><b>${escape(i.name)}</b><br>${i.sets.map(escape).join(" / ")}</p>`).join("")}</div></div>`,
        )
        .join("")
    : '<div class="empty-state">没有匹配的记录。完成一次训练，或在下方添加历史。</div>';
  const keys = Object.keys(store.state.conflicts);
  $("#conflicts").hidden = !keys.length;
  $("#conflicts").innerHTML =
    '<h2>同步冲突</h2><p class="note">两台设备修改了同一份数据。先导出 JSON 可保存双方版本，再选择。</p>' +
    keys
      .map(
        (k) =>
          `<p>${escape(k)}</p><button class="btn" data-resolve="${escape(k)}" data-local="true">保留本机</button><button class="btn" data-resolve="${escape(k)}" data-local="false">${store.state.conflicts[k].guestImport ? "采用离线记录" : "采用云端"}</button>`,
      )
      .join("");
  $("#adopt-local").hidden =
    store.owner === "guest" || !localStorage.getItem("gym-vault-v49:guest");
  const deleted = Object.entries({
    ...(store.get("settings:main")?.recoveredAutoRest || {}),
    ...(store.state.deleted || {}),
  }).filter(([key]) => !store.get(key));
  $("#undo-deleted").hidden = !deleted.length;
  $("#undo-deleted").innerHTML =
    "<h2>最近删除 · 可恢复</h2>" +
    deleted
      .map(
        ([key, r]) =>
          `<button class="btn" data-restore="${escape(key)}">恢复 ${r.date}</button>`,
      )
      .join("");
}
function renderRecordReceipt() {
  const date = lastRecordedDate || plan().date;
  const key = "record:" + date;
  const saved = store.get(key);
  const box = $("#day-record-status");
  box.hidden = !saved;
  for (const [id, name, label] of [
    ["basketball-day", "篮球", "篮球／有氧"],
    ["rest-day", "休息", "休息"],
  ]) {
    const selected = !!saved?.items.some((i) => i.name === name);
    $("#" + id).setAttribute("aria-pressed", String(selected));
    $("#" + id).classList.toggle("recorded", selected);
    $("#" + id).textContent = selected ? "✓ 已记录" + label : "记录" + label;
  }
  $("#quick-record-date").textContent = "记录日期 · " + date;
  if (!saved) return;
  const module = moduleOf(saved.items);
  const label =
    { Basketball: "篮球／有氧", Rest: "休息", Legs: "腿＋核心" }[module] ||
    module + " 训练";
  const pending = store.state.pending.some((op) => op.key === key);
  const conflict = !!store.state.conflicts[key];
  const state = conflict
    ? "本机已保存 · 同步冲突待处理"
    : store.owner === "guest"
      ? "本机已保存 · 登录后同步"
      : pending
        ? "本机已保存 · 等待云端确认"
        : "已同步云端";
  box.textContent = `✓ ${date} · 已记录${label}\n${state}`;
  box.classList.toggle("needs-attention", conflict);
}
function renderAll() {
  renderRecordReceipt();
  if (
    !document.activeElement?.closest(
      ".set-row, .feeling-buttons, .feedback-field, .feedback-safety, .load-advice",
    )
  )
    renderCheck();
  renderAnalysis();
  renderArchive();
}
function autoRest() {
  const cfg = store.get("settings:main");
  if (
    !cfg?.autoRest ||
    cfg.autoRestConsent !== true ||
    cfg.enabledFrom > addDays(iso(), -1)
  )
    return;
  capture();
  const r = restCandidate(
    store.records(),
    store.get("draft:active"),
    new Date(),
    TIME_ZONE,
    cfg.enabledFrom,
  );
  if (r && !Object.hasOwn(store.state.docs, "record:" + r.date)) {
    put("record:" + r.date, r);
    renderAll();
    toast("已补记 " + r.date + " 休息");
  }
}
$$(".nav button").forEach(
  (b) =>
    (b.onclick = guarded(() => {
      capture();
      $$(".nav button").forEach((x) => x.classList.toggle("active", x === b));
      $$(".screen").forEach((s) =>
        s.classList.toggle("active", s.id === b.dataset.go),
      );
      renderAll();
      window.scrollTo(0, 0);
    })),
);
document.addEventListener(
  "input",
  guarded((e) => {
    if (e.target.id === "archive-search") renderArchive();
    if (e.target.matches("[data-feedback], [data-quality]")) capture();
    if (e.target.closest(".set-row")) {
      e.target.closest(".set-row").dataset.edited = "true";
      capture();
      count();
    }
  }),
);
document.addEventListener(
  "click",
  guarded((e) => {
    const adopt = e.target.closest("[data-cycle-weight]");
    if (adopt) {
      const i = Number(adopt.dataset.cycleWeight);
      const ex = templateFor(plan()).items[i];
      const proposal = ex?.[4]?.weightProposal;
      const rows = $$(`.set-row[data-ex="${i}"]`);
      if (
        !proposal ||
        rows.some(
          (row) =>
            row.dataset.edited === "true" || row.classList.contains("checked"),
        )
      ) {
        toast("已有本次输入，先保留；请按今天实际状态调整");
        return;
      }
      rows.forEach((row, j) => {
        row.querySelector(".kg").value = proposal[j].kg;
        row.querySelector(".reps").value = proposal[j].reps;
        row.dataset.edited = "true";
      });
      capture();
      adopt.disabled = true;
      adopt.textContent = `已采用 ${proposal[0].kg}kg 建议 · 尚未记录完成`;
      toast("建议已填入，先热身试练；不合适可直接改回");
      return;
    }
    const feeling = e.target.closest("[data-feeling]");
    if (feeling) {
      const field = document.querySelector(
        `[data-feedback="${feeling.dataset.feeling}"]`,
      );
      field.value =
        field.value === feeling.dataset.rating ? "" : feeling.dataset.rating;
      feeling.parentElement.querySelectorAll("button").forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.rating === field.value),
        );
      });
      capture();
    }
    const check = e.target.closest(".set-check");
    if (check) {
      const row = check.closest(".set-row");
      if (!row.classList.contains("checked")) {
        const name = templateFor(plan()).items[Number(row.dataset.ex)][0];
        validateWorkSet(
          {
            kg: row.querySelector(".kg").value,
            reps: row.querySelector(".reps").value,
          },
          loggingMode(name),
        );
      }
      row.classList.toggle("checked");
      check.setAttribute("aria-pressed", row.classList.contains("checked"));
      capture();
      count();
    }
    const rest = e.target.closest("[data-rest]");
    if (rest) {
      unlockAudio();
      const duration = Number(rest.dataset.rest);
      timerState = {
        duration,
        remaining: duration,
        deadline: Date.now() + duration * 1000,
      };
      saveTimer();
      toast("休息已开始；呼吸和状态未恢复可以延长，不会自动记录训练");
    }
    const restore = e.target.closest("[data-restore]");
    if (restore) {
      put(
        restore.dataset.restore,
        store.state.deleted[restore.dataset.restore] ||
          store.get("settings:main")?.recoveredAutoRest?.[
            restore.dataset.restore
          ],
      );
      renderAll();
      toast("已恢复记录");
    }
    const edit = e.target.closest("[data-edit]");
    if (edit) {
      editing = edit.dataset.edit;
      const r = store.get("record:" + editing);
      $("#editor").hidden = false;
      $("#edit-date").value = r.date;
      $("#edit-text").value = r.items
        .map((i) => [i.name, ...i.sets].join("\n"))
        .join("\n");
      $("#editor").scrollIntoView({ behavior: "smooth" });
    }
    const del = e.target.closest("[data-delete]");
    if (del && confirm("确认删除这一天？删除会同步至云端。")) {
      put("record:" + del.dataset.delete, null);
      renderAll();
    }
    const resolve = e.target.closest("[data-resolve]");
    if (resolve) {
      store.resolve(resolve.dataset.resolve, resolve.dataset.local === "true");
      scheduleSync();
      renderAll();
    }
  }),
);
for (const id of ["plan-date", "plan-module"])
  $("#" + id).onchange = guarded(() => {
    capture();
    if (
      hasProgress(store.get("draft:active")) &&
      !confirm("切换计划将清空当前草稿，确认？")
    ) {
      renderCheck(true);
      return;
    }
    lastRecordedDate = null;
    const date = $("#plan-date").value,
      module = $("#plan-module").value;
    if (!date) throw Error("请选择日期");
    put("draft:active", {
      date,
      module,
      planVersion: 61,
      dateExplicit:
        id === "plan-date" || !!store.get("draft:active")?.dateExplicit,
      rows: {},
      updatedAt: Date.now(),
    });
    renderCheck();
  });
bind("finish-day", () => {
  const r = archive(capture() || plan());
  if (record(r)) {
    put("draft:active", null);
    renderAll();
    lastRecordedDate = r.date;
    renderRecordReceipt();
    toast(`${r.date} · 训练已保存`);
  }
});
bind("clear-day", () => {
  if (confirm("确认清空当前草稿？")) {
    put("draft:active", null);
    renderCheck();
  }
});
for (const [id, name] of [
  ["basketball-day", "篮球"],
  ["rest-day", "休息"],
])
  bind(id, () => {
    const date = lastRecordedDate || plan().date;
    const previous = store.get("record:" + date);
    if (previous?.items.length === 1 && previous.items[0].name === name) {
      lastRecordedDate = date;
      renderRecordReceipt();
      toast(`${date} · 已记录${name}，无需重复保存`);
      return;
    }
    if (
      hasProgress(plan()) &&
      !confirm("当前有训练草稿，确认改为" + name + "？")
    )
      return;
    if (record(normalizeRecord({ date, items: [{ name, sets: [] }] }))) {
      lastRecordedDate = date;
      put("draft:active", null);
      renderAll();
      toast(`${date} · ${name}已保存`);
    }
  });
bind("manual-add", () => {
  const r = parseText($("#manual-input").value, iso());
  if (record(r)) {
    $("#manual-input").value = "";
    renderAll();
  }
});
bind("edit-save", () => {
  const prior = store.get("record:" + editing);
  const r = {
    ...parseText($("#edit-text").value, $("#edit-date").value),
    ...(prior?.note ? { note: prior.note } : {}),
    ...(prior?.legacy ? { legacy: prior.legacy } : {}),
  };
  for (const item of r.items) {
    const old = prior?.items.find(
      (i) =>
        canon(i.name) === canon(item.name) &&
        JSON.stringify(i.sets) === JSON.stringify(item.sets),
    );
    if (old?.feedback) item.feedback = old.feedback;
  }
  if (
    r.date !== editing &&
    store.get("record:" + r.date) &&
    !confirm("目标日期已有记录，确认覆盖？")
  )
    return;
  put("record:" + r.date, r);
  if (r.date !== editing) put("record:" + editing, null);
  editing = null;
  $("#editor").hidden = true;
  renderAll();
});
bind("edit-cancel", () => {
  $("#editor").hidden = true;
  editing = null;
});
bind("manual-yesterday-rest", () => {
  const date = addDays(iso(), -1);
  if (store.get("record:" + date)) throw Error("昨天已有记录");
  if (store.get("draft:active")?.date === date && hasProgress(plan()))
    throw Error("昨天有未归档草稿，请先处理");
  put(
    "record:" + date,
    normalizeRecord({ date, items: [{ name: "休息", sets: [] }] }),
  );
  renderAll();
});
$("#auto-rest-toggle").onchange = guarded((e) => {
  put("settings:main", {
    ...store.get("settings:main"),
    autoRest: e.target.checked,
    autoRestConsent: e.target.checked,
    timezone: "Australia/Brisbane",
    enabledFrom: iso(),
  });
  autoRest();
});
bind("export-json", () => {
  capture();
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            owner: store.owner,
            ...store.state,
            ...(store.owner === "guest"
              ? { legacyBackup: localStorage.getItem("gym-vault-v36-cloud") }
              : {}),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "gym-vault-v49-" + iso() + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
bind("login-pass", async () => {
  if (!client) throw Error("云端组件未加载；本机功能可用");
  capture();
  const { error } = await client.auth.signInWithPassword({
    email: $("#email").value.trim(),
    password: $("#password").value,
  });
  $("#password").value = "";
  if (error) throw error;
  await activateAccount();
});
async function activateAccount() {
  if (accountRecovery) return accountRecovery;
  accountRecovery = restoreAccount();
  try {
    await accountRecovery;
  } catch (error) {
    accountRecoveryNeeded = true;
    $("#account-state").textContent =
      "登录恢复暂未完成 · 联网后自动重试，也可点恢复登录；本机数据保留";
    throw error;
  } finally {
    accountRecovery = null;
  }
}
async function restoreAccount() {
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error) throw error;
  accountRecoveryNeeded = false;
  $("#login-fields").hidden = !!session;
  $("#logout").hidden = !session;
  $("#account-state").textContent = session
    ? "此设备已登录 · 下次打开自动恢复，联网后自动同步"
    : "首次在此入口登录一次，之后自动恢复；未登录时仍可本机记录";
  if ((session?.user.id || "guest") !== store.owner) {
    clearTimeout(syncTimeout);
    const guest = new Store(localStorage, "guest");
    startStore(session?.user.id || "guest");
    if (session) store.importGuest(guest);
  }
  if (session) {
    status("已登录 · 正在合并云端数据");
    await sync.run();
    renderAll();
    if (timerState.deadline > Date.now()) saveTimer();
  } else status("未登录 · 数据保存在本机");
}
bind("logout", async () => {
  capture();
  clearTimeout(syncTimeout);
  await reminders.schedule(null).catch(() => {});
  const result = await client?.auth.signOut({ scope: "local" });
  if (result?.error) throw result.error;
  startStore("guest");
  $("#login-fields").hidden = false;
  $("#logout").hidden = true;
  $("#account-state").textContent = "已退出此设备，其他设备不受影响";
  status("已退出 · 当前显示本机访客档案");
});
bind("restore-session", async () => {
  capture();
  if (!client) throw Error("云端组件未加载；请联网后重新打开，勿清除本机数据");
  await activateAccount();
});
for (const id of ["cloud-read", "cloud-upload", "archive-refresh"])
  bind(id, async () => {
    capture();
    if (client && (accountRecoveryNeeded || store.owner === "guest")) {
      await activateAccount();
      return;
    }
    aiInboxSig = null;
    await sync.run();
    renderAll();
  });
bind("adopt-local", async () => {
  if (
    !confirm(
      "将升级前本机记录和草稿关联到当前登录账号？同日期差异会保留为冲突。",
    )
  )
    return;
  const guest = new Store(localStorage);
  for (const [key, d] of Object.entries(guest.state.docs)) {
    const existing = store.state.docs[key];
    if (
      existing &&
      JSON.stringify(existing.value) !== JSON.stringify(d.value)
    ) {
      store.transaction((s) => {
        s.docs[key] = { value: d.value, version: existing.version };
        s.conflicts[key] = {
          key,
          value: existing.value,
          version: existing.version,
        };
      });
    } else if (!existing) put(key, d.value);
  }
  renderAll();
  scheduleSync();
});
$("#import-json").onchange = guarded(async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw Error("备份过大，最大5MB");
  const data = JSON.parse(await file.text());
  if (data.owner && data.owner !== store.owner)
    throw Error("备份属于另一个账号，请切换到对应账号导入");
  const rs =
    data.records ||
    Object.entries(data.docs || {})
      .filter(([k, d]) => k.startsWith("record:") && d.value)
      .map(([, d]) => d.value);
  if (!Array.isArray(rs) || !rs.length) throw Error("备份没有训练记录");
  const normalized = rs.map((r) => normalizeRecord(r));
  if (
    !confirm(
      `导入${normalized.length}天记录？同日期将使用备份版本，修改会同步云端。`,
    )
  )
    return;
  for (const r of normalized) put("record:" + r.date, r);
  renderAll();
  e.target.value = "";
  toast("备份已导入");
});
// Deadline-based rest timer survives throttling and reload; no ticking counter.
let timerState = { duration: 90, remaining: 90, deadline: null };
try {
  const t = JSON.parse(localStorage.getItem("gym-vault-v49-timer"));
  if (
    t &&
    Number.isFinite(t.duration) &&
    t.duration > 0 &&
    Number.isFinite(t.remaining) &&
    t.remaining >= 0 &&
    (t.deadline === null || Number.isFinite(t.deadline))
  )
    timerState = t;
} catch {}
function remaining() {
  return timerState.deadline
    ? Math.max(0, Math.ceil((timerState.deadline - Date.now()) / 1000))
    : timerState.remaining;
}
function saveTimer() {
  localStorage.setItem("gym-vault-v49-timer", JSON.stringify(timerState));
  void reminders
    .schedule(timerState.deadline)
    .then((ok) => {
      if (ok)
        $("#push-status").textContent = timerState.deadline
          ? "后台提醒已安排"
          : "后台提醒已启用";
    })
    .catch((e) => {
      $("#push-status").textContent = "后台提醒未安排：" + e.message;
    });
  showTimer();
}
function showTimer() {
  const n = remaining();
  $("#timer-display").textContent =
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0");
  $("#timer-toggle").textContent = timerState.deadline ? "暂停" : "开始";
  $("#training-rest").hidden = !timerState.deadline;
  $("#training-rest-time").textContent = $("#timer-display").textContent;
  if (timerState.deadline && n === 0) {
    timerState.deadline = null;
    timerState.remaining = 0;
    saveTimer();
    toast("休息结束");
    navigator.vibrate?.([180, 80, 180]);
    if (restAudio) {
      const o = restAudio.createOscillator();
      o.connect(restAudio.destination);
      o.frequency.value = 740;
      o.start();
      o.stop(restAudio.currentTime + 0.35);
    }
  }
}
$$("[data-timer]").forEach(
  (b) =>
    (b.onclick = () => {
      timerState = {
        duration: +b.dataset.timer,
        remaining: +b.dataset.timer,
        deadline: null,
      };
      saveTimer();
    }),
);
let restAudio;
function unlockAudio() {
  try {
    restAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    void restAudio.resume();
  } catch {}
}
bind("enable-push", async () => {
  await reminders.enable();
  $("#push-status").textContent = "后台提醒已启用";
  if (timerState.deadline > Date.now())
    await reminders.schedule(timerState.deadline);
});
bind("test-push", async () => {
  await reminders.enable();
  await reminders.schedule(Date.now() + 5000);
  $("#push-status").textContent = "测试已安排，请切到其他 App，等待约15秒";
});
bind("timer-toggle", () => {
  unlockAudio();
  if (timerState.deadline) {
    timerState.remaining = remaining();
    timerState.deadline = null;
  } else {
    timerState.remaining = timerState.remaining || timerState.duration;
    timerState.deadline = Date.now() + timerState.remaining * 1000;
  }
  saveTimer();
});
bind("timer-reset", () => {
  timerState.deadline = null;
  timerState.remaining = timerState.duration;
  saveTimer();
});
bind("training-rest-stop", () => {
  timerState.deadline = null;
  timerState.remaining = timerState.duration;
  saveTimer();
});
setInterval(showTimer, 250);
window.addEventListener("pagehide", guarded(capture));
document.addEventListener(
  "visibilitychange",
  guarded(async () => {
    if (document.hidden) capture();
    else {
      showTimer();
      if (client && accountRecoveryNeeded) await activateAccount();
      autoRest();
      await sync.run();
      renderAll();
    }
  }),
);
window.addEventListener(
  "online",
  guarded(async () => {
    if (client && accountRecoveryNeeded) await activateAccount();
    if (timerState.deadline > Date.now()) saveTimer();
    aiInboxSig = null;
    await sync.run();
    renderAll();
  }),
);
window.addEventListener(
  "storage",
  guarded((e) => {
    if (e.key === store.key) {
      store.state = store.read();
      renderAll();
    }
  }),
);
startStore("guest");
if (client)
  client.auth.onAuthStateChange((_event, session) => {
    if ((session?.user.id || "guest") !== store.owner)
      setTimeout(() => activateAccount().catch((e) => status(e.message)), 0);
  });
if (client) activateAccount().catch((e) => status(e.message));
else $("#account-state").textContent = "云端组件不可用 · 本机记录可正常使用";
autoRest();
restTimer = setInterval(guarded(autoRest), 60000);
setInterval(
  guarded(async () => {
    if (!document.hidden && client && accountRecoveryNeeded) {
      await activateAccount();
      return;
    }
    if (
      !document.hidden &&
      (store.state.pending.length || store.owner !== "guest")
    ) {
      await sync.run();
      renderAll();
    }
  }),
  15000,
);
showTimer();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    $("#app-update").hidden = false;
  });
  navigator.serviceWorker
    .register("./sw.js", { scope: "./", updateViaCache: "none" })
    .catch(() => status("离线缓存未启用；训练数据仍可本机保存"));
}
bind("app-update", async () => {
  capture();
  await sync.run();
  location.reload();
});

$("#archive-module").onchange = renderArchive;
