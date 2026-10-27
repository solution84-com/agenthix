/**
 * The viewer's reads of its file, by range, from the ticket that is live now. hq's page renews a file's tickets while
 * it stays open and tells the viewer the new ticket's path (`messages.ts`); every read after that uses it, so a PDF left
 * open keeps drawing its pages without being loaded again. Reads go only to this origin, with no credentials.
 */
import { PDFDataRangeTransport } from 'pdfjs-dist'
import { isTicketPath } from './address'

/** A read the relay refused or could not answer; `status` 0 when nothing answered. */
export class TicketReadError extends Error {
  readonly name = 'TicketReadError'
  constructor(readonly status: number) {
    super(status === 0 ? 'The relay did not answer.' : `The relay answered ${status}.`)
  }
}

/** "bytes 0-1023/4096" → 4096, or undefined. */
function totalOf(contentRange: string | null): number | undefined {
  const match = /^bytes \d+-\d+\/(\d+)$/.exec(contentRange?.trim() ?? '')
  return match ? Number(match[1]) : undefined
}

export class TicketSource {
  // Called through a wrapper: a browser's fetch called as another object's method throws "Illegal invocation".
  constructor(private ticketPath: string, private readonly origin: string, private readonly fetchIt: typeof fetch = (input, init) => fetch(input, init)) {}

  get path(): string {
    return this.ticketPath
  }

  /** Takes a renewed ticket's path; anything but a ticket's path is ignored. */
  renew(path: string): void {
    if (isTicketPath(path)) this.ticketPath = path
  }

  private async get(range: string): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchIt(`${this.origin}${this.ticketPath}`, {
        headers: { Range: range }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      })
    } catch {
      throw new TicketReadError(0)
    }
    if (response.status !== 200 && response.status !== 206 && response.status !== 416) throw new TicketReadError(response.status)
    return response
  }

  /** The file's length and its first bytes, up to `chunk`. */
  async open(chunk: number): Promise<{ length: number; initialData: Uint8Array }> {
    const response = await this.get(`bytes=0-${chunk - 1}`)
    if (response.status === 416) return { length: 0, initialData: new Uint8Array(0) }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (response.status === 200) return { length: bytes.length, initialData: bytes }
    const total = totalOf(response.headers.get('Content-Range'))
    if (total === undefined) throw new TicketReadError(response.status)
    return { length: total, initialData: bytes.subarray(0, Math.min(bytes.length, total)) }
  }

  /** Bytes `begin` up to (not including) `end`, as pdf.js asks for them. */
  async read(begin: number, end: number): Promise<Uint8Array> {
    const response = await this.get(`bytes=${begin}-${end - 1}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (response.status === 206) return bytes.subarray(0, end - begin)
    if (response.status === 200) return bytes.subarray(begin, end)
    return new Uint8Array(0)
  }
}

/**
 * pdf.js's range transport over a ticket source; a read that fails is handed to `onError`. `Transport` is the class of
 * the pdf.js build in use (tests run its legacy build, which accepts only its own).
 */
export function rangeTransport(source: TicketSource, opened: { length: number; initialData: Uint8Array },
  onError: (error: unknown) => void, Transport: typeof PDFDataRangeTransport = PDFDataRangeTransport): PDFDataRangeTransport {
  const transport = new Transport(opened.length, opened.initialData)
  transport.requestDataRange = (begin: number, end: number) => {
    source.read(begin, end).then(chunk => transport.onDataRange(begin, chunk), onError)
  }
  return transport
}
