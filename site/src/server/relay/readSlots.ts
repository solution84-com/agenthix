import { SITE_CONCURRENT_FILE_READS } from '@agenthix/core'

/** How many reads may wait for a slot before a further one is refused as `busy`. */
export const MAX_QUEUED_FILE_READS = 256

export class ReadsFull extends Error {
  constructor() {
    super('Every file read slot is taken and the queue is full')
    this.name = 'ReadsFull'
  }
}

type Waiter = { grant: (release: () => void) => void; dropped: boolean }

/**
 * The site's cap on ticket reads at once (part 6: 32, queued beyond). A site's disk is shared with its agents, so a
 * relay asking for many files waits its turn rather than taking the disk.
 */
export class ReadSlots {
  private active = 0
  private readonly queue: Waiter[] = []

  constructor(
    private readonly limit = SITE_CONCURRENT_FILE_READS,
    private readonly maxQueued = MAX_QUEUED_FILE_READS,
  ) {}

  get running(): number {
    return this.active
  }

  get waiting(): number {
    return this.queue.length
  }

  /**
   * Resolves with the slot's release once one is free. `cancelled` drops a waiter whose stream went away, so a
   * cancelled read never holds a place in the queue. Throws `ReadsFull` when the queue is full too.
   */
  acquire(cancelled?: { onCancel(drop: () => void): void }): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++
      return Promise.resolve(this.releaser())
    }
    if (this.waiting >= this.maxQueued) return Promise.reject(new ReadsFull())
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { grant: resolve, dropped: false }
      this.queue.push(waiter)
      cancelled?.onCancel(() => {
        if (waiter.dropped) return
        waiter.dropped = true
        const at = this.queue.indexOf(waiter)
        if (at >= 0) this.queue.splice(at, 1)
        reject(new Error('The read was cancelled while it waited'))
      })
    })
  }

  private releaser(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
      this.next()
    }
  }

  private next(): void {
    while (this.active < this.limit && this.queue.length > 0) {
      const waiter = this.queue.shift()!
      // Marked so a cancel arriving after the grant does not reject a promise that already resolved.
      waiter.dropped = true
      this.active++
      waiter.grant(this.releaser())
    }
  }
}

export const fileReadSlots = new ReadSlots()
