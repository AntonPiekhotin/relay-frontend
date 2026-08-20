import { useEffect } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { DialogList } from '@/features/dialogs/DialogList'
import { displayName, initialsOf, useMe } from '@/queries/useUser'
import { signOut } from '@/stores/authStore'
import { useOutboxStore } from '@/stores/outboxStore'
import { clearAvatarCache } from '@/lib/avatar'
import { startRealtime, stopRealtime } from '@/lib/realtime/connection'
import { ConnectionBanner } from './ConnectionBanner'
import { CallOverlay } from '@/features/calls/CallOverlay'
import { IncomingCallToast } from '@/features/calls/IncomingCallToast'

/**
 * The shell from docs/UI.md §2: a fixed-width sidebar, and a chat column that must be `min-w-0`.
 *
 * This is the composition root — the one place allowed to assemble several feature folders, which
 * is why it is the only cross-feature import in the app (docs/ARCHITECTURE.md §3).
 */
export function AppLayout() {
  const me = useMe()
  const queryClient = useQueryClient()

  // One socket for the app, opened once we are behind the auth guard and torn down on sign-out.
  useEffect(() => {
    startRealtime(queryClient)
    return () => stopRealtime()
  }, [queryClient])

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle">
        <header className="flex items-center gap-3 border-b border-border-subtle p-3">
          <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-surface-raised">
            <Avatar avatarUrl={me.data?.avatarUrl} userId={me.data?.id} initials={initialsOf(me.data)} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayName(me.data)}</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Everything cached belongs to the account that is leaving: the object URLs point at
              // its avatar bytes, and its queued messages must not be flushed by whoever signs in
              // next — the same clientMsgId would be sent from a different account.
              clearAvatarCache()
              useOutboxStore.getState().clear()
              queryClient.clear()
              signOut()
            }}
          >
            Sign out
          </Button>
        </header>

        <nav className="flex flex-wrap gap-1 border-b border-border-subtle p-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex-1 rounded-lg px-3 py-1.5 text-center text-sm ${
                isActive ? 'bg-surface-raised text-zinc-100' : 'text-zinc-400 hover:bg-surface-raised'
              }`
            }
          >
            Chats
          </NavLink>
          <NavLink
            to="/contacts"
            className={({ isActive }) =>
              `flex-1 rounded-lg px-3 py-1.5 text-center text-sm ${
                isActive ? 'bg-surface-raised text-zinc-100' : 'text-zinc-400 hover:bg-surface-raised'
              }`
            }
          >
            Contacts
          </NavLink>
          <NavLink
            to="/groups/new"
            className={({ isActive }) =>
              `flex-1 rounded-lg px-3 py-1.5 text-center text-sm ${
                isActive ? 'bg-surface-raised text-zinc-100' : 'text-zinc-400 hover:bg-surface-raised'
              }`
            }
          >
            New group
          </NavLink>
          <NavLink
            to="/calls"
            className={({ isActive }) =>
              `flex-1 rounded-lg px-3 py-1.5 text-center text-sm ${
                isActive ? 'bg-surface-raised text-zinc-100' : 'text-zinc-400 hover:bg-surface-raised'
              }`
            }
          >
            Calls
          </NavLink>
        </nav>

        <DialogList />
      </aside>

      {/* min-w-0 is load-bearing: without it a long unbroken message blows the sidebar off-screen. */}
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>

      <IncomingCallToast />
      <CallOverlay />
    </div>
  )
}
