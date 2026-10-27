import { describe, expect, it } from 'vitest'
import { readAddress } from '../address'
import { documentOptions, failureOfError, PDF_PREVIEW_LIMIT } from '../documentOptions'
import { fitWidthScale, nextZoom, pageAt, ZOOM_MAX, ZOOM_MIN } from '../layout'
import { viewerMessage } from '../messages'

const TICKET = '/t/eyJhbGciOiJSUzI1NiJ9.eyJzaXRlIjoicyJ9.c2ln'

describe('the address the viewer is opened at @SC-1489', () => {
  it('reads the ticket path and theme from the fragment', () => {
    expect(readAddress(`#link=${encodeURIComponent(TICKET)}&theme=dark`)).toEqual({ ticketPath: TICKET, theme: 'dark' })
    expect(readAddress(`#link=${encodeURIComponent(TICKET)}`)).toEqual({ ticketPath: TICKET, theme: 'light' })
  })

  it('takes only a ticket on its own origin: no other origin, no other path, nothing else', () => {
    for (const link of [
      'https://evil.example/t/a.b.c', '//evil.example/t/a.b.c', '/relay/t/a.b.c', '/t/a.b.c/../x', '/t/a.b.c?x=1',
      '/viewer/pdf', 'javascript:alert(1)', '/t/not-a-ticket', '',
    ]) {
      expect(readAddress(`#link=${encodeURIComponent(link)}`), link).toBeNull()
    }
    expect(readAddress('')).toBeNull()
    expect(readAddress(`#link=${encodeURIComponent(TICKET)}&theme=<b>`)).toEqual({ ticketPath: TICKET, theme: 'light' })
  })
})

describe('the options pdf.js is opened with @SC-1488', () => {
  const options = documentOptions('https://files.example.com')

  it('runs no script a PDF carries: no XFA forms, and nothing of pdf.js’s scripting is set up', () => {
    expect(options.enableXfa).toBe(false)
    expect(Object.keys(options).some(k => /script|sandbox|eval/i.test(k))).toBe(false)
  })

  it('reads by range, only the pages shown, with no credentials', () => {
    expect(options).not.toHaveProperty('url')
    expect(options.disableAutoFetch).toBe(true)
    expect(options.disableStream).toBe(true)
    expect(options.disableRange).toBe(false)
    expect(options.withCredentials).toBe(false)
  })

  it('takes fonts, character maps and image decoders from the viewer’s own files', () => {
    expect(options.cMapUrl).toBe('https://files.example.com/viewer/pdf/cmaps/')
    expect(options.standardFontDataUrl).toBe('https://files.example.com/viewer/pdf/standard_fonts/')
    expect(options.wasmUrl).toBe('https://files.example.com/viewer/pdf/wasm/')
    expect(options.iccUrl).toBe('https://files.example.com/viewer/pdf/iccs/')
  })

  it('previews up to 50 MB', () => {
    expect(PDF_PREVIEW_LIMIT).toBe(50 * 1024 * 1024)
  })
})

describe('what a failure is reported as @SC-1489', () => {
  it('a changed file, a refused read, a broken PDF', () => {
    expect(failureOfError({ name: 'ResponseException', status: 409 })).toBe('changed')
    expect(failureOfError({ name: 'ResponseException', status: 403 })).toBe('unavailable')
    expect(failureOfError({ name: 'ResponseException', status: 503 })).toBe('unavailable')
    expect(failureOfError({ name: 'TicketReadError', status: 409 })).toBe('changed')
    expect(failureOfError({ name: 'TicketReadError', status: 0 })).toBe('unavailable')
    expect(failureOfError({ name: 'InvalidPDFException' })).toBe('unreadable')
    expect(failureOfError({ name: 'PasswordException' })).toBe('unreadable')
    expect(failureOfError(new TypeError('Failed to fetch'))).toBe('unavailable')
    expect(failureOfError('nonsense')).toBe('unavailable')
  })
})

describe('the messages it sends @SC-1489', () => {
  it('carry a report or a page count in one envelope', () => {
    expect(viewerMessage({ report: { state: 'ready' } })).toEqual({ source: 'pdf-viewer', version: 1, report: { state: 'ready' } })
    expect(viewerMessage({ pages: 14 })).toEqual({ source: 'pdf-viewer', version: 1, pages: 14 })
  })
})

describe('pages and zoom @SC-1489', () => {
  it('fits a page to the width it has, inside the zoom’s bounds', () => {
    expect(fitWidthScale(612, 612 + 32, 16)).toBeCloseTo(1)
    expect(fitWidthScale(612, 100000, 16)).toBe(ZOOM_MAX)
    expect(fitWidthScale(612, 10, 16)).toBe(ZOOM_MIN)
  })

  it('steps zoom in and out between its bounds', () => {
    expect(nextZoom(1, 'in')).toBeGreaterThan(1)
    expect(nextZoom(1, 'out')).toBeLessThan(1)
    expect(nextZoom(ZOOM_MAX, 'in')).toBe(ZOOM_MAX)
    expect(nextZoom(ZOOM_MIN, 'out')).toBe(ZOOM_MIN)
  })

  it('says which page is at the top of the view', () => {
    const tops = [0, 800, 1600, 2400]
    expect(pageAt(tops, 0)).toBe(1)
    expect(pageAt(tops, 798)).toBe(1)
    expect(pageAt(tops, 799.5)).toBe(2)
    expect(pageAt(tops, 1700)).toBe(3)
    expect(pageAt(tops, 99999)).toBe(4)
  })
})
