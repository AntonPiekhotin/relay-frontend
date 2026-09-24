import { useEffect, useState } from 'react'
import { getCachedAvatarUrl, loadAvatar } from '@/lib/avatar'

export interface AvatarProps {
  /** The server's relative `avatarUrl`, or null for a user with no picture. */
  avatarUrl?: string | null | undefined
  /** Drives the fallback colour, so the same person is always the same colour. */
  userId?: string | undefined
  initials?: string | undefined
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
  /** The call stage, where the avatar is the whole subject of the screen rather than a row's mark. */
  xl: 'size-28 text-3xl',
} as const

const COLORS = ['#ab5064', '#aa5830', '#877000', '#33854a', '#008484', '#4f6eb7', '#875ca5', '#9f5387']

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return COLORS[hash % COLORS.length] ?? '#4f6eb7'
}

export function Avatar({ avatarUrl, userId, initials = '?', size = 'md', className = '' }: AvatarProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(() =>
    avatarUrl ? (getCachedAvatarUrl(avatarUrl) ?? null) : null,
  )

  useEffect(() => {
    if (!avatarUrl) {
      setObjectUrl(null)
      return
    }
    let live = true
    void loadAvatar(avatarUrl).then((url) => {
      if (live) setObjectUrl(url)
    })
    return () => {
      live = false
    }
  }, [avatarUrl])

  const classes = `${SIZES[size]} shrink-0 overflow-hidden rounded-full ${className}`

  if (objectUrl) {
    return <img src={objectUrl} alt="" className={`${classes} object-cover`} />
  }

  return (
    <span
      aria-hidden="true"
      className={`${classes} flex items-center justify-center font-semibold text-white`}
      style={{ backgroundColor: colorFor(userId ?? initials) }}
    >
      {initials}
    </span>
  )
}
