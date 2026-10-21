import { describe, it, expect } from 'vitest'
import type { RunStreamEvent } from '@agenthix/core'
import { clientRunEvent } from '../clientRunEvents'

// The run events a client reads (the mobile app among them) are hq's own declared events: hq builds each from the
// fields it declares, so a change on the site's side reaches no client unseen. Names a client does not rely on
// pass through as the site sent them.

/** A frame as a site may send it: hq checked its envelope only, so a test may give it any data. */
type SentFrame = Partial<Omit<RunStreamEvent, 'name' | 'data'>> & { name?: RunStreamEvent['name']; data?: unknown }
const frame = (overrides: SentFrame): RunStreamEvent => ({
  sessionId: 'sess-1', runId: 'run-1', taskId: null, targetRoom: 'session', name: 'agentStreamDelta', data: {}, ...overrides,
}) as RunStreamEvent

const manifest = { tools: [{ name: 'WebFetch', reason: 'docs' }], bashPatterns: [{ pattern: 'npm test' }] }

describe('the run events hq sends a client @SC-1142', () => {
  it('builds a stream delta from the run and its text, and nothing else the site added', () => {
    expect(clientRunEvent(frame({ data: { runId: 'run-1', textDelta: 'hi', extra: 1 } }))).toEqual({
      name: 'agentStreamDelta', data: { runId: 'run-1', textDelta: 'hi' },
    })
  })

  it('drops a stream delta with no text, or no run', () => {
    expect(clientRunEvent(frame({ data: { textDelta: 5 } }))).toBeNull()
    expect(clientRunEvent(frame({ runId: null, data: { textDelta: 'hi' } }))).toBeNull()
  })

  it("names the session a task run started in as the frame's own, the one hq checked the site owns", () => {
    const started = frame({ name: 'taskSessionStarted', runId: null, targetRoom: 'task', taskId: 't1', data: { sessionId: 'other' } })
    expect(clientRunEvent(started)).toEqual({ name: 'taskSessionStarted', data: { sessionId: 'sess-1' } })
  })

  it('builds a pending approval with its run, session, task, summary and the tools and commands asked for', () => {
    const task = frame({
      name: 'manifestPendingApproval', targetRoom: 'task', taskId: 't1',
      data: { runId: 'run-1', taskId: 't1', summary: 'needs the web', pendingManifest: { ...manifest, more: true } },
    })
    expect(clientRunEvent(task)).toEqual({
      name: 'manifestPendingApproval',
      data: { runId: 'run-1', sessionId: 'sess-1', taskId: 't1', summary: 'needs the web', pendingManifest: manifest },
    })
    const chat = frame({ name: 'manifestPendingApproval', data: { runId: 'run-1', sessionId: 'sess-1', summary: null, pendingManifest: manifest } })
    expect(clientRunEvent(chat)?.data).toMatchObject({ taskId: null, summary: null })
  })

  it('drops a pending approval whose list of tools or commands is not one', () => {
    for (const pendingManifest of [null, { tools: 'x', bashPatterns: [] }, { tools: [{ name: 1 }], bashPatterns: [] }, { tools: [], bashPatterns: [{ pattern: 'ls', reason: 2 }] }]) {
      expect(clientRunEvent(frame({ name: 'manifestPendingApproval', data: { summary: null, pendingManifest } }))).toBeNull()
    }
  })

  it('passes an event no client relies on through as the site sent it', () => {
    const data = { runId: 'run-1', toolUseId: 'u1', toolName: 'Read', toolInput: {} }
    expect(clientRunEvent(frame({ name: 'agentToolCall', data }))).toEqual({ name: 'agentToolCall', data })
  })
})
