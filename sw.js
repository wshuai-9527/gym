const CACHE = "gym-vault-v49.0.2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./vendor/supabase/supabase.js",
  "./vendor/supabase/591.supabase.js",
  "./src/styles.css",
  "./src/app.js",
  "./src/core.js",
  "./src/storage.js",
  "./src/sync.js",
  "./src/catalog.js",
  "./images/v41/plan_push.svg",
  "./images/v41/plan_pull.svg",
  "./images/v41/plan_legs.svg",
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
      try {
        const response = await fetch(e.request, { cache: "no-cache" });
        if (response.ok) await c.put(e.request, response.clone());
        return response;
      } catch {
        const cached = await c.match(e.request, { ignoreSearch: true });
        if (cached) return cached;
        if (e.request.mode === "navigate") return c.match("./index.html");
        return Response.error();
      }
    })(),
  );
});
