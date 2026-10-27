/**
 * Pictures signed once per ticket life: a picture shown many times on one screen gets the ticket hq last signed for
 * the same person, file version, purpose and relay until it is within a minute of expiring. Only a new ticket is
 * signed and recorded (T11); task attachments, and every other space, sign per request.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { FileTicketInput } from '@agenthix/core'
import { reusePictureTickets, PICTURE_TICKET_REUSE_MARGIN_MS } from '../pictureTickets'

const LIFE_MS = 5 * 60_000
let now: number
let signed: FileTicketInput[]

function issuer(opts: { max?: number } = {}) {
  return reusePictureTickets(async input => {
    signed.push(input)
    return { token: `ticket-${signed.length}`, expiresAt: now + LIFE_MS }
  }, { now: () => now, max: opts.max })
}

const picture = (over: Partial<Extract<FileTicketInput, { space: 'upload' }>> = {}): FileTicketInput => ({
  space: 'upload', path: '/agents/agt_1/images/avatar.png', purpose: 'preview', version: 'v1', person: 'usr_a', relay: 'relay-hq', ...over,
})

beforeEach(() => {
  now = 1_793_000_000_000
  signed = []
})

describe('a picture ticket @SC-1521', () => {
  it('is signed once for the same picture asked twice, and the same ticket given again', async () => {
    const issue = issuer()
    const first = await issue(picture())
    const second = await issue(picture())
    expect(second).toEqual(first)
    expect(signed).toHaveLength(1)
  })

  it('is signed once when the same picture is asked for twice at the same moment', async () => {
    const issue = issuer()
    const [a, b] = await Promise.all([issue(picture()), issue(picture())])
    expect(a).toEqual(b)
    expect(signed).toHaveLength(1)
  })

  it('is signed anew when the file changed, for another person, purpose or relay', async () => {
    const issue = issuer()
    await issue(picture())
    await issue(picture({ version: 'v2' }))
    await issue(picture({ person: 'usr_b' }))
    await issue(picture({ person: null }))
    await issue(picture({ purpose: 'download' }))
    await issue(picture({ relay: 'relay-other' }))
    await issue(picture({ path: '/agents/agt_2/images/avatar.png' }))
    expect(signed).toHaveLength(7)
  })

  it('is given again until a minute before it expires, then signed anew', async () => {
    const issue = issuer()
    await issue(picture())
    now += LIFE_MS - PICTURE_TICKET_REUSE_MARGIN_MS - 1
    expect((await issue(picture())).token).toBe('ticket-1')
    now += 1
    expect((await issue(picture())).token).toBe('ticket-2')
    expect(signed).toHaveLength(2)
  })

  it('is not kept when signing fails, so the next ask signs again', async () => {
    let fail = true
    const issue = reusePictureTickets(async input => {
      signed.push(input)
      if (fail) throw new Error('relay record failed')
      return { token: 'ok', expiresAt: now + LIFE_MS }
    }, { now: () => now })
    await expect(issue(picture())).rejects.toThrow('relay record failed')
    fail = false
    expect((await issue(picture())).token).toBe('ok')
    expect(signed).toHaveLength(2)
  })

  it('keeps at most `max` pictures, dropping the one used longest ago', async () => {
    const issue = issuer({ max: 2 })
    await issue(picture({ path: '/agents/a/images/1.png' }))
    await issue(picture({ path: '/agents/b/images/2.png' }))
    await issue(picture({ path: '/agents/a/images/1.png' }))
    await issue(picture({ path: '/agents/c/images/3.png' }))
    expect(signed).toHaveLength(3)
    await issue(picture({ path: '/agents/a/images/1.png' }))
    expect(signed).toHaveLength(3)
    await issue(picture({ path: '/agents/b/images/2.png' }))
    expect(signed).toHaveLength(4)
  })
})

describe('a ticket that is not for a picture @SC-1521', () => {
  it('is signed on every ask for a task attachment', async () => {
    const issue = issuer()
    const attachment = picture({ path: '/files/task/tsk_1/u-1/notes.pdf', purpose: 'download' })
    await issue(attachment)
    await issue(attachment)
    expect(signed).toHaveLength(2)
  })

  it("is signed on every ask for a site's file", async () => {
    const issue = issuer()
    const place: FileTicketInput = {
      space: 'place', site: 'site-1', loc: { ownerType: 'project', ownerId: 'prj_1' }, path: 'a.png',
      purpose: 'preview', version: 'v1', person: 'usr_a', relay: 'relay-1',
    }
    await issue(place)
    await issue(place)
    expect(signed).toHaveLength(2)
  })
})
