export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export class ChannelRequestFailed extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'ChannelRequestFailed'
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Matches a reply to the request that asked for it. One instance per live
 * connection: the sequence restarts at 1 for each socket, so a late reply
 * arriving from a previous connection can never settle a request on this one.
 */
export class PendingRequests {
  private seq = 0
  private readonly pending = new Map<string, Pending>()

  next(timeoutMs: number): { requestId: string; promise: Promise<unknown> } {
    const requestId = String(++this.seq)
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new ChannelRequestFailed('Request timed out', 'timeout'))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(requestId, { resolve, reject, timer })
    })
    return { requestId, promise }
  }

  settle(replyTo: string, result: unknown): boolean {
    const entry = this.take(replyTo)
    if (!entry) return false
    entry.resolve(result)
    return true
  }

  /** `payload` is what the site sent, unchecked: a `ChannelErrorPayload` when the site keeps to the protocol. */
  fail(replyTo: string, payload: unknown): boolean {
    const entry = this.take(replyTo)
    if (!entry) return false
    const { message, code } = (payload ?? {}) as { message?: unknown; code?: unknown }
    entry.reject(typeof message === 'string' && typeof code === 'string'
      ? new ChannelRequestFailed(message, code)
      : new ChannelRequestFailed('The site answered with an error HQ could not read.', 'handler_failed'))
    return true
  }

  /** Called when the socket closes. Everything in flight must fail now, not later. */
  rejectAll(reason: string): void {
    for (const id of [...this.pending.keys()]) {
      this.take(id)?.reject(new ChannelRequestFailed(reason, 'disconnected'))
    }
  }

  get size(): number {
    return this.pending.size
  }

  private take(id: string): Pending | null {
    const entry = this.pending.get(id)
    if (!entry) return null
    clearTimeout(entry.timer)
    this.pending.delete(id)
    return entry
  }
}
