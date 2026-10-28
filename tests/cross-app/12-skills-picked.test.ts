// A picked skill and a typed "/" word, from hq's dispatch to the message a runtime is given (skills spec part 5
// *Picking a skill*; security review M7).
//
// hq dispatches a turn whose text starts with "/" over the real channel, and the site records it as the text it was
// sent. No harness starts on this tier, so what a runtime does with the message is the site's own start-of-turn code
// run in this process over the skills the site really staged for the dispatched run, for both runtimes
// (harness/siteStaging.ts): Claude, whose runtime would read a leading "/" as one of its commands, and OpenCode.
// Run on the pair an earlier file left, or alone (`npx vitest run 12-skills-picked`), pairing its own default site.
import { beforeAll, describe, expect, it } from 'vitest'
import { login } from './harness/hqApi'
import { ensureDefaultSite } from './harness/knowledgeSetup'
import { claudeTurn, openCodeTurn, plainTextLine, type RunSkillInputs, type StagedTurn } from './harness/siteStaging'
import { agent, call, chatRun, installedEntry, librarySkill, project, userIdOf, type MadeSkill } from './harness/skillsHq'

const stamp = Date.now().toString(36)

let token: string
let ok: MadeSkill
let quiet: MadeSkill
let manual: MadeSkill
let turns: Record<'Claude' | 'OpenCode', StagedTurn>
let plain: string

const staged = (s: MadeSkill) => `agent-${s.name}`

beforeAll(async () => {
  await ensureDefaultSite()
  token = await login('e2e-admin', 'E2eAdmin!2026')
  const adminId = await userIdOf('e2e-admin')
  const projectId = await project(token, `Skills Picked ${stamp}`)
  const agentId = await agent(token, 'Skills Picked Agent', projectId)
  ok = await librarySkill(token, `xa-pick-ok-${stamp}`, 'A skill anyone may pick.')
  quiet = await librarySkill(token, `xa-pick-quiet-${stamp}`, 'A skill only the model loads.', ['user-invocable: false'])
  manual = await librarySkill(token, `xa-pick-manual-${stamp}`, 'A skill only a person invokes.', ['disable-model-invocation: true'])
  await call('add-asset-to-agents', { assetId: ok.assetId, agentIds: [agentId] }, token)
  await call('add-asset-to-agents', { assetId: quiet.assetId, agentIds: [agentId] }, token)
  await call('add-asset-to-agents', { assetId: manual.assetId, agentIds: [agentId] }, token)

  // The turn hq dispatches, as a person typed it: a "/" word that is not a picked skill.
  const run = await chatRun(token, { userId: adminId, agentId, projectId, text: '/init' })
  expect(run.inputText).toBe('/init')
  const named = [ok, quiet, manual].map(s => installedEntry(s, 'agent')).filter(e => run.skillDigests.includes(e.digest))
  expect(named).toHaveLength(3)
  const inputs: RunSkillInputs = { place: { ownerType: 'project', ownerId: projectId }, agentId, personId: adminId, installed: named, files: [], person: [] }
  turns = { Claude: await claudeTurn(run.id, inputs), OpenCode: await openCodeTurn(run.id, inputs) }
  plain = await plainTextLine()
}, 600_000)

describe.each(['Claude', 'OpenCode'] as const)('a picked skill on %s @SC-1607', runtime => {
  it('becomes the run\'s first instruction when the person may invoke it and it is staged', () => {
    const prompt = turns[runtime].prompt('Review this change.', staged(ok))
    expect(prompt.startsWith(`The person picked the skill ${staged(ok)} `)).toBe(true)
    expect(prompt).toContain('Load it with your skill tool first')
    expect(prompt.endsWith('\n\nReview this change.')).toBe(true)
  })

  it('names the staged file to read instead when only a person may invoke it', () => {
    const prompt = turns[runtime].prompt('Review this change.', staged(manual))
    expect(prompt).toContain(`The person picked the skill ${staged(manual)} `)
    expect(prompt).toMatch(/Read the file \S+\/SKILL\.md first/)
    expect(prompt).toContain('Do not load this skill with your skill tool.')
  })

  it('is dropped, and the text kept, when the skill sets user-invocable: false', () => {
    expect(turns[runtime].prompt('Review this change.', staged(quiet))).toBe('Review this change.')
  })

  it('is dropped, and the text kept, when no skill of that name is staged for the turn', () => {
    expect(turns[runtime].prompt('Review this change.', 'agent-not-staged-here')).toBe('Review this change.')
    expect(turns[runtime].prompt('Review this change.', 'platform-init')).toBe('Review this change.')
  })
})

describe.each(['Claude', 'OpenCode'] as const)('message text beginning with "/" on %s @SC-1607', runtime => {
  it.each([
    ['a bundled command', '/init'],
    ['another bundled command with an argument', '/compact keep the last three turns'],
    ['a staged skill\'s name', '/agent-xa-pick-ok do it'],
    ['a command after leading space', '   /clear'],
  ])('reaches the runtime as plain text for %s, never starting with the command', (_what, text) => {
    const prompt = turns[runtime].prompt(text)
    expect(prompt).toBe(`${plain}\n\n${text}`)
    expect(prompt.trimStart().startsWith('/')).toBe(false)
  })

  it('keeps a picked skill\'s highlighted word in the text as plain text beside the instruction', () => {
    const prompt = turns[runtime].prompt(`/${staged(ok)} review the change`, staged(ok))
    expect(prompt.startsWith(`The person picked the skill ${staged(ok)} `)).toBe(true)
    expect(prompt).toContain(`${plain}\n\n/${staged(ok)} review the change`)
  })

  it('leaves text that does not start with "/" as it is', () => {
    expect(turns[runtime].prompt('Please run /init for me')).toBe('Please run /init for me')
  })
})
