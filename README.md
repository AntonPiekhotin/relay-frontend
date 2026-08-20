# Relay Web

React/TypeScript web client for the [Relay](../../IdeaProjects/relay) messenger backend.

**React 19 · TypeScript 5.7 · Vite 6 · Tailwind CSS v4 · TanStack Query · Zustand · React Router 7**

```bash
npm install
npm run dev        # http://localhost:5173
```

The backend must be running — see [docs/BACKEND-SETUP.md](docs/BACKEND-SETUP.md).

## Status

Scaffold only. The contract types (`src/lib/protocol/types.ts`, `src/lib/api/types.ts`) are written;
no features are built yet. Start at Phase 0 of [docs/ROADMAP.md](docs/ROADMAP.md).

## Docs

Agents and humans should read [CLAUDE.md](CLAUDE.md) first — it holds the invariants.

| Doc | Covers |
|---|---|
| [PROTOCOL-CLIENT.md](docs/PROTOCOL-CLIENT.md) | WebSocket frames, envelope, error codes |
| [REST-API.md](docs/REST-API.md) | Every HTTP endpoint, auth, avatars |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, folder layout, which store owns what |
| [MESSAGING.md](docs/MESSAGING.md) | Outbox, idempotency, history merge, read state |
| [REALTIME.md](docs/REALTIME.md) | Socket lifecycle, reconnect, presence, typing |
| [CALLS.md](docs/CALLS.md) | Direct calls (WebRTC/TURN), group calls (LiveKit) |
| [UI.md](docs/UI.md) | Screens, components, Tailwind conventions |
| [ROADMAP.md](docs/ROADMAP.md) | Phased build order |
| [BACKEND-SETUP.md](docs/BACKEND-SETUP.md) | Running the backend locally |

## One thing to know before you start

The backend has **no CORS configuration**, and websocket-gateway enforces same-origin on the WS
handshake. Everything goes through the Vite dev proxy (`/api` → `:8080`, `/ws` → `:8083`) as
**paths, never hosts**. A direct call to `localhost:8080` is blocked by CORS; a direct WebSocket to
`localhost:8083` is answered `403`. See [ARCHITECTURE.md §2](docs/ARCHITECTURE.md).

## `.cra-backup/`

The original Create React App scaffold, moved aside rather than deleted. Safe to remove
(`rm -rf .cra-backup`) once you are happy with the Vite setup.
