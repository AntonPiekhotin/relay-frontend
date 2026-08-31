import { useOutboxStore } from '@/stores/outboxStore'
import { useSocketStore } from '@/stores/socketStore'
import { useT } from '@/lib/i18n'

/**
 * Not optional. With no REST fallback send, a disconnected client's messages sit in the outbox
 * indefinitely — and a UI that looks normal while that happens is lying to the user (docs/UI.md §4).
 */
export function ConnectionBanner() {
  const t = useT()
  const status = useSocketStore((s) => s.status)
  const queued = useOutboxStore((s) => Object.keys(s.entries).length)

  if (status === 'ready') return null

  const text =
    status === 'unauthorized'
      ? t.banner.sessionEnded
      : status === 'connecting' || status === 'authenticating'
        ? t.banner.connecting
        : t.banner.offline

  return (
    <div
      role="status"
      className={`px-4 py-1.5 text-center text-xs ${
        status === 'unauthorized' ? 'bg-danger-surface text-danger-surface-fg' : 'bg-surface-raised text-fg-muted'
      }`}
    >
      {text}
      {queued > 0 ? ` ${t.banner.queued(queued)}` : ''}
    </div>
  )
}
