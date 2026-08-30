import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'

export interface ComposerProps {
  /** Focus follows the conversation: opening one puts the cursor in the box. */
  dialogId: string
  disabled?: boolean
  /** Returns false when the message was NOT accepted — a full queue. The text then stays put. */
  onSend: (text: string) => boolean
  /** Called on real input. The throttle lives in the caller — never one frame per keystroke. */
  onTyping?: (() => void) | undefined
}

const MAX_ROWS_PX = 160

export function Composer({ dialogId, disabled = false, onSend, onTyping }: ComposerProps) {
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setText('')
    box.current?.focus()
  }, [dialogId])

  const resize = () => {
    const node = box.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_ROWS_PX)}px`
  }

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    // Clearing a message the outbox refused would destroy it: there is no REST fallback and no
    // other copy of it anywhere.
    if (!onSend(trimmed)) return
    setText('')
    // Keep focus after sending — the next message is nearly always the next thing you do.
    requestAnimationFrame(() => {
      box.current?.focus()
      resize()
    })
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-border-subtle p-2 sm:p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={box}
        rows={1}
        value={text}
        aria-label="Message"
        placeholder="Write a message…"
        className="max-h-40 min-h-10 w-full min-w-0 flex-1 resize-none rounded-lg border border-border-subtle
          bg-surface-raised px-3 py-2 text-base text-fg placeholder:text-fg-subtle focus:border-accent
          focus:outline-none sm:text-sm"
        onChange={(e) => {
          setText(e.target.value)
          resize()
          if (e.target.value.trim()) onTyping?.()
        }}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter newlines.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <Button
        type="submit"
        size="icon"
        className="shrink-0"
        aria-label="Send"
        title="Send"
        disabled={!text.trim() || disabled}
      >
        <Icon name="send" />
      </Button>
    </form>
  )
}
