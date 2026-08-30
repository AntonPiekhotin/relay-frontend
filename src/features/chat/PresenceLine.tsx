import { usePresenceStore } from '@/stores/presenceStore'
import { formatLastSeen } from '@/lib/time'

export interface PresenceLineProps {
  /** Null for a group — presence is per person, and a group header names members instead. */
  peerId: string | null
}

/**
 * `last_seen` is null whenever it is not known: every `online` update, any peer the server never
 * watched go offline, and everything after a server restart. That renders as a bare "Offline" —
 * never "a long time ago", and never as an error (docs/REALTIME.md §5).
 */
export function PresenceLine({ peerId }: PresenceLineProps) {
  const presence = usePresenceStore((s) => (peerId ? s.byUser[peerId] : undefined))

  if (!peerId || !presence) return null
  if (presence.online) return <span className="text-xs text-success">Online</span>

  const lastSeen = formatLastSeen(presence.lastSeen)
  return <span className="text-xs text-fg-subtle">{lastSeen ? `Offline · ${lastSeen}` : 'Offline'}</span>
}
