# S2 Studio PWA prototype

S2 Studio is an experimental browser UI for the existing `s2` engineering prototype. The current implementation is **strictly simulation-only**. It has no local bridge, no CLI process integration, and no physical hardware or sensor access.

## Requirements and commands

Node.js `^20.19.0` or `>=22.12.0` and npm are required (Vite 8 runtime requirement).

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run dev` starts the Vite development server on `0.0.0.0`; use the local URL printed by Vite. For PWA/offline verification, run `npm run build` and `npm run preview`, then load the production preview once online. Service workers require a secure context; `localhost` and HTTPS origins qualify in modern browsers.

## Runtime boundaries

- Manual-control and program actions only display a local preview; they never spawn `s2`, call a device, or make a network request to a control service.
- The sensor screen generates random synthetic values in the browser. They are not physical readings or health metrics.
- The local activity log is capped at 100 entries and stored in `localStorage`; parsing validates old/corrupt values and does not write during initial loading.
- The overview event chart is derived from current-day log timestamps. It contains no fabricated measurements.
- The service worker caches the built app shell, same-origin JS/CSS entry assets, icons, and manifest. It does not intercept cross-origin, non-GET, or dynamic/API requests. Old caches are removed only when their names use the `s2-studio-shell-` prefix.
- PWA install affordances depend on browser support. Offline startup is available only after the app shell has been fetched successfully while online.

## Verification

`npm test` uses Node's built-in test runner. It checks documented setpoint bounds, strict program syntax and pass validation, browser-local log parsing, service-worker precaching, offline fallback, explicit cache misses, cache cleanup scope, and request filtering. `npm run build` performs TypeScript checking and a production Vite build.

These tests verify UI and browser-storage behavior only. They do not establish hardware behavior, physical-output safety, calibration, medical validity, or service-worker behavior on every browser/OS combination.
