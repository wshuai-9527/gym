import { normalizeRecord, dateKey } from "./core.js";
export const empty = () => ({
  schema: 49,
  docs: {},
  pending: [],
  conflicts: {},
  legacyLoaded: false,
  deleted: {},
});
export class Store {
  constructor(storage, owner = "guest") {
    this.storage = storage;
    this.owner = owner;
    this.key = "gym-vault-v49:" + owner;
    this.state = this.read();
  }
  read() {
    const raw = this.storage.getItem(this.key);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    if (s.schema !== 49 || !s.docs || !Array.isArray(s.pending))
      throw Error("本机数据结构异常，请先导出备份");
    s.deleted ||= {};
    return s;
  }
  transaction(fn) {
    const next = structuredClone(this.read());
    fn(next);
    this.storage.setItem(this.key, JSON.stringify(next));
    this.state = next;
  }
  get(key) {
    return this.state.docs[key]?.value || null;
  }
  records() {
    return Object.entries(this.state.docs)
      .filter(([k, d]) => k.startsWith("record:") && d.value)
      .map(([, d]) => d.value)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  put(key, value) {
    this.transaction((s) => {
      const old = s.docs[key];
      if (key.startsWith("record:") && value === null && old?.value)
        s.deleted[key] = old.value;
      if (key.startsWith("record:") && value !== null) delete s.deleted[key];
      s.docs[key] = { value, version: old?.version || 0 };
      const queued = s.pending.find((p) => p.key === key && !p.sent);
      if (queued) {
        queued.value = value;
      } else
        s.pending.push({
          id: crypto.randomUUID(),
          key,
          value,
          base: old?.version || 0,
        });
    });
  }
  migrateLegacy() {
    if (this.owner !== "guest" || this.state.legacyLoaded) return;
    const raw = this.storage.getItem("gym-vault-v36-cloud");
    let legacy = raw ? JSON.parse(raw) : { records: [] };
    const draftRaw = this.storage.getItem("gym-vault-v48-active-draft");
    const draft = draftRaw ? JSON.parse(draftRaw) : null;
    this.transaction((s) => {
      for (const r of legacy.records || []) {
        const n = normalizeRecord(r);
        s.docs["record:" + n.date] = { value: n, version: 0 };
      }
      if (draft?.sig) {
        const [date, module] = draft.sig.split("|");
        s.docs["draft:active"] = {
          value: { ...draft, date: dateKey(date), module },
          version: 0,
        };
      }
      s.legacyLoaded = true;
    });
  }
  merge(remote) {
    this.transaction((s) => {
      for (const d of remote) {
        const p = s.pending.find((p) => p.key === d.key);
        if (p) {
          if (!p.sent && d.version !== p.base) s.conflicts[d.key] = d;
        } else {
          if (
            d.key.startsWith("record:") &&
            d.value === null &&
            s.docs[d.key]?.value
          )
            s.deleted[d.key] = s.docs[d.key].value;
          s.docs[d.key] = { value: d.value, version: d.version };
        }
      }
    });
  }
  resolve(key, useLocal) {
    this.transaction((s) => {
      const remote = s.conflicts[key];
      if (!remote) return;
      const local = s.docs[key]?.value;
      s.pending = s.pending.filter((p) => p.key !== key);
      s.docs[key] = {
        value: useLocal ? local : remote.value,
        version: remote.version,
      };
      if (useLocal)
        s.pending.push({
          id: crypto.randomUUID(),
          key,
          value: local,
          base: remote.version,
        });
      delete s.conflicts[key];
    });
  }
  acknowledge(op, remote) {
    this.transaction((s) => {
      s.pending = s.pending.filter((p) => p.id !== op.id);
      const newer = s.pending.find((p) => p.key === op.key);
      if (newer) {
        newer.base = remote.version;
        s.docs[op.key].version = remote.version;
      } else s.docs[op.key] = { value: remote.value, version: remote.version };
    });
  }
}
