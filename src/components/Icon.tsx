export type IconName =
  | 'send'
  | 'phone'
  | 'phone-off'
  | 'mic'
  | 'mic-off'
  | 'video'
  | 'video-off'
  | 'close'
  | 'sun'
  | 'moon'

export interface IconProps {
  name: IconName
  /** Tailwind sizing utilities. The icon is square; `size-*` is the one you want. */
  className?: string
}

/**
 * Icons are static SVG files under `public/icons/`, painted through a CSS mask rather than an
 * `<img>`: a masked element takes its colour from `bg-current`, so one file serves the accent, the
 * muted-ghost, and the disabled state without a second copy. An `<img src>` would be locked to
 * whatever colour the file was authored in.
 *
 * The mask URLs are written as literal classes — Tailwind scans source text, so a template string
 * built from `name` would emit no CSS at all.
 */
const MASKS: Record<IconName, string> = {
  send: '[mask-image:url(/icons/send.svg)]',
  phone: '[mask-image:url(/icons/phone.svg)]',
  'phone-off': '[mask-image:url(/icons/phone-off.svg)]',
  mic: '[mask-image:url(/icons/mic.svg)]',
  'mic-off': '[mask-image:url(/icons/mic-off.svg)]',
  video: '[mask-image:url(/icons/video.svg)]',
  'video-off': '[mask-image:url(/icons/video-off.svg)]',
  close: '[mask-image:url(/icons/close.svg)]',
  sun: '[mask-image:url(/icons/sun.svg)]',
  moon: '[mask-image:url(/icons/moon.svg)]',
}

const MASK_BASE =
  'inline-block shrink-0 bg-current [mask-size:contain] [mask-repeat:no-repeat] [mask-position:center]'

/**
 * Decorative by contract: an icon never carries the accessible name. The button around it does,
 * through `aria-label`.
 */
export function Icon({ name, className = 'size-5' }: IconProps) {
  return <span aria-hidden="true" className={`${MASK_BASE} ${MASKS[name]} ${className}`} />
}
