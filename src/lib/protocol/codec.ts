/**
 * Envelope encode/decode. THE ONLY PLACE snake_case appears on the client.
 *
 * Envelope keys are flat lowercase (`v`, `type`, `id`, `ts`); every key inside `payload` is
 * snake_case, and `ts` is epoch millis while payload timestamps are ISO strings. The backend runs
 * a separate Jackson mapper for the wire precisely so this cannot drift — REST is camelCase and
 * that is deliberate, not an inconsistency to fix (docs/PROTOCOL-CLIENT.md §2).
 */

import { PROTOCOL_VERSION } from './types'
import type { InboundEnvelope, OutboundEnvelope, OutboundFrameType } from './types'

/**
 * A frame id. Mandatory on every C→S frame, even the ones that answer nothing, so a rejection can
 * name the offending frame.
 *
 * For `message.send` this id IS the `client_msg_id` — mint it once with the message and reuse it
 * for every retry, or the server's `(sender_id, client_message_id)` unique constraint has nothing
 * to dedupe on and the message is duplicated permanently (docs/MESSAGING.md §1).
 */
export function newFrameId(): string {
  return crypto.randomUUID()
}

export function makeFrame<T>(type: OutboundFrameType, payload: T, id: string = newFrameId()): OutboundEnvelope<T> {
  return { v: PROTOCOL_VERSION, type, id, ts: Date.now(), payload }
}

export function encodeFrame<T>(frame: OutboundEnvelope<T>): string {
  return JSON.stringify(frame)
}

/**
 * Parse an inbound frame. Returns null for anything unusable — a non-JSON message, a non-object, a
 * frame with no `type` — because a malformed frame is not an exception to raise at the socket
 * layer. Unknown but well-formed types are passed through: dropping them is the dispatcher's job.
 */
export function decodeFrame(raw: unknown): InboundEnvelope | null {
  if (typeof raw !== 'string') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const candidate = parsed as Partial<InboundEnvelope>
  if (typeof candidate.type !== 'string' || candidate.type.length === 0) return null

  return {
    v: typeof candidate.v === 'number' ? candidate.v : PROTOCOL_VERSION,
    type: candidate.type,
    ts: typeof candidate.ts === 'number' ? candidate.ts : Date.now(),
    payload: candidate.payload ?? {},
  }
}

/** Narrow a decoded envelope's payload. The dispatcher owns the type-to-payload mapping. */
export function payloadOf<T>(envelope: InboundEnvelope): T {
  return envelope.payload as T
}
