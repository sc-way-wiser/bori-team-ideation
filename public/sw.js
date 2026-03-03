// Idearium Service Worker
const CACHE_NAME = "idearium-v1";
const SW_VERSION = "1.0.4";

// ── Install: skip waiting immediately so new SW activates right away ───────────
self.addEventListener("install", (event) => {
  console.log(`📦 SW v${SW_VERSION} installing — skipping wait`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/", "/index.html"]).catch(() => Promise.resolve());
    }),
  );
  self.skipWaiting();
});

// ── Activate: claim all clients and clean up old caches ───────────────────────
self.addEventListener("activate", (event) => {
  console.log(`🔄 SW v${SW_VERSION} activating`);
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(`🗑️ Deleting old cache: ${name}`);
              return caches.delete(name);
            }),
        ),
      ),
      self.clients.claim().then(() => {
        console.log(`✅ SW v${SW_VERSION} controlling all clients`);
      }),
    ]),
  );
});

// ── Fetch: network-first, fall back to cache for navigation ──────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  // For navigation requests (HTML), try network first, fall back to /index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/index.html")
          .then((cached) => cached ?? new Response("Offline", { status: 503 })),
      ),
    );
    return;
  }

  // For everything else: network first, no caching overhead
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ── Message: allow client to manually trigger skipWaiting ────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
