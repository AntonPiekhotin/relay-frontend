/**
 * What should be ringing, derived from the call state rather than commanded.
 *
 * The alternative — a `startRingtone()` next to every `setCall` and a `stop` on every exit path —
 * has to be right in a dozen places across two engines: accept, reject, hangup, missed, cancel, a
 * failed invite, a socket drop, a group decline, another device answering. Getting one wrong leaves
 * a phone ringing at somebody with no call on screen, which is the single worst bug this feature
 * can have. So there is one subscription instead, and it cannot drift: the tone is a pure function
 * of `call.kind`, and `reset()` silences everything by definition.
 */

import { useCallStore, type CallState } from '@/stores/callStore'
import { primeAudio, startRingback, startRingtone, stopRinging } from './tones'

type Ringing = 'ringback' | 'ringtone' | null

function ringingFor(kind: CallState['kind']): Ringing {
  switch (kind) {
    // Your own call, waiting on them.
    case 'outgoing':
      return 'ringback'
    // Somebody calling you — a direct invite, or a group call you have been invited to.
    case 'incoming':
    case 'group-ringing':
      return 'ringtone'
    // Silent: 'idle', 'connected', and 'group'. A default rather than a list, so a kind added
    // later is silent until somebody decides otherwise — never accidentally ringing forever.
    default:
      return null
  }
}

let current: Ringing = null
let unsubscribe: (() => void) | null = null

/** Called once at boot, alongside the other `init*`s in `main.tsx`. */
export function initCallAudio(): void {
  if (unsubscribe) return

  // Before any call exists: the gesture that unlocks audio is usually long past by the time
  // somebody calls you.
  primeAudio()

  unsubscribe = useCallStore.subscribe((state) => {
    const next = ringingFor(state.call.kind)
    if (next === current) return
    current = next

    if (next === 'ringback') startRingback()
    else if (next === 'ringtone') startRingtone()
    else stopRinging()
  })
}

/**
 * Silence the ringtone the instant the user answers or declines, rather than when the state
 * catches up: both paths await the network (a `getUserMedia` prompt, a join request) before the
 * call changes kind, and a phone that keeps ringing after you have picked it up feels broken.
 *
 * This does not fight the subscription — every state the call can reach from here is a silent one,
 * so the two agree. It only makes the silence arrive sooner.
 */
export function silenceRinging(): void {
  current = null
  stopRinging()
}

/** Test seam: drop the subscription so a fresh one can be installed. */
export function resetCallAudioForTest(): void {
  unsubscribe?.()
  unsubscribe = null
  current = null
  stopRinging()
}
