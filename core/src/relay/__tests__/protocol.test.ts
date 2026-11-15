import { describe, expect, it } from 'vitest'
import { parseProtocolVersion } from '../../protocol/connection.js'
import { SERVICE_PORTS } from '../../ports/ports.js'
import {
  RELAY_HQ_LINK_PATH, RELAY_PROTOCOL_VERSION, RELAY_PROTOCOL_VERSION_HEADER, RELAY_SITE_LINE_PATH,
  RELAY_STREAMS_PER_PERSON, RELAY_TICKET_PATH_PREFIX,
} from '../protocol.js'
import { FILE_TICKET_TTL_SECONDS, LATER_TICKET_PURPOSES, RELAY_PASS_TTL_SECONDS, TICKET_PURPOSES } from '../tokens.js'
import * as core from '../../index.js'

describe('the relay protocol @SC-1461', () => {
  it('is at 1.0, with a header named after the relay', () => {
    expect(RELAY_PROTOCOL_VERSION).toBe('1.0')
    expect(parseProtocolVersion(RELAY_PROTOCOL_VERSION)).toEqual({ major: 1, minor: 0 })
    expect(RELAY_PROTOCOL_VERSION_HEADER).toBe('X-Relay-Protocol-Version')
  })

  it('pins its paths, lifetimes, purposes and caps', () => {
    expect([RELAY_SITE_LINE_PATH, RELAY_HQ_LINK_PATH, RELAY_TICKET_PATH_PREFIX]).toEqual(['/relay-line', '/relay-link', '/t/'])
    expect([FILE_TICKET_TTL_SECONDS, RELAY_PASS_TTL_SECONDS]).toEqual([300, 3600])
    expect(TICKET_PURPOSES).toEqual(['preview', 'download'])
    expect(LATER_TICKET_PURPOSES).toEqual(['diff', 'ide-session'])
    expect(RELAY_STREAMS_PER_PERSON).toBe(16)
    expect(SERVICE_PORTS.relay.server).toBe(4401)
  })

  it('is exported from core\'s entry, with the kinds', () => {
    expect(typeof core.verifyRelayToken).toBe('function')
    expect(typeof core.createStreamHeadReader).toBe('function')
    expect(typeof core.chooseFileKind).toBe('function')
    expect(core.FILES_SERVE_METHOD).toBe('files.serve')
    expect(core.RELAY_ASSIGN_METHOD).toBe('relay.assign')
    expect(core.FILE_ABOUT_METHOD).toBe('file.about')
    expect(typeof core.readFileRef).toBe('function')
    expect(typeof core.isUploadPath).toBe('function')
    expect(typeof core.fileTicketLink).toBe('function')
    expect(typeof core.relayAnswerForm).toBe('function')
  })
})

// hq signs from this input: each space keeps its own fields, so a ticket for one cannot carry another's.
const placeInput: core.FileTicketInput = {
  purpose: 'preview', space: 'place', loc: { ownerType: 'project', ownerId: 'p1' }, path: 'a.md', version: '1:1',
  person: 'u1', site: 's1', relay: 'r1',
}
const uploadInput: core.FileTicketInput = { purpose: 'download', space: 'upload', path: '/org/images/x.png', version: '1:1', person: 'u1', relay: 'r1' }
// @ts-expect-error an upload names no site
const uploadWithSite: core.FileTicketInput = { ...uploadInput, site: 's1' }
void [placeInput, uploadWithSite]
