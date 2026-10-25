/**
 * The secret store's rules (spec part 3): a value never comes back except through `valuesForRun`, is bound to its
 * row and place, keeps a file's bytes exactly, refuses bad names, and can't be deleted while a switched-on workflow
 * uses it. Against an in-memory database; every value is a canary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const admins = vi.hoisted(() => new Set<string>())
vi.mock('../access', async () => {
  const { refuse } = await import('../refusal')
  return {
    requireAdministerPlace: async (_p: unknown, userId: string, what: string) => {
      if (!admins.has(userId)) refuse('not_allowed', `${what} is for this project's administrators: ask one of them.`)
    },
  }
})
vi.mock('../rotation', () => ({ clearRotationNotice: async () => {} }))

import { useSecretsDb } from '../db'
import type { Place } from '../place'
import { SecretsRefusal } from '../refusal'
import {
  addSecret, deleteSecret, describeSecret, listPlaceSecretNames, listSecrets, recordUse, replaceSecret, secretHistory, valuesForRun,
} from '../store'
import { FakeSecretsDb } from './fakeSecretsDb'

const CANARY = 'CANARY-7f3a-not-a-real-secret-91c2'
const P: Place = { type: 'project', id: 'p1' }
const OTHER: Place = { type: 'project', id: 'p2' }
const ADMIN = 'admin-1'
const MEMBER = 'member-1'
const text = (t: string) => ({ kind: 'text' as const, text: t })
const DESC = { description: 'Deploys to staging over ssh', issuer: 'the staging server', renewAt: 'ops runbook' }

let db: FakeSecretsDb

beforeEach(() => {
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 7).toString('base64'))
  admins.clear()
  admins.add(ADMIN)
  db = new FakeSecretsDb()
  useSecretsDb(db)
})

afterEach(() => {
  useSecretsDb(null)
  vi.unstubAllEnvs()
})

async function refusal(p: Promise<unknown>): Promise<SecretsRefusal> {
  const err = await p.then(() => null, e => e)
  expect(err).toBeInstanceOf(SecretsRefusal)
  expect((err as Error).message).toMatch(/Nothing was changed\.$/)
  expect((err as Error).message).not.toContain(CANARY)
  return err as SecretsRefusal
}

describe('never returning a value @SC-1326', () => {
  it('keeps no plain value in what it stores, and returns none from any read but valuesForRun', async () => {
    const added = await addSecret(P, ADMIN, { name: 'STAGING_DEPLOY_KEY', value: text(CANARY), ...DESC })
    expect(db.secretRows[0].ciphertext.includes(Buffer.from(CANARY))).toBe(false)
    const reads = [added, await listSecrets(P), await secretHistory(P, 'STAGING_DEPLOY_KEY'), await listPlaceSecretNames(P)]
    for (const r of reads) {
      const json = JSON.stringify(r)
      expect(json).not.toContain(CANARY)
      expect(json).not.toContain('ciphertext')
    }
    expect(Object.keys(added)).not.toContain('ciphertext')
    expect((await valuesForRun(P, ['STAGING_DEPLOY_KEY'])).get('STAGING_DEPLOY_KEY')?.toString('utf8')).toBe(CANARY)
  })

  it('names no value in a refusal', async () => {
    await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    await refusal(addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC }))
  })
})

describe('associated data @SC-1326', () => {
  it('refuses a ciphertext copied into another secret', async () => {
    await addSecret(P, ADMIN, { name: 'A_KEY', value: text(CANARY), ...DESC })
    await addSecret(P, ADMIN, { name: 'B_KEY', value: text('other'), ...DESC })
    db.secretRows[1].ciphertext = Buffer.from(db.secretRows[0].ciphertext)
    expect((await refusal(valuesForRun(P, ['B_KEY']))).code).toBe('unreadable')
  })

  it('refuses a secret whose row was moved to another place', async () => {
    await addSecret(P, ADMIN, { name: 'A_KEY', value: text(CANARY), ...DESC })
    db.secretRows[0].place = OTHER
    expect((await refusal(valuesForRun(OTHER, ['A_KEY']))).code).toBe('unreadable')
  })
})

describe('values @SC-1327', () => {
  it('round-trips a file byte for byte, up to 48 KB', async () => {
    const bytes = Buffer.alloc(48 * 1024)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 7) % 256
    await addSecret(P, ADMIN, { name: 'DEPLOY_KEY_FILE', value: { kind: 'file', base64: bytes.toString('base64') }, ...DESC })
    expect((await listSecrets(P))[0].kind).toBe('FILE')
    expect((await valuesForRun(P, ['DEPLOY_KEY_FILE'])).get('DEPLOY_KEY_FILE')!.equals(bytes)).toBe(true)
  })

  it('keeps a typed value exactly, newlines and spaces included', async () => {
    const typed = ' line one\nline two \n'
    await addSecret(P, ADMIN, { name: 'TYPED', value: text(typed), ...DESC })
    expect((await valuesForRun(P, ['TYPED'])).get('TYPED')!.toString('utf8')).toBe(typed)
  })

  it('refuses a file over 48 KB, an empty value and a broken upload', async () => {
    const big = Buffer.alloc(48 * 1024 + 1).toString('base64')
    await refusal(addSecret(P, ADMIN, { name: 'BIG', value: { kind: 'file', base64: big }, ...DESC }))
    await refusal(addSecret(P, ADMIN, { name: 'EMPTY', value: text(''), ...DESC }))
    await refusal(addSecret(P, ADMIN, { name: 'BROKEN', value: { kind: 'file', base64: 'abc$' }, ...DESC }))
    expect(db.secretRows).toHaveLength(0)
  })

  it('asks every secret to say what it is', async () => {
    await refusal(addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), description: '  ' }))
  })
})

describe('names @SC-1327', () => {
  it.each(['ssh_key', '1KEY', 'KEY-1', '', 'GITHUB_TOKEN'])('refuses the secret name %j', async name => {
    expect((await refusal(addSecret(P, ADMIN, { name, value: text(CANARY), ...DESC }))).code).toBe('invalid')
    expect(db.secretRows).toHaveLength(0)
  })
})

describe('who writes @SC-1328', () => {
  it('refuses anyone but the place’s administrators, and changes nothing', async () => {
    await refusal(addSecret(P, MEMBER, { name: 'KEY', value: text(CANARY), ...DESC }))
    await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    await refusal(replaceSecret(P, MEMBER, 'KEY', text('new')))
    await refusal(deleteSecret(P, MEMBER, 'KEY'))
    await refusal(describeSecret(P, MEMBER, 'KEY', { description: 'x' }))
    expect((await valuesForRun(P, ['KEY'])).get('KEY')!.toString()).toBe(CANARY)
  })
})

describe('replacing @SC-1329', () => {
  it('keeps the name, description and record; the next run gets the new value', async () => {
    const first = await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC, rotateBy: new Date(Date.now() + 86_400_000) })
    const second = await replaceSecret(P, ADMIN, 'KEY', { kind: 'file', base64: Buffer.from('CANARY-new').toString('base64') })
    expect(second.id).toBe(first.id)
    expect(second.description).toBe(DESC.description)
    expect(second.kind).toBe('FILE')
    expect(second.rotateBy).toBeNull()
    expect((await valuesForRun(P, ['KEY'])).get('KEY')!.toString()).toBe('CANARY-new')
    expect((await secretHistory(P, 'KEY')).map(r => r.action)).toEqual(['REPLACED', 'SET'])
  })
})

describe('deleting @SC-1329', () => {
  const uses = (enabled: boolean, extra: Partial<{ githubSecretNames: string[] }> = {}) => ({
    workflowId: 'w1', workflowName: 'deploy-staging', enabled,
    definition: { steps: [{ name: 'upload', run: './up.sh', secrets: ['KEY'] }], variables: [] },
    githubSecretNames: [], ...extra,
  })

  it('is refused while a switched-on workflow’s approved version names it, naming the workflow', async () => {
    await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    db.approve(P, uses(true))
    const err = await refusal(deleteSecret(P, ADMIN, 'KEY'))
    expect(err.code).toBe('in_use')
    expect(err.workflows).toEqual(['deploy-staging'])
    expect(err.message).toContain('deploy-staging')
    expect(db.secretRows).toHaveLength(1)
  })

  it('counts a name set-github-secrets was approved for', async () => {
    await addSecret(P, ADMIN, { name: 'NPM_PUBLISH', value: text(CANARY), ...DESC })
    db.approve(P, { ...uses(true), definition: { steps: [{ secrets: [] }] }, githubSecretNames: ['NPM_PUBLISH'] })
    expect((await refusal(deleteSecret(P, ADMIN, 'NPM_PUBLISH'))).code).toBe('in_use')
  })

  it('goes once that workflow is off, and keeps its record without the row', async () => {
    const added = await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    db.approve(P, uses(false))
    await deleteSecret(P, ADMIN, 'KEY')
    expect(db.secretRows).toHaveLength(0)
    const history = await secretHistory(P, 'KEY')
    expect(history.map(r => [r.action, r.byUserId])).toEqual([['DELETED', ADMIN], ['SET', ADMIN]])
    expect(history.every(r => r.secretId !== added.id)).toBe(true)
  })

  it('is not stopped by another place’s workflow', async () => {
    await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    db.approve(OTHER, uses(true))
    await deleteSecret(P, ADMIN, 'KEY')
    expect(db.secretRows).toHaveLength(0)
  })
})

describe('valuesForRun @SC-1330', () => {
  it('skips an integration’s name and refuses a name the place lacks', async () => {
    await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    expect([...(await valuesForRun(P, ['KEY', 'GITHUB_TOKEN'])).keys()]).toEqual(['KEY'])
    expect((await refusal(valuesForRun(P, ['KEY', 'MISSING']))).code).toBe('not_found')
    expect((await refusal(valuesForRun(OTHER, ['KEY']))).code).toBe('not_found')
  })
})

describe('the record of use @SC-1330', () => {
  it('records each run that used a secret, never its value', async () => {
    const added = await addSecret(P, ADMIN, { name: 'KEY', value: text(CANARY), ...DESC })
    await recordUse(P, 'run-1', ['KEY', 'GITHUB_TOKEN'], MEMBER)
    const used = db.recordRows.filter(r => r.action === 'USED')
    expect(used.map(r => [r.secretName, r.secretId, r.runId, r.byUserId])).toEqual([
      ['KEY', added.id, 'run-1', MEMBER], ['GITHUB_TOKEN', null, 'run-1', MEMBER],
    ])
    expect(JSON.stringify(db.recordRows)).not.toContain(CANARY)
  })
})
