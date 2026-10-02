import { normalizeRecord } from "./core.js";
export class Sync {
  constructor(client, store, status) {
    this.client = client;
    this.store = store;
    this.status = status;
    this.busy = false;
  }
  async paged(table, configure) {
    let out = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await configure(
        this.client.from(table).select("*"),
      ).range(offset, offset + 499);
      if (error) throw error;
      out.push(...data);
      if (data.length < 500) return out;
    }
  }
  async run() {
    if (this.store.owner === "guest") {
      this.status("已保存在本机 · 登录后可同步云端");
      return;
    }
    if (!this.client) return;
    if (globalThis.navigator?.locks)
      return navigator.locks.request(
        "gym-sync:" + this.store.owner,
        { ifAvailable: true },
        (lock) => (lock ? this.execute() : undefined),
      );
    return this.execute();
  }
  async execute() {
    if (this.busy) return;
    this.busy = true;
    try {
      const {
        data: { user },
        error,
      } = await this.client.auth.getUser();
      if (error) throw error;
      if (!user || user.id !== this.store.owner)
        throw Error("未登录；修改保存在本机");
      // Import old tables read-only. Only truly new dates are imported; V49 tombstones win.
      if (!this.store.state.legacyLoaded) {
        const days = await this.paged("training_days", (q) =>
          q.eq("user_id", user.id).order("training_date").order("id"),
        );
        const sets = await this.paged("training_sets", (q) =>
          q
            .eq("user_id", user.id)
            .order("day_id")
            .order("set_index")
            .order("id"),
        );
        const converted = [];
        const seen = new Set();
        for (const day of days) {
          if (seen.has(day.training_date))
            throw Error(
              "旧云端存在重复日期，须先审核整理：" + day.training_date,
            );
          seen.add(day.training_date);
          let by = {};
          for (const row of sets.filter((s) => s.day_id === day.id)) {
            const name = row.exercise_name || row.exercise_key;
            let raw = row.seconds
              ? `${row.seconds}s`
              : row.weight_kg
                ? `${row.weight_kg}kg*${row.reps}`
                : `${row.reps}`;
            (by[name] || (by[name] = [])).push(raw);
          }
          let items = Object.entries(by).map(([name, sets]) => ({
            name,
            sets,
          }));
          if (!items.length && ["Rest", "Basketball"].includes(day.module))
            items = [
              { name: day.module === "Rest" ? "休息" : "篮球", sets: [] },
            ];
          if (items.length)
            converted.push(
              normalizeRecord({
                date: day.training_date,
                items,
                source: "legacy-cloud",
              }),
            );
        }
        const remote = await this.paged("gym_documents", (q) =>
          q.eq("user_id", user.id).order("key"),
        );
        this.store.merge(remote);
        for (const r of converted)
          if (!Object.hasOwn(this.store.state.docs, "record:" + r.date))
            this.store.put("record:" + r.date, r);
        this.store.transaction((s) => (s.legacyLoaded = true));
      } else
        this.store.merge(
          await this.paged("gym_documents", (q) =>
            q.eq("user_id", user.id).order("key"),
          ),
        );
      let wrote = false;
      for (const snapshot of [...this.store.state.pending]) {
        if (this.store.state.conflicts[snapshot.key]) continue;
        const op = this.store.state.pending.find((p) => p.id === snapshot.id);
        if (!op) continue;
        this.store.transaction(
          (s) => (s.pending.find((p) => p.id === op.id).sent = true),
        );
        const { data, error } = await this.client.rpc("gym_apply_document", {
          p_owner: this.store.owner,
          p_key: op.key,
          p_value: op.value,
          p_expected: op.base,
          p_mutation: op.id,
        });
        if (error) throw error;
        if (data.conflict) {
          this.store.transaction((s) => (s.conflicts[op.key] = data.document));
        } else {
          this.store.acknowledge(op, data.document);
          wrote = true;
        }
      }
      if (wrote)
        this.store.merge(
          await this.paged("gym_documents", (q) =>
            q.eq("user_id", user.id).order("key"),
          ),
        );
      const count = this.store.state.pending.length;
      this.status(
        Object.keys(this.store.state.conflicts).length
          ? "有跨设备冲突，请在档案页选择保留版本"
          : count
            ? `本机已保存 · ${count} 项待同步`
            : "已保存并同步云端",
      );
    } catch (e) {
      const missing = ["42P01", "PGRST202", "PGRST205"].includes(e.code);
      this.status(
        missing
          ? "本机已保存 · 云端升级 SQL 待审核启用"
          : `本机已保存 · 同步未完成：${e.message}`,
      );
    } finally {
      this.busy = false;
    }
  }
}
