import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { onRelayEvent } from '@/lib/realtime/events'

/**
 * Navigate away when the open conversation stops existing — the owner deleted the group, or you
 * were removed from it. The cache is already cleared by the frame handler; this is the part a
 * handler is not allowed to do, because handlers must not render.
 */
export function useDialogGone(dialogId: string | undefined): void {
  const navigate = useNavigate()

  useEffect(() => {
    if (!dialogId) return
    return onRelayEvent('dialogGone', (event) => {
      if (event.dialogId === dialogId) navigate('/', { replace: true })
    })
  }, [dialogId, navigate])
}
