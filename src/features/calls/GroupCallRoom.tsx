import { useEffect, useRef } from 'react'
import { getRoom } from '@/lib/calls/groupCall'
import { useCallStore } from '@/stores/callStore'
import { displayName, useUser } from '@/queries/useUser'

/**
 * The SDK owns who is publishing; `call.signal` owns who was invited. These are not reconciled
 * frame by frame — this reads the room whenever the engine bumps `mediaVersion` (docs/CALLS.md §2).
 */
export function GroupCallRoom() {
  const mediaVersion = useCallStore((s) => s.mediaVersion)
  const room = getRoom()
  const identities = room ? [...room.remoteParticipants.keys()] : []

  return (
    <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2 p-2 sm:grid-cols-2">
      {identities.length === 0 ? (
        <p className="flex items-center justify-center text-sm text-fg-subtle sm:col-span-2">
          Waiting for others to join…
        </p>
      ) : (
        identities.map((identity) => (
          <ParticipantTile key={identity} identity={identity} mediaVersion={mediaVersion} />
        ))
      )}
    </div>
  )
}

interface ParticipantTileProps {
  identity: string
  mediaVersion: number
}

/** LiveKit identity IS the user id, which is what makes the name lookup possible at all. */
function ParticipantTile({ identity, mediaVersion }: ParticipantTileProps) {
  const user = useUser(identity)
  const video = useRef<HTMLVideoElement | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  /**
   * Tracks are read from the room inside the effect rather than passed in: a publications array
   * rebuilt on every render would detach and re-attach every tile on each mic toggle, blacking out
   * everybody's video for a frame.
   */
  useEffect(() => {
    const participant = getRoom()?.remoteParticipants.get(identity)
    if (!participant) return

    const attached: { detach: (element: HTMLMediaElement) => void; element: HTMLMediaElement }[] = []

    for (const publication of participant.trackPublications.values()) {
      const track = publication.track
      if (!track) continue
      const element = track.kind === 'video' ? video.current : audio.current
      if (!element) continue
      track.attach(element)
      attached.push({ detach: (el) => track.detach(el), element })
    }

    return () => {
      for (const { detach, element } of attached) detach(element)
    }
  }, [identity, mediaVersion])

  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video ref={video} autoPlay playsInline className="absolute inset-0 size-full object-cover" />
      <audio ref={audio} autoPlay />
      <p className="absolute bottom-1 left-2 text-xs text-white/80">
        {user.data ? displayName(user.data) : identity}
      </p>
    </div>
  )
}
