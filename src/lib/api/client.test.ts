import { describe, expect, it } from 'vitest'
import { API_BASE, resolveApiUrl } from './client'

describe('resolveApiUrl', () => {
  it('prefixes a bare endpoint path', () => {
    expect(resolveApiUrl('/user/me')).toBe(`${API_BASE}/user/me`)
  })

  it('leaves a server-supplied avatarUrl alone — prefixing it twice is a 404', () => {
    const avatarUrl = `${API_BASE}/user/abc/avatar?v=1730000000000`
    expect(resolveApiUrl(avatarUrl)).toBe(avatarUrl)
  })

  it('tolerates a path with no leading slash', () => {
    expect(resolveApiUrl('user/me')).toBe(`${API_BASE}/user/me`)
  })
})
