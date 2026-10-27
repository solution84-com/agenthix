import { describe, expect, it } from 'vitest'
import { FILE_OPEN_STATES, fileTicketLink, KINDS_NEEDING_FILES_ADDRESS, needsFilesAddress } from '../open.js'

const TICKET = 'eyJhbGciOiJSUzI1NiJ9.eyJzaXRlIjoicyJ9.c2ln-_'

describe('a ticket\'s link @SC-1450', () => {
  it('is the files address and the ticket path', () => {
    expect(fileTicketLink({ origin: 'https://files.example.com', door: 'files-address' }, TICKET))
      .toBe(`https://files.example.com/t/${TICKET}`)
    expect(fileTicketLink({ origin: 'http://files.localhost:4100/', door: 'files-address' }, TICKET))
      .toBe(`http://files.localhost:4100/t/${TICKET}`)
  })

  it('is under the relay\'s path on a bare address', () => {
    expect(fileTicketLink({ origin: 'https://203.0.113.7', door: 'bare-address' }, TICKET))
      .toBe(`https://203.0.113.7/relay/t/${TICKET}`)
  })

  it('refuses an address that is not an origin, and a ticket that is not a token', () => {
    for (const origin of ['files.example.com', 'ftp://files.example.com', 'https://files.example.com/x', 'https://a@b.com', 'https://files.example.com?q', 'javascript:alert(1)']) {
      expect(() => fileTicketLink({ origin, door: 'files-address' }, TICKET), origin).toThrow()
    }
    for (const ticket of ['', 'a/b.c.d', 'a.b.c?x', '../t', 'a b.c.d']) {
      expect(() => fileTicketLink({ origin: 'https://files.example.com', door: 'files-address' }, ticket), ticket).toThrow()
    }
  })
})

describe('what open answers @SC-1451', () => {
  it('names each state the frame words', () => {
    expect(FILE_OPEN_STATES).toEqual(['ready', 'no-files-address', 'no-relay', 'relay-unavailable', 'site-unavailable', 'not-found'])
  })

  it('says a PDF needs a files address, and nothing else does', () => {
    expect(KINDS_NEEDING_FILES_ADDRESS).toEqual(['pdf'])
    expect(needsFilesAddress('pdf')).toBe(true)
    for (const kind of ['markdown', 'text', 'code', 'json', 'csv', 'image', 'none'] as const) expect(needsFilesAddress(kind)).toBe(false)
  })
})
