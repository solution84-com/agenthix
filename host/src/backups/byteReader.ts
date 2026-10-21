/** Reading a sealed backup's bytes in the lengths its layout gives (`seal.ts`). */
import { DamagedBackup } from './errors'

/** Reads exact lengths from a stream of buffers. */
export class ByteReader {
  private buffered: Buffer[] = []
  private length = 0
  private done = false
  constructor(private readonly source: AsyncIterator<Buffer>) {}

  /** Exactly `n` bytes; null at a clean end before any of them; an error when it ends partway. */
  async read(n: number): Promise<Buffer | null> {
    while (this.length < n && !this.done) {
      const next = await this.source.next()
      if (next.done) this.done = true
      else {
        const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value)
        this.buffered.push(chunk)
        this.length += chunk.length
      }
    }
    if (this.length === 0 && this.done) return null
    if (this.length < n) throw new DamagedBackup('it ends partway through')
    const all = Buffer.concat(this.buffered)
    this.buffered = [all.subarray(n)]
    this.length = all.length - n
    return all.subarray(0, n)
  }

  /** Lets go of the source, so a reader that stops early does not leave it waiting to be read. */
  async close(): Promise<void> {
    if (!this.done) {
      this.done = true
      await this.source.return?.()
    }
  }

  async *rest(): AsyncGenerator<Buffer> {
    for (const b of this.buffered) if (b.length) yield b
    this.buffered = []
    if (this.done) return
    for (;;) {
      const next = await this.source.next()
      if (next.done) return
      yield next.value
    }
  }
}
