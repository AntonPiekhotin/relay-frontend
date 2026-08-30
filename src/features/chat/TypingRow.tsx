import { useEffect } from 'react'
import { typistsIn, useTypingStore } from '@/stores/typingStore'
import { displayName, useUser } from '@/queries/useUser'

export interface TypingRowProps {
  dialogId: string
}

/**
 * The height is reserved whether or not anybody is typing — otherwise the message list jumps by a
 * line every time somebody starts and stops (docs/UI.md §2).
 */
export function TypingRow({ dialogId }: TypingRowProps) {
  // Select narrowly: subscribing to the whole store re-renders the pane on every unrelated frame.
  const byDialog = useTypingStore((s) => s.byDialog)
  const sweep = useTypingStore((s) => s.sweep)

  // One sweep for the whole app, rather than a timer per user per dialog. There is no typing.stop
  // frame, so expiry is entirely on us.
  useEffect(() => {
    const timer = setInterval(sweep, 1_000)
    return () => clearInterval(timer)
  }, [sweep])

  const typists = typistsIn(byDialog, dialogId)

  return (
    <p className="h-5 px-4 text-xs text-fg-subtle" aria-live="polite">
      {typists.length === 1 && typists[0] ? (
        <SingleTypist userId={typists[0]} />
      ) : typists.length > 1 ? (
        `${typists.length} people are typing…`
      ) : (
        ''
      )}
    </p>
  )
}

function SingleTypist({ userId }: { userId: string }) {
  const user = useUser(userId)
  return <>{user.data ? `${displayName(user.data)} is typing…` : 'Typing…'}</>
}
