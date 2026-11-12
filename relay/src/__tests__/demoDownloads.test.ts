import { afterEach, describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'
import { downloadsOnly, setFileHeaders, type ServedHead } from '../http/responseHeaders'

function headersFor(head: ServedHead): Record<string, string> {
  const set: Record<string, string> = {}
  setFileHeaders({ setHeader: (k: string, v: string) => { set[k] = v } } as unknown as ServerResponse, head, 'files-address')
  return set
}

const picture: ServedHead = { status: 200, size: 4, contentType: 'image/png', purpose: 'preview', fileName: 'a.png' }
const page: ServedHead = { status: 200, size: 4, contentType: 'text/html', purpose: 'preview', fileName: 'a.html' }

afterEach(() => {
  delete process.env.DEMO_MODE
  downloadsOnly(true)
})

describe('the public demo serves every file as a download @SC-1999', () => {
  it('sends a preview as an attachment in demo mode', () => {
    process.env.DEMO_MODE = 'true'
    downloadsOnly(true)
    expect(headersFor(picture)['Content-Disposition']).toMatch(/^attachment;/)
    expect(headersFor(page)['Content-Disposition']).toMatch(/^attachment;/)
  })

  it('keeps the door\'s own rule with the setting off', () => {
    downloadsOnly(true)
    expect(headersFor(picture)['Content-Disposition']).toMatch(/^inline;/)
  })
})
