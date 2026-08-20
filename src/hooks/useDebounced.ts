import { useEffect, useState } from 'react'

/** Debounce a value. Search is gated on this — a request per keystroke is a 400 waiting to happen. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
