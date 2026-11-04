import { describe, expect, it } from 'vitest'
import {
  PDF_PREVIEW_LIMIT,
  pdfViewerHostMessage,
  pdfViewerMessage,
  readPdfViewerHostMessage,
  readPdfViewerMessage,
} from '../pdfViewer.js'

describe('the PDF viewer messages', () => {
  it('keeps the shapes both sides have always sent', () => {
    expect(pdfViewerMessage({ pages: 14 })).toEqual({ source: 'pdf-viewer', version: 1, pages: 14 })
    expect(pdfViewerHostMessage('/t/a.b.c')).toEqual({ source: 'pdf-viewer-host', version: 1, link: '/t/a.b.c' })
    expect(PDF_PREVIEW_LIMIT).toBe(50 * 1024 * 1024)
  })

  it('reads a ready report, a failure, a page count, and nothing else', () => {
    expect(readPdfViewerMessage(pdfViewerMessage({ report: { state: 'ready' } }))).toEqual({ report: { state: 'ready' } })
    expect(readPdfViewerMessage(pdfViewerMessage({ report: { state: 'failed', reason: 'changed' } }))).toEqual({
      report: { state: 'failed', reason: 'changed' },
    })
    expect(readPdfViewerMessage(pdfViewerMessage({ pages: 3 }))).toEqual({ pages: 3 })
    for (const bad of [null, 'x', {}, { source: 'pdf-viewer', version: 2 }, pdfViewerMessage({ pages: 0 }), pdfViewerMessage({ report: { state: 'partial', shown: 1 } })]) {
      expect(readPdfViewerMessage(bad), JSON.stringify(bad)).toBeNull()
    }
    expect(readPdfViewerMessage({ source: 'pdf-viewer', version: 1, report: { state: 'failed', reason: 'odd' } })).toBeNull()
  })

  it('reads the framing page link only in its exact shape', () => {
    expect(readPdfViewerHostMessage(pdfViewerHostMessage('/t/a.b.c'))).toBe('/t/a.b.c')
    for (const bad of [null, {}, { source: 'pdf-viewer', version: 1, link: '/t/a' }, { source: 'pdf-viewer-host', version: 2, link: '/t/a' }, { source: 'pdf-viewer-host', version: 1, link: 4 }]) {
      expect(readPdfViewerHostMessage(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})
