import { PLAN, CUES, templateFor } from "./catalog.js";
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
} from "./core.js";
import { Store } from "./storage.js";
import { Sync } from "./sync.js";
import { threeDayReports, calendarDays } from "./reports.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let toastTimer;
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
const status = (m) => {
  $("#cloud-status").textContent = m;
  $("#autosave-text").textContent = m;
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
function startStore(owner) {
  store = new Store(localStorage, owner);
  store.migrateLegacy();
  sync = new Sync(client, store, status);
  renderedSig = null;
  checkFingerprint = archiveFingerprint = analysisFingerprint = null;
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
  return currentPlan(store.records(), store.get("draft:active"));
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
    planVersion: d.planVersion ?? (hasProgress(d) ? 49 : 50),
    rows,
    updatedAt: Date.now(),
  };
  if (
    (hasProgress(next) || hasProgress(d)) &&
    JSON.stringify(next.rows) !== JSON.stringify(d.rows)
  ) {
    put("draft:active", next);
  }
  return next;
}
function lastKg(name) {
  for (const r of store.records().slice().reverse())
    for (const i of r.items)
      if (canon(i.name) === name) {
        const p = i.sets
          .map((s) => {
            try {
              return parseSet(s);
            } catch {
              return { kg: 0 };
            }
          })
          .filter((x) => x.kg > 0)
          .at(-1);
        if (p) return p.kg;
      }
  return "";
}
function renderCheck(force = false) {
  const d = plan(),
    p = templateFor(d);
  const fingerprint = JSON.stringify([d, store.records(), iso()]);
  if (!force && fingerprint === checkFingerprint) return;
  checkFingerprint = fingerprint;
  renderedSig = d.date + "|" + d.module;
  $("#today-sub").textContent = p.sub + " · 本机自动保存";
  $("#date-chip").textContent = iso() + " · Brisbane";
  $("#focus-title").textContent = d.module + " 日";
  $("#focus-desc").textContent =
    `计划日期 ${d.date} · ${p.items.length} 个动作 · ${d.planVersion !== 50 && hasProgress(d) ? "继续旧版草稿；完成或清空后使用新计划" : "按动作质量完成，保留约 2 次余力"}`;
  $("#focus-tags").innerHTML =
    "<span>V50</span><span>增肌基础</span><span>自动保存</span>";
  $("#plan-date").value = d.date;
  $("#plan-module").value = d.module;
  const seq = ["Push", "Pull", "Legs"];
  $("#schedule").innerHTML = Array.from(
    { length: 3 },
    (_, i) =>
      `<span class="${i === 0 ? "current" : ""}"><small>第 ${i + 1} 次力量</small><b>${seq[(seq.indexOf(d.module) + i) % 3]}</b></span>`,
  ).join("");
  let html = `<p class="mini routine-note">目标每周 6 练：Push / Pull / Legs 两轮＋休息 1 天。篮球与休息不推进轮转，疲劳时可顺延。</p>`;
  p.items.forEach((ex, i) => {
    const n =
        p === PLAN[d.module]
          ? +ex[1][0]
          : ["侧平举", "上斜划船"].includes(ex[0])
            ? 4
            : +ex[1][0],
      time = ex[0] === "平板支撑",
      body = time || ex[0] === "平板支撑肩触碰";
    html += `<article class="glass card exercise-card"><div class="exercise-head"><span class="exercise-index">${String(i + 1).padStart(2, "0")}</span><div><h3 class="ex-name">${ex[0]}</h3><div class="ex-meta">${ex[3]} · ${ex[1]}</div></div></div><details class="exercise-guide"><summary>动作要点 · 上次 ${lastKg(ex[0]) || "—"} kg</summary><p>${escape(CUES[ex[0]] || "控制动作、保留余力；重量按每只器械填写。")}</p><p>重量按每只器械；单侧动作记录每侧次数。主项休息 2–3 分钟，孤立动作约 60–120 秒。</p></details><div class="set-columns"><span>组</span><span>重量 kg</span><span>${time ? "时间 s" : "次数"}</span><span>完成</span></div><div class="set-list">`;
    for (let j = 0; j < n; j++) {
      const key = `${i}-${j}`,
        x = d.rows[key] || {};
      html += `<div class="set-row ${x.done ? "checked" : ""}" data-key="${key}" data-ex="${i}" data-edited="${!!x.edited}"><button class="set-check" aria-label="完成${ex[0]}第${j + 1}组" aria-pressed="${!!x.done}">✓</button><b>${j + 1}</b><div class="field"><input type="number" inputmode="decimal" min="0" max="1000" step="0.5" class="kg" aria-label="重量" ${body ? "disabled" : ""} value="${escape(x.kg ?? (body ? "" : lastKg(ex[0])))}"><span class="unit">${body ? "" : "kg"}</span></div><div class="field"><input type="number" inputmode="numeric" min="1" max="${time ? 86400 : 1000}" class="reps" aria-label="${time ? "秒数" : "次数"}" value="${escape(x.reps ?? (time ? (p === PLAN[d.module] ? 40 : 80) : 12))}"><span class="unit">${time ? "s" : ""}</span></div></div>`;
    }
    html += "</div></article>";
  });
  $("#check-list").innerHTML = html;
  count();
}
function count() {
  const rows = $$(".set-row"),
    done = rows.filter((r) => r.classList.contains("checked")).length,
    p = Math.round((done / rows.length) * 100) || 0;
  $("#set-count").textContent = `${done}/${rows.length} 组`;
  $("#progress-text").textContent = p + "%";
  $("#ring").style.setProperty("--p", p);
}
function archive(d) {
  const items = [];
  templateFor(d).items.forEach((ex, i) => {
    const sets = [];
    for (const [key, x] of Object.entries(d.rows))
      if (key.startsWith(i + "-") && x.done) {
        const time = ex[0] === "平板支撑",
          body = ex[0] === "平板支撑肩触碰";
        if (!time && !body && (x.kg === "" || Number(x.kg) < 0))
          throw Error("请填写已勾选组的重量");
        sets.push(
          time ? `${x.reps}s` : body ? `${x.reps}` : `${x.kg}kg*${x.reps}`,
        );
      }
    if (sets.length) items.push({ name: ex[0], sets });
  });
  return normalizeRecord({ date: d.date, items });
}
function record(r) {
  const key = "record:" + r.date;
  if (store.get(key) && !confirm("该日期已有记录，确认替换？")) return false;
  put(key, r);
  return true;
}
function bar(values) {
  const max = Math.max(1, ...Object.values(values));
  return Object.entries(values)
    .map(
      ([k, v]) =>
        `<div class="rowbar"><b>${escape(k)}</b><div class="bar"><i style="width:${(v / max) * 100}%"></i></div><span>${Number(v).toFixed(1)}</span></div>`,
    )
    .join("");
}
function renderAnalysis() {
  const fingerprint = JSON.stringify([store.records(), iso()]);
  if (fingerprint === analysisFingerprint) return;
  analysisFingerprint = fingerprint;
  const records = store.records(),
    a = analyse(records),
    reports = threeDayReports(records),
    current = reports.current;
  $("#ana-range").textContent = `Brisbane · ${addDays(iso(), -6)} — ${iso()}`;
  const recentStrength = records.filter(
    (r) =>
      r.date >= addDays(iso(), -27) &&
      r.date <= iso() &&
      ["Push", "Pull", "Legs"].includes(moduleOf(r.items)),
  ).length;
  const metric = (label, value, unit = "") =>
    `<div class="stat"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>`;
  const reportHTML = (r) =>
    `<details class="report-card"><summary><span><small>三日结算 · ${r.start.slice(5)} — ${r.end.slice(5)}</small><b>${r.strength} 次力量 · ${r.sets} 记录组</b></span><span class="report-arrow">＋</span></summary><div class="report-content"><div class="stats-row">${metric("篮球 / 有氧", r.basketball, "天")}${metric("明确休息", r.rest, "天")}${metric("未记录", r.unlogged, "天")}</div><p>Push ${r.modules.Push} · Pull ${r.modules.Pull} · Legs ${r.modules.Legs} 次。记录负荷 ${Math.round(r.volume)} kg·次，计时 ${r.seconds} 秒。</p><p>${r.strength === 0 ? "本周期没有力量记录；不把缺失数据当成休息或训练退步。" : "三天只用于回顾执行情况，训练效果需要看数周趋势。"}</p>${r.comparable.length ? "<h4>同动作最高记录重量</h4>" + r.comparable.map((e) => `<p class="compare-row"><span>${escape(e.name)}</span><b>${e.previousKg} → ${e.kg} kg</b></p>`).join("") + '<p class="mini">次数、器械和余力不一定相同，重量变化不等于力量变化。</p>' : '<p class="mini">前后周期没有可比较的负重动作，不计算进步百分比。</p>'}${r.unknown ? `<p>有 ${r.unknown} 组无法解析，未纳入数值。</p>` : ""}</div></details>`;
  $("#analysis-body").innerHTML = `
  <article class="glass card report-overview"><div class="eyebrow">YOUR TRAINING, IN FOCUS</div><h2>三天，一次回顾。</h2><p>当前周期 ${current.start} — ${current.scheduledEnd}</p><div class="stats-row">${metric("力量", current.strength, "次")}${metric("已记录", current.sets, "组")}${metric("待记录", current.unlogged, "天")}</div><p class="mini">本期进行中 · ${current.nextAt} 00:00 Brisbane 后结算。报告根据历史记录计算，编辑后会同步更新；未记录不视为休息。</p></article>
  <div class="section-title"><h2>最近 7 天</h2><span>记录概览</span></div><div class="metric-grid">${metric("记录组数", a.sets, "组")}${metric("外部负荷", Math.round(a.volume), "kg·次")}${metric("计时训练", a.seconds, "秒")}${metric("下一次力量", nextModule(records.filter((r) => r.date <= iso())))}</div>
  <article class="glass card"><div class="section-title"><h2>训练节奏</h2><span>14 天</span></div><div class="activity-calendar">${calendarDays(
    records,
  )
    .map(
      (d) =>
        `<div class="calendar-day ${d.module}" title="${d.date} · ${d.module === "Unlogged" ? "未记录" : d.module}"><span>${d.date.slice(8)}</span><i></i></div>`,
    )
    .join(
      "",
    )}</div><p class="mini">● 力量　● 篮球　○ 休息　· 未记录</p>${bar(a.modules)}<p class="mini">显示模块记录组数；单侧按每侧组数记一次，不擅自翻倍。</p></article>
  <div class="section-title"><h2>三日报告</h2><span>最近 8 期</span></div><p class="mini">固定日历周期，不按登录时间重置；打开分析即可查看。</p>${reports.completed.map(reportHTML).join("")}
  <details class="glass card plan-review"><summary>训练计划 · 为什么这样调整？</summary><p>以增肌和一般力量为默认目标：Push 12 组、Pull 12 组、Legs 15 组。减少重复划船，补入高脚杯深蹲、罗马尼亚硬拉和提踵；核心先保姿势，不必每组硬撑 80 秒。</p><p>近 28 天已记录 ${recentStrength} 次力量训练。你当前目标为每周 6 练：Push → Pull → Legs → Push → Pull → Legs → 休息。胸部两轮约 10 组、股四头约 10 组、背部拉类约 12 组；这些是计划工作组，实际有效组还取决于动作和余力。</p><p>频率比三分化的名字更重要。每周只练 3 天时，各模块约一次，不一定是最适合的安排；可考虑全身 3 练或上下肢交替，分散同肌群的周训练量。当前六练目标适合 PPL 两轮，但若近期训练频率低，应逐渐恢复，不要一次把周训练量加到六练。高强度篮球算额外负荷，腿部疲劳明显时顺延腿日。</p><p>主项休息约 2–3 分钟、孤立动作约 60–120 秒；多数工作组保留约 2 次余力。相同重量下，全部工作组稳定达到次数上限、姿势和余力仍合格，再小幅加重。</p><p>这是起始模板。缺少睡眠、疼痛、RIR 和训练时长数据时，不推算恢复分数或伤病风险；肩、腰或膝疼痛不应硬做。</p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/" target="_blank" rel="noopener">依据：ACSM 2026 阻力训练立场声明 ↗</a></details>
  <details class="glass card"><summary>两个“飞鸟”怎么分？</summary><p><b>站姿哑铃侧平举：</b>站立向身体两侧抬臂，练中肩，归入 Push；日常说的“站立飞鸟”若是这个动作，就按侧平举记录。</p><p><b>坐姿俯身反向飞鸟：</b>躯干前折、手臂向侧后方打开，练后肩，归入 Pull。</p><p>若站立时是在胸前夹合，那是绳索胸部飞鸟，不等于侧平举。不要站直拿哑铃向胸前夹合来代替水平抗阻的胸飞鸟；胸部飞鸟单独记名。</p></details>
  <details class="glass card"><summary>历史估算 1RM 与统计口径</summary>${bar(a.pr)}<p class="note">Epley 估算仅取 1–10 次的部分主项。非最大努力组可能低估；只比较同动作、同器械、同填写方式。双臂和单臂划船分别保留历史，不混算。</p><p class="note">kg·次不等于增肌刺激，计时与自重单列，未录入 RIR 时不判断有效组。无法解析 ${a.unknown} 组。</p></details>`;
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
          `<p>${escape(k)}</p><button class="btn" data-resolve="${escape(k)}" data-local="true">保留本机</button><button class="btn" data-resolve="${escape(k)}" data-local="false">采用云端</button>`,
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
function renderAll() {
  if (!document.activeElement?.closest(".set-row")) renderCheck();
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
    })),
);
document.addEventListener(
  "input",
  guarded((e) => {
    if (e.target.id === "archive-search") renderArchive();
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
    const check = e.target.closest(".set-check");
    if (check) {
      const row = check.closest(".set-row");
      row.classList.toggle("checked");
      check.setAttribute("aria-pressed", row.classList.contains("checked"));
      capture();
      count();
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
    const date = $("#plan-date").value,
      module = $("#plan-module").value;
    if (!date) throw Error("请选择日期");
    put("draft:active", {
      date,
      module,
      planVersion: 50,
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
    toast("已归档，等待云端确认");
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
    if (
      hasProgress(plan()) &&
      !confirm("当前有训练草稿，确认改为" + name + "？")
    )
      return;
    if (
      record(
        normalizeRecord({ date: plan().date, items: [{ name, sets: [] }] }),
      )
    ) {
      put("draft:active", null);
      renderAll();
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
  const {
    data: { session },
  } = await client.auth.getSession();
  if ((session?.user.id || "guest") !== store.owner) {
    clearTimeout(syncTimeout);
    startStore(session?.user.id || "guest");
  }
  if (session) {
    status("已登录 · 正在合并云端数据");
    await sync.run();
    renderAll();
  } else status("未登录 · 数据保存在本机");
}
bind("logout", async () => {
  capture();
  clearTimeout(syncTimeout);
  await client?.auth.signOut();
  startStore("guest");
  status("已退出 · 当前显示本机访客档案");
});
for (const id of ["cloud-read", "cloud-upload", "archive-refresh"])
  bind(id, async () => {
    capture();
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
  showTimer();
}
function showTimer() {
  const n = remaining();
  $("#timer-display").textContent =
    String(Math.floor(n / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0");
  $("#timer-toggle").textContent = timerState.deadline ? "暂停" : "开始";
  if (timerState.deadline && n === 0) {
    timerState.deadline = null;
    timerState.remaining = 0;
    saveTimer();
    toast("休息结束");
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
bind("timer-toggle", () => {
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
setInterval(showTimer, 250);
window.addEventListener("pagehide", guarded(capture));
document.addEventListener(
  "visibilitychange",
  guarded(async () => {
    if (document.hidden) capture();
    else {
      showTimer();
      autoRest();
      await sync.run();
      renderAll();
    }
  }),
);
window.addEventListener(
  "online",
  guarded(async () => {
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
autoRest();
restTimer = setInterval(guarded(autoRest), 60000);
setInterval(
  guarded(async () => {
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
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .catch(() => status("离线缓存未启用；训练数据仍可本机保存"));

$("#archive-module").onchange = renderArchive;
