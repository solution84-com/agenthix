import { describe, expect, it } from 'vitest'
import { runContextParams } from '../dispatchParams'

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', role: null, runtime: 'claude-sdk', approval: 'immediate', defaultModel: 'm', allowedTools: null, allowedBashPatterns: null, isKernel: true }
const base = { agent, mounts: { ownerSlugs: {} }, riskRules: null, credential: null, packages: {
  agent: { kind: 'agent', key: 'a', digest: 'a'.repeat(64) }, org: null, platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
} }
const codeWork = {
  workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  copyId: '11111111-1111-4111-8111-111111111111', branch: 'add-login-page', main: 'main', behindMain: 0, otherBranches: [],
  author: { name: 'Kernel', email: 'kernel@agents.hq.example' }, onBehalfOf: { name: 'Mia', email: 'mia@people.hq.example' },
}

describe('a run\'s code work, as dispatch carries it @SC-1731', () => {
  it('is accepted in core\'s shape', () => {
    expect(runContextParams.safeParse({ ...base, codeWork }).success).toBe(true)
  })

  it("keeps the live preview whose own copy a run on another site works in", () => {
    const livePreviewId = 'e78fcb41-6a6a-40fd-a080-771bf7c75b89'
    const parsed = runContextParams.safeParse({ ...base, codeWork: { ...codeWork, livePreviewId } })
    expect(parsed.success && parsed.data.codeWork?.livePreviewId).toBe(livePreviewId)
  })

  it.each([
    ['a live preview id with a path in it', { livePreviewId: '../lp' }],
    ['a copy id that is not a uuid', { copyId: '../../etc' }],
    ['a branch name Git would read as an option', { branch: '--upload-pack=x' }],
    ['a main that is an expression', { main: 'HEAD~1' }],
    ['no author for the run-end commit', { author: undefined }],
    ['an author name that would break the commit header', { author: { name: 'K <x@y>', email: 'k@a.b' } }],
    ['a person whose address is not one', { onBehalfOf: { name: 'Mia', email: 'not an address' } }],
  ])('refuses %s', (_, change) => {
    expect(runContextParams.safeParse({ ...base, codeWork: { ...codeWork, ...change } }).success).toBe(false)
  })
})
