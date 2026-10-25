/**
 * Which version of each page a caller (a run or a conversation, by its `callerKey`) last read, so a write of an
 * existing page carries the version it started from (K3, G2), as Claude Code's Write needs a Read first. In memory and
 * bounded: a version forgotten (hq restarting, a day passing) only means the page is read again before it is written.
 */
export const READ_RECORD_MAX_ENTRIES = 20_000
export const READ_RECORD_TTL_MS = 24 * 60 * 60 * 1000

export class ReadRecord {
  private readonly seen = new Map<string, { version: string; at: number }>()

  constructor(
    private readonly maxEntries = READ_RECORD_MAX_ENTRIES,
    private readonly ttlMs = READ_RECORD_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  private key(callerKey: string, page: string): string {
    return `${callerKey}\u0000${page}`
  }

  remember(callerKey: string, page: string, version: string): void {
    const key = this.key(callerKey, page)
    this.seen.delete(key)
    this.seen.set(key, { version, at: this.now() })
    // Oldest first, by insertion order.
    while (this.seen.size > this.maxEntries) this.seen.delete(this.seen.keys().next().value as string)
  }

  recall(callerKey: string, page: string): string | null {
    const key = this.key(callerKey, page)
    const entry = this.seen.get(key)
    if (!entry) return null
    if (this.now() - entry.at > this.ttlMs) {
      this.seen.delete(key)
      return null
    }
    return entry.version
  }

  forget(callerKey: string, page: string): void {
    this.seen.delete(this.key(callerKey, page))
  }
}
