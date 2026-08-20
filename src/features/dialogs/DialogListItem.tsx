import { NavLink } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { formatDialogTime } from '@/lib/time'
import type { DialogSummary } from '@/lib/api/types'
import { useDialogDisplay } from './useDialogDisplay'

export interface DialogListItemProps {
  dialog: DialogSummary
}

export function DialogListItem({ dialog }: DialogListItemProps) {
  const display = useDialogDisplay(dialog)

  return (
    <li>
      <NavLink
        to={`/d/${dialog.dialogId}`}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg p-2 ${
            isActive ? 'bg-surface-raised' : 'hover:bg-surface-raised/60'
          }`
        }
      >
        <Avatar
          avatarUrl={display.avatarUrl}
          userId={display.peerId ?? dialog.dialogId}
          initials={display.initials}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            {/* truncate is load-bearing: a long name otherwise pushes the time off the row. */}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{display.name || '…'}</span>
            <span className="shrink-0 text-xs text-zinc-500">{formatDialogTime(dialog.lastMessageAt)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
              {dialog.type === 'group' ? `${dialog.participantIds.length} members` : ''}
            </span>
            {dialog.unreadCount > 0 ? (
              <span
                aria-label={`${dialog.unreadCount} unread`}
                className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white"
              >
                {dialog.unreadCount > 99 ? '99+' : dialog.unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </NavLink>
    </li>
  )
}
