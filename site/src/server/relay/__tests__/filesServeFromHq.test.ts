import { describe, it, expect, vi } from 'vitest'
import { FILES_SERVE_METHOD, createStreamHeadReader } from '@agenthix/core'
import { contentMethods } from '../../hq/content/contentMethods'
import { openRead } from '../../hq/content/__tests__/contentReadHarness'
import { makeKey, signToken, ticketClaims } from './ticketKit'

describe('files.serve on hq\'s content channel @SC-1498 @SC-1566', () => {
  it('is refused without reading the ticket: hq carries no file bytes', async () => {
    const ticket = signToken(makeKey('hq-1'), ticketClaims({ ownerType: 'project', ownerId: 'p1' }, 'a.md', '1:1'))
    const read = openRead({ ticket }, undefined, undefined, contentMethods[FILES_SERVE_METHOD], FILES_SERVE_METHOD)
    await read.outcome
    await vi.waitFor(() => expect(read.handlerSettled()).toBe('resolved'))
    const parsed = createStreamHeadReader().push(new Uint8Array(read.body()))
    expect(parsed.state === 'head' && parsed.head).toEqual({ status: 403, refusal: 'ticket-invalid' })
    expect(parsed.state === 'head' && parsed.rest.length).toBe(0)
  })
})
