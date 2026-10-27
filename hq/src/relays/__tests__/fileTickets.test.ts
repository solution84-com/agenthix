import { describe, it, expect, vi } from 'vitest'
import type { FileTicketInput } from '@agenthix/core'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { createTicketIssuer, fileOpenedEntry, type FileOpenedEntry } from '../fileTickets'

const place: FileTicketInput = {
  space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: 't1' }, path: 'out/report.pdf',
  purpose: 'download', version: '10:1', person: 'u1', site: 'site-1', relay: 'relay-1',
}

describe('issuing a file ticket @SC-1509 @SC-1523 @SC-1572', () => {
  it('records the ticket before handing it back', async () => {
    const recorded: FileOpenedEntry[] = []
    const issue = createTicketIssuer({
      sign: async () => ({ token: 'a.b.c', expiresAt: 1 }),
      record: async entry => { recorded.push(entry) },
    })
    expect(await issue(place)).toEqual({ token: 'a.b.c', expiresAt: 1 })
    expect(recorded).toEqual([{
      personId: 'u1', space: 'place', ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: 't1',
      path: 'out/report.pdf', pageVersionId: null, version: '10:1', purpose: 'download', siteId: 'site-1', relayId: 'relay-1',
    }])
  })

  it('hands back no ticket when its record could not be written', async () => {
    const issue = createTicketIssuer({
      sign: async () => ({ token: 'a.b.c', expiresAt: 1 }),
      record: async () => { throw new Error('database away') },
    })
    await expect(issue(place)).rejects.toThrow('database away')
  })

  it('records each space by its own fields', () => {
    expect(fileOpenedEntry({ ...place, space: 'artefact', owner: { ownerType: 'user', ownerId: 'u1' }, name: 'chart.png' } as unknown as FileTicketInput))
      .toMatchObject({ space: 'artefact', ownerType: 'user', ownerId: 'u1', path: 'chart.png', workspaceId: null, taskId: null })
    expect(fileOpenedEntry({
      space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' }, path: 'a.md', versionId: 'v2',
      purpose: 'preview', version: '1:1', person: 'u1', site: 'site-1', relay: 'relay-1',
    })).toMatchObject({ space: 'knowledge', ownerType: 'org', path: 'a.md', pageVersionId: 'v2', siteId: 'site-1' })
    expect(fileOpenedEntry({ space: 'upload', path: '/org/images/logo.png', purpose: 'preview', version: '1:1', person: null, relay: 'relay-1' }))
      .toMatchObject({ space: 'upload', personId: null, ownerType: null, siteId: null, path: '/org/images/logo.png' })
  })
})
