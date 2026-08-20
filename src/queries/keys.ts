/**
 * The single query-key factory (docs/ARCHITECTURE.md §5).
 *
 * Socket frames update the cache surgically, and a key typo means the update lands nowhere and is
 * silently lost. Going through this factory makes that a compile error instead.
 */

export const qk = {
  me: ['me'] as const,
  user: (id: string) => ['user', id] as const,
  dialogs: ['dialogs'] as const,
  dialog: (id: string) => ['dialog', id] as const,
  history: (dialogId: string) => ['history', dialogId] as const,
  readState: (dialogId: string) => ['readState', dialogId] as const,
  contacts: (page: number) => ['contacts', page] as const,
  search: (q: string, page: number) => ['search', q, page] as const,
  callLog: ['callLog'] as const,
} as const
