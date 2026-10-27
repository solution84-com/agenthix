import { describe, expect, it } from 'vitest'
import {
  RELAY_BARE_PATH_PREFIX, RELAY_BARE_TICKET_PATH_PREFIX, RELAY_DOOR_RULES, relayAnswerForm, ticketPathPrefix,
} from '../door.js'
import { RELAY_HQ_LINK_PATH, RELAY_SITE_LINE_PATH } from '../protocol.js'

describe('the relay\'s two doors @SC-1459', () => {
  it('answers on the files address at /t/, and on a bare address under /relay/', () => {
    expect(ticketPathPrefix('files-address')).toBe('/t/')
    expect(ticketPathPrefix('bare-address')).toBe('/relay/t/')
    expect(RELAY_BARE_TICKET_PATH_PREFIX).toBe('/relay/t/')
  })

  it('keeps the bare prefix apart from the line and the link', () => {
    expect(RELAY_BARE_PATH_PREFIX).toBe('/relay/')
    expect(RELAY_SITE_LINE_PATH.startsWith(RELAY_BARE_PATH_PREFIX)).toBe(false)
    expect(RELAY_HQ_LINK_PATH.startsWith(RELAY_BARE_PATH_PREFIX)).toBe(false)
  })

  it('states its rule as data: nothing inline on a bare address', () => {
    expect(RELAY_DOOR_RULES['files-address'].inline).toBe(true)
    expect(RELAY_DOOR_RULES['bare-address'].inline).toBe(false)
  })
})

describe('how an answer is sent @SC-1460', () => {
  it('sends a download as an attachment of no type, at either door', () => {
    for (const door of ['files-address', 'bare-address'] as const) {
      expect(relayAnswerForm(door, 'download', 'text/html')).toEqual({ contentType: 'application/octet-stream', disposition: 'attachment' })
    }
  })

  it('shows a preview inline on the files address, as the site guessed it', () => {
    expect(relayAnswerForm('files-address', 'preview', 'application/pdf')).toEqual({ contentType: 'application/pdf', disposition: 'inline' })
    expect(relayAnswerForm('files-address', 'preview', 'text/plain; charset=utf-8'))
      .toEqual({ contentType: 'text/plain; charset=utf-8', disposition: 'inline' })
  })

  it('replaces a guess that is not a plain media type', () => {
    for (const guess of ['', 'text/html\r\nSet-Cookie: a=b', 'text', 'text/plain; boundary=x', 'a'.repeat(300)]) {
      expect(relayAnswerForm('files-address', 'preview', guess).contentType, guess).toBe('application/octet-stream')
    }
  })

  it('on a bare address, sends a preview as text or a picture, always as an attachment', () => {
    expect(relayAnswerForm('bare-address', 'preview', 'text/html')).toEqual({ contentType: 'text/plain; charset=utf-8', disposition: 'attachment' })
    expect(relayAnswerForm('bare-address', 'preview', 'application/pdf')).toEqual({ contentType: 'text/plain; charset=utf-8', disposition: 'attachment' })
    expect(relayAnswerForm('bare-address', 'preview', 'text/markdown')).toEqual({ contentType: 'text/plain; charset=utf-8', disposition: 'attachment' })
    expect(relayAnswerForm('bare-address', 'preview', 'image/png')).toEqual({ contentType: 'image/png', disposition: 'attachment' })
    expect(relayAnswerForm('bare-address', 'preview', 'image/svg+xml')).toEqual({ contentType: 'image/svg+xml', disposition: 'attachment' })
    expect(relayAnswerForm('bare-address', 'preview', 'image/x-made-up')).toEqual({ contentType: 'text/plain; charset=utf-8', disposition: 'attachment' })
  })
})
