import { useEffect, useRef, useState } from 'react'
import { useCallStore, type CallState } from '@/stores/callStore'
import {
  getLocalStream,
  getRemoteStream,
  hangUpDirectCall,
  setCameraEnabled,
  setMicEnabled,
} from '@/lib/calls/directCall'
import { leaveCurrentGroupCall, setGroupCameraEnabled, setGroupMicEnabled } from '@/lib/calls/groupCall'
import { displayName, initialsOf, useUser } from '@/queries/useUser'
import { formatDuration, useElapsed } from '@/hooks/useElapsed'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { GroupCallRoom } from './GroupCallRoom'

/** How long an ended-call notice stays up before it clears itself. */
const NOTICE_MS = 6000

type DirectCall = Extract<CallState, { kind: 'outgoing' | 'connected' }>

/**
 * The full-screen call surface: outgoing, connected, and group. Ringing lives in the toast.
 *
 * Everything on this surface sits on `bg-black/95` in both themes, so its text is `text-white`
 * rather than a `fg` token — a token would resolve to near-black in the light theme and vanish
 * (docs/UI.md §8 sanctions the literal here, as it does `bg-black` behind a video).
 */
export function CallOverlay() {
  const call = useCallStore((s) => s.call)
  const micEnabled = useCallStore((s) => s.micEnabled)
  const cameraEnabled = useCallStore((s) => s.cameraEnabled)

  if (call.kind === 'idle') return <CallNotice />
  if (call.kind === 'incoming' || call.kind === 'group-ringing') return null

  const isGroup = call.kind === 'group'
  const media = call.media

  return (
    <div role="dialog" aria-label="Call" className="fixed inset-0 z-40 flex flex-col bg-black/95">
      {isGroup ? (
        <>
          <GroupHeader roster={call.roster} />
          <GroupCallRoom />
        </>
      ) : (
        <DirectStage call={call} />
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 p-4">
        {/* The icon shows the current state (a slash means off); the label names the action the
            click performs. That is the convention every call UI uses, and the two must not be
            swapped — an icon-only control has no other cue for either. */}
        <Button
          variant="secondary"
          size="icon"
          onClick={() => void (isGroup ? setGroupMicEnabled(!micEnabled) : setMicEnabled(!micEnabled))}
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          <Icon name={micEnabled ? 'mic' : 'mic-off'} />
        </Button>
        {media === 'video' ? (
          <Button
            variant="secondary"
            size="icon"
            onClick={() => void (isGroup ? setGroupCameraEnabled(!cameraEnabled) : setCameraEnabled(!cameraEnabled))}
            aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            <Icon name={cameraEnabled ? 'video' : 'video-off'} />
          </Button>
        ) : null}
        <Button
          variant="danger"
          size="icon"
          onClick={() => (isGroup ? void leaveCurrentGroupCall() : hangUpDirectCall('hangup'))}
          aria-label={isGroup ? 'Leave the call' : 'Hang up'}
          title={isGroup ? 'Leave the call' : 'Hang up'}
        >
          <Icon name="phone-off" />
        </Button>
      </div>
    </div>
  )
}

/**
 * How a call ended, once it has. "No answer" and "Call declined" are different facts and the caller
 * cannot tell them apart from an overlay that simply disappears — which is what used to happen.
 * It clears itself, because a notice about a call that is over should not need dismissing.
 */
function CallNotice() {
  const error = useCallStore((s) => s.error)
  const setError = useCallStore((s) => s.setError)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [error, setError])

  if (!error) return null

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border border-border-subtle
        bg-surface-raised px-4 py-2 text-sm sm:left-auto"
    >
      {error}
      <Button
        variant="ghost"
        size="icon-sm"
        className="-mr-2 shrink-0"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => setError(null)}
      >
        <Icon name="close" className="size-4" />
      </Button>
    </div>
  )
}

function GroupHeader({ roster }: { roster: Extract<CallState, { kind: 'group' }>['roster'] }) {
  const joined = roster.filter((p) => p.state === 'joined').length
  return <p className="p-4 text-center text-sm text-white/70">Group call · {joined} joined</p>
}

/**
 * The 1:1 stage. The remote `<video>` is always mounted, because it is also the sink the remote
 * *audio* plays through — hiding it on a voice call would mute the other person. When it has no
 * picture to show (a voice call, or a video call that has not connected yet) the peer panel is
 * drawn over the top of it rather than in place of it.
 */
function DirectStage({ call }: { call: DirectCall }) {
  const mediaVersion = useCallStore((s) => s.mediaVersion)
  const localVideo = useRef<HTMLVideoElement | null>(null)
  const remoteVideo = useRef<HTMLVideoElement | null>(null)
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)

  // Streams are attached with `srcObject`, never a blob URL, and re-attached whenever the engine
  // says tracks changed — the objects themselves never enter React state.
  useEffect(() => {
    const remote = getRemoteStream()
    if (localVideo.current) localVideo.current.srcObject = getLocalStream()
    if (remoteVideo.current) remoteVideo.current.srcObject = remote
    setHasRemoteVideo((remote?.getVideoTracks().length ?? 0) > 0)
  }, [mediaVersion])

  const showLocalPreview = call.media === 'video'

  return (
    <div className="relative flex-1">
      <video ref={remoteVideo} autoPlay playsInline className="size-full bg-black object-contain" />

      {hasRemoteVideo ? <FloatingLabel call={call} /> : <PeerPanel call={call} />}

      {showLocalPreview ? (
        <video
          ref={localVideo}
          autoPlay
          playsInline
          muted
          aria-label="Your camera"
          className="absolute bottom-4 right-4 w-28 rounded-lg border border-white/20 object-cover sm:w-40"
        />
      ) : null}
    </div>
  )
}

/** Name and duration over a live picture, where the picture is already doing the reassuring. */
function FloatingLabel({ call }: { call: DirectCall }) {
  const peer = useUser(call.peerId)
  return (
    <p className="absolute inset-x-0 top-0 p-4 text-center text-sm text-white/70">
      {peer.data ? displayName(peer.data) : '…'}
      {call.kind === 'connected' ? <> · <CallTimer since={call.startedAt} /></> : null}
    </p>
  )
}

/**
 * The whole point of this change: while a call is being placed, this is what the user looks at
 * instead of a black rectangle. Who is being called, that the invite has actually reached their
 * device, and a counter proving the app has not simply frozen.
 */
function PeerPanel({ call }: { call: DirectCall }) {
  const peer = useUser(call.peerId)
  const outgoing = call.kind === 'outgoing'
  // Counting up, not down: the server sends the *caller* no deadline — `ring_expires_at` rides the
  // invite, which only the callee sees. An invented countdown would be a number we cannot stand
  // behind; elapsed time is measured here and is always true.
  const elapsed = useElapsed(outgoing ? call.placedAt : call.startedAt)

  const status = outgoing
    ? call.status === 'ringing'
      ? 'Ringing…'
      : 'Connecting…'
    : call.media === 'video'
      ? 'Waiting for their video…'
      : 'Connected'

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="relative flex items-center justify-center">
        {/* Two staggered halos, the visual half of "it is ringing". `animate-ping` grows and fades
            from the avatar's own footprint, so the rings read as coming off the person being
            called. Hidden outright when the user has asked for reduced motion. */}
        {outgoing ? (
          <>
            <span
              aria-hidden="true"
              className="absolute size-28 animate-ping rounded-full bg-white/10 motion-reduce:hidden"
            />
            <span
              aria-hidden="true"
              className="absolute size-28 animate-ping rounded-full bg-white/10 [animation-delay:0.9s]
                motion-reduce:hidden"
            />
          </>
        ) : null}
        <Avatar
          avatarUrl={peer.data?.avatarUrl}
          userId={call.peerId}
          initials={initialsOf(peer.data)}
          size="xl"
          className="relative ring-2 ring-white/20"
        />
      </span>

      <div className="space-y-1">
        <p className="text-xl font-medium text-white">{peer.data ? displayName(peer.data) : '…'}</p>
        {/* Polite, not assertive: the status changes mid-call and must not interrupt a screen
            reader that is already reading something else out. */}
        <p aria-live="polite" className="text-sm text-white/70">
          {status}
          {elapsed !== null ? ` · ${formatDuration(elapsed)}` : ''}
        </p>
        <p className="text-xs text-white/50">{call.media === 'video' ? 'Video call' : 'Voice call'}</p>
      </div>
    </div>
  )
}

function CallTimer({ since }: { since: number }) {
  const elapsed = useElapsed(since)
  return <>{formatDuration(elapsed ?? 0)}</>
}
