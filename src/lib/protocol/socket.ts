/**
 * The socket: connect, heartbeat, reconnect. It knows the protocol's lifecycle rules and nothing
 * about the app — frames go out through `onFrame`, and what to do with them is the dispatcher's job.
 *
 * `VITE_WS_PATH` is read here and nowhere else (docs/ARCHITECTURE.md §6). It is a PATH: the
 * gateway never calls `setAllowedOrigins`, so a cross-origin handshake is answered 403 (§2).
 */

import { decodeFrame, encodeFrame, makeFrame } from './codec'
import type { InboundEnvelope, OutboundEnvelope, PongPayload } from './types'

const WS_PATH = import.meta.env.VITE_WS_PATH ?? '/ws'

/** 30s, per docs/PROTOCOL-CLIENT.md §6. The server never pings and enforces no idle timeout. */
const HEARTBEAT_MS = 30_000
/** Two consecutive missed pongs means the connection is dead — nothing else will tell us. */
const MAX_MISSED_PONGS = 2
/** `session.connected` is sent unprompted and immediately; its absence means the handshake failed. */
const SESSION_FRAME_TIMEOUT_MS = 5_000

const BACKOFF_BASE_MS = 1_000
const BACKOFF_CAP_MS = 30_000

/** Service Overload: we filled the 256-frame outbound buffer. Transient — reconnect and re-sync. */
const CLOSE_SERVICE_OVERLOAD = 1013
/** Our own code for "this connection is dead, stop pretending". */
const CLOSE_CLIENT_HEARTBEAT = 4000

export type SocketStatus =
  | 'idle'
  | 'connecting'
  /** The socket is open but `session.connected` has not landed — NOT usable yet. */
  | 'authenticating'
  /** `session.connected` received. This, not `onopen`, is READY. */
  | 'ready'
  | 'reconnecting'
  /** The token could not be refreshed. The auth layer takes over from here. */
  | 'unauthorized'

/** `invalid` ends the session; `unreachable` is a blip to back off through, not a sign-out. */
export type RefreshOutcome = 'ok' | 'invalid' | 'unreachable'

export interface RelaySocketOptions {
  getToken: () => string | null
  /** Never reconnect with a token that just failed — refresh first, whatever the outcome. */
  refreshToken: () => Promise<RefreshOutcome>
  onFrame: (frame: InboundEnvelope) => void
  onStatus: (status: SocketStatus) => void
}

export class RelaySocket {
  private ws: WebSocket | null = null
  private status: SocketStatus = 'idle'
  private attempt = 0
  private wantOpen = false
  /** Distinguishes a handshake rejection from a dropped connection: the 401 happens BEFORE open. */
  private openedThisAttempt = false
  private pendingPings = new Set<string>()
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private sessionTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: RelaySocketOptions) {}

  getStatus(): SocketStatus {
    return this.status
  }

  isReady(): boolean {
    return this.status === 'ready' && this.ws?.readyState === WebSocket.OPEN
  }

  connect(): void {
    this.wantOpen = true
    this.open()
  }

  /** A deliberate teardown — sign-out, or a page leaving. No reconnect follows. */
  disconnect(): void {
    this.wantOpen = false
    this.clearTimers()
    this.attempt = 0
    const ws = this.ws
    this.ws = null
    ws?.close(1000, 'client disconnect')
    this.setStatus('idle')
  }

  /**
   * Send a frame. Returns false when there is no usable socket — the caller queues rather than
   * assuming delivery, because there is no REST fallback send anywhere in this system.
   */
  send(frame: OutboundEnvelope): boolean {
    if (!this.isReady() || !this.ws) return false
    try {
      this.ws.send(encodeFrame(frame))
      return true
    } catch {
      return false
    }
  }

  private open(): void {
    if (!this.wantOpen) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return

    const token = this.options.getToken()
    if (!token) {
      this.setStatus('unauthorized')
      return
    }

    this.openedThisAttempt = false
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')

    // The token rides in the subprotocol list — the browser WebSocket constructor cannot set
    // headers, and a token in the query string leaks into every access log on the way.
    const ws = new WebSocket(socketUrl(), ['access_token', token])
    this.ws = ws

    ws.onopen = () => {
      this.openedThisAttempt = true
      this.setStatus('authenticating')
      // READY is session.connected, not onopen. If it never arrives, this was not an authenticated
      // handshake, whatever the socket thinks.
      this.sessionTimer = setTimeout(() => {
        ws.close(CLOSE_CLIENT_HEARTBEAT, 'no session.connected')
      }, SESSION_FRAME_TIMEOUT_MS)
    }

    ws.onmessage = (event: MessageEvent<unknown>) => {
      const frame = decodeFrame(event.data)
      if (!frame) return

      if (frame.type === 'session.connected') {
        this.clearSessionTimer()
        this.attempt = 0
        this.setStatus('ready')
        this.startHeartbeat()
      } else if (frame.type === 'pong') {
        this.pendingPings.delete((frame.payload as PongPayload).ref_id)
      }

      this.options.onFrame(frame)
    }

    ws.onclose = (event) => {
      if (this.ws !== ws) return
      this.ws = null
      this.clearTimers()
      this.pendingPings.clear()
      void this.handleClose(event.code)
    }

    ws.onerror = () => {
      // `close` always follows; the error event carries nothing actionable in a browser.
    }
  }

  private async handleClose(code: number): Promise<void> {
    if (!this.wantOpen) return

    /**
     * A close with no preceding `open` is a rejected handshake — 401 before the upgrade, or 403
     * on the Origin check. The browser does not tell us which, and there is no error frame,
     * because auth is settled before the socket exists. Refresh once, then reconnect; NEVER retry
     * with the token that just failed.
     */
    if (!this.openedThisAttempt) {
      const outcome = await this.options.refreshToken()
      if (outcome === 'invalid') {
        // The refresh token itself was rejected. There is nothing left to reconnect with.
        this.wantOpen = false
        this.setStatus('unauthorized')
        return
      }
      // `unreachable` means the server is down, not that we are unwelcome. Back off and retry —
      // a backend restart must not leave this socket permanently dead.
    }

    // 1013 means we stopped reading and filled the outbound buffer. It is transient, and the
    // reconnect sequence re-syncs over REST exactly as after any other drop.
    if (code === CLOSE_SERVICE_OVERLOAD) this.attempt = Math.max(this.attempt, 1)

    this.setStatus('reconnecting')
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.retryTimer !== null) return
    const delay = backoffDelay(this.attempt++)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.open()
    }, delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.pendingPings.clear()
    this.heartbeat = setInterval(() => {
      // Two unanswered pings and the socket is dead — a half-open connection (a sleeping laptop, a
      // phone changing networks) fires no `close` event, so this is the only detector there is.
      if (this.pendingPings.size >= MAX_MISSED_PONGS) {
        this.ws?.close(CLOSE_CLIENT_HEARTBEAT, 'missed pongs')
        return
      }
      const ping = makeFrame('ping', {})
      if (this.send(ping)) this.pendingPings.add(ping.id)
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer !== null) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat()
    this.clearSessionTimer()
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /** Called when the network comes back — no point waiting out a 30s backoff after that. */
  reconnectNow(): void {
    if (!this.wantOpen || this.isReady()) return
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.attempt = 0
    this.open()
  }

  private setStatus(status: SocketStatus): void {
    if (this.status === status) return
    this.status = status
    this.options.onStatus(status)
  }
}

/**
 * Exponential with jitter: ~1s, 2s, 4s, 8s, capped at 30s, each shifted by up to half the step.
 * The jitter is not optional — clients reconnecting in lockstep after a blip is the incident the
 * backend docs keep warning about.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS)
  return Math.round(base / 2 + random() * (base / 2))
}

function socketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}${WS_PATH}`
}
