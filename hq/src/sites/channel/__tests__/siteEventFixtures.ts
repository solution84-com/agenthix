/**
 * Shared set-up for the site event intake tests (siteEvent*.integration.test.ts):
 * real sessions owned by a named site, the frames a site sends, and a stand-in
 * for the socket server the handler emits into.
 */
import { vi } from 'vitest'
import type { RunStatusEvent, RunStreamEvent } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUser, createAgent, createProject, createTestTask } from '../../../test/factories'
import { UNTITLED_SESSION_TITLE } from '../../../sessions/siteSessionTitle'

// Every session starts under the placeholder title a site's first title replaces.
const title = UNTITLED_SESSION_TITLE

export async function siteNamed(siteId: string, label = 'Build box') {
  return prisma.executionSite.upsert({
    where: { siteId },
    create: { siteId, label, credentialHash: 'h'.repeat(64) },
    update: {},
  })
}

/** A person's own chat; its owner is the site holding that person's storage. */
export async function personalSession(id: string, siteId = 'site-1') {
  const site = await siteNamed(siteId)
  const user = await createUser()
  await prisma.userStoragePlacement.create({ data: { userId: user.id, siteId: site.id } })
  return prisma.agentSession.create({ data: { id, title, userId: user.id, agentId: (await createAgent()).id } })
}

/** A chat working in a project's files; its owner is the project's site. */
export async function projectSession(id: string, siteId = 'site-1', agentId?: string) {
  const site = await siteNamed(siteId)
  const project = await createProject({ executionSiteId: site.id })
  return prisma.agentSession.create({
    data: {
      id, title, userId: (await createUser()).id, agentId: agentId ?? (await createAgent()).id,
      primaryOwnerType: 'project', primaryOwnerId: project.id,
    },
  })
}

/** A task's session; the project it runs for is the task's. */
export async function taskSession(id: string, siteId = 'site-1') {
  const site = await siteNamed(siteId)
  const project = await createProject({ executionSiteId: site.id })
  const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: 'person-1' } })
  const session = await prisma.agentSession.create({
    data: {
      id, title, userId: (await createUser()).id, agentId: (await createAgent()).id, sessionType: 'task',
      taskId: task.id, primaryOwnerType: 'project', primaryOwnerId: project.id,
    },
  })
  return { session, task, project }
}

export const sessionRow = (id: string) => prisma.agentSession.findUniqueOrThrow({ where: { id } })

/** A frame as a site may send it: the intake checks its envelope and reads its data as untrusted, so a test may give it any. */
type SentStreamFrame = Partial<Omit<RunStreamEvent, 'name' | 'data'>> & { name?: RunStreamEvent['name']; data?: unknown }

export function streamEvent(overrides: SentStreamFrame = {}): RunStreamEvent {
  return {
    sessionId: 'sess-1', runId: 'run-1', taskId: null, targetRoom: 'session',
    name: 'agentStreamDelta', data: { runId: 'run-1', textDelta: 'hi' },
    ...overrides,
  } as RunStreamEvent
}

export function statusEvent(overrides: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return {
    runId: 'run-1', sessionId: 'sess-1', taskId: null, agentId: 'agent-1', agentHandle: 'bot',
    status: 'RUNNING', error: null, sessionPatch: null, manifestPending: null,
    ...overrides,
  }
}

export type FakeIo = ReturnType<typeof installFakeIo>

/** Puts a stand-in socket server where the handler looks for Wasp's. */
export function installFakeIo() {
  const emit = vi.fn()
  const to = vi.fn((_room: string) => ({ emit }))
  ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = { to }
  return { to, emit }
}

export function removeFakeIo(): void {
  delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__
}

/** Warning lines logged so far, as text. */
export function warnings(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls.map((call) => String(call[0]))
}
