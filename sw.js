const CACHE = "gym-vault-v58.0.0";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./src/cycles.js",
  "./src/adaptive.js",
  "./src/notifications.js",
  "./vendor/supabase/supabase.js",
  "./vendor/supabase/591.supabase.js",
  "./src/styles.css",
  "./src/app.js",
  "./src/core.js",
  "./src/storage.js",
  "./src/sync.js",
  "./src/catalog.js",
  "./src/reports.js",
  "./src/history-reference.js",
  "./src/exercise-visuals.js",
  "./src/progression.js",
  "./src/report-inbox.js",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await c.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith("gym-vault-") && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    !u.pathname.startsWith(new URL(self.registration.scope).pathname)
  )
    return;
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      // Use one atomically installed shell; never mix old HTML and new modules.
      if (e.request.mode === "navigate")
        return (await c.match("./index.html")) || fetch(e.request);
      const canonical = new URL(u.pathname, self.location.origin);
      const cached = await c.match(canonical.href, { ignoreSearch: true });
      return cached || fetch(e.request);
    })(),
  );
});
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data?.json() || {};
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || "休息结束", {
      body: data.body || "准备好后开始下一组",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: "gym-rest",
      data: { url: self.registration.scope },
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const tab = tabs.find((t) => t.url.startsWith(self.registration.scope));
      if (tab) return tab.focus();
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
