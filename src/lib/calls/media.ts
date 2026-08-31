/**
 * Media acquisition and teardown.
 *
 * The teardown rules are the ones that leak visibly in a browser: a track left running keeps the
 * camera light on after the call ends, and users notice that immediately (docs/CALLS.md §1).
 */

import type { CallMedia } from '@/lib/protocol/types'
import { translate } from '@/lib/i18n'

/**
 * `getUserMedia` requires a secure context — `localhost` counts, a LAN IP does not. Testing from
 * another device on the network needs HTTPS.
 */
export async function acquireLocalMedia(media: CallMedia): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: media === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  })
}

/** Stop EVERY track. Nothing else turns the camera light off. */
export function stopStream(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

/** A denied prompt is a normal outcome, and "no permission" and "no camera" are different problems. */
export function mediaErrorMessage(error: unknown): string {
  const t = translate()
  const name = error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return t.calls.mediaBlocked
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t.calls.mediaMissing
    case 'NotReadableError':
      return t.calls.mediaBusy
    default:
      return t.calls.mediaFailed
  }
}
