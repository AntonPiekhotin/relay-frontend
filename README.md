<div align="center">

<img src="public/favicon.svg" alt="Relay" width="88" height="88">

# Relay Web

**The web client for [Relay](https://github.com/AntonPiekhotin/relay) — a real-time messenger with direct and group chats, presence, typing, and voice/video calls.**

[![CI/CD](https://github.com/AntonPiekhotin/relay-frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/AntonPiekhotin/relay-frontend/actions/workflows/ci.yml)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TanStack Query](https://img.shields.io/badge/TanStack%20Query-v5-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![LiveKit](https://img.shields.io/badge/LiveKit-group%20calls-0D9488?logo=livekit&logoColor=white)](https://livekit.io)

[Features](#features) ·
[How it works](#how-it-works) ·
[Quick start](#quick-start) ·
[Architecture](#architecture) ·
[Design principles](#design-principles) ·
[Deployment](#deployment) ·
[Documentation](#documentation)

</div>

---

## What is Relay Web?

Relay Web is a single-page React application that talks to the Relay backend, a set of
Kotlin/Spring microservices living in a [separate repository](https://github.com/AntonPiekhotin/relay).
It is the full messenger experience in a browser tab: sign in, find people, chat one-to-one or in
groups, see who is online and typing, and call each other over WebRTC or a LiveKit room.

It is built the way a client for a lossy network should be built:

- **REST is the source of truth, the WebSocket only makes it live.** Every frame either updates a
  server-backed cache entry or updates state that is *meant* to die with the connection.
- **Sends survive reloads and outages.** Messages go through a persisted outbox with one
  idempotency key per message, so a retry can never duplicate anything.
- **Reconnects recover, not replay.** The server buffers nothing for offline clients. A reconnect
  runs a fixed six-step catch-up over REST and merges the result into what is already on screen.
- **Strict TypeScript at both boundaries.** The REST DTOs and the socket frames are typed
  contracts transcribed from the backend, and every `switch` over a wire union tolerates values
  it has never seen.

---

## Features

| Area | What works today |
|---|---|
| **Identity** | Register, sign in, silent token refresh, session persistence across reloads, shareable auto-login links for demos |
| **Conversations** | Dialog list sorted by activity, unread badges, cursor-paginated history with scroll anchoring, day separators |
| **Sending** | Optimistic rendering, persisted outbox, ack correlation, retry with the same client id, offline banner and queued state |
| **Read state** | One `message.read` per open chat naming the newest message, read ticks, per-dialog unread counts, seen-by for groups |
| **Presence & typing** | Per-dialog presence subscriptions, last-seen, throttled typing indicators that expire client-side |
| **Groups** | Create groups, pick members, manage the roster, rendered system messages for joins, leaves and renames |
| **Direct calls** | Voice and video over WebRTC, trickle ICE through coturn, incoming-call toast, ring timeout, call log |
| **Group calls** | LiveKit SFU rooms joined over REST, live roster, mic and camera controls, responsive video grid |
| **People** | User search, contacts, profiles, avatar upload, password change |
| **Polish** | Light and dark themes with no first-paint flash, English and Ukrainian localization, responsive drawer layout below `md`, keyboard and screen-reader friendly controls |

---

## How it works

The backend is **pull over HTTP, push over WebSocket**, and the client mirrors that split exactly.
History, the dialog list, profiles and catch-up come over REST and land in TanStack Query. Only
time-critical deltas ride the socket and land in Zustand stores.

```
        REST (correct, paginated, authoritative)     WS (live, lossy, ordered per dialog)
                        │                                        │
                 TanStack Query                            Zustand stores
             dialogs · history · profiles              socket · outbox · presence
             read-state · call log                     typing · calls · session
                        │                                        │
                        └──────────────┬─────────────────────────┘
                                       │
                              components / hooks
```

### The send path

Every message takes the same path, and the acknowledgement means *"committed to the database"*,
never *"the recipient saw it"*.

```
Composer ─► outboxStore (persisted, clientMsgId minted ONCE)
              │
              ├─► optimistic row in the Query cache, status PENDING
              │
              └─► WS  message.send  { id: clientMsgId, payload: { dialog_id, text } }
                        │
                        ├─ ack          → replace optimistic row with the server's message and created_at
                        ├─ error        → retryable? keep in outbox and back off : mark FAILED, offer retry
                        └─ socket lost  → stays in outbox, flushes on reconnect with the SAME id
```

The envelope `id` doubles as the idempotency key. The server enforces uniqueness on
`(sender_id, client_message_id)`, so however many times a send is retried exactly one message exists.

### The reconnect sequence

The socket may drop at any time and the gateway is allowed to lose frames while it is down. Every
reconnect therefore runs the same recovery:

1. Reconnect with exponential backoff and jitter, authenticating at the handshake.
2. Wait for `session.connected` and confirm the identity.
3. Refetch the dialog list to pick up conversations started while away, with authoritative unread counts.
4. For each dialog held locally, page history forward with an `after` cursor and merge on `messageId`.
5. Re-subscribe presence for the conversation on screen.
6. Flush the outbox.

Skipping a step silently loses data, so the steps are not optional and not reorderable.

### Calls

Direct and group calls are two different mechanisms that share only the outbound `call.signal` frame.

| | Direct (1:1) | Group |
|---|---|---|
| Setup | WebSocket frames (`call.invite`, `call.accept`, `call.ice`, …) | REST join, returns a LiveKit token |
| Media | Peer-to-peer WebRTC, TURN-relayed when needed | LiveKit SFU |
| SDP / ICE | Passed through as opaque blobs | Never touches the app |

Nothing about a call is retryable. Call setup is ordered and time-boxed, so a failed signal means
tear down and start again.

---

## Quick start

### Prerequisites

- **Node 22** (pinned in `.nvmrc`)
- **The Relay backend running locally.** Nothing past the login screen works without it. Clone
  [AntonPiekhotin/relay](https://github.com/AntonPiekhotin/relay) and follow its README to bring
  up `docker compose` and `scripts/start-all.sh`.

### Run it

```bash
git clone https://github.com/AntonPiekhotin/relay-frontend.git
cd relay-frontend
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` to the API gateway on `:8080` and `/ws` to the WebSocket gateway on
`:8083`, so the browser only ever sees its own origin. See [Why everything goes through a proxy](#why-everything-goes-through-a-proxy).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with the backend proxy |
| `npm run build` | `tsc -b` then `vite build` into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only, no emit |
| `npm run lint` | ESLint over the whole project |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |

### Configuration

`.env.example` holds the only two variables, and both are **paths**, never hosts:

```dotenv
VITE_API_BASE=/api/v1
VITE_WS_PATH=/ws
```

Because they are paths, one production build runs against any deployment.

---

## Architecture

### Layers

| Layer | Owns | Lives in |
|---|---|---|
| **Wire contracts** | Typed REST DTOs (camelCase) and socket frames (snake_case), transcribed from the backend | `src/lib/api/types.ts`, `src/lib/protocol/types.ts` |
| **Transport** | Fetch wrapper with refresh-on-401, the `RelaySocket` with heartbeat and backoff, the envelope codec | `src/lib/` |
| **Server state** | Dialogs, history, profiles, read state, call log. Refetchable, paginated, cache-surgery on socket frames | `src/queries/` |
| **Live state** | Connection status, outbox, presence, typing, the current call, tokens, theme, language | `src/stores/` |
| **Features** | One folder per screen area. May import from `lib`, `stores`, `queries`, `components`, `hooks`. Never from another feature | `src/features/` |
| **Components** | Generic, feature-agnostic UI: `Avatar`, `Button`, `Modal`, `Spinner`, pickers | `src/components/` |

Only four things reach `localStorage`: the auth session, the outbox, the theme, and the language.
Messages never live in a store. They live in the Query cache, and only *unacked* messages live in
the outbox.

### Repository layout

```
relay-frontend/
├── src/
│   ├── lib/
│   │   ├── api/            REST client, endpoint functions, camelCase DTOs
│   │   ├── protocol/       socket frames, envelope codec, RelaySocket
│   │   ├── realtime/       connection lifecycle, frame dispatch, the reconnect catch-up
│   │   ├── chat/           message merge and history helpers
│   │   ├── calls/          WebRTC peer connection and LiveKit room glue
│   │   ├── i18n/           en.ts is the reference catalog; uk.ts must match its shape
│   │   └── avatar.ts       authenticated avatar fetch + object-URL cache
│   ├── stores/             Zustand: auth, socket, outbox, presence, typing, call, theme, language
│   ├── queries/            TanStack Query keys and hooks: dialogs, history, users, read state
│   ├── features/           auth · dialogs · chat · groups · contacts · calls · profile · shell
│   ├── components/         Avatar, Button, Modal, Input, Icon, EmptyState, pickers
│   └── hooks/              useDebounced, useCountdown, useElapsed, useDialogGone
├── public/                 favicon and the icon set
├── .github/workflows/      lint → typecheck → test → build → image → deploy
├── Dockerfile              nginx wrapping a prebuilt dist/, no Node stage
├── deploy-nginx.conf       SPA fallback and cache headers for the container
├── DEPLOY.md               how a push to main reaches production
└── CLAUDE.md               the invariants every contributor, human or agent, must keep
```

### Why everything goes through a proxy

The backend has **no CORS configuration**, and the WebSocket gateway enforces same-origin on the
handshake. A direct `fetch` to `localhost:8080` is blocked by the browser, and a direct WebSocket
to `localhost:8083` is answered with `403`. So both paths are proxied, in development by Vite and
in production by nginx, and the app never contains a backend host. Adding a backend service means
adding a proxy entry, not a new base URL.

---

## Design principles

The handful of rules that explain most decisions in the codebase. The full list, with the
anti-patterns to reject, is in [`CLAUDE.md`](CLAUDE.md).

1. **Never treat the socket as the source of truth.** Never request history over it, and never
   keep a list of messages outside the Query cache.
2. **One idempotency key per message, forever.** The `clientMsgId` is minted once, persisted, and
   reused on every retry. A new id per retry duplicates the message permanently.
3. **Never send an identity in a payload.** Sender, reader, caller and typist all come from the
   authenticated socket; a `user_id` in a payload is silently discarded.
4. **Unknown frame types and enum values are ignored, never errors.** This is what lets the server
   add frames without breaking deployed clients.
5. **Read state is one frame naming a position.** Opening a chat with fifty unread messages sends
   one `message.read`, not fifty.
6. **Presence is subscribed per dialog, on demand,** and re-subscribed after every reconnect.
   Typing is throttled to one emission per three seconds and expires client-side.
7. **Merge, never append.** History rows and `message.new` frames arrive for the same message.
   Deduplicate on `messageId`, merge pending sends on `clientMsgId`.
8. **Cursor pagination only.** New messages insert at the head, so an offset silently skips rows.
9. **The server's `created_at` wins.** Optimistic timestamps are replaced on ack.
10. **Avatars need an authenticated fetch.** The endpoint sits behind bearer auth, so an
    `<img src>` returns `401`. Fetch as a blob and use an object URL.

---

## Deployment

Every push runs lint, typecheck, tests and a production build. On `main` the workflow additionally
builds a multi-arch nginx image around `dist/`, pushes it to GHCR, and rolls it onto the server
with the backend's own `apply.sh`, which brings a health gate and automatic rollback for free.

```
push to main
  ├─ npm ci → lint → typecheck → test → build
  ├─ docker build (nginx + dist/)  →  ghcr.io/<owner>/relay-web:<sha>   [arm64, amd64]
  └─ ssh → deploy/apply.sh web <sha>   →  pull, roll, poll healthy, roll back on failure
```

The SPA is served from the **same hostname as the API**, behind one edge nginx that routes by path.
That is not a layout preference. It is the same-origin constraint from above, applied in
production.

To try the container locally:

```bash
npm run build && docker build -t relay-web:dev .
docker run --rm -p 8088:80 relay-web:dev      # http://localhost:8088
```

The full runbook, including secrets, caching headers, rollback and the gotchas, is in
[`DEPLOY.md`](DEPLOY.md).

---

## Documentation

| Document | Covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The correctness model, the fifteen invariants, and the anti-patterns to reject on sight |
| [`DEPLOY.md`](DEPLOY.md) | CI/CD, the image, caching, one-time setup, rolling back |
| [`vite.config.ts`](vite.config.ts) | The dev proxy and why it exists |
| [Relay backend](https://github.com/AntonPiekhotin/relay) | Services, Kafka topics, the wire protocol that this client implements |

The backend's `docs/PROTOCOL.md` is the ultimate source of truth for the wire format. If anything
here disagrees with it, the backend wins.

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 · TypeScript 5.7 (strict) · React Router 7 |
| Styling | Tailwind CSS v4, configured in CSS, light and dark themes from one set of tokens |
| Server state | TanStack Query v5 with cursor-based infinite queries |
| Live state | Zustand v5, with `persist` only where a reload must survive |
| Realtime | Native `WebSocket` with a versioned JSON envelope, heartbeat, and jittered backoff |
| Media | WebRTC + coturn for direct calls · `livekit-client` for group rooms |
| Tooling | Vite 6 · Vitest + Testing Library · ESLint 9 · typescript-eslint |
| Delivery | GitHub Actions · multi-arch Docker image on nginx · GHCR |
