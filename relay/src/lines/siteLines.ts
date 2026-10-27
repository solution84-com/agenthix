/**
 * The lines sites hold to this relay: one per site, the newest. On each line the relay opens streams and the site
 * answers them (`StreamMux('opener')`), as hq does on its content channel.
 *
 * When a site dials again, new streams go to the new line at once; the old line is retired — it takes no new stream
 * and is closed once its open streams finish, or after `RETIRE_GRACE_MS` — so a download under way when the site
 * renews its pass carries on.
 */
import { StreamMux } from '@agenthix/core'

export const RETIRE_GRACE_MS = 10 * 60_000
export const REPLACED_CLOSE_CODE = 4000
export const RELAY_CHANGED_CLOSE_CODE = 4003

/** The slice of a `ws` socket the lines use, so tests need no network. */
export interface LineSocket {
  send(data: string | Uint8Array, cb?: (err?: Error) => void): void
  close(code?: number, reason?: string): void
  readonly readyState: number
  readonly OPEN: number
}

type Line = { siteId: string; socket: LineSocket; mux: StreamMux }

export class LineClosedError extends Error {}

export class SiteLines {
  private readonly lines = new Map<string, Line>()
  private readonly retiring = new Map<StreamMux, { line: Line; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly graceMs: number = RETIRE_GRACE_MS) {}

  add(siteId: string, socket: LineSocket): StreamMux {
    const mux = new StreamMux('opener', {
      sendText: text => {
        if (socket.readyState === socket.OPEN) socket.send(text)
      },
      sendBinary: bytes => new Promise((resolve, reject) => {
        if (socket.readyState !== socket.OPEN) {
          reject(new LineClosedError('The site\'s line is not open'))
          return
        }
        socket.send(bytes, err => (err ? reject(err) : resolve()))
      }),
    })
    const previous = this.lines.get(siteId)
    this.lines.set(siteId, { siteId, socket, mux })
    if (previous && previous.socket !== socket) this.retire(previous)
    return mux
  }

  /** The socket closed: its line goes, and its streams fail. */
  remove(siteId: string, socket: LineSocket): void {
    const current = this.lines.get(siteId)
    if (current?.socket === socket) {
      this.lines.delete(siteId)
      current.mux.closeAll('disconnected', 'The site\'s line closed')
      return
    }
    for (const [mux, { line, timer }] of this.retiring) {
      if (line.socket !== socket) continue
      clearTimeout(timer)
      this.retiring.delete(mux)
      mux.closeAll('disconnected', 'The site\'s line closed')
    }
  }

  current(siteId: string): StreamMux | null {
    return this.lines.get(siteId)?.mux ?? null
  }

  /** Called when a stream on `mux` is over: a retired line with none left is closed. */
  settle(mux: StreamMux): void {
    const r = this.retiring.get(mux)
    if (r && mux.openStreamCount === 0) this.closeRetired(mux)
  }

  sites(): string[] {
    return [...this.lines.keys()]
  }

  /** Every line, new and retired, closed: the relay's id changed, so the passes they were opened with name another. */
  closeAll(code: number, reason: string): void {
    for (const line of this.lines.values()) {
      line.mux.closeAll('disconnected', reason)
      line.socket.close(code, reason)
    }
    this.lines.clear()
    for (const mux of [...this.retiring.keys()]) this.closeRetired(mux, code, reason)
  }

  private retire(line: Line): void {
    if (line.mux.openStreamCount === 0) {
      line.socket.close(REPLACED_CLOSE_CODE, 'Replaced by a newer line')
      return
    }
    const timer = setTimeout(() => this.closeRetired(line.mux), this.graceMs)
    timer.unref?.()
    this.retiring.set(line.mux, { line, timer })
  }

  private closeRetired(mux: StreamMux, code = REPLACED_CLOSE_CODE, reason = 'Replaced by a newer line'): void {
    const r = this.retiring.get(mux)
    if (!r) return
    clearTimeout(r.timer)
    this.retiring.delete(mux)
    mux.closeAll('disconnected', reason)
    r.line.socket.close(code, reason)
  }
}
