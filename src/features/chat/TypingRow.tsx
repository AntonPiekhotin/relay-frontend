import { useEffect } from 'react'
import { typistsIn, useTypingStore } from '@/stores/typingStore'
import { displayName, useUser } from '@/queries/useUser'
import { useT } from '@/lib/i18n'

export interface TypingRowProps {
  dialogId: string
}

/**
 * The height is reserved whether or not anybody is typing — otherwise the message list jumps by a
 * line every time somebody starts and stops (docs/UI.md §2).
 */
export function TypingRow({ dialogId }: TypingRowProps) {
  const t = useT()
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
        t.chat.typingMany(typists.length)
      ) : (
        ''
      )}
    </p>
  )
}

function SingleTypist({ userId }: { userId: string }) {
  const t = useT()
  const user = useUser(userId)
  return <>{user.data ? t.chat.typingOne(displayName(user.data)) : t.chat.typing}</>
}
