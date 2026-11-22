const CACHE_PREFIX = "s2-studio-shell-";
const CACHE = `${CACHE_PREFIX}v3`;
const STATIC_SHELL = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const page = await fetch("/");
      if (!page.ok)
        throw new Error(`Unable to fetch application shell: ${page.status}`);
      const html = await page.clone().text();
      const assets = [
        ...html.matchAll(
          /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi,
        ),
      ]
        .map((match) => new URL(match[1], self.location.origin))
        .filter((url) => url.origin === self.location.origin)
        .map((url) => url.href);
      const cache = await caches.open(CACHE);
      await cache.put("/", page.clone());
      await cache.addAll([...STATIC_SHELL, ...assets]);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const staticAsset =
    url.pathname.startsWith("/assets/") || STATIC_SHELL.includes(url.pathname);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    (request.mode !== "navigate" && !staticAsset)
  )
    return;

  event.respondWith(
    (async () => {
      if (request.mode === "navigate") {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match("/")) ||
            new Response("Application shell is not available offline yet.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      }

      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return new Response("This resource is not available offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
