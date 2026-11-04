/**
 * An export, from the machine that holds it to the browser of the fleet admin who downloads it (core's
 * exportDownload.ts). The screen asks for a download through its session and CSRF token, and gets a one-time link
 * bound to that session: the browser fetches it by itself, which cannot carry the token, so the link stands in for it,
 * and works once, within a minute, with the same session's cookie.
 *
 * The file passes through in chunks, each a command's answer — signed by the machine and opened only as the answer of
 * the machine asked (hosts/commands.ts) — checked for its place, its size and where it ends, and written straight to
 * the browser; nothing of it is kept here. Anything wrong ends the download, and its words are what the screen shows.
 * Only once the whole file has left for the browser is the machine told, and it removes its copy.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { Response } from 'express'
import { EXPORT_CHUNK_BYTES, exportChunkProblem, type ExportChunk, type HostActor, type HostResult } from '@agenthix/core'
import type { HostCommands } from '../hosts/commands'
import type { Session } from '../auth/sessions'

const LINK_MS = 60_000
const KEEP_MS = 60 * 60_000
/** Chunks asked for ahead of the one being written. */
const AHEAD = 4

export type DownloadState = 'waiting' | 'sending' | 'done' | 'failed'

export type DownloadStatus = {
  downloadId: string
  exportId: string
  machineName: string
  state: DownloadState
  sizeBytes: number | null
  sentBytes: number
  problem: string | null
  /** Whether the machine removed its copy once the file was sent; null until then. */
  removedFromMachine: boolean | null
}

type Pending = { status: DownloadStatus; sessionIdHash: string; userId: string; by: HostActor; fingerprint: string; expiresAt: number }

/** The machine refused, in its own words. */
class Refused extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s)
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)

export class ExportDownloads {
  private readonly links = new Map<string, Pending>()
  private readonly statuses = new Map<string, { status: DownloadStatus; userId: string; link: string }>()

  constructor(private readonly commands: HostCommands, private readonly now: () => number = Date.now) {}

  /** A one-time link for this session to download the export; the status is read by its id. */
  begin(session: Session, by: HostActor, fingerprint: string, machineName: string, exportId: string): { downloadId: string; link: string } {
    this.prune()
    const link = randomBytes(32).toString('base64url')
    const status: DownloadStatus = {
      downloadId: randomUUID(), exportId, machineName, state: 'waiting', sizeBytes: null, sentBytes: 0, problem: null, removedFromMachine: null,
    }
    this.links.set(link, { status, sessionIdHash: session.idHash, userId: session.user.id, by, fingerprint, expiresAt: this.now() + LINK_MS })
    this.statuses.set(status.downloadId, { status, userId: session.user.id, link })
    setTimeout(() => this.statuses.delete(status.downloadId), KEEP_MS).unref?.()
    return { downloadId: status.downloadId, link }
  }

  /** The session the link was made for, to check the cookie against; null when there is no such link now. */
  sessionOf(link: string): string | null {
    const p = this.links.get(link)
    return p && p.expiresAt > this.now() ? p.sessionIdHash : null
  }

  /** Spends the link; null when it is spent, expired or was never made. */
  take(link: string): Pending | null {
    const p = this.links.get(link)
    this.links.delete(link)
    if (!p || p.expiresAt <= this.now()) return null
    p.status.state = 'sending'
    return p
  }

  /** A link refused before the file was fetched ends the download in words, instead of leaving it waiting. */
  refuse(link: string, problem: string): void {
    const p = this.links.get(link)
    if (p && p.status.state === 'waiting') {
      p.status.state = 'failed'
      p.status.problem = problem
    }
    this.links.delete(link)
  }

  status(downloadId: string, userId: string): DownloadStatus | null {
    const s = this.statuses.get(downloadId)
    if (!s || s.userId !== userId) return null
    // A link nobody fetched within its minute is gone; a download still waiting on it has failed.
    const waiting = s.status.state === 'waiting'
    const link = this.links.get(s.link)
    if (waiting && (!link || link.expiresAt <= this.now())) {
      s.status.state = 'failed'
      s.status.problem = `The browser did not fetch the file within a minute. The export is still on ${s.status.machineName}: download it again.`
    }
    return { ...s.status }
  }

  /** Streams the export to the response; never throws. */
  async send(p: Pending, res: Response): Promise<void> {
    const { status } = p
    status.state = 'sending'
    let gone = false
    res.on('close', () => { gone = !res.writableFinished })
    const ask = (offset: number) => {
      const answer = this.commands.send(p.fingerprint, { op: 'backup.exportRead', exportId: status.exportId, offset }, p.by)
      answer.catch(() => {})
      return answer
    }
    const chunkAt = async (answer: Promise<HostResult>, offset: number): Promise<Buffer> => {
      const r = await answer
      if (!r.ok) throw new Refused(r.refusal.code, r.refusal.message)
      const problem = exportChunkProblem(r.result, { exportId: status.exportId, offset, sizeBytes: status.sizeBytes })
      if (problem) throw new Error(problem)
      const chunk = r.result as ExportChunk
      // The first chunk's size is the one every later chunk must give.
      status.sizeBytes ??= chunk.sizeBytes
      return Buffer.from(chunk.data, 'base64url')
    }
    try {
      const first = await chunkAt(ask(0), 0)
      const size = status.sizeBytes!
      res.status(200)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', `attachment; filename="${status.exportId}"`)
      res.setHeader('Content-Length', String(size))
      await this.write(res, first, () => gone)
      status.sentBytes = first.length
      const ahead: { offset: number; answer: Promise<HostResult> }[] = []
      let next = first.length
      const fill = () => {
        while (ahead.length < AHEAD && next < size) {
          ahead.push({ offset: next, answer: ask(next) })
          next += EXPORT_CHUNK_BYTES
        }
      }
      fill()
      while (ahead.length) {
        const { offset, answer } = ahead.shift()!
        const bytes = await chunkAt(answer, offset)
        await this.write(res, bytes, () => gone)
        status.sentBytes += bytes.length
        fill()
      }
      res.end()
      // A browser that drops while the last bytes flush closes the response without finishing it.
      if (!res.writableFinished) await new Promise<void>(resolve => { res.once('finish', resolve); res.once('close', resolve) })
      if (!res.writableFinished) throw new Error('the browser stopped taking it')
      status.removedFromMachine = await this.release(p)
      status.state = 'done'
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      status.state = 'failed'
      if (gone) status.problem = `The download was stopped before it ended. The export is still on ${status.machineName}: download it again.`
      else if (!res.headersSent) status.problem = sentence(message)
      else status.problem = `The download stopped: ${sentence(lowerFirst(message))} Download it again.`
      if (!res.headersSent) {
        res.status(err instanceof Refused && err.code === 'not_found' ? 404 : 502).json({ error: 'download_failed', message: status.problem })
      } else {
        res.destroy()
      }
    }
  }

  private async write(res: Response, bytes: Buffer, gone: () => boolean): Promise<void> {
    if (gone()) throw new Error('the browser stopped taking it')
    if (!res.write(bytes)) {
      await new Promise<void>(resolve => {
        const done = () => {
          res.off('drain', done)
          res.off('close', done)
          resolve()
        }
        res.on('drain', done)
        res.on('close', done)
      })
    }
    if (gone()) throw new Error('the browser stopped taking it')
  }

  private async release(p: Pending): Promise<boolean | null> {
    try {
      const r = await this.commands.send(p.fingerprint, { op: 'backup.exportDone', exportId: p.status.exportId }, p.by)
      return r.ok && r.op === 'backup.exportDone' ? (r.result as { removed: boolean }).removed : null
    } catch {
      // Not told now: the machine removes it by itself a day after it was made.
      return null
    }
  }

  private prune(): void {
    const now = this.now()
    for (const [link, p] of this.links) if (p.expiresAt <= now) this.links.delete(link)
  }
}
