import { useEffect, useState } from 'react'
import { toMillis } from '@/lib/time'

/**
 * Seconds left until an ISO deadline, or null when there is none.
 *
 * `ring_expires_at` is the server's honest deadline — the client never runs a shorter timer of its
 * own and never decides the outcome; it only draws the countdown (docs/CALLS.md §1).
 */
export function useCountdown(deadline: string | null | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) {
      setSecondsLeft(null)
      return
    }
    const target = toMillis(deadline)
    const tick = () => setSecondsLeft(Math.max(0, Math.round((target - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return secondsLeft
}
