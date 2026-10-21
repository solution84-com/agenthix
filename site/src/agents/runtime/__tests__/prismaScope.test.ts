/**
 * @SC-338 — the structural guarantee the whole execution-runtime severance
 * (plan 5d-2 task 7b) rests on: site's generated Prisma client has no delegate
 * for any control-plane model. Every hq-only read the moved runtime used to do
 * directly is either pre-resolved by hq at dispatch (RunContextPayload) or a
 * real cross-boundary call — never a direct query against a model site was
 * never given a schema for in the first place. Constructing a bare
 * PrismaClient (not the DATABASE_URL-gated `test/db.ts` used by integration
 * tests) is enough — delegates are defined on the generated class itself, no
 * live connection required to check they exist.
 */
import { describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'

const CONTROL_PLANE_MODELS = ['task', 'project', 'agent', 'user', 'userSettings', 'board', 'product', 'program'] as const
const RUNTIME_MODELS = ['agentRun', 'agentSession', 'transcriptEntry', 'toolCallLog'] as const

describe('site prisma client scope @SC-338', () => {
  const prisma = new PrismaClient()

  it.each(CONTROL_PLANE_MODELS)('has no delegate for control-plane model %s', (model) => {
    expect((prisma as unknown as Record<string, unknown>)[model]).toBeUndefined()
  })

  it.each(RUNTIME_MODELS)('has a delegate for runtime model %s', (model) => {
    expect((prisma as unknown as Record<string, unknown>)[model]).toBeDefined()
  })
})
