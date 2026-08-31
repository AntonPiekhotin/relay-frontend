import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { DialogList } from '@/features/dialogs/DialogList'
import { displayName, initialsOf, useMe } from '@/queries/useUser'
import { startRealtime, stopRealtime } from '@/lib/realtime/connection'
import { ConnectionBanner } from './ConnectionBanner'
import { CallOverlay } from '@/features/calls/CallOverlay'
import { IncomingCallToast } from '@/features/calls/IncomingCallToast'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'
import { useT, type Messages } from '@/lib/i18n'

/**
 * The dock at the foot of the sidebar. Icon-only, so every entry carries its name twice — as the
 * `aria-label` a screen reader reads, and as the `title` a pointer user hovers for (docs/UI.md §3).
 */
const NAV_ITEMS: { to: string; label: (t: Messages) => string; icon: IconName; end: boolean }[] = [
  { to: '/', label: (t) => t.nav.chats, icon: 'chats', end: true },
  { to: '/groups/new', label: (t) => t.nav.newGroup, icon: 'group', end: false },
  { to: '/calls', label: (t) => t.nav.calls, icon: 'phone', end: false },
  { to: '/contacts', label: (t) => t.nav.contacts, icon: 'contacts', end: false },
]

/**
 * The shell from docs/UI.md §2: a fixed-width sidebar, and a chat column that must be `min-w-0`.
 *
 * Below `md` the sidebar is an overlay drawer instead of a column. It has to leave the flow
 * entirely — a 20rem column merely narrowed still leaves the chat unusable on a 360px screen, and
 * a sidebar that only shrinks is what makes the page wider than the viewport in the first place.
 *
 * This is the composition root — the one place allowed to assemble several feature folders, which
 * is why it is the only cross-feature import in the app (docs/ARCHITECTURE.md §3).
 */
export function AppLayout() {
  const t = useT()
  const me = useMe()
  const queryClient = useQueryClient()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // One socket for the app, opened once we are behind the auth guard and torn down on sign-out.
  useEffect(() => {
    startRealtime(queryClient)
    return () => stopRealtime()
  }, [queryClient])

  // Navigating IS the drawer's dismiss action on mobile: every link in it leads to the main column.
  useEffect(() => setDrawerOpen(false), [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ConnectionBanner />

      {/* The only place the drawer can be opened from, so it is on every route, not just the chat. */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-2 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          aria-label={t.nav.openConversations}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </Button>
        <span className="text-sm font-semibold">Relay</span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {drawerOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] flex-col border-r border-border-subtle
            bg-surface transition-transform duration-200 md:static md:z-auto md:w-80 md:max-w-none md:translate-x-0
            md:transition-none ${drawerOpen ? 'translate-x-0' : '-translate-x-full'} md:shrink-0`}
        >
          <header className="flex items-center gap-2 border-b border-border-subtle p-3">
            <Link to="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 hover:bg-surface-raised">
              <Avatar avatarUrl={me.data?.avatarUrl} userId={me.data?.id} initials={initialsOf(me.data)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{displayName(me.data)}</span>
            </Link>
            <ThemeToggle />
          </header>

          <DialogList />

          {/* The dock sits below the list, so the sidebar's own scroll never carries it out of reach. */}
          <nav className="grid shrink-0 grid-cols-4 gap-1 border-t border-border-subtle p-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-label={item.label(t)}
                title={item.label(t)}
                className={({ isActive }) =>
                  `flex h-10 items-center justify-center rounded-lg ${
                    isActive ? 'bg-surface-raised text-accent' : 'text-fg-muted hover:bg-surface-raised'
                  }`
                }
              >
                <Icon name={item.icon} />
              </NavLink>
            ))}
          </nav>
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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}
