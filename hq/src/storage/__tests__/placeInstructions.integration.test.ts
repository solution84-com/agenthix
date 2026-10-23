/**
 * An agent's instructions in a place (every screen reviewed spec §3), against
 * the real test database with the site's file store as the stand-in. The rules:
 * a project's read is the project's own Files, for its members only, checked
 * before the site is asked; anywhere else it is the caller's own Files; a
 * person's instructions are never read into a project.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationRef } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'

const files = vi.hoisted(() => new Map<string, string>())
const asked = vi.hoisted(() => [] as string[])
const h = vi.hoisted(() => {
  const key = (loc: { ownerType: string; ownerId: string }, rel: string) => `${loc.ownerType}:${loc.ownerId}/${rel}`
  return {
    statFileOnSite: vi.fn(async (loc: LocationRef, rel: string) => {
      asked.push(`${loc.ownerType}:${loc.ownerId}`)
      const text = files.get(key(loc, rel))
      if (text === undefined) throw new (await import('@agenthix/core')).LocationFileError('not_found', 'missing')
      return { name: rel, kind: 'file', size: Buffer.byteLength(text), modifiedAt: '2026-10-06T00:00:00.000Z' }
    }),
    readFileOnSite: vi.fn(async (loc: LocationRef, rel: string) => Buffer.from(files.get(key(loc, rel)) ?? '')),
    listFilesOnSite: vi.fn(async (loc: LocationRef, dir: string) => {
      asked.push(`${loc.ownerType}:${loc.ownerId}`)
      const prefix = key(loc, `${dir}/`)
      const names = new Set([...files.keys()].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length).split('/')[0]))
      return { entries: [...names].map(name => ({ name, kind: 'directory', size: 0, modifiedAt: '2026-10-06T00:00:00.000Z' })) }
    }),
  }
})

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../locationFileStore', () => h)
vi.mock('../../packages/agentPackageService', () => ({ readAgentContent: vi.fn(async () => ({ instructions: 'The organisation says this.', skillFiles: [] })) }))

import { getPlaceInstructions } from '../placeInstructions'

const as = (user: { id: string }) => ({ user, entities: {} }) as any

beforeEach(() => {
  files.clear()
  asked.length = 0
})

describe("an agent's instructions in a place @SC-577", () => {
  it("reads a project's AGENTS.md, its skills, and the agent's own file there, after the organisation's", async () => {
    const project = await createProject()
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    const agent = await createAgent()
    files.set(`project:${project.id}/AGENTS.md`, 'Previews only.')
    files.set(`project:${project.id}/.agents/skills/seo-audit/SKILL.md`, 'x')
    files.set(`project:${project.id}/.agents/agents/${agent.id}/instructions.md`, 'Use src/ui.')
    files.set(`user:${member.id}/AGENTS.md`, 'My own words.')

    const view = await getPlaceInstructions({ projectId: project.id, agentId: agent.id }, as(member))

    expect(view.place).toEqual({ kind: 'project', ownerType: 'project', ownerId: project.id })
    expect(view.organisation).toEqual({ instructions: 'The organisation says this.' })
    expect(view.everyAgent).toEqual({ file: { path: 'AGENTS.md', text: 'Previews only.', modifiedAt: '2026-10-06T00:00:00.000Z', tooLarge: false }, skills: ['seo-audit'] })
    expect(view.forAgent?.file).toMatchObject({ path: `.agents/agents/${agent.id}/instructions.md`, text: 'Use src/ui.' })
    expect(new Set(asked)).toEqual(new Set([`project:${project.id}`]))
  })

  it("reads the caller's own Files when no project is named, and says when a file is missing", async () => {
    const me = await createUser()
    const agent = await createAgent()
    files.set(`user:${me.id}/AGENTS.md`, 'British spelling.')

    const view = await getPlaceInstructions({ agentId: agent.id }, as(me))

    expect(view.place).toEqual({ kind: 'personal', ownerType: 'user', ownerId: me.id })
    expect(view.everyAgent.file.text).toBe('British spelling.')
    expect(view.forAgent?.file).toMatchObject({ text: null, tooLarge: false })
    expect(new Set(asked)).toEqual(new Set([`user:${me.id}`]))
  })

  it("reads a personal project as its person's own Files", async () => {
    const me = await createUser()
    const personal = await createProject({ personalOwnerId: me.id, personalSpace: true, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: me.id, role: 'ADMIN' } })

    const view = await getPlaceInstructions({ projectId: personal.id }, as(me))

    expect(view.place).toEqual({ kind: 'personal', ownerType: 'user', ownerId: me.id })
    expect(view.forAgent).toBeNull()
  })

  it("reads another personal project as the project's own Files", async () => {
    const me = await createUser()
    const personal = await createProject({ personalOwnerId: me.id, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: me.id, role: 'ADMIN' } })

    const view = await getPlaceInstructions({ projectId: personal.id }, as(me))

    expect(view.place).toEqual({ kind: 'project', ownerType: 'project', ownerId: personal.id })
  })

  it("refuses a project to someone not on it, open or private, before the site is asked", async () => {
    const project = await createProject({ accessLevel: 'PRIVATE' })
    const outsider = await createUser()

    await expect(getPlaceInstructions({ projectId: project.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404 })
    expect(asked).toEqual([])
  })

  it("never reads another person's personal project", async () => {
    const owner = await createUser()
    const personal = await createProject({ personalOwnerId: owner.id, personalSpace: true, accessLevel: 'PRIVATE' })
    const someoneElse = await createUser()

    await expect(getPlaceInstructions({ projectId: personal.id }, as(someoneElse))).rejects.toMatchObject({ statusCode: 404 })
    expect(asked).toEqual([])
  })

  it('answers 404 for an agent that does not exist', async () => {
    const me = await createUser()
    await expect(getPlaceInstructions({ agentId: 'no-such-agent' }, as(me))).rejects.toMatchObject({ statusCode: 404 })
  })
})

