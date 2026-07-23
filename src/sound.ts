/**
 * Play the retro "ding" that accompanies a reminder. No-ops when the Audio
 * constructor is unavailable (jsdom) and swallows a rejected play() (autoplay
 * policy, missing asset) so it never throws.
 */
export function playDing(): void {
  if (typeof Audio === 'undefined') return
  try {
    const audio = new Audio(`${import.meta.env.BASE_URL}notify.mp3`)
    void audio.play().catch(() => {})
  } catch {
    // Audio unavailable — ignore.
  }
}
