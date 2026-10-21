import { describe, it, expect, vi } from 'vitest'
import { registerWorkforceTools } from '../workforceTools'
import type { RunOp } from '../mcpServer'

// registerWorkforceTools is thin wiring only now — the service logic (finding
// boards, creating tasks, the role floor) lives in
// controlplane/workforceOps.ts and is covered by
// controlplane/__tests__/workforceOps.test.ts. This file only proves each
// tool dispatches to runOp with the right name and args.

function captureServer() {
  const handlers: Record<string, (args: unknown) => Promise<unknown>> = {}
  const server = {
    tool: (name: string, _schema: unknown, handler: (args: unknown) => Promise<unknown>) => {
      handlers[name] = handler
    },
  } as unknown as Parameters<typeof registerWorkforceTools>[0]
  const runOp: RunOp = vi.fn(async () => ({ content: [{ type: 'text' as const, text: '{}' }] }))
  registerWorkforceTools(server, { runOp })
  return { handlers, runOp }
}

describe('registerWorkforceTools wiring', () => {
  it('list_workforce_templates dispatches through runOp', async () => {
    const { handlers, runOp } = captureServer()
    await handlers['list_workforce_templates']({})
    expect(runOp).toHaveBeenCalledWith('list_workforce_templates', {})
  })

  it('propose_workforce_template dispatches through runOp with its args', async () => {
    const { handlers, runOp } = captureServer()
    await handlers['propose_workforce_template']({ templateId: 'wft-1', reason: 'because' })
    expect(runOp).toHaveBeenCalledWith('propose_workforce_template', { templateId: 'wft-1', reason: 'because' })
  })
})
