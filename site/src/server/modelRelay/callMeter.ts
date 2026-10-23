/**
 * One upstream call through the relay, measured: its call id, the vendor's usage read from the answer as it passes
 * (usageReader.ts), and the upstream status and kind of failure, in hq's model adapter's terms so one rule moves a
 * provider's state whichever side saw the call. The report is what the relay hands the outbox (usageOutbox.ts).
 *
 * An answer the vendor compressed is decoded for reading only, from a copy of each chunk; the harness receives the
 * bytes exactly as they came.
 */
import { randomUUID } from 'node:crypto'
import zlib from 'node:zlib'
import { CLOUD_GATEWAY_ERROR_FIELD, type UpstreamErrorKind, type UsageReport } from '@agenthix/core'
import { UsageReader, type UsageApi } from './usageReader'

/** As hq's model adapter reads the vendor's words (conversations/model/errors.ts). */
const QUOTA_WORDS = /quota|credit balance|insufficient|billing|exceeded your current|out of credit|spend limit/i

/** The kind of failure an upstream status and the start of its answer name; undefined for a call that worked. */
export function upstreamErrorKind(status: number, text: string): UpstreamErrorKind | undefined {
  if (status >= 200 && status < 300) return undefined
  if (status === 0 || status === 408 || status >= 500) return 'unavailable'
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return text.includes(`"${CLOUD_GATEWAY_ERROR_FIELD}"`) ? 'cap_reached' : 'quota'
  if (status === 429) return QUOTA_WORDS.test(text) ? 'quota' : 'rate-limit'
  if (status >= 400) return QUOTA_WORDS.test(text) ? 'quota' : 'invalid'
  return 'other'
}

function decoderFor(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null | 'identity' {
  const e = (encoding ?? '').trim().toLowerCase()
  if (!e || e === 'identity') return 'identity'
  if (e === 'gzip' || e === 'x-gzip') return zlib.createGunzip()
  if (e === 'deflate') return zlib.createInflate()
  if (e === 'br') return zlib.createBrotliDecompress()
  return null
}

const DECODE_SETTLE_MS = 2_000

/** The model as hq accepts it in a report (core's `parseUsageReport`); anything else is reported as unknown. */
const REPORTABLE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@~-]{0,199}$/

export type CallMeterInfo = { runId: string; providerId: string; api: UsageApi }

export class CallMeter {
  readonly callId = randomUUID()
  private reader: UsageReader | null = null
  private decoder: Exclude<ReturnType<typeof decoderFor>, 'identity'> = null
  private readable = true
  private status = 0

  constructor(private readonly info: CallMeterInfo, private readonly now: () => Date = () => new Date()) {}

  /** The answer's status and headers arrived. */
  answer(status: number, contentType: string | undefined, contentEncoding: string | undefined): void {
    this.status = status
    const reader = new UsageReader(this.info.api, contentType)
    this.reader = reader
    const decoder = decoderFor(contentEncoding)
    if (decoder === null) this.readable = false
    else if (decoder !== 'identity') {
      this.decoder = decoder
      decoder.on('data', (chunk: Buffer) => reader.push(chunk))
      decoder.on('error', () => { this.readable = false })
    }
  }

  chunk(chunk: Buffer): void {
    if (!this.reader || !this.readable) return
    if (this.decoder) this.decoder.write(Buffer.from(chunk))
    else this.reader.push(chunk)
  }

  /**
   * The report for this call. `broken` is set when the answer ended early on the vendor's side; a call the harness
   * or the end of its turn cut off is not a failure of the provider.
   */
  async report(model: string | null, broken = false): Promise<UsageReport> {
    if (this.decoder && this.readable) await this.drain(this.decoder)
    const reader = this.reader
    const usage = reader && this.readable ? reader.end() : null
    const errorKind = upstreamErrorKind(this.status, reader?.text() ?? '') ?? reader?.streamFailure ?? (broken ? 'unavailable' : undefined)
    return {
      callId: this.callId,
      runId: this.info.runId,
      providerId: this.info.providerId,
      model: model && REPORTABLE_MODEL.test(model) ? model : 'unknown',
      at: this.now().toISOString(),
      usage,
      upstreamStatus: this.status,
      ...(errorKind ? { errorKind } : {}),
    }
  }

  private drain(decoder: NonNullable<CallMeter['decoder']>): Promise<void> {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); resolve() }
      const timer = setTimeout(done, DECODE_SETTLE_MS)
      decoder.once('end', done)
      decoder.once('error', done)
      decoder.end()
      decoder.resume()
    })
  }
}
