/**
 * Call tones, synthesised with WebAudio rather than shipped as audio files.
 *
 * A ringback is two steady sine tones and a cadence — a few lines here, versus an asset to license,
 * host, preload and decode before the first call of the session can ring. Nothing here is ever
 * allowed to fail loudly: audio is feedback, and a browser that refuses to make a sound must not
 * take the call down with it. Every entry point swallows its own errors.
 *
 * Autoplay: an `AudioContext` starts suspended until a user gesture resumes it. Every tone below is
 * started from inside a click handler's call stack (placing a call, answering one), which is that
 * gesture — so the `resume()` is granted. If a browser refuses anyway, the call still works; it is
 * just silent.
 */

/** 440 + 480 Hz is the ringback pair every telephone network uses. It reads as "ringing". */
const RINGBACK_HZ = [440, 480]
/** Long enough to register, short enough that the gap does not feel like a dropped call. */
const RINGBACK_BURST_S = 1.2
const RINGBACK_CYCLE_MS = 3600

/** Well under a notification's loudness — this plays while the user is staring at the call UI. */
const RINGBACK_GAIN = 0.05
const CHIME_GAIN = 0.09

let ctx: AudioContext | null = null
let ringbackTimer: ReturnType<typeof setInterval> | null = null

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
 * The caller's ringback: it plays until the callee answers, declines, or the ring times out.
 * Idempotent — calling it twice does not stack two cadences on top of each other.
 */
export function startRingback(): void {
  if (ringbackTimer !== null) return
  try {
    const context = audio()
    if (!context) return
    burst(context, context.currentTime, RINGBACK_BURST_S, RINGBACK_HZ, RINGBACK_GAIN)
    // Scheduled a cycle at a time rather than as one long chain, so stopping is immediate and
    // nothing stays queued on the audio thread after the call is gone.
    ringbackTimer = setInterval(() => {
      const live = ctx
      if (live) burst(live, live.currentTime, RINGBACK_BURST_S, RINGBACK_HZ, RINGBACK_GAIN)
    }, RINGBACK_CYCLE_MS)
  } catch {
    stopRingback()
  }
}

export function stopRingback(): void {
  if (ringbackTimer === null) return
  clearInterval(ringbackTimer)
  ringbackTimer = null
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
