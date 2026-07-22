import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './id'

afterEach(() => vi.unstubAllGlobals())

describe('newId', () => {
  it('returns unique strings when crypto.randomUUID exists', () => {
    // jsdom provides a real crypto.randomUUID.
    const ids = new Set(Array.from({ length: 100 }, () => newId()))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(typeof id).toBe('string')
  })

  it('builds a v4 UUID from getRandomValues when randomUUID is undefined', () => {
    vi.stubGlobal('crypto', {
      randomUUID: undefined,
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 0xff
        return arr
      },
    })
    const id = newId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('does not throw and stays unique when no crypto exists', () => {
    vi.stubGlobal('crypto', undefined)
    const a = newId()
    const b = newId()
    expect(typeof a).toBe('string')
    expect(a).not.toBe(b)
  })
})
