/**
 * A tiny event bus for the few things a frame handler must tell the UI that are not cache state —
 * navigating away from a dialog that no longer exists, and surfacing an unattributable error.
 *
 * Handlers must not render (docs/REALTIME.md §4); this is how they stay that way.
 */

type Listener<T> = (value: T) => void

export interface RelayEvents {
  /** The dialog is gone server-side: `dialog.deleted`, or a `member_removed` naming you. */
  dialogGone: { dialogId: string; reason: 'deleted' | 'removed' }
  /** An error frame with `ref_id: null` — it cannot be attributed to any pending message. */
  notice: { message: string }
}

const listeners: { [K in keyof RelayEvents]: Set<Listener<RelayEvents[K]>> } = {
  dialogGone: new Set(),
  notice: new Set(),
}

export function onRelayEvent<K extends keyof RelayEvents>(event: K, listener: Listener<RelayEvents[K]>): () => void {
  listeners[event].add(listener)
  return () => {
    listeners[event].delete(listener)
  }
}

export function emitRelayEvent<K extends keyof RelayEvents>(event: K, value: RelayEvents[K]): void {
  for (const listener of listeners[event]) listener(value)
}
