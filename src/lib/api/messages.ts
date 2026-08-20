/**
 * History. There is no REST send — `POST /api/v1/message/messages` is `/internal`-only, so the
 * socket is the only way a client sends (docs/REST-API.md §2, docs/MESSAGING.md §1).
 */

import { api } from './client'
import type { MessageHistoryResponse } from './types'

/** Newest-first. `before` is a message id you already hold, never an offset. */
export function getHistory(dialogId: string, before?: string | null, limit = 50): Promise<MessageHistoryResponse> {
  return api<MessageHistoryResponse>(`/message/dialogs/${dialogId}/messages`, {
    query: { before, limit },
  })
}

/**
 * Catch-up. Comes back ASCENDING, unlike everything else — normalise before merging. Passing both
 * `before` and `after` is a 400, which is why this is a separate function.
 */
export function getHistoryAfter(dialogId: string, after: string, limit = 100): Promise<MessageHistoryResponse> {
  return api<MessageHistoryResponse>(`/message/dialogs/${dialogId}/messages`, {
    query: { after, limit },
  })
}
