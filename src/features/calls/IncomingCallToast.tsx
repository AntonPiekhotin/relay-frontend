import { useCallStore } from '@/stores/callStore'
import { acceptIncomingCall, rejectIncomingCall } from '@/lib/calls/directCall'
import { declineIncomingGroupCall, joinIncomingGroupCall } from '@/lib/calls/groupCall'
import { displayName, initialsOf, useUser } from '@/queries/useUser'
import { useCountdown } from '@/hooks/useCountdown'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'

/** Ringing UI for both mechanisms. A group invite carries no SDP — there is nothing to negotiate. */
export function IncomingCallToast() {
  const call = useCallStore((s) => s.call)
  const isDirect = call.kind === 'incoming'
  const isGroup = call.kind === 'group-ringing'
  const from = isDirect || isGroup ? call.from : null
  const caller = useUser(from)
  const secondsLeft = useCountdown(isDirect || isGroup ? call.ringExpiresAt : null)

  if (!isDirect && !isGroup) return null

  return (
    <div
      role="dialog"
      aria-label="Incoming call"
      className="fixed inset-x-4 top-4 z-50 space-y-3 rounded-xl border border-border-subtle bg-surface-raised
        p-4 shadow-xl sm:left-auto sm:w-80"
    >
      <div className="flex items-center gap-3">
        <Avatar
          avatarUrl={caller.data?.avatarUrl}
          userId={from ?? undefined}
          initials={initialsOf(caller.data)}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{caller.data ? displayName(caller.data) : 'Incoming call'}</p>
          <p className="text-xs text-zinc-400">
            {isGroup ? 'Group call' : call.media === 'video' ? 'Video call' : 'Voice call'}
            {secondsLeft !== null ? ` · ${secondsLeft}s` : ''}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Accepting is the user gesture that lets remote audio play, so media is attached from
            inside this handler rather than a later effect. */}
        <Button
          className="flex-1"
          onClick={() => void (isGroup ? joinIncomingGroupCall() : acceptIncomingCall())}
        >
          Answer
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          onClick={() => (isGroup ? void declineIncomingGroupCall() : rejectIncomingCall('declined'))}
        >
          Decline
        </Button>
      </div>
    </div>
  )
}
