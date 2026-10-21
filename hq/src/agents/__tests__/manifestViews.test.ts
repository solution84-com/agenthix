import { describe, it, expect } from 'vitest'
import type { PendingManifest, ToolCallRow } from '@agenthix/core'

/** A stored request of another shape than core declares, which the view reads defensively. */
const stored = (v: unknown) => v as PendingManifest
import { pendingManifestView, toolCallView } from '../manifestViews'

const row: ToolCallRow = {
  id: 'c1', runId: 'r1', toolName: 'Bash', toolInput: { command: 'ls' }, toolUseId: 'tu1', riskLevel: 'HIGH',
  blocked: true, blockReason: 'bash-not-in-manifest', createdAt: '2026-10-21T10:00:00.000Z',
}

describe('toolCallView', () => {
  it('answers each field the Runs screen reads, and nothing else of the row', () => {
    expect(toolCallView({ ...row, extra: 'site-only' } as ToolCallRow)).toEqual(row)
  })

  it('gives a call recorded without input a null input', () => {
    expect(toolCallView({ ...row, toolInput: undefined as unknown as ToolCallRow['toolInput'] }).toolInput).toBeNull()
  })
})

describe('pendingManifestView', () => {
  const run = { id: 'r1', sessionId: 's1' }

  it('lists each tool by name and each command by its pattern, with the reason when there is one', () => {
    const view = pendingManifestView({
      ...run,
      pendingManifest: stored({
        summary: 'Needs to build',
        tools: [{ name: 'Write', reason: 'a.ts' }, { name: 'WebFetch' }],
        bashPatterns: [{ pattern: 'make', reason: 'make build', extra: 1 }],
      }),
    })
    expect(view).toEqual({
      runId: 'r1', sessionId: 's1', summary: 'Needs to build',
      pendingManifest: { tools: [{ name: 'Write', reason: 'a.ts' }, { name: 'WebFetch' }], bashPatterns: [{ pattern: 'make', reason: 'make build' }] },
    })
  })

  it('leaves out what is not a tool or a pattern, and answers empty lists for a request with none', () => {
    expect(pendingManifestView({ ...run, pendingManifest: stored({ tools: [{ reason: 'no name' }, 'Bash', null], bashPatterns: 'make' }) }).pendingManifest)
      .toEqual({ tools: [], bashPatterns: [] })
    expect(pendingManifestView({ ...run, pendingManifest: null })).toEqual({
      runId: 'r1', sessionId: 's1', summary: null, pendingManifest: { tools: [], bashPatterns: [] },
    })
  })
})
