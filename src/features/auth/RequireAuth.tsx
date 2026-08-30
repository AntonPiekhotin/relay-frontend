import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useMe } from '@/queries/useUser'
import { Spinner } from '@/components/Spinner'
import { ApiError } from '@/lib/api/client'

/**
 * The route guard. Two stages, because a hook cannot be called conditionally: the outer component
 * decides whether there is a session at all, the inner one resolves who it belongs to.
 */
export function RequireAuth() {
  const hydrated = useAuthStore((s) => s.hydrated)
  const hasSession = useAuthStore((s) => Boolean(s.accessToken || s.refreshToken))
  const location = useLocation()

  // Until the persisted store has been read back, "no token" is not yet a fact.
  if (!hydrated) return <FullPageSpinner />
  if (!hasSession) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <ResolveIdentity />
}

/**
 * `GET /user/me` is what supplies the application user id. The JWT `sub` is a Keycloak id and is
 * not interchangeable with it, so nothing may guess: every "subtract yourself" in the app reads
 * `authStore.userId`, which is set here and nowhere else.
 */
function ResolveIdentity() {
  const me = useMe()
  const setUserId = useAuthStore((s) => s.setUserId)
  const userId = useAuthStore((s) => s.userId)
  const signOut = useAuthStore((s) => s.signOut)

  useEffect(() => {
    if (me.data) setUserId(me.data.id)
  }, [me.data, setUserId])

  useEffect(() => {
    // The client already spent its one refresh and one retry; a 401 here means the session is done.
    if (me.error instanceof ApiError && me.error.status === 401) signOut()
  }, [me.error, signOut])

  if (me.isError && !userId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-muted">
        Could not reach the server. Check that the backend is running — docs/BACKEND-SETUP.md.
      </div>
    )
  }
  if (!userId) return <FullPageSpinner />

  return <Outlet />
}

function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}
