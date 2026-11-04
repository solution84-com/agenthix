/**
 * The sections of an agent's prompt preview, against the real database: the site's sections pass through only
 * when every one is well formed; anything else falls back to the one read-only prompt section. With no
 * Execution Site connected the preview fails with the shared error and asks no site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PLATFORM_PACKAGE_KEY } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createUser, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getAgentPromptPreview } from '../queries'
import { writePackage } from '../../packages/packageStore'
import { writeAgentContent } from '../../packages/agentPackageService'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const FALLBACK = [{ key: 'prompt', label: 'System Prompt', content: 'flat prompt', editable: false }]
const GOOD_SECTION = { key: 'identity', label: 'Identity', content: 'You are bot', editable: true }

async function agentAndCaller() {
  await writePackage({ kind: 'platform', key: PLATFORM_PACKAGE_KEY, files: [{ path: 'PLATFORM.md', content: Buffer.from('platform') }], updatedById: null })
  const agent = await createAgent()
  await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
  const ctx = { user: { id: (await createUser()).id }, entities: { Agent: prisma.agent } } as any
  return { agent, ctx }
}

describe('getAgentPromptPreview sections', () => {
  beforeEach(async () => {
    await ensureExecutionSite()
  })

  it.each([
    ['absent', undefined],
    ['empty', []],
    ['not an array', { length: 1, map: 'nope' }],
    ['a string', 'sections'],
    ['null', null],
    ['containing a non-object', [null]],
    ['containing an entry with the wrong field types', [{ key: 'k', label: 'L', content: 42, editable: 'yes' }]],
    ['containing one good and one malformed entry', [GOOD_SECTION, { key: 'k' }]],
  ])('falls back to the single prompt section when sections is %s', async (_label, sections) => {
    const { agent, ctx } = await agentAndCaller()
    siteStore.promptPreview.mockResolvedValueOnce({ prompt: 'flat prompt', sections } as never)
    const out = await getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, ctx)
    expect(out.sections).toEqual(FALLBACK)
    expect(out.systemPrompt).toBe('flat prompt')
  })

  it("passes the site's sections through when every one is well formed", async () => {
    const { agent, ctx } = await agentAndCaller()
    siteStore.promptPreview.mockResolvedValueOnce({ prompt: 'flat prompt', sections: [GOOD_SECTION] })
    expect((await getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, ctx)).sections).toEqual([GOOD_SECTION, expect.objectContaining({ key: 'skills' })])
  })

  it("adds a task preview's new comments and every preview's skills as placeholders", async () => {
    const { agent, ctx } = await agentAndCaller()
    siteStore.promptPreview.mockResolvedValueOnce({ prompt: 'flat prompt', sections: [GOOD_SECTION, { ...GOOD_SECTION, key: 'execution' }] })
    const keys = (await getAgentPromptPreview({ agentId: agent.id, mode: 'task' }, ctx)).sections?.map(s => s.key)
    expect(keys).toEqual(['identity', 'new_comments', 'execution', 'skills'])
  })
})

describe('getAgentPromptPreview with no Execution Site connected', () => {
  it('fails with the shared error and asks no site', async () => {
    const { agent, ctx } = await agentAndCaller()
    await expect(getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, ctx)).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)
    expect(siteStore.promptPreview).not.toHaveBeenCalled()
  })
})
