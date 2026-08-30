/**
 * Call tones, synthesised with WebAudio rather than shipped as audio files.
 *
 * A ringback is two steady sine tones and a cadence — a few lines here, versus an asset to license,
 * host, preload and decode before the first call of the session can ring. Nothing here is ever
 * allowed to fail loudly: audio is feedback, and a browser that refuses to make a sound must not
 * take the call down with it. Every entry point swallows its own errors.
 *
 * Autoplay: an `AudioContext` starts suspended until the page has been activated by a user gesture.
 * An *outgoing* call always has one — the user clicked to place it — but an **incoming** call does
 * not: it arrives on the socket, with no gesture anywhere near it. That is what `primeAudio` is
 * for. It unlocks the context on the first interaction of the session, so the ringtone can sound
 * for a call that arrives an hour later. If a browser refuses anyway, the call still works and the
 * toast still shows; it is just silent.
 */

/** 440 + 480 Hz is the ringback pair every telephone network uses. It reads as "ringing". */
const RINGBACK_HZ = [440, 480]
/** Long enough to register, short enough that the gap does not feel like a dropped call. */
const RINGBACK_BURST_S = 1.2
const RINGBACK_CYCLE_MS = 3600

/**
 * The incoming ringtone is deliberately nothing like the ringback: an alternating two-pitch figure
 * against the ringback's flat drone. The two can never play at once, but the user must still be
 * able to tell, without looking, whether their own call is ringing or somebody is calling them.
 */
const RINGTONE_HZ = [660, 880]
const RINGTONE_NOTE_S = 0.18
const RINGTONE_GAP_S = 0.22
const RINGTONE_CYCLE_MS = 2600

/** Well under a notification's loudness — this plays while the user is staring at the call UI. */
const RINGBACK_GAIN = 0.05
/** A shade louder: a ringtone has to carry to somebody who is not looking at the tab. */
const RINGTONE_GAIN = 0.08
const CHIME_GAIN = 0.09

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

let ctx: AudioContext | null = null
/**
 * The one repeating tone, whichever it is. A single handle is what makes ringback and ringtone
 * mutually exclusive by construction rather than by every caller remembering to stop the other.
 */
let loopTimer: ReturnType<typeof setInterval> | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return null
  }
}

/**
 * One burst of a chord. The gain ramps rather than switching, because a square-edged start or stop
 * on a sine is an audible click — the one thing that makes synthesised audio sound broken.
 */
function burst(context: AudioContext, at: number, seconds: number, frequencies: number[], peak: number): void {
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.02)
  gain.gain.setValueAtTime(peak, at + seconds - 0.05)
  gain.gain.linearRampToValueAtTime(0, at + seconds)
  gain.connect(context.destination)

  for (const frequency of frequencies) {
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, at)
    oscillator.connect(gain)
    oscillator.start(at)
    oscillator.stop(at + seconds)
  }

  // Release the graph once it has finished sounding; a call that rings out schedules ~11 of these.
  setTimeout(
    () => gain.disconnect(),
    Math.max(0, (at + seconds - context.currentTime + 0.2) * 1000),
  )
}

/**
 * Unlock the audio context on the first user gesture of the session, so a call that arrives later
 * — with no gesture of its own — can still make a sound. Safe to call before there is any call.
 */
export function primeAudio(): void {
  const unlock = () => {
    audio()
    for (const type of GESTURES) window.removeEventListener(type, unlock)
  }
  try {
    for (const type of GESTURES) window.addEventListener(type, unlock, { passive: true })
  } catch {
    // No window, or listeners refused: the tones simply stay locked.
  }
}

/**
 * Play `pattern` now and again every `cycleMs` until something stops it. Scheduled a cycle at a
 * time rather than as one long chain, so stopping is immediate and nothing stays queued on the
 * audio thread after the call is gone.
 */
function loop(cycleMs: number, pattern: (context: AudioContext) => void): void {
  // Whatever was ringing is not what should be ringing now — there is only ever one.
  stopRinging()
  try {
    const context = audio()
    if (!context) return
    pattern(context)
    loopTimer = setInterval(() => {
      const live = ctx
      if (live) pattern(live)
    }, cycleMs)
  } catch {
    stopRinging()
  }
}

/** The caller's ringback: it plays until the callee answers, declines, or the ring times out. */
export function startRingback(): void {
  loop(RINGBACK_CYCLE_MS, (context) => {
    burst(context, context.currentTime, RINGBACK_BURST_S, RINGBACK_HZ, RINGBACK_GAIN)
  })
}

/** The callee's ringtone: somebody is calling you. Plays until the call is answered or gone. */
export function startRingtone(): void {
  loop(RINGTONE_CYCLE_MS, (context) => {
    const start = context.currentTime
    // Four notes alternating between the pair, the last one held — a figure, not a beep.
    RINGTONE_HZ.concat(RINGTONE_HZ).forEach((hz, index) => {
      const last = index === RINGTONE_HZ.length * 2 - 1
      burst(
        context,
        start + index * RINGTONE_GAP_S,
        last ? RINGTONE_NOTE_S * 1.6 : RINGTONE_NOTE_S,
        [hz],
        RINGTONE_GAIN,
      )
    })
  })
}

/** Stop whichever of the two is ringing. Idempotent, and the only way either of them ends. */
export function stopRinging(): void {
  if (loopTimer === null) return
  clearInterval(loopTimer)
  loopTimer = null
}

/** Two rising notes the moment the peer picks up — the audible half of "you are connected now". */
export function playConnected(): void {
  try {
    const context = audio()
    if (!context) return
    burst(context, context.currentTime, 0.12, [660], CHIME_GAIN)
    burst(context, context.currentTime + 0.13, 0.16, [880], CHIME_GAIN)
  } catch {
    // Silence is an acceptable outcome here; a thrown error is not.
  }
}

/** One falling pair when the call is over, so ending is not just a screen disappearing. */
export function playEnded(): void {
  try {
    const context = audio()
    if (!context) return
    burst(context, context.currentTime, 0.14, [520], CHIME_GAIN)
    burst(context, context.currentTime + 0.15, 0.22, [400], CHIME_GAIN)
  } catch {
    // As above.
  }
}
