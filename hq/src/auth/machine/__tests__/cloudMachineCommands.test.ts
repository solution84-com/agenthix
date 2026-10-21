import { describe, it, expect, vi, beforeEach } from 'vitest'

// The commands Agenthix Cloud's operations arrive as over hq's control socket (pre-release spec B6, B7): what each
// reads, and its refusals by code. What they do to the data is the integration tests'.

const calls = vi.hoisted(() => [] as unknown[][])
vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../cloudAccountLinks', async () => {
  const { CloudLinkRefusal } = await vi.importActual<typeof import('../cloudAccountLinks')>('../cloudAccountLinks')
  return {
    CloudLinkRefusal,
    cloudFirstLink: async (ref: string) => { calls.push(['first', ref]); return { link: 'https://hq.example.com/invite/secret', expiresAt: 'x' } },
    cloudResetLink: async (username: string) => { calls.push(['reset', username]); throw new CloudLinkRefusal('not_found', 'No active organisation admin signs in with that username.') },
    cloudAdminInvite: async () => { calls.push(['invite']); throw new CloudLinkRefusal('conflict', 'HQ still has an active organisation admin, who can invite another.') },
  }
})
vi.mock('../../../fleet/cloudSites', async () => {
  const { CloudSiteRefusal } = await vi.importActual<typeof import('../../../fleet/cloudSites')>('../../../fleet/cloudSites')
  return {
    CloudSiteRefusal,
    registerCloudSite: async (input: unknown) => { calls.push(['register', input]); return { executionSiteId: 'es-1' } },
    unregisterCloudSite: async (id: string) => { calls.push(['unregister', id]); throw new CloudSiteRefusal('not_found', 'No site Agenthix Cloud added has that id.') },
  }
})

vi.mock('../../../cloud', async () => {
  const { CloudConnectionError } = await vi.importActual<typeof import('../../../cloud/cloudConnection')>('../../../cloud/cloudConnection')
  return {
    cloudConnectionKey: async () => { calls.push(['key']); return { publicKey: 'pk', clientId: 'cid', hqAddress: 'https://hq.example.com' } },
    connectByCloud: async (o: { cloudOrganisationId: string }) => {
      calls.push(['connect', o])
      if (o.cloudOrganisationId === 'org_7') throw new CloudConnectionError('HQ is connected to another Agenthix Cloud organisation.')
      return { ...o, connectedAt: 'x' }
    },
  }
})

import { runHqMachineCommand } from '../hqMachineCommands'

const HASH = 'a'.repeat(64)

beforeEach(() => { calls.length = 0 })

describe("Cloud's commands @SC-1098", () => {
  it('pass what they read to hq and answer core\'s result as data, never a link in the text', async () => {
    const first = await runHqMachineCommand('cloud-first-link', ['r_1-x'])
    expect(first).toEqual({ ok: true, text: 'Done.', data: { link: 'https://hq.example.com/invite/secret', expiresAt: 'x' } })
    expect(await runHqMachineCommand('cloud-site-register', ['machine-1', 'cloud site', HASH])).toMatchObject({ ok: true, data: { executionSiteId: 'es-1' } })
    expect(calls).toEqual([['first', 'r_1-x'], ['register', { machineId: 'machine-1', siteName: 'cloud site', credentialHash: HASH }]])
  })

  it('answer a refusal with its code', async () => {
    expect(await runHqMachineCommand('cloud-reset-link', ['avery'])).toEqual({ ok: false, code: 'not_found', error: 'No active organisation admin signs in with that username.' })
    expect(await runHqMachineCommand('cloud-admin-invite', [])).toMatchObject({ ok: false, code: 'conflict' })
    expect(await runHqMachineCommand('cloud-site-unregister', ['es-9'])).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('connect HQ to the organisation Cloud runs it for, and refuse another as a conflict @SC-1124', async () => {
    expect(await runHqMachineCommand('cloud-organisation-key', [])).toEqual({ ok: true, text: 'Done.', data: { publicKey: 'pk', clientId: 'cid', hqAddress: 'https://hq.example.com' } })
    expect(await runHqMachineCommand('cloud-organisation-connect', ['org_42', 'Acme Robotics'])).toMatchObject({ ok: true, data: { cloudOrganisationId: 'org_42', name: 'Acme Robotics' } })
    expect(await runHqMachineCommand('cloud-organisation-connect', ['org_7', 'Other'])).toMatchObject({ ok: false, code: 'conflict' })
    for (const args of [[], ['org_42'], ['org 42', 'Acme'], ['org.42', 'Acme'], ['org:42', 'Acme'], ['org_42', ' Acme'], ['org_42', 'bad\nname'], ['o'.repeat(65), 'Acme']]) {
      expect(await runHqMachineCommand('cloud-organisation-connect', args)).toMatchObject({ ok: false, code: 'usage' })
    }
  })

  it('refuse what is missing or not well formed, before anything is done', async () => {
    const bad: [string, string[]][] = [
      ['cloud-first-link', []], ['cloud-first-link', ['has space']], ['cloud-first-link', ['x'.repeat(129)]],
      ['cloud-reset-link', []], ['cloud-reset-link', ['two words']],
      ['cloud-site-register', ['machine-1', 'name']], ['cloud-site-register', ['machine-1', 'name', 'not-a-hash']],
      ['cloud-site-register', ['machine 1', 'name', HASH]], ['cloud-site-register', ['machine-1', 'bad\nname', HASH]],
      ['cloud-site-register', ['machine-1', ' padded', HASH]], ['cloud-site-register', ['machine-1', 'n'.repeat(65), HASH]],
      ['cloud-site-unregister', []], ['cloud-site-unregister', ['../x y']],
    ]
    for (const [command, args] of bad) expect(await runHqMachineCommand(command, args)).toMatchObject({ ok: false, code: 'usage' })
    expect(calls).toEqual([])
  })
})
