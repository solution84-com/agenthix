/**
 * Integration tests (ADR-0094, real test DB) for the agent's Skills section (spec part 6; board A1): everything the
 * agent will see grouped by why it has it, the skills that run in its places counted, a place the viewer isn't in
 * counted and never named, and what each person may do. Not run by the lane that wrote it; the lead runs it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import { prisma } from '../../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})

import { installAsset, previewAssetInstall } from '../../../operations'
import { addAssetToAgents, setAssetEveryAgent } from '../../../lifecycle/operations'
import { contextWithRole, useTempRoots, type TempRoots } from '../../../../agents/__tests__/definitionFixtures'
import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../../test/factories'
import { getAgentSkillSet } from '../operations'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots(); await prisma.org.create({ data: { name: 'Fernhill' } }) })
afterEach(async () => { await roots.restore() })

async function install(name: string, ctx: unknown) {
  const z = new JSZip()
  z.file(`${name}/package.json`, JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name, version: '1.0.0', description: `Does ${name}` }))
  z.file(`${name}/SKILL.md`, `---\nname: ${name}\ndescription: Does ${name}. Use when asked.\n---\n\n# ${name}\n`)
  const args = { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
  const preview = await previewAssetInstall(args, ctx as never)
  return (await installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx as never)).assetId!
}

const ctxOf = (user: { id: string }) => ({ user, entities: {} }) as never

describe("an agent's Skills @board-A1 @SC-1654", () => {
  it('groups skills by why the agent has them, and offers an administrator the rest to add', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const agent = await createAgent({ name: 'Ada' })
    const everyone = await install('brand-voice', ctx)
    const hers = await install('seo-research', ctx)
    await install('qa-bug-reporting', ctx)
    await setAssetEveryAgent({ assetId: everyone, everyAgent: true }, ctx)
    await addAssetToAgents({ assetId: hers, agentIds: [agent.id] }, ctx)

    const view = await getAgentSkillSet({ agentId: agent.id }, ctx)
    expect(view.mayManage).toBe(true)
    expect(view.everyAgent.map(s => s.identity)).toEqual(['unsigned/brand-voice'])
    expect(view.thisAgent.map(s => s.identity)).toEqual(['unsigned/seo-research'])
    expect(view.addable.map(s => s.identity)).toEqual(['unsigned/qa-bug-reporting'])
    expect(view.listed.map(s => s.name)).toEqual(expect.arrayContaining(['brand-voice', 'seo-research']))
  })

  it('shows a member the same list read only, with nothing to add', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const agent = await createAgent({ name: 'Ada' })
    await install('qa-bug-reporting', ctx)
    const member = await createUserWithRole('MEMBER')
    const view = await getAgentSkillSet({ agentId: agent.id }, ctxOf(member))
    expect(view.mayManage).toBe(false)
    expect(view.addable).toEqual([])
  })

  it('counts a place\'s skills as on, off and set aside, and only for places the viewer is in', async () => {
    const agent = await createAgent({ name: 'Ada' })
    const member = await createUserWithRole('MEMBER')
    const mine = await createProject({ name: 'Website rebuild' })
    const theirs = await createProject({ name: 'Secret' })
    await joinProjectAs(mine.id, member.id, 'MEMBER')
    await prisma.projectAgent.createMany({ data: [{ projectId: mine.id, agentId: agent.id }, { projectId: theirs.id, agentId: agent.id }] })
    const fp = 'f'.repeat(64)
    const row = (path: string, over: Record<string, unknown> = {}) => ({
      placeType: 'project' as const, placeId: mine.id, path, group: 'PLACE' as const, name: path, description: 'd', lastFingerprint: fp, ...over,
    })
    await prisma.placeSkill.createMany({ data: [
      row('.agents/skills/on-one', { switch: 'ON', switchFingerprint: fp }),
      row('.agents/skills/off-one'),
      row('.agents/skills/aside', { setAsideReason: 'The organisation installs acme/aside.' }),
      row(`.agents/agents/${'x'.repeat(8)}/skills/another-agents`, { group: 'AGENT', agentId: 'someone-else', switch: 'ON', switchFingerprint: fp }),
      { ...row('.agents/skills/secret-one', { switch: 'ON', switchFingerprint: fp }), placeId: theirs.id },
    ] })

    const view = await getAgentSkillSet({ agentId: agent.id }, ctxOf(member))
    expect(view.places).toEqual([expect.objectContaining({ name: 'Website rebuild', on: 1, off: 1, setAside: 1, onNames: ['.agents/skills/on-one'] })])
    expect(view.hiddenPlaces).toBe(1)
    expect(JSON.stringify(view)).not.toContain('Secret')
    expect(view.setAside).toEqual([expect.objectContaining({ where: 'Website rebuild', reason: 'The organisation installs acme/aside.' })])
  })

  it('refuses someone with no role here, and an agent that is not there', async () => {
    const stranger = await prisma.user.create({ data: {} })
    await expect(getAgentSkillSet({ agentId: 'x' }, ctxOf(stranger))).rejects.toMatchObject({ statusCode: 403 })
    const { ctx } = await contextWithRole('ADMIN')
    await expect(getAgentSkillSet({ agentId: 'nope' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
  })
})
