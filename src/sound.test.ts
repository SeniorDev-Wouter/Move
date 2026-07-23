import { afterEach, describe, expect, it, vi } from 'vitest'
import { playDing } from './sound'

afterEach(() => vi.unstubAllGlobals())

describe('playDing', () => {
  it('does not throw when Audio is undefined', () => {
    vi.stubGlobal('Audio', undefined)
    expect(() => playDing()).not.toThrow()
  })

  it("constructs the base-relative 'notify.mp3' and calls play()", async () => {
    let src: string | undefined
    let played = false
    class FakeAudio {
      constructor(source?: string) {
        src = source
      }
      play(): Promise<void> {
        played = true
        return Promise.resolve()
      }
    }
    vi.stubGlobal('Audio', FakeAudio)

    expect(() => playDing()).not.toThrow()
    expect(src?.endsWith('notify.mp3')).toBe(true)
    expect(played).toBe(true)
  })

  it('swallows a rejected play()', async () => {
    class FakeAudio {
      constructor(_source?: string) {}
      play(): Promise<void> {
        return Promise.reject(new Error('autoplay blocked'))
      }
    }
    vi.stubGlobal('Audio', FakeAudio)

    expect(() => playDing()).not.toThrow()
    // Let the rejected play() settle; the .catch() must swallow it.
    await Promise.resolve()
  })
})
