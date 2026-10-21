/**
 * Integration tests for the agent reads that cross to a site (ADR-0094 — real test DB): the detail page
 * (SC-048), lookup by handle (SC-182) and the prompt preview (SC-047).
 *
 * The agent, its sessions and its packages are real; the site's answers come from the shared siteRuntimeStore
 * fake, and the dashboard notifier and feed are the shared fakes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createSession, createUser, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getAgentDetail, getAgentByHandle, getAgentPromptPreview } from '../queries'
import { writeAgentContent } from '../../packages/agentPackageService'
import { writePackage } from '../../packages/packageStore'
import { PLATFORM_PACKAGE_KEY } from '@agenthix/core'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { opContext } from './definitionFixtures'

// Building a prompt preview asks the install's own site, so one has to be registered — an agent has no home
// site of its own to fall back to — and resolves the run's packages, so the platform's has to exist too.
beforeEach(async () => {
  await ensureExecutionSite()
  await writePackage({ kind: 'platform', key: PLATFORM_PACKAGE_KEY, files: [{ path: 'PLATFORM.md', content: Buffer.from('platform') }], updatedById: null })
  siteStore.promptPreview.mockResolvedValue({ prompt: 'a prompt' })
})

const signedIn = async () => opContext(await createUser())

async function agentWithContent(data: Record<string, unknown> = {}) {
  const agent = await createAgent(data)
  await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
  return agent
}

describe('getAgentDetail @SC-048', () => {
  it('returns session/run counts and aggregated token usage', async () => {
    const agent = await createAgent()
    const session = await createSession({ agentId: agent.id })
    siteStore.listRuns.mockResolvedValue([
      {
        id: 'r1', sessionId: session.id, status: 'COMPLETED', createdAt: '2026-01-02T00:00:00.000Z',
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, totalTokens: 165 },
      },
      // `createdAt` on every row: the site's runs are merged and sorted by it
      // (core's RunRow carries it), so a row without one is not a run any site
      // could have returned.
      { id: 'r2', sessionId: session.id, status: 'PENDING', usage: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ])
    siteStore.countRuns.mockResolvedValue({ count: 2 })

    const detail = await getAgentDetail({ id: agent.id }, await signedIn())

    expect(detail.sessionCount).toBe(1)
    expect(detail.runCount).toBe(2)
    expect(detail.totalTokens).toBe(165)
    expect(detail.taskCounts).toBeDefined()
  })

  it('returns 404 for an unknown agent id', async () => {
    await expect(
      getAgentDetail({ id: 'nope' }, await signedIn()),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('getAgentByHandle unknown handle @SC-182', () => {
  it('returns 404 for an unknown handle', async () => {
    await expect(
      getAgentByHandle({ handle: 'no-such-agent' }, await signedIn()),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('resolves an existing agent by handle', async () => {
    const agent = await createAgent({ handle: 'findable' })
    const found = await getAgentByHandle({ handle: 'findable' }, await signedIn())
    expect(found.id).toBe(agent.id)
  })
})

describe('getAgentPromptPreview @SC-047', () => {
  it('returns a prompt preview for chat mode', async () => {
    const agent = await agentWithContent({ name: 'Preview Agent' })
    const preview = await getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, await signedIn())
    expect(typeof preview.systemPrompt).toBe('string')
    expect(Array.isArray(preview.sections)).toBe(true)
  })

  it('returns a task-mode preview with the task user message', async () => {
    const agent = await agentWithContent()
    const preview = await getAgentPromptPreview({ agentId: agent.id, mode: 'task' }, await signedIn())
    expect(preview.userMessage).toBe('Execute your assigned task.')
  })

  it('returns 404 for an unknown agent id', async () => {
    await expect(
      getAgentPromptPreview({ agentId: 'nope', mode: 'chat' }, await signedIn()),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('passes the site\'s sections through, editable ones still editable', async () => {
    const agent = await agentWithContent({ name: 'Sectioned' })
    const sections = [
      { key: 'identity', label: 'Identity', content: 'You are Sectioned.', editable: false },
      { key: 'profile', label: 'Profile', content: 'Bio', editable: true },
    ]
    siteStore.promptPreview.mockResolvedValueOnce({ prompt: 'You are Sectioned.\n\n---\n\nBio', sections })
    const preview = await getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, await signedIn())
    expect(preview.sections).toEqual(sections)
  })

  it('falls back to one read-only section when the site sends none', async () => {
    const agent = await agentWithContent({ name: 'Legacy' })
    siteStore.promptPreview.mockResolvedValueOnce({ prompt: 'flat' })
    const preview = await getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, await signedIn())
    expect(preview.sections).toEqual([{ key: 'prompt', label: 'System Prompt', content: 'flat', editable: false }])
  })

  // A package error surfaces as 409 (person-actionable), not a bare 500 —
  // same shared mapper `triggerAgentRun` uses.
  it('a package delivery error surfaces as 409, naming the reason', async () => {
    const agent = await agentWithContent({ name: 'Failed Delivery' })
    const { PackageDeliveryError } = await import('../../packages/packageDelivery')
    siteStore.promptPreview.mockRejectedValueOnce(
      new PackageDeliveryError('package_delivery_failed', 'Delivering the agent package a1 to Execution Site s1 failed: disk full'),
    )
    await expect(getAgentPromptPreview({ agentId: agent.id, mode: 'chat' }, await signedIn()))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('disk full') })
  })
})
