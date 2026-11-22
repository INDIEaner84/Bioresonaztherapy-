import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
const origin = "https://studio.example";

function setupWorker({ networkFailure = false } = {}) {
  const listeners = new Map();
  const cacheNames = new Set([
    "unrelated-app-cache",
    "s2-studio-shell-v1",
    "s2-studio-shell-v2",
  ]);
  const entries = new Map();
  const added = [];
  const deleted = [];
  let claimed = false;
  let networkUnavailable = networkFailure;
  const cache = {
    async addAll(requests) {
      added.push(...requests);
      for (const request of requests) {
        const key = new URL(request, origin).href;
        entries.set(
          key,
          key === `${origin}/`
            ? new Response(
                '<script src="/assets/app-a1.js"></script><link href="/assets/app-b2.css" rel="stylesheet"><script src="https://cdn.example/remote.js"></script>',
              )
            : new Response(`cached ${key}`),
        );
      }
    },
    async put(request, response) {
      entries.set(
        new URL(request.url ?? request, origin).href,
        response.clone(),
      );
    },
    async match(request) {
      const key = new URL(request.url ?? request, origin).href;
      const response = entries.get(key);
      return response?.clone();
    },
  };
  const caches = {
    async open(name) {
      cacheNames.add(name);
      return cache;
    },
    async keys() {
      return [...cacheNames];
    },
    async delete(name) {
      deleted.push(name);
      return cacheNames.delete(name);
    },
    async match(request) {
      const key = new URL(request.url ?? request, origin).href;
      const response = entries.get(key);
      return response?.clone();
    },
  };
  const workerSelf = {
    location: { origin },
    clients: {
      async claim() {
        claimed = true;
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    skipWaiting() {},
  };
  const fetch = async (request) => {
    if (networkUnavailable) throw new Error("offline");
    const url = new URL(request.url ?? request, origin);
    if (url.pathname === "/") {
      return new Response(
        '<script src="/assets/app-a1.js"></script><link href="/assets/app-b2.css" rel="stylesheet"><script src="https://cdn.example/remote.js"></script>',
      );
    }
    return new Response(`network ${url.href}`);
  };
  vm.runInNewContext(source, {
    self: workerSelf,
    caches,
    fetch,
    URL,
    Response,
  });
  return {
    listeners,
    cacheNames,
    entries,
    added,
    deleted,
    setOffline: (value) => {
      networkUnavailable = value;
    },
    get claimed() {
      return claimed;
    },
  };
}

async function install(worker) {
  const pending = [];
  worker.listeners.get("install")({
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);
}

test("PWA installation precaches built entrypoint assets plus root shell", async () => {
  const worker = setupWorker();
  await install(worker);
  const cachedPaths = worker.added.map(
    (request) => new URL(request, origin).pathname,
  );
  assert.ok(worker.entries.has(`${origin}/`));
  assert.ok(cachedPaths.includes("/manifest.webmanifest"));
  assert.ok(cachedPaths.includes("/icon-192.png"));
  assert.ok(cachedPaths.includes("/icon-512.png"));
  assert.ok(cachedPaths.includes("/assets/app-a1.js"));
  assert.ok(cachedPaths.includes("/assets/app-b2.css"));
  assert.ok(!cachedPaths.includes("/remote.js"));
});

test("activation removes only obsolete S2 Studio caches and claims clients", async () => {
  const worker = setupWorker();
  await install(worker);
  const pending = [];
  worker.listeners.get("activate")({
    waitUntil: (promise) => pending.push(promise),
  });
  await Promise.all(pending);
  assert.deepEqual(worker.deleted, [
    "s2-studio-shell-v1",
    "s2-studio-shell-v2",
  ]);
  assert.ok(worker.cacheNames.has("unrelated-app-cache"));
  assert.equal(worker.claimed, true);
});

test("offline navigation falls back to the precached app shell", async () => {
  const worker = setupWorker();
  await install(worker);
  worker.setOffline(true);
  let responsePromise;
  worker.listeners.get("fetch")({
    request: { method: "GET", url: `${origin}/`, mode: "navigate" },
    respondWith: (promise) => {
      responsePromise = promise;
    },
  });
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /app-a1\.js/);
});

test("offline uncached assets fail explicitly and are never replaced with HTML", async () => {
  const worker = setupWorker();
  await install(worker);
  worker.setOffline(true);
  let responsePromise;
  worker.listeners.get("fetch")({
    request: {
      method: "GET",
      url: `${origin}/assets/missing.js`,
      mode: "cors",
    },
    respondWith: (promise) => {
      responsePromise = promise;
    },
  });
  const response = await responsePromise;
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /text\/plain/);
});

test("non-GET, cross-origin, and dynamic API requests are not intercepted", () => {
  const worker = setupWorker();
  for (const request of [
    { method: "POST", url: `${origin}/api`, mode: "cors" },
    { method: "GET", url: "https://other.example/file.js", mode: "cors" },
    { method: "GET", url: `${origin}/api/status`, mode: "cors" },
  ]) {
    let intercepted = false;
    worker.listeners.get("fetch")({
      request,
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false);
  }
});
