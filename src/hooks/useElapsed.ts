import { useEffect, useState } from 'react'

/**
 * Seconds since a local epoch-millis instant, ticking once a second. Null when there is none.
 *
 * The counterpart to `useCountdown`: a countdown needs the server's deadline to be honest, but an
 * elapsed time is measured against a moment this client observed itself, so it is always true even
 * where the server tells us nothing — which is exactly the caller's side of a ringing call.
 */
export function useElapsed(since: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (since === null) {
      setSeconds(null)
      return
    }
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - since) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [since])

  return seconds
}

/** `m:ss`, the shape every call timer uses. Hours are added only once there are any. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const padded = `${minutes < 10 && hours > 0 ? '0' : ''}${minutes}:${String(rest).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${padded}` : padded
}
