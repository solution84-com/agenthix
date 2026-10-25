/**
 * The secret store against the real test database (spec part 3): what a row holds, who may read and write through
 * the operations, a ciphertext refused in another row, deletion refused while a switched-on workflow uses it, the
 * rotation notice, and a project's secrets going with it. Every value is a canary.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

import { deleteProject } from '../../projects/projectService'
import {
  addPlaceSecret, addPlaceVariable, deletePlaceSecret, editPlaceVariable, getPlaceSecretHistory, getPlaceSecrets,
  getPlaceVariableHistory, getPlaceVariables, replacePlaceSecret,
} from '../operations'
import { SECRET_ROTATION_NOTIFICATION, sweepRotationNotices } from '../rotation'
import { valuesForRun } from '../store'

const CANARY = 'CANARY-5d1e-not-a-real-secret-0b77'
const ctx = (user?: { id: string }) => ({ user }) as any
const DESC = { description: 'Deploys to staging over ssh', issuer: 'the staging server', renewAt: '' }

let admin: { id: string }
let member: { id: string }
let outsider: { id: string }
let place: { type: 'project'; id: string }

beforeEach(async () => {
  admin = await createUserWithRole('MEMBER', { displayName: 'Sam' })
  member = await createUserWithRole('MEMBER')
  outsider = await createUserWithRole('ADMIN')
  const project = await createProject()
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, member.id, 'VIEWER')
  place = { type: 'project', id: project.id }
})

async function approvedWorkflow(name: string, enabled: boolean, secrets: string[], variables: string[] = []) {
  const workflow = await prisma.workflow.create({ data: { placeType: 'project', placeId: place.id, name, enabled } })
  await prisma.workflowVersion.create({
    data: {
      workflowId: workflow.id, number: 1, hash: 'a'.repeat(64), executorImageDigest: `sha256:${'b'.repeat(64)}`, state: 'APPROVED',
      definition: { name, steps: [{ name: 'go', run: './go.sh', secrets, timeoutSeconds: null }], variables },
    },
  })
  return workflow
}

describe('secrets through the operations', () => {
  it('stores the value encrypted and shows members everything but it @SC-1326 @SC-1328', async () => {
    await addPlaceSecret({ place, name: 'STAGING_DEPLOY_KEY', value: { kind: 'text', text: CANARY }, ...DESC }, ctx(admin))
    const row = await prisma.placeSecret.findFirstOrThrow({ where: { placeId: place.id } })
    expect(Buffer.from(row.ciphertext).includes(Buffer.from(CANARY))).toBe(false)
    const view = await getPlaceSecrets({ place }, ctx(member))
    expect(view.mayChange).toBe(false)
    expect(view.secrets.map(s => [s.name, s.kind, s.changedBy?.name])).toEqual([['STAGING_DEPLOY_KEY', 'text', 'Sam']])
    const history = await getPlaceSecretHistory({ place, name: 'STAGING_DEPLOY_KEY' }, ctx(member))
    expect(JSON.stringify([view, history])).not.toContain(CANARY)
    expect((await valuesForRun(place, ['STAGING_DEPLOY_KEY'])).get('STAGING_DEPLOY_KEY')!.toString()).toBe(CANARY)
  })

  it('refuses a member’s write, and an outsider’s read, organisation admin or not @SC-1328', async () => {
    await expect(addPlaceSecret({ place, name: 'K', value: { kind: 'text', text: CANARY }, ...DESC }, ctx(member)))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(getPlaceSecrets({ place }, ctx(outsider))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.placeSecret.count()).toBe(0)
  })

  it('refuses a ciphertext copied into another secret’s row @SC-1326', async () => {
    await addPlaceSecret({ place, name: 'A_KEY', value: { kind: 'text', text: CANARY }, ...DESC }, ctx(admin))
    await addPlaceSecret({ place, name: 'B_KEY', value: { kind: 'text', text: 'other' }, ...DESC }, ctx(admin))
    const a = await prisma.placeSecret.findFirstOrThrow({ where: { name: 'A_KEY' } })
    await prisma.placeSecret.updateMany({ where: { name: 'B_KEY' }, data: { ciphertext: a.ciphertext } })
    await expect(valuesForRun(place, ['B_KEY'])).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('round-trips a file, and refuses deleting a secret a switched-on workflow uses @SC-1327 @SC-1329', async () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 10])
    await addPlaceSecret({ place, name: 'KEY_FILE', value: { kind: 'file', base64: bytes.toString('base64') }, ...DESC }, ctx(admin))
    expect((await valuesForRun(place, ['KEY_FILE'])).get('KEY_FILE')!.equals(bytes)).toBe(true)
    const wf = await approvedWorkflow('deploy-staging', true, ['KEY_FILE'])
    await expect(deletePlaceSecret({ place, name: 'KEY_FILE' }, ctx(admin))).rejects.toMatchObject({ statusCode: 409 })
    expect((await getPlaceSecrets({ place }, ctx(admin))).secrets[0].usedBy.map(w => w.name)).toEqual(['deploy-staging'])
    await prisma.workflow.update({ where: { id: wf.id }, data: { enabled: false } })
    await deletePlaceSecret({ place, name: 'KEY_FILE' }, ctx(admin))
    expect(await prisma.placeSecret.count()).toBe(0)
    expect((await prisma.secretRecord.findMany({ orderBy: { at: 'asc' } })).map(r => r.action)).toEqual(['SET', 'DELETED'])
  })

  it('records a replacement, keeping the row @SC-1329', async () => {
    await addPlaceSecret({ place, name: 'KEY', value: { kind: 'text', text: CANARY }, ...DESC }, ctx(admin))
    const before = await prisma.placeSecret.findFirstOrThrow({})
    await replacePlaceSecret({ place, name: 'KEY', value: { kind: 'text', text: 'CANARY-2' } }, ctx(admin))
    expect((await prisma.placeSecret.findFirstOrThrow({})).id).toBe(before.id)
    expect((await valuesForRun(place, ['KEY'])).get('KEY')!.toString()).toBe('CANARY-2')
  })
})

describe('variables through the operations @SC-1332', () => {
  it('keeps old → new, and asks about a value that looks like a secret', async () => {
    await addPlaceVariable({ place, name: 'STAGING_HOST', value: 'staging.example.com' }, ctx(admin))
    const held = await editPlaceVariable({ place, name: 'STAGING_HOST', value: 'ghp_CANARYaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, ctx(admin))
    expect(held.saved).toBe(false)
    await editPlaceVariable({ place, name: 'STAGING_HOST', value: 'staging2.example.com' }, ctx(admin))
    expect((await getPlaceVariables({ place }, ctx(member))).variables.map(v => v.value)).toEqual(['staging2.example.com'])
    const history = await getPlaceVariableHistory({ place, name: 'STAGING_HOST' }, ctx(member))
    expect(history.map(c => [c.action, c.oldValue, c.newValue])).toEqual([
      ['changed', 'staging.example.com', 'staging2.example.com'], ['set', null, 'staging.example.com'],
    ])
    await expect(addPlaceVariable({ place, name: 'PATH', value: '/bin' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('rotation and deletion', () => {
  it('tells the place’s administrators a week before, and clears it once replaced @SC-1331', async () => {
    await addPlaceSecret({ place, name: 'KEY', value: { kind: 'text', text: CANARY }, ...DESC, rotateBy: new Date(Date.now() + 3 * 86_400_000) }, ctx(admin))
    await sweepRotationNotices()
    const open = await prisma.notification.findMany({ where: { type: SECRET_ROTATION_NOTIFICATION } })
    expect(open.map(n => [n.userId, n.status])).toEqual([[admin.id, 'unread']])
    await replacePlaceSecret({ place, name: 'KEY', value: { kind: 'text', text: 'CANARY-2' } }, ctx(admin))
    await sweepRotationNotices()
    expect((await prisma.notification.findFirstOrThrow({ where: { type: SECRET_ROTATION_NOTIFICATION } })).status).toBe('handled')
  })

  it('deletes a project’s secrets, variables, workflows and their records with it @SC-1329', async () => {
    await addPlaceSecret({ place, name: 'KEY', value: { kind: 'text', text: CANARY }, ...DESC }, ctx(admin))
    await addPlaceVariable({ place, name: 'REGION', value: 'eu-west-2' }, ctx(admin))
    await approvedWorkflow('deploy', true, ['KEY'])
    await deleteProject(place.id)
    expect([await prisma.placeSecret.count(), await prisma.secretRecord.count(), await prisma.placeVariable.count(), await prisma.placeVariableChange.count()])
      .toEqual([0, 0, 0, 0])
    expect([await prisma.workflow.count(), await prisma.workflowVersion.count()]).toEqual([0, 0])
  })
})
