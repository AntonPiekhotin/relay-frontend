# Deploying Relay Web

At the repo root rather than under `docs/`, because `/docs/` is in `.gitignore` — nothing in that
directory is tracked, so a deploy document there would exist only on one laptop.

The backend's own deploy guide is `~/IdeaProjects/relay/deploy/README.md` and it is the source of
truth for the server, the compose stack and `apply.sh`. This file covers the half that lives here.

---

## The shape of it

```
push to main (relay-frontend)
  │
  ├─ npm ci → lint → typecheck → test → build        ← every branch stops here
  │                                     └─ dist/
  ├─ docker build (nginx + dist/, no Node stage)
  │    └─ push ghcr.io/<owner>/relay-web:<short-sha> + :latest   [linux/arm64, linux/amd64]
  │
  └─ ssh <box> → /opt/relay → deploy/apply.sh web <short-sha>
                                │
                                ├─ flock deploy/.apply.lock
                                ├─ WEB_TAG=<sha> in deploy/.env   (PREV remembered)
                                ├─ docker compose pull web
                                ├─ docker compose up -d --no-deps web
                                ├─ poll `docker inspect relay-web` for healthy, ≤300s
                                └─ not healthy? → WEB_TAG=<PREV>, re-roll, exit 1
```

**The deploy script is the backend's, unmodified.** `apply.sh` was never service-specific: it
uppercases the name it is handed into `WEB_TAG`, rewrites that one line in `deploy/.env`, and
inspects a container called `relay-web`. So rollback, the health gate and the lock against
concurrent deploys all come for free.

**Requests reach the SPA through two nginx hops.** The edge one terminates TLS and routes by path
— `/api/v1/` and `/ws` to the app, `/realms/` to Keycloak, `/rtc` to LiveKit, **everything left
over to us**. Ours serves static files on the bridge and does the SPA fallback. TLS and every
security header belong to the edge; `deploy-nginx.conf` deliberately sets none of them.

## Why the app is on the same hostname as the API

Not a layout preference — a correctness constraint, and the one most likely to be "simplified" by
someone who does not know why it is there.

`VITE_API_BASE` and `VITE_WS_PATH` are **paths** (`/api/v1`, `/ws`), never hosts. The backend has
no CORS configuration anywhere, and `websocket-gateway` registers its handler without
`setAllowedOrigins`, so Spring applies its same-origin default to the WS upgrade. A SPA served
from any other name gets a CORS failure on fetch and **403** on the socket. See
`docs/ARCHITECTURE.md` §2.

The workflow therefore passes **no `VITE_*` build args at all**, and the image is portable as a
result: one build runs against any deployment. If either variable ever has to become a host, the
build step needs `build-args`, the image stops being environment-agnostic, and this paragraph
stops being true.

## Why the Dockerfile has no Node stage

The deploy host is an Ampere A1, so CI builds `linux/arm64`. A `FROM node AS build` stage inside
an arm64 image build runs under QEMU — `npm ci` plus `vite build`, emulated, minutes per
architecture. Static output has no architecture, so the workflow builds `dist/` once natively and
the Dockerfile only wraps it. Same reasoning as the backend's `deploy/Dockerfile`, which likewise
refuses to compile the jar it packages.

The cost of that choice: **`docker build` over a stale `dist/` silently ships stale assets.**
Locally, always

```bash
npm run build && docker build -t relay-web:dev .
docker run --rm -p 8088:80 relay-web:dev      # http://localhost:8088
```

The container serves the SPA but has no backend behind it, so anything past the login screen will
fail — `npm run dev` and the Vite proxy remain the way to work on the app.

## Caching

| Path | Header | Why |
|---|---|---|
| `/assets/*` | `public, immutable, max-age=31536000` | Vite content-hashes the filename, so the name changes when the bytes do |
| `/index.html` | `no-cache` | it names those hashed files; a cached copy makes a deploy invisible |
| anything else | falls back to `/index.html` | React Router owns the path space |

`no-cache` means "revalidate before use", not "do not store" — the browser still sends
`If-None-Match`, so an unchanged deploy answers 304 rather than re-sending the document.

`/assets/` returns a hard **404** instead of falling back, on purpose: a request for a hashed
asset that is not there means the client is running a previous deploy's `index.html`. A 404 says
that; HTML in a `<script>` slot says `Unexpected token '<'`.

## One-time setup

The four secrets are the **same values as the backend repo** — a second place to rotate them.
Settings → Secrets and variables → Actions:

| Secret | |
|---|---|
| `DEPLOY_SSH_KEY` | private half of a keypair in the deploy user's `authorized_keys` |
| `DEPLOY_HOST` | the server |
| `DEPLOY_USER` | the user that owns `/opt/relay` and is in the `docker` group |
| `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan <host>`. Pinned deliberately — the alternative hands the deploy key to whatever answers on port 22 |

| Variable | Default | |
|---|---|---|
| `DEPLOY_PATH` | `/opt/relay` | the **backend** checkout on the server |
| `DEPLOY_SSH_PORT` | `22` | |
| `SKIP_TESTS` | unset | `true` skips the suite and emits a `::warning` on the run |

**In the backend repo**, once: a `web` service in `deploy/docker-compose.prod.yml`, a
`location /` proxying to `web:80` in `deploy/nginx/conf.d/relay.conf.template`, and `WEB_TAG` in
`deploy/.env`. Order matters; `deploy/README.md` § *The frontend is a second repository* has it.

## Rolling back

Same command as the backend, on the box, with an older short sha:

```bash
cd /opt/relay && deploy/apply.sh web a1b2c3d
```

Which sha is live: `grep WEB_TAG deploy/.env`. Every tag stays in GHCR, so any past commit is one
command away. A failed deploy already rolls itself back.

## Gotchas

- **`nginx -s reload` on the edge does not pick up a `relay.conf.template` change.** The image
  renders `*.template` into `conf.d/` at container *start* and `conf.d` is not mounted, so a
  reload re-reads the copy from the last start. Use `restart nginx`. Only relevant when the
  backend's routing changes, not on a normal frontend deploy.
- **A `web` deploy disconnects nobody.** Unlike `websocket-gateway`, this container holds no
  sockets. Clients keep their connection and pick up the new bundle on their next full load.
- **GHCR packages are private on first push.** The server's existing `docker login ghcr.io` PAT
  needs `read:packages`, which it already has for the backend images in the same namespace.
- **The two repos are coupled only by convention.** The workflow does not check the backend repo
  out at our sha — that commit does not exist there. `docker-compose.prod.yml` naming
  `relay-web`, and this repo pushing `relay-web`, is the entire contract. Nothing enforces it.
- **Node is pinned to 22 in `.nvmrc`** (LTS) while local development may be on something newer.
  CI being the older of the two is the safe direction.
