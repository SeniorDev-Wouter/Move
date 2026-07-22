let counter = 0

/**
 * Generate a unique id. Prefers crypto.randomUUID, then a v4 UUID built from
 * crypto.getRandomValues, and finally a time+counter fallback. Guards every
 * crypto access so it never throws in a non-secure context or an old webview.
 */
export function newId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined

  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID()
    } catch {
      // fall through to the next strategy
    }
  }

  if (c && typeof c.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      // Set the version (4) and variant (RFC 4122) bits.
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex: string[] = []
      for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1))
      const h = (i: number) => hex[bytes[i]]
      return (
        `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-` +
        `${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`
      )
    } catch {
      // fall through to the final fallback
    }
  }

  return `${Date.now().toString(36)}-${(counter++).toString(36)}`
}
