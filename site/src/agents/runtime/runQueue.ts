/** In-process run scheduling primitives. Process-local state — one instance per
 *  engine; a restart clears them (crash recovery in setup.ts covers orphaned runs). */
export class KeyedAsyncQueue {
  private tails = new Map<string, Promise<void>>()

  async enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) || Promise.resolve()
    // Run tasks sequentially: the next task runs regardless of whether this one fails.
    // Separate the queue-ordering chain (errors suppressed) from the return value (errors propagate).
    const current = previous.then(task) as Promise<T>
    const tail = current.then(() => {}, () => {})
    this.tails.set(key, tail)
    // Keys are per session, so an idle key is dropped rather than kept for the
    // life of the process — unless something queued behind it meanwhile.
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return current
  }

  /** Keys with work queued or running. */
  get size(): number {
    return this.tails.size
  }
}

export class GlobalSlots {
  private activeCount = 0
  private waiting: (() => void)[] = []
  constructor(private max: number) {}

  /** A new cap: runs holding a slot keep it; waiting ones start while there is room. */
  setMax(max: number): void {
    this.max = max
    while (this.activeCount < this.max && this.waiting.length) {
      this.activeCount++
      this.waiting.shift()!()
    }
  }

  /** Whether the next `acquire` would have to wait. */
  get full(): boolean {
    return this.activeCount >= this.max
  }

  async acquire(): Promise<void> {
    if (this.activeCount < this.max) { this.activeCount++; return }
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  release(): void {
    this.activeCount--
    if (this.activeCount >= this.max) return
    const next = this.waiting.shift()
    if (next) { this.activeCount++; next() }
  }
}
