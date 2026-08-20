# Relay Web — Agent Guide

React/TypeScript web client for the **Relay** messenger backend (Kotlin/Spring microservices, in a
separate repo at `~/IdeaProjects/relay`).

**Stack:** React 19 · TypeScript 5.7 (strict) · Vite 6 · Tailwind CSS v4 · TanStack Query v5
(server state) · Zustand v5 (live state) · React Router 7 · `livekit-client` (group calls) ·
Vitest + Testing Library.

**This file is always in context. Keep it under 150 lines.** Detail lives in `docs/`.

---

## The one thing to understand first

The backend is **pull over HTTP, push over WebSocket**, and that split is not a style preference —
it is the correctness model. History, the dialog list, and catch-up come over REST; only
time-critical deltas ride the socket. **The server buffers nothing for offline clients.** There is
no replay and no "missed messages" frame. A frame lost to a dropped socket is recovered by a REST
catch-up fetch on reconnect, which is the only reason the gateway is allowed to drop it.

So: **never request history over the socket, and never treat the socket as the source of truth.**
The socket makes the UI live; REST makes it correct.

---

## Invariants — never violate, regardless of the task

1. **Everything goes through the same-origin dev proxy.** The backend has **no CORS config at all**,
   and websocket-gateway never calls `setAllowedOrigins`, so Spring enforces same-origin on the WS
   handshake. A hardcoded `http://localhost:8080` in application code is blocked by CORS; a direct
   `ws://localhost:8083` is answered **403**. Use the paths `/api/v1` and `/ws`. See
   `vite.config.ts` and `docs/ARCHITECTURE.md` §2.
2. **REST is camelCase; socket payloads are snake_case.** `dialogId` over HTTP, `dialog_id` on the
   wire, for the same field. The backend uses two separate Jackson mappers to guarantee this. Never
   unify them into one type or "normalise" at the boundary of the wrong layer — convert only inside
   the mapper described in `docs/PROTOCOL-CLIENT.md` §2.
3. **The envelope `id` of a `message.send` IS the `client_msg_id`.** Generate it once with
   `crypto.randomUUID()`, persist it, and reuse it for **every** retry. Dedup is a DB unique
   constraint on `(sender_id, client_message_id)`; a retry with the same id returns the original ack
   and exactly one message exists. A new id per retry duplicates the message — permanently.
4. **Never send an identity in a payload.** Sender, reader, caller, typist, and presence subject all
   come from the authenticated socket. A `user_id`/`caller_id`/reader id in a payload is discarded,
   not honoured — including on `message.read`, `typing.start`, and `presence.subscribe`.
5. **Unknown frame types and unknown enum values are ignored, never errors.** This is what lets the
   server add frames without breaking us. Unknown `type` → drop silently. Unknown `signal.verb`,
   system-message `kind`, presence `status`, or error `code` → fall back to generic handling. A
   `switch` over any wire union needs a tolerant default, never a thrown error.
6. **Read state is one frame naming a position, never one per message.** Opening a chat with fifty
   unread messages sends **one** `message.read` naming the newest. The cursor only moves forward
   server-side, so retries and out-of-order frames are safe and need no client-side comparison.
7. **Presence is subscribed per dialog, on demand.** Subscribe when a conversation opens,
   unsubscribe when it closes. Never subscribe by user id (impossible by design), and never keep
   subscriptions for off-screen conversations. Subscriptions die with the socket — re-subscribe
   after every reconnect.
8. **Throttle `typing.start` to one emission per 3 seconds**, never per keystroke, and expire a
   received indicator client-side after ~5s. The server enforces neither, and there is no
   `typing.stop` frame — there never will be, because a lost stop leaves somebody typing forever.
9. **Merge, never append.** `message.new` and history rows both arrive for the same message.
   Deduplicate on `messageId`; merge your own `PENDING` sends on `clientMsgId`. Receiving a message
   you already hold is normal, not an error.
10. **Cursor pagination only, and cursors are message/dialog ids you already hold.** Never offset —
    new messages insert at the head and offsets silently skip rows. The `page`/`size` params on
    user search and contacts are the one exception; do not copy that shape anywhere else.
11. **The server's `created_at` is authoritative and may reorder your message.** Replace optimistic
    local values on ack. Never display the client `ts` after an ack has landed.
12. **Avatars need an authenticated fetch, not an `<img src>`.** `GET /api/v1/user/{id}/avatar` sits
    behind the gateway's `anyRequest().authenticated()`, and a browser attaches no bearer token to
    an image request — a raw `src` returns **401**. Fetch as a blob with the token and use an object
    URL. See `docs/REST-API.md` §3.
13. **Nothing about a call is retryable.** Call setup is ordered and time-boxed; replaying a failed
    signal negotiates against a peer that has moved on. Tear down and start a new call.
14. **SDP and ICE candidates are opaque.** Pass them through untouched. The server never parses
    them and neither should we.
15. **Never send a group call's id in a `call.*` frame.** Direct calls are socket frames; group
    calls are REST + LiveKit and share only the outbound `call.signal` frame. Mixing them yields
    `INVALID_REQUEST`.

## Anti-patterns — reject on sight

```ts
// WRONG — bypasses the proxy; blocked by CORS, and 403 on a WS upgrade
fetch('http://localhost:8080/api/v1/message/dialogs')
new WebSocket('ws://localhost:8083/ws', ['access_token', jwt])

// WRONG — a new id per retry duplicates the message forever
socket.send({ id: crypto.randomUUID(), type: 'message.send', ... })   // on the RETRY path

// WRONG — identity in a payload; silently discarded
payload: { dialog_id, user_id: me.id }                 // the socket already knows who you are

// WRONG — one read frame per message
unread.forEach(m => sendRead(m.id))                    // one frame, naming the newest

// WRONG — a throwing default over a wire union
default: throw new Error(`unknown verb ${verb}`)       // ignore it; the server may add verbs

// WRONG — an avatar as a plain src; no bearer token is attached, so 401
<img src={user.avatarUrl} />                            // fetch as a blob, use an object URL

// WRONG — a typing frame per keystroke
onChange={() => send('typing.start', { dialog_id })}    // throttle to 1 per 3s
```

---

## Routing — read before working on the matching area

| Task | Read |
|---|---|
| Frames, envelope, snake_case payloads, error codes | `docs/PROTOCOL-CLIENT.md` |
| Any HTTP call, endpoint shapes, auth, avatars | `docs/REST-API.md` |
| Folder layout, layers, which store owns what | `docs/ARCHITECTURE.md` |
| Sending, the outbox, optimistic UI, history merge, read state | `docs/MESSAGING.md` |
| Socket lifecycle, reconnect, catch-up, presence, typing | `docs/REALTIME.md` |
| Direct calls (WebRTC/TURN), group calls (LiveKit) | `docs/CALLS.md` |
| Screens, components, Tailwind conventions, a11y | `docs/UI.md` |
| What to build next, in what order | `docs/ROADMAP.md` |
| Running the backend locally | `docs/BACKEND-SETUP.md` |

**The backend's own `docs/PROTOCOL.md` is the ultimate source of truth** for the wire format
(`~/IdeaProjects/relay/docs/PROTOCOL.md`). If this repo's docs disagree with it, the backend wins —
fix the doc here in the same change.

---

## Commands

```bash
npm run dev         # Vite dev server on :5173, proxying /api and /ws
npm run build       # tsc -b && vite build
npm run typecheck   # types only
npm run lint
npm run test        # Vitest, single run
```

The backend must be running for anything past the login screen: `docs/BACKEND-SETUP.md`.

## Build order

- [ ] 0. Scaffold — router, query client, auth store, login/register  ← *next*
- [ ] 1. Dialog list + history — cursor pagination, dialog naming
- [ ] 2. Send — outbox, optimistic UI, ack correlation, retry
- [ ] 3. Live — socket lifecycle, reconnect + catch-up, `message.new`
- [ ] 4. Read state — cursors, unread badges, read ticks
- [ ] 5. Presence and typing — per-dialog subscribe, throttling
- [ ] 6. Groups — create, manage, system messages, seen-by
- [ ] 7. Calls — direct (WebRTC + TURN), then group (LiveKit)
