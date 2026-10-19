// iOS Web Push requires an installed Home Screen app and a user gesture.
export class RestNotifications {
  constructor(client, owner, storage, env = globalThis) {
    Object.assign(this, { client, owner, storage, env });
    this.queue = Promise.resolve();
  }
  async enable() {
    if (this.owner() === "guest")
      throw Error("请先恢复账号，提醒会关联当前设备");
    const e = this.env;
    if (!e.Notification || !e.PushManager || !e.navigator.serviceWorker)
      throw Error("请从主屏幕打开 App 后启用通知");
    if ((await e.Notification.requestPermission()) !== "granted")
      throw Error("请在系统设置中允许此 App 通知");
    const reg = await e.navigator.serviceWorker.ready;
    const { data, error } = await this.client.rpc("gym_push_public_config");
    if (error) throw error;
    const key = typeof data === "string" ? data : data.publicKey;
    const bytes = Uint8Array.from(
      atob(
        key
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(key.length / 4) * 4, "="),
      ),
      (c) => c.charCodeAt(0),
    );
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }));
    let id = this.storage.getItem("gym-vault-device-id");
    if (!id) {
      id = crypto.randomUUID();
      this.storage.setItem("gym-vault-device-id", id);
    }
    const enrolled = await this.client.rpc("gym_push_enroll", {
      p_device: id,
      p_subscription: sub.toJSON(),
    });
    if (enrolled.error) throw enrolled.error;
    this.storage.setItem("gym-push-owner", this.owner());
  }
  schedule(deadline) {
    const owner = this.owner();
    if (owner === "guest" || this.storage.getItem("gym-push-owner") !== owner)
      return Promise.resolve(false);
    const run = async () => {
      if (this.owner() !== owner) return false;
      const { error } = await this.client.rpc("gym_push_schedule", {
        p_device: this.storage.getItem("gym-vault-device-id"),
        p_due: deadline ? new Date(deadline).toISOString() : null,
      });
      if (error) throw error;
      return true;
    };
    this.queue = this.queue.catch(() => {}).then(run);
    return this.queue;
  }
}
