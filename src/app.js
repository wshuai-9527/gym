import { PLAN } from "./catalog.js";
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
} from "./core.js";
import { Store } from "./storage.js";
import { Sync } from "./sync.js";
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
  const d = store.get("draft:active");
  const last = store
    .records()
    .filter((r) => r.date <= iso())
    .at(-1);
  return d?.date && PLAN[d.module]
    ? d
    : {
        date: last?.date === iso() ? addDays(iso(), 1) : iso(),
        module: nextModule(store.records().filter((r) => r.date <= iso())),
        rows: {},
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
  const next = { ...d, rows, updatedAt: Date.now() };
  if (JSON.stringify(next.rows) !== JSON.stringify(d.rows)) {
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
function renderCheck() {
  const d = plan(),
    p = PLAN[d.module];
  renderedSig = d.date + "|" + d.module;
  $("#today-sub").textContent = p.sub + " · 本机自动保存";
  $("#date-chip").textContent = d.date;
  $("#focus-title").textContent = d.module + " 日";
  $("#focus-desc").textContent =
    `计划日期 ${d.date} · 篮球/休息不推进三分化；有未归档草稿时继续原计划。`;
  $("#focus-tags").innerHTML =
    "<span>V49</span><span>离线队列</span><span>草稿保护</span>";
  $("#plan-date").value = d.date;
  $("#plan-module").value = d.module;
  const seq = ["Push", "Pull", "Legs"];
  $("#schedule").innerHTML = Array.from(
    { length: 7 },
    (_, i) =>
      `<span>${addDays(d.date, i).slice(5)}<br>${seq[(seq.indexOf(d.module) + i) % 3]}</span>`,
  ).join("");
  let html = `<p class="mini">7 天为力量轮转预览，实际篮球或休息后顺延；可改日期与训练类型。</p><img class="plan-img" src="${p.img}" alt="${p.title}">`;
  p.items.forEach((ex, i) => {
    const n = ["侧平举", "上斜划船"].includes(ex[0]) ? 4 : +ex[1][0],
      time = ex[0] === "平板支撑",
      body = time || ex[0] === "平板支撑肩触碰";
    html += `<article class="glass card"><div class="ex-name">${ex[0]}</div><div class="ex-meta">${ex[3]} · ${ex[1]}</div><p class="mini">重量按每只器械填写；单侧动作次数按每侧填写。</p><div class="set-list">`;
    for (let j = 0; j < n; j++) {
      const key = `${i}-${j}`,
        x = d.rows[key] || {};
      html += `<div class="set-row ${x.done ? "checked" : ""}" data-key="${key}" data-ex="${i}" data-edited="${!!x.edited}"><button class="set-check" aria-label="完成${ex[0]}第${j + 1}组" aria-pressed="${!!x.done}">✓</button><b>第${j + 1}组</b><div class="field"><input type="number" inputmode="decimal" min="0" max="1000" step="0.5" class="kg" aria-label="重量" ${body ? "disabled" : ""} value="${escape(x.kg ?? (body ? "" : lastKg(ex[0])))}"><span class="unit">${body ? "" : "kg"}</span></div><div class="field"><input type="number" inputmode="numeric" min="1" max="${time ? 86400 : 1000}" class="reps" aria-label="${time ? "秒数" : "次数"}" value="${escape(x.reps ?? (time ? 80 : 12))}"><span class="unit">${time ? "s" : ""}</span></div></div>`;
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
  PLAN[d.module].items.forEach((ex, i) => {
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
  const a = analyse(store.records());
  $("#ana-range").textContent = `最近 7 天 ${addDays(iso(), -6)}–${iso()}`;
  $("#analysis-body").innerHTML =
    `<div class="metric-grid"><article class="glass card metric"><small>记录组数（含自重/计时）</small><b>${a.sets}</b></article><article class="glass card metric"><small>记录外部负荷 kg·次</small><b>${Math.round(a.volume)}</b></article><article class="glass card metric"><small>计时训练秒数</small><b>${a.seconds}</b></article><article class="glass card metric"><small>下一次力量轮转</small><b>${nextModule(store.records().filter((r) => r.date <= iso()))}</b></article></div><article class="glass card"><h2>模块记录组数</h2>${bar(a.modules)}<p class="note">组数不等于有效增肌组。未记录 RIR/RPE、动作幅度或接近力竭程度，不能判断训练刺激或恢复风险。</p></article><article class="glass card"><h2>估算 1RM · 历史最高</h2>${bar(a.pr)}<p class="note">Epley：重量 × (1 + 次数 / 30)，仅显示 1–10 次的主项。按原记录每只器械重量估算；只用于同动作、同器械、同填写规则的趋势比较。非最大努力组可能低估。</p></article><article class="glass card"><h2>数据解读</h2><p class="note">kg·次不擅自乘双侧系数，不跨动作比较“刺激量”。计时和自重训练单列。篮球属于训练负荷，不视为恢复日。无心率、时长、主观疲劳数据时不计算 ACWR 或伤病风险。无法解析组：${a.unknown}。</p></article>`;
}
function renderArchive() {
  const rs = store.records().slice().reverse();
  $("#auto-rest-toggle").checked = !!store.get("settings:main")?.autoRest;
  $("#archive-total").textContent = rs.length + " 天";
  $("#archive-list").innerHTML = rs
    .map(
      (r) =>
        `<div class="archive-day"><h3>${r.date} · ${escape(moduleOf(r.items))}</h3><div class="archive-item"><button data-edit="${r.date}">编辑</button><button data-delete="${r.date}">删除整天</button>${r.items.map((i) => `<p><b>${escape(i.name)}</b><br>${i.sets.map(escape).join(" / ")}</p>`).join("")}</div></div>`,
    )
    .join("");
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
  const deleted = Object.entries(store.state.deleted || {});
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
  if (!cfg?.autoRest || cfg.enabledFrom > addDays(iso(), -1)) return;
  capture();
  const r = restCandidate(
    store.records(),
    store.get("draft:active"),
    new Date(),
    cfg.timezone,
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
        store.state.deleted[restore.dataset.restore],
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
      renderCheck();
      return;
    }
    const date = $("#plan-date").value,
      module = $("#plan-module").value;
    if (!date) throw Error("请选择日期");
    put("draft:active", { date, module, rows: {}, updatedAt: Date.now() });
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
    autoRest: e.target.checked,
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
  if (session?.user.id !== store.owner) {
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
  client.auth.onAuthStateChange(() =>
    setTimeout(() => activateAccount().catch((e) => status(e.message)), 0),
  );
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
