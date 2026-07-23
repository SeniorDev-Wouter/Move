import { afterEach, describe, expect, it, vi } from 'vitest'
import { playDing } from './sound'

afterEach(() => vi.unstubAllGlobals())

describe('playDing', () => {
  it('does not throw when Audio is undefined', () => {
    vi.stubGlobal('Audio', undefined)
    expect(() => playDing()).not.toThrow()
  })

  it("constructs the base-relative 'ding.wav' and swallows a rejected play()", async () => {
    let src: string | undefined
    class FakeAudio {
      constructor(source?: string) {
        src = source
      }
      play(): Promise<void> {
        return Promise.reject(new Error('autoplay blocked'))
      }
    }
    vi.stubGlobal('Audio', FakeAudio)

    expect(() => playDing()).not.toThrow()
    expect(src?.endsWith('ding.wav')).toBe(true)
    // Let the rejected play() settle; the .catch() must swallow it.
    await Promise.resolve()
  })
})
