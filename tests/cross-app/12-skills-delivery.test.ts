// Skills reaching a run's staging across a real hq and a real site (skills spec part 4 *The person's skills*, part 5
// *Delivery per turn*; adr-0072, adr-0084, adr-0156, adr-0157, adr-0159).
//
// hq dispatches turns to the site over the real channel. A run on this tier fails at launch (no agent image, no
// credential), so no harness starts; what is observable is (1) the row the site makes for the dispatch, which records
// the digest of every installed and personal skill the dispatch named, (2) the site's package cache, where hq's
// delivered content must be, and (3) what the site's own staging does with them: the start-of-turn functions both
// runtimes call are run in this process on the site's code, over the site's real cache and database, for the
// dispatched run (harness/siteStaging.ts). The entries given to staging are the ones hq names for a skill (its record
// of the asset or version) kept only when their digest is among those the site recorded for that run, so a skill hq
// did not name is not staged.
//
// Runs on the pair an earlier file left, or alone (`npx vitest run 12-skills-delivery`), pairing its own default site.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { hqDb, siteDb } from './harness/db'
import { login } from './harness/hqApi'
import { ensureDefaultSite } from './harness/knowledgeSetup'
import { claudeTurn, openCodeTurn, type RunSkillInputs } from './harness/siteStaging'
import {
  agent, call, chatRun, installedEntry, librarySkill, placeSkill, project, switchOn, taskRun, userIdOf, yourSpace,
  type MadeSkill, type SiteRun,
} from './harness/skillsHq'

const stamp = Date.now().toString(36)
const named = (what: string) => `xa-${what}-${stamp}`

let adminToken: string
let adminId: string
let operatorId: string
let projectId: string
let agentA: string
let agentB: string
let everyAgentSkill: MadeSkill
let agentASkill: MadeSkill
let unusedSkill: MadeSkill
let builtIn: { assetId: string; name: string; digest: string; version: string; versionId: string; identity: string }
let place: { ownerType: 'project'; ownerId: string }

/** What hq names for installed skills, as the dispatch carries them, kept to the digests the site recorded. */
function installedFor(run: SiteRun, level: Record<string, 'org' | 'agent' | 'builtin'>, all: MadeSkill[]) {
  return all.filter(s => level[s.assetId]).map(s => installedEntry(s, level[s.assetId])).filter(e => run.skillDigests.includes(e.digest))
}

function inputs(installed: ReturnType<typeof installedFor>, person: RunSkillInputs['person'] = []): RunSkillInputs {
  return { place, agentId: agentA, personId: adminId, installed, files: [], person }
}

beforeAll(async () => {
  await ensureDefaultSite()
  adminToken = await login('e2e-admin', 'E2eAdmin!2026')
  adminId = await userIdOf('e2e-admin')
  operatorId = await userIdOf('e2e-operator')
  projectId = await project(adminToken, `Skills Delivery ${stamp}`, [operatorId])
  place = { ownerType: 'project', ownerId: projectId }
  agentA = await agent(adminToken, 'Skills Agent A', projectId)
  agentB = await agent(adminToken, 'Skills Agent B', projectId)

  everyAgentSkill = await librarySkill(adminToken, named('every'), 'Used by every agent.')
  agentASkill = await librarySkill(adminToken, named('agent-a'), 'Used by the first agent only.')
  unusedSkill = await librarySkill(adminToken, named('nobody'), 'Given to nobody.')
  await call('set-asset-every-agent', { assetId: everyAgentSkill.assetId, everyAgent: true }, adminToken)
  await call('add-asset-to-agents', { assetId: agentASkill.assetId, agentIds: [agentA] }, adminToken)

  // A built-in hq's image installed at boot that every run gets unless it is switched off, and not the one that
  // only applies in a git repository.
  const row = await hqDb.asset.findFirstOrThrow({
    where: { kind: 'SKILL', builtIn: true, removedAt: null, switchedOff: false, currentVersionId: { not: null }, name: { not: 'working-with-git' } },
    include: { currentVersion: true },
  })
  const v = row.currentVersion!
  builtIn = { assetId: row.id, name: row.name, digest: v.digest, version: v.version, versionId: v.id, identity: `${row.publisher}/${row.name}` }
}, 600_000)

afterAll(async () => {
  await call('set-built-in-skill-switch', { assetId: builtIn.assetId, on: true }, adminToken).catch(() => {})
  await call('update-asset-settings', { personalSkillsOutsideSpace: true }, adminToken).catch(() => {})
})

describe('an installed skill reaches the run of an agent that has it, by digest @SC-1650', () => {
  it('names the skills every agent has and the agent\'s own to that agent\'s run, and no skill given to nobody', async () => {
    const run = await chatRun(adminToken, { userId: adminId, agentId: agentA, projectId, text: 'Hello' })
    expect(run.skillDigests).toContain(everyAgentSkill.digest)
    expect(run.skillDigests).toContain(agentASkill.digest)
    expect(run.skillDigests).toContain(builtIn.digest)
    expect(run.skillDigests).not.toContain(unusedSkill.digest)
  })

  it('stages them for that run under their level\'s names, from the content hq delivered, and records the fingerprints', async () => {
    const run = await chatRun(adminToken, { userId: adminId, agentId: agentA, projectId, text: 'Stage these' })
    const levels = { [everyAgentSkill.assetId]: 'org', [agentASkill.assetId]: 'agent', [unusedSkill.assetId]: 'agent' } as const
    const entries = [
      ...installedFor(run, levels, [everyAgentSkill, agentASkill, unusedSkill]),
      installedEntry({ ...builtIn }, 'builtin'),
    ].filter(e => run.skillDigests.includes(e.digest))
    for (const turn of [await claudeTurn(run.id, inputs(entries)), await openCodeTurn(run.id, inputs(entries))]) {
      expect(turn.names).toContain(`org-${everyAgentSkill.name}`)
      expect(turn.names).toContain(`agent-${agentASkill.name}`)
      expect(turn.names).toContain(`platform-${builtIn.name}`)
      expect(turn.names).not.toContain(`agent-${unusedSkill.name}`)
    }
    const used = (await siteDb.agentRun.findUniqueOrThrow({ where: { id: run.id } })).skillsUsed as { name: string; fingerprint: string; refused?: string }[]
    expect(used.find(u => u.name === `org-${everyAgentSkill.name}`)).toMatchObject({ fingerprint: everyAgentSkill.digest })
    expect(used.filter(u => u.refused)).toEqual([])
  })

  it('does not name the first agent\'s own skill to another agent\'s run', async () => {
    const run = await chatRun(adminToken, { userId: adminId, agentId: agentB, projectId, text: 'Hello' })
    expect(run.skillDigests).toContain(everyAgentSkill.digest)
    expect(run.skillDigests).not.toContain(agentASkill.digest)
    // Handed to staging anyway, it is not in the content hq delivered for this run's digests: nothing of it stages.
    const turn = await claudeTurn(run.id, inputs(installedFor(run, { [everyAgentSkill.assetId]: 'org', [agentASkill.assetId]: 'agent' }, [everyAgentSkill, agentASkill])))
    expect(turn.names).toContain(`org-${everyAgentSkill.name}`)
    expect(turn.names).not.toContain(`agent-${agentASkill.name}`)
  })
})

describe('a built-in switched off is not given to the run @SC-1634', () => {
  it('leaves it out of the dispatch and out of staging, and gives it again when switched back on', async () => {
    await call('set-built-in-skill-switch', { assetId: builtIn.assetId, on: false }, adminToken)
    const off = await chatRun(adminToken, { userId: adminId, agentId: agentA, projectId, text: 'Without it' })
    expect(off.skillDigests).not.toContain(builtIn.digest)
    expect(off.skillDigests).toContain(everyAgentSkill.digest)
    const staged = await claudeTurn(off.id, inputs(installedFor(off, { [everyAgentSkill.assetId]: 'org' }, [everyAgentSkill])))
    expect(staged.names).not.toContain(`platform-${builtIn.name}`)

    await call('set-built-in-skill-switch', { assetId: builtIn.assetId, on: true }, adminToken)
    const on = await chatRun(adminToken, { userId: adminId, agentId: agentA, projectId, text: 'With it' })
    expect(on.skillDigests).toContain(builtIn.digest)
  })
})

describe('a person\'s own skill follows them into their own conversation only @SC-1649', () => {
  let personal: Awaited<ReturnType<typeof placeSkill>>
  let personalDigest: string
  let personalVersionId: string

  beforeAll(async () => {
    const space = await yourSpace(adminId)
    personal = await placeSkill(adminToken, space, named('mine'), 'The first person\'s own way of working.')
    await switchOn(adminToken, personal.id)
    const version = await hqDb.placeSkillVersion.findFirstOrThrow({ where: { placeSkillId: personal.id }, orderBy: { number: 'desc' } })
    personalDigest = version.digest
    personalVersionId = version.id
    expect(personalDigest).toBe(personal.fingerprint)
  }, 120_000)

  const personEntry = () => ({
    identity: `${adminId}/${personal.name}`, version: String(personal.version), digest: personalDigest,
    ref: { kind: 'skill' as const, key: personalVersionId, digest: personalDigest },
  })

  it('reaches the person\'s own conversation, in a project, and stages as theirs', async () => {
    const run = await chatRun(adminToken, { userId: adminId, agentId: agentA, projectId, text: 'Mine, please' })
    expect(run.skillDigests).toContain(personalDigest)
    const turn = await claudeTurn(run.id, inputs([], [personEntry()]))
    expect(turn.names).toContain(`person-${personal.name}`)
    const used = (await siteDb.agentRun.findUniqueOrThrow({ where: { id: run.id } })).skillsUsed as { name: string; personId?: string }[]
    expect(used.find(u => u.name === `person-${personal.name}`)).toMatchObject({ personId: adminId })
  })

  it('does not reach a conversation someone else holds', async () => {
    const operatorToken = await login('e2e-operator', 'E2eOperator!2026')
    const run = await chatRun(operatorToken, { userId: operatorId, agentId: agentA, projectId, text: 'Not yours' })
    expect(run.skillDigests).not.toContain(personalDigest)
    expect(run.skillDigests).toContain(everyAgentSkill.digest)
  })

  it('does not reach a task\'s run, which is not a conversation', async () => {
    const run = await taskRun(adminToken, { agentId: agentA, projectId, title: `Personal skills ${stamp}` })
    expect(run.skillDigests).not.toContain(personalDigest)
    expect(run.skillDigests).toContain(everyAgentSkill.digest)
  })

  it('stops following the person outside Your space when the organisation turns that off', async () => {
    await call('update-asset-settings', { personalSkillsOutsideSpace: false }, adminToken)
    try {
      const run = await chatRun(adminToken, { userId: adminId, agentId: agentA, projectId, text: 'Off' })
      expect(run.skillDigests).not.toContain(personalDigest)
    } finally {
      await call('update-asset-settings', { personalSkillsOutsideSpace: true }, adminToken)
    }
  })
})
