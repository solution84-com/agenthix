/**
 * `find_tools` on the data path (ADR-0193): a run finds only the tools it may use — never one at Never in its
 * capability, and only among what its site offers it — each with the input the agent gives, never a field the site
 * fills in. Called directly: what is searched is pure; who may call it is the registry's (callOperation).
 */
import { describe, it, expect, vi } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'

vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import { findToolsOp, entriesForRun, FIND_TOOLS_SCHEMA } from '../findToolsOp'
import { ControlPlaneError, type CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { ALL_CONTROL_PLANE_TOOLS } from '../toolSchemas'

const run = (neverTools: string[] = []): CallerContext => ({
  kind: 'run',
  claims: { permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools } } as unknown as CapabilityClaims,
})

const names = (answer: { tools: { name: string }[] }) => answer.tools.map(t => t.name)

describe('find_tools on the data path @SC-2174', () => {
  it('finds a tool by what the run wants to do, with its description and input', async () => {
    const answer = await findToolsOp(run(), { query: 'create a routine on a schedule' })
    expect(names(answer)).toContain('create_routine')
    const found = answer.tools.find(t => t.name === 'create_routine')!
    expect(found.description).toBe(ALL_CONTROL_PLANE_TOOLS.find(t => t.name === 'create_routine')!.description)
    expect((found.input as { properties: Record<string, unknown> }).properties).toHaveProperty('cron')
  })

  it('never finds a tool at Never in the run\'s capability', async () => {
    const answer = await findToolsOp(run(['create_routine']), { query: 'create a routine on a schedule' })
    expect(names(answer)).not.toContain('create_routine')
    expect(entriesForRun(['create_routine'], undefined).map(e => e.name)).not.toContain('create_routine')
  })

  it('searches only among the tools the site offers the run, when it names them', async () => {
    const answer = await findToolsOp(run(), { query: 'run workflow deploy', among: ['run_workflow', 'list_workflows'] })
    expect(names(answer).every(n => ['run_workflow', 'list_workflows'].includes(n))).toBe(true)
    expect(names(answer)).toContain('run_workflow')
  })

  it('never shows a field the site fills in from the calling run', async () => {
    const answer = await findToolsOp(run(), { query: 'run workflow', among: ['run_workflow'] })
    const input = answer.tools[0]!.input as { properties: Record<string, unknown> }
    expect(input.properties).toHaveProperty('name')
    expect(input.properties).not.toHaveProperty('runId')
  })

  it('says so in one line, sending the run back to the names it was given, when nothing matches', async () => {
    const answer = await findToolsOp(run(), { query: 'zzqx', among: ['create_milestone'] })
    expect(answer.tools).toEqual([])
    expect(answer.note).toMatch(/^No tool you may use matches that/)
    expect(answer.note).toMatch(/named in your instructions/)
  })

  it('is a run\'s own tool: a person\'s connection is refused', async () => {
    await expect(findToolsOp(connectionCaller(), { query: 'routine' })).rejects.toBeInstanceOf(ControlPlaneError)
  })

  it('is not one of the tools it searches, and the site fills in what it offers', () => {
    expect(entriesForRun([], undefined).map(e => e.name)).not.toContain('find_tools')
    expect(Object.keys(FIND_TOOLS_SCHEMA.schema).sort()).toEqual(['among', 'query'])
  })
})
