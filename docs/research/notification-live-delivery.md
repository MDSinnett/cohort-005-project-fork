# How can new Notifications reach an open page in this stack?

Research for [#3](https://github.com/MDSinnett/cohort-005-project-fork/issues/3). Facts and trade-offs only; this does not pick an approach.

Researched 2026-11-10.

## The stack as it actually is

- **React Router is v8, not v7.** `package.json` pins `react-router`, `@react-router/node`, `@react-router/serve` and `@react-router/dev` at `8.3.0` (confirmed in `node_modules/react-router/package.json`). The app uses framework mode with `ssr: true` (`react-router.config.ts`). The reactrouter.com docs cited below are the current docs.
- **Production server:** `npm start` runs `react-router-serve ./build/server/index.js` (`package.json`). `@react-router/serve` 8.3.0 is a ready-made Express 5 app. It applies `compression()`, serves static assets, sends every other request to `createRequestHandler` from `@react-router/express`, and calls `app.listen(...)` (`node_modules/@react-router/serve/dist/cli.js` lines 17-20, 111-127). It has no hook for adding your own middleware or handling the HTTP `upgrade` event.
- **Dev server:** `npm run dev` runs `react-router dev`, which is the Vite dev server (Vite 7).
- **Data:** one `data.db` file opened with synchronous `better-sqlite3` in WAL mode (`app/db/index.ts`). There is one server process and one writer, and the app cannot run on more than one machine (ADR 0006, `docs/adr/0006-one-sqlite-file-through-drizzle.md`. That file is in the main checkout but not yet on the fork's `origin/main`).
- **Session:** a cookie session (`cadence_session`, `httpOnly`, `sameSite: lax`) read in loaders through `getCurrentUserId(request)` (`app/lib/session.ts`).
- **Loaders on every page:** every app page sits under `routes/layout.app.tsx`. Its loader runs `getAllUsers()`, the current user, recent-course progress (several queries per course) and `isTeamAdmin` (`app/routes/layout.app.tsx:174`). Any whole-page revalidation runs this loader again.

## Option 1: Next navigation only (loader revalidation)

**How.** Put the unread Notifications (or a count) in a loader that runs on every page, such as `layout.app.tsx` or a new parent route. Nothing else is needed. "In framework mode with SSR, route loaders are automatically revalidated after all navigations and form submissions" ([Route Module: shouldRevalidate](https://reactrouter.com/start/framework/route-module)). Actions also trigger revalidation "of all loader data on the page when called from `<Form>`, `useFetcher`, and `useSubmit`" (same page). Failed 4xx/5xx submissions do not revalidate by default ([Revalidation Optimization](https://reactrouter.com/how-to/optimize-revalidation)).

**Hosting.** Plain request/response, so it works unchanged with `react-router-serve` and the Vite dev server.

**SQLite load.** One extra indexed read per navigation or submission, inside a loader that already runs. No load from idle tabs.

**Complexity.** The lowest of the four: one query and some UI.

**Limits.** A tab with no activity never sees a new Notification. Someone reading a lesson or watching a video finds out only when they next click or submit.

## Option 2: Polling (useRevalidator or useFetcher on an interval)

**How, variant A: `useRevalidator`.** Its documented purpose is to "Revalidate the data on the page for reasons outside of normal data mutations like Window focus or polling on an interval" ([useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). The client code is a `useEffect` with `setInterval(() => revalidator.revalidate(), N)`. The docs show a window-focus example but no interval example. `revalidate()` re-runs the page's active loaders. A route's `shouldRevalidate` can opt out, but a child opting out "does not skip any ancestor routes" ([Revalidation Optimization](https://reactrouter.com/how-to/optimize-revalidation)). In this app, every tick therefore re-runs `layout.app.tsx`'s loader and the leaf route's loader, unless each of them adds a `shouldRevalidate`.

**How, variant B: `useFetcher` plus a resource route.** Add a small route (for example `api.notifications.ts`) whose loader returns only the unread Notifications, and call `fetcher.load("/api/notifications")` on an interval. A route with a loader and no default export is a resource route; when fetchers call it, return `data()` rather than a raw `Response` ([Resource Routes](https://reactrouter.com/how-to/resource-routes)). Fetchers "track their own, independent state" ([useFetcher](https://reactrouter.com/api/hooks/useFetcher)). `fetcher.load` "only revalidates by default after action submissions and explicit `useRevalidator` calls" ([Revalidation Optimization](https://reactrouter.com/how-to/optimize-revalidation)). Each tick runs only that one loader.

**Hosting.** Plain short requests, so it works with `react-router-serve` and Vite dev as they are.

**SQLite load.** Each open tab makes roughly one request every N seconds, even when nothing has changed.
- Variant A runs the whole layout loader on each tick, which is several queries plus one per recent course.
- Variant B runs about one indexed query (for example `WHERE user_id = ? AND read_at IS NULL`) on each tick.
- `better-sqlite3` is synchronous, so every query briefly blocks the single Node event loop. WAL mode lets these reads run alongside the one writer without blocking it.
- Delivery delay is up to N seconds. Pausing while `document.hidden` is true cuts the load from background tabs (this is the standard Page Visibility API, not a React Router feature).

**Complexity.** Low. One hook, optionally a resource route, and a visibility check. Variant A needs no new route but costs more per tick.

## Option 3: Server-sent events (SSE) via a resource route

**How.**
- **Server:** a resource route whose loader returns `new Response(readableStream, { headers: { "Content-Type": "text/event-stream" } })` and keeps it open, ending it when `request.signal` aborts. `remix-utils` wraps this as `eventStream(request.signal, setup)`, where `setup` gets `send` and returns a cleanup function, and its README says it "must live in a Resource Route" ([remix-utils README, Server-Sent Events](https://github.com/sergiodxa/remix-utils#server-sent-events)).
- **Client:** a browser `EventSource`, or remix-utils' `useEventSource(url, { event })`. That hook "keeps a global map of connections based on the provided URL and options" so matching components share one connection (same README).
- **remix-utils version:** remix-utils' current major "requires React Router v8", and v7 apps should stay on 9.x (README, Installation). This app is on v8, so the current major applies.
- **Two client patterns:** an event carries the Notification payload directly, or an event only signals "something changed" and the client then calls `revalidator.revalidate()` or `fetcher.load()` to read it the usual way.

**What happens with `react-router-serve` (checked in installed source).**
- `react-router-serve` mounts `compression()`. compression 1.8.2 treats `text/event-stream` as compressible, because `compressible`'s regex `^text\/` matches it (`node_modules/compressible/index.js:23`). It skips compression only for `Cache-Control: no-transform` or a known small `Content-Length` (`node_modules/compression/index.js:175-192, 318`).
- Buffering is not a problem here, though. `@react-router/node`'s `writeReadableStreamToWritable` calls `writable.flush()` after every chunk when it exists (`node_modules/@react-router/node/dist/index.js:107-122`), and compression adds `res.flush` (`compression/index.js:93`).
- `@react-router/express` calls `res.flushHeaders()` for `text/event-stream` responses (`node_modules/@react-router/express/dist/index.js:63`).
- Result: SSE streams through the stock server with no custom server. Sending `Cache-Control: no-transform` turns compression off for the stream, if wanted.

**Hosting and protocol constraints.**
- **Process model:** each open tab holds one long-lived HTTP connection to the single Node process.
- **Proxies:** any reverse proxy or host in front must allow streaming responses and long idle connections. remix-utils warns that "your server must support HTTP streaming" (README).
- **Connection limit:** the HTML spec warns that clients with "HTTP's per-server connection limitation might run into trouble" when a user opens several tabs, each with an `EventSource` to the same domain ([HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)). This is the HTTP/1.1 six-per-origin limit; HTTP/2 multiplexes and avoids it. `react-router-serve` uses Node's `http` server, which is HTTP/1.1 only, unless a proxy in front terminates HTTP/2.
- **Reconnection:** the browser reconnects automatically after an "implementation-defined" delay that the server can change with `retry:`. It resends the last `id:` as a `Last-Event-ID` header, so a server can replay missed Notifications. Responding with 204 stops reconnection (HTML spec, same page).
- **Auth:** `EventSource` cannot set custom headers; its only option is `withCredentials` (HTML spec). A same-origin request still carries the `cadence_session` cookie, so the loader can call `getCurrentUserId(request)` as it does now.

**SQLite load.** It depends on how the stream learns about new Notifications:
- **In-process push:** the code that inserts a Notification also emits it on an in-memory emitter keyed by recipient, and the open streams subscribe. The database does no extra reads beyond the insert itself. This works only because there is one server process (ADR 0006), and it would stop working if the app ever ran on more than one process or machine. (This is reasoning from ADR 0006, not a documented React Router feature.) In Vite dev, modules can be re-evaluated on HMR, so a module-scope emitter may be duplicated. The usual workaround is to keep it on `globalThis` (an inference, not checked against Vite docs).
- **Polling inside the stream:** each open stream queries SQLite on a server-side timer. The load is the same as Option 2 variant B, but there is no HTTP request per tick.

**Complexity.** Medium. You need:
- a resource route that streams;
- abort and cleanup handling;
- an emitter or server-side poll;
- heartbeat comments to keep proxies from closing idle connections;
- a client hook;
- a decision on replay through `Last-Event-ID`;
- a plan for many open tabs.

It needs no new server process and no new runtime dependency, although `remix-utils` can provide the helpers.

## Option 4: WebSockets

**How.** React Router has no WebSocket API. Neither the route module nor the resource route docs mention one, and the deploying guide doesn't mention long-lived connections ([Deploying](https://reactrouter.com/start/framework/deploying)). A WebSocket needs the HTTP server's `upgrade` event, which happens outside React Router's request handler.

**Hosting.**
- `react-router-serve` creates and listens on its own Express server and offers no extension point (`@react-router/serve/dist/cli.js:111-127`). So WebSockets need one of these:
  - **A custom server**, such as the official `node-custom-server` template, "Custom express server for more control" ([Deploying](https://reactrouter.com/start/framework/deploying); [template source](https://github.com/remix-run/react-router-templates/tree/main/node-custom-server)). In that template, `server.js` runs Vite in middleware mode during development and imports `build/server/index.js` in production. You then attach a WebSocket library (for example `ws`) to the Node `http.Server`. This replaces both `npm run dev` and `npm start` with `node server.js`.
  - **A separate WebSocket process or port.** This does not fit the single-process, in-memory-emitter model unless the two processes communicate, for example by polling SQLite.
- **Dev:** Vite's `httpServer` "Will be null in middleware mode" ([Vite JS API](https://vite.dev/guide/api-javascript.html)). In a custom server you own the `http.Server` and attach to that. Vite already uses its own WebSocket for HMR, so app sockets need a separate path.
- **Auth:** the upgrade request carries cookies, but the session has to be parsed by hand from the upgrade request, outside loaders and `getCurrentUserId(request)`.

**SQLite load.** The same as SSE: either none beyond the insert (in-process push, single process only) or a server-side poll.

**Complexity.** The highest of the four. It requires:
- replacing the stock server with a custom one, which touches both scripts and the dev workflow;
- adding a dependency;
- handling auth on upgrade;
- writing reconnection and backoff yourself, because WebSockets have no automatic reconnect or `Last-Event-ID` equivalent;
- heartbeats.

What it buys over SSE is client-to-server messages on the same channel. Notification delivery is one-way, and Cadence already sends client-to-server traffic through actions.

## Comparison

| | Next navigation | Polling (revalidator / fetcher) | SSE resource route | WebSockets |
| --- | --- | --- | --- | --- |
| Reaches an idle open page | No | Yes, within N seconds | Yes, near-instant | Yes, near-instant |
| Works with `react-router-serve` as is | Yes | Yes | Yes (adapter flushes; verified in source) | No, needs a custom server |
| New dependencies | None | None | None (remix-utils optional) | WebSocket lib + custom server |
| SQLite cost | ~1 read per navigation | 1 read (fetcher) or full layout loader (revalidator) per tab per tick | ~0 extra reads with in-process push; else a server-side poll | Same as SSE |
| Depends on single process (ADR 0006) | No | No | Only if using in-process push | Only if using in-process push |
| Long-lived connections per tab | 0 | 0 | 1 (HTTP/1.1 six-per-origin limit) | 1 |
| Implementation complexity | Lowest | Low | Medium | Highest |

Hybrids are possible. For example, an SSE or polling signal can trigger `revalidator.revalidate()` or `fetcher.load()`, and the Notifications are still read through a normal loader.
