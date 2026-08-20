import { useEffect, useRef } from 'react'
import { useCallStore } from '@/stores/callStore'
import {
  getLocalStream,
  getRemoteStream,
  hangUpDirectCall,
  setCameraEnabled,
  setMicEnabled,
} from '@/lib/calls/directCall'
import { leaveCurrentGroupCall, setGroupCameraEnabled, setGroupMicEnabled } from '@/lib/calls/groupCall'
import { displayName, useUser } from '@/queries/useUser'
import { useCountdown } from '@/hooks/useCountdown'
import { Button } from '@/components/Button'
import { GroupCallRoom } from './GroupCallRoom'

/** The full-screen call surface: outgoing, connected, and group. Ringing lives in the toast. */
export function CallOverlay() {
  const call = useCallStore((s) => s.call)
  const error = useCallStore((s) => s.error)
  const micEnabled = useCallStore((s) => s.micEnabled)
  const cameraEnabled = useCallStore((s) => s.cameraEnabled)
  const setError = useCallStore((s) => s.setError)

  if (call.kind === 'idle') {
    return error ? (
      <div
        role="alert"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-2 text-sm"
      >
        {error}
        <Button variant="ghost" size="sm" onClick={() => setError(null)}>
          Dismiss
        </Button>
      </div>
    ) : null
  }

  if (call.kind === 'incoming' || call.kind === 'group-ringing') return null

  const isGroup = call.kind === 'group'
  const media = call.media

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
      <Header />

      {isGroup ? (
        <GroupCallRoom />
      ) : (
        <DirectStage peerId={call.kind === 'connected' ? call.peerId : call.kind === 'outgoing' ? call.peerId : ''} />
      )}

      <div className="flex items-center justify-center gap-3 p-4">
        <Button
          variant="secondary"
          onClick={() => void (isGroup ? setGroupMicEnabled(!micEnabled) : setMicEnabled(!micEnabled))}
          aria-label={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micEnabled ? 'Mute' : 'Unmute'}
        </Button>
        {media === 'video' ? (
          <Button
            variant="secondary"
            onClick={() => void (isGroup ? setGroupCameraEnabled(!cameraEnabled) : setCameraEnabled(!cameraEnabled))}
            aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {cameraEnabled ? 'Camera off' : 'Camera on'}
          </Button>
        ) : null}
        <Button
          variant="danger"
          onClick={() => (isGroup ? void leaveCurrentGroupCall() : hangUpDirectCall('hangup'))}
        >
          {isGroup ? 'Leave' : 'Hang up'}
        </Button>
      </div>
    </div>
  )
}

function Header() {
  const call = useCallStore((s) => s.call)
  const peerId = call.kind === 'outgoing' || call.kind === 'connected' ? call.peerId : null
  const peer = useUser(peerId)
  // The server's deadline drives the countdown; we never decide the outcome ourselves.
  const secondsLeft = useCountdown(call.kind === 'outgoing' ? call.ringExpiresAt : null)

  const label =
    call.kind === 'outgoing'
      ? `Calling ${peer.data ? displayName(peer.data) : '…'}${secondsLeft !== null ? ` · ${secondsLeft}s` : ''}`
      : call.kind === 'connected'
        ? (peer.data ? displayName(peer.data) : 'In call')
        : call.kind === 'group'
          ? `Group call · ${call.roster.filter((p) => p.state === 'joined').length} joined`
          : ''

  return <p className="p-4 text-center text-sm text-zinc-300">{label}</p>
}

function DirectStage({ peerId }: { peerId: string }) {
  const mediaVersion = useCallStore((s) => s.mediaVersion)
  const localVideo = useRef<HTMLVideoElement | null>(null)
  const remoteVideo = useRef<HTMLVideoElement | null>(null)

  // Streams are attached with `srcObject`, never a blob URL, and re-attached whenever the engine
  // says tracks changed — the objects themselves never enter React state.
  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = getLocalStream()
    if (remoteVideo.current) remoteVideo.current.srcObject = getRemoteStream()
  }, [mediaVersion])

  return (
    <div className="relative flex-1">
      <video ref={remoteVideo} autoPlay playsInline className="size-full bg-black object-contain" />
      <video
        ref={localVideo}
        autoPlay
        playsInline
        muted
        aria-label="Your camera"
        className="absolute bottom-4 right-4 w-40 rounded-lg border border-border-subtle object-cover"
      />
      <span className="sr-only">{peerId}</span>
    </div>
  )
}
