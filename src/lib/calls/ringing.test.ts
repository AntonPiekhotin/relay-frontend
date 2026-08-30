import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallStore } from '@/stores/callStore'
import { initCallAudio, resetCallAudioForTest, silenceRinging } from './ringing'

/**
 * The tone is a pure function of the call state, so these drive the store and assert which
 * synthesiser call came out. What is really being pinned is the bug this design exists to prevent:
 * a ringtone that outlives the call that started it.
 */

const tones = vi.hoisted(() => ({
  primeAudio: vi.fn(),
  startRingback: vi.fn(),
  startRingtone: vi.fn(),
  stopRinging: vi.fn(),
}))

vi.mock('./tones', () => tones)

const INCOMING = {
  kind: 'incoming',
  callId: 'c1',
  from: 'peer-1',
  media: 'audio',
  sdp: 'v=0',
  ringExpiresAt: '2030-01-01T00:00:40Z',
} as const

const OUTGOING = {
  kind: 'outgoing',
  callId: 'c1',
  peerId: 'peer-1',
  media: 'audio',
  ringExpiresAt: null,
  status: 'connecting',
} as const

beforeEach(() => {
  resetCallAudioForTest()
  useCallStore.getState().reset()
  for (const fn of Object.values(tones)) fn.mockClear()
  initCallAudio()
})

afterEach(() => {
  resetCallAudioForTest()
  useCallStore.getState().reset()
})

describe('what rings', () => {
  it('rings the ringtone for a direct call coming in', () => {
    useCallStore.getState().setCall(INCOMING)

    expect(tones.startRingtone).toHaveBeenCalledOnce()
    expect(tones.startRingback).not.toHaveBeenCalled()
  })

  it('rings the ringtone for a group call you have been invited to', () => {
    useCallStore.getState().setCall({
      kind: 'group-ringing',
      callId: 'c2',
      from: 'peer-1',
      media: 'audio',
      ringExpiresAt: '2030-01-01T00:00:40Z',
      roster: [],
    })

    expect(tones.startRingtone).toHaveBeenCalledOnce()
  })

  it('rings the ringback for a call you placed — never the ringtone', () => {
    useCallStore.getState().setCall(OUTGOING)

    expect(tones.startRingback).toHaveBeenCalledOnce()
    expect(tones.startRingtone).not.toHaveBeenCalled()
  })

  it('does not restart on a state change that leaves the kind alone', () => {
    useCallStore.getState().setCall(OUTGOING)
    useCallStore.getState().setCall({ ...OUTGOING, status: 'ringing' })

    // 'Connecting…' → 'Ringing…' is a label change. Restarting the cadence there would clip it.
    expect(tones.startRingback).toHaveBeenCalledOnce()
  })
})

describe('what stops it', () => {
  it('stops when an incoming call is answered', () => {
    useCallStore.getState().setCall(INCOMING)
    useCallStore.getState().setCall({
      kind: 'connected',
      callId: 'c1',
      peerId: 'peer-1',
      media: 'audio',
      startedAt: Date.now(),
    })

    expect(tones.stopRinging).toHaveBeenCalled()
  })

  it('stops when the call goes away, however it went away', () => {
    useCallStore.getState().setCall(INCOMING)
    // reset() is the single exit every teardown path funnels through — decline, hangup, missed,
    // cancel, a socket drop. Silence has to be a property of that, not of each caller.
    useCallStore.getState().reset()

    expect(tones.stopRinging).toHaveBeenCalled()
  })

  it('silences on the answer gesture, before the state has caught up', () => {
    useCallStore.getState().setCall(INCOMING)
    silenceRinging()

    expect(tones.stopRinging).toHaveBeenCalled()

    // And having silenced early, the later state change must not start anything again.
    tones.startRingtone.mockClear()
    useCallStore.getState().setCall({
      kind: 'connected',
      callId: 'c1',
      peerId: 'peer-1',
      media: 'audio',
      startedAt: Date.now(),
    })
    expect(tones.startRingtone).not.toHaveBeenCalled()
  })
})
