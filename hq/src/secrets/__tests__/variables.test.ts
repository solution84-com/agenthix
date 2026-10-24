/** A place's variables: names by core's rules, every change kept old → new, and the *looks like a secret* question. */
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

import { useSecretsDb } from '../db'
import type { Place } from '../place'
import { SecretsRefusal } from '../refusal'
import {
  LOOKS_LIKE_A_SECRET_QUESTION, addVariable, deleteVariable, editVariable, listPlaceVariableNames, variableHistory, variableValuesForRun,
} from '../variables'
import { FakeSecretsDb } from './fakeSecretsDb'

const P: Place = { type: 'project', id: 'p1' }
const ADMIN = 'admin-1'
let db: FakeSecretsDb

beforeEach(() => {
  admins.clear()
  admins.add(ADMIN)
  db = new FakeSecretsDb()
  useSecretsDb(db)
})
afterEach(() => useSecretsDb(null))

async function refusal(p: Promise<unknown>): Promise<SecretsRefusal> {
  const err = await p.then(() => null, e => e)
  expect(err).toBeInstanceOf(SecretsRefusal)
  expect((err as Error).message).toMatch(/Nothing was changed\.$/)
  return err as SecretsRefusal
}

describe('variables', () => {
  it('keeps every change old → new, with who', async () => {
    await addVariable(P, ADMIN, 'STAGING_HOST', 'staging.example.com')
    await editVariable(P, ADMIN, 'STAGING_HOST', 'staging2.example.com')
    db.approve(P, { workflowId: 'w', workflowName: 'deploy', enabled: false, definition: { variables: ['STAGING_HOST'] }, githubSecretNames: [] })
    await deleteVariable(P, ADMIN, 'STAGING_HOST')
    expect((await variableHistory(P, 'STAGING_HOST')).map(c => [c.action, c.oldValue, c.newValue, c.byUserId])).toEqual([
      ['DELETED', 'staging2.example.com', null, ADMIN],
      ['CHANGED', 'staging.example.com', 'staging2.example.com', ADMIN],
      ['SET', null, 'staging.example.com', ADMIN],
    ])
  })

  it.each(['PATH', 'HOME', 'LD_PRELOAD', 'GIT_DIR', 'SSH_AUTH_SOCK', 'NODE_OPTIONS', 'GITHUB_TOKEN', 'NPM_CONFIG_REGISTRY', 'lower'])(
    'refuses the name %s', async name => {
      expect((await refusal(addVariable(P, ADMIN, name, 'x'))).code).toBe('invalid')
      expect(db.variableRows).toHaveLength(0)
    })

  it('holds back a value that looks like a secret until the person says it is not one', async () => {
    const value = 'ghp_CANARYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const held = await addVariable(P, ADMIN, 'TOKENISH', value)
    expect(held).toMatchObject({ saved: false, question: LOOKS_LIKE_A_SECRET_QUESTION })
    expect(db.variableRows).toHaveLength(0)
    expect(await addVariable(P, ADMIN, 'TOKENISH', value, { notASecret: true })).toMatchObject({ saved: true })
    await addVariable(P, ADMIN, 'PLAIN', 'eu-west-2')
    expect(await editVariable(P, ADMIN, 'PLAIN', '-----BEGIN PRIVATE KEY-----')).toMatchObject({ saved: false })
    expect((await variableValuesForRun(P, ['PLAIN'])).PLAIN).toBe('eu-west-2')
  })

  it('refuses a second variable of the same name, and anyone but an administrator', async () => {
    await addVariable(P, ADMIN, 'REGION', 'eu-west-2')
    expect((await refusal(addVariable(P, ADMIN, 'REGION', 'us-east-1'))).code).toBe('exists')
    expect((await refusal(editVariable(P, 'member-1', 'REGION', 'us-east-1'))).code).toBe('not_allowed')
    expect(await listPlaceVariableNames(P)).toEqual(['REGION'])
  })

  it('refuses deleting one a switched-on workflow uses', async () => {
    await addVariable(P, ADMIN, 'REGION', 'eu-west-2')
    db.approve(P, { workflowId: 'w', workflowName: 'deploy', enabled: true, definition: { variables: ['REGION'] }, githubSecretNames: [] })
    expect((await refusal(deleteVariable(P, ADMIN, 'REGION'))).workflows).toEqual(['deploy'])
  })

  it('gives a run the values it names, refusing one the place lacks', async () => {
    await addVariable(P, ADMIN, 'REGION', 'eu-west-2')
    expect(await variableValuesForRun(P, ['REGION'])).toEqual({ REGION: 'eu-west-2' })
    expect((await refusal(variableValuesForRun(P, ['REGION', 'HOSTNAME']))).code).toBe('not_found')
  })
})
