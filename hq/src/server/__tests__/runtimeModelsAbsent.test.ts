/**
 * @SC-347 — hq's half of the schema drop (plan 5d-2 task 10 "shed"). AgentRun,
 * TranscriptEntry and ToolCallLog moved to site's own schema (D3 — hq authors
 * an AgentSession, but its runs/transcript/tool-call history live entirely on
 * site now); this asserts hq's schema.prisma no longer declares them.
 *
 * Reads hq/schema.prisma's own TEXT, the same reasoning
 * storage/__tests__/storageModelInvariant.test.ts's SC-255 block already
 * uses: hq's generated Prisma client only regenerates on a Wasp compile,
 * which is not part of this change (schema-file edit only). Migration
 * 20260816181500_drop_runtime_tables_moved_to_site is applied — the tables
 * are gone from hq's DB too — but reading the generated client here would
 * still only prove whatever a `wasp start`/`wasp build` happened to last
 * regenerate, not this change; the schema text is what actually changed and
 * is what this test pins at the schema level.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const hqSchemaText = readFileSync(join(__dirname, '../../../schema.prisma'), 'utf8')

describe('the moved runtime is shed from hq\'s schema @SC-347', () => {
  it('hq/schema.prisma has no AgentRun model', () => {
    expect(hqSchemaText).not.toMatch(/^model AgentRun \{/m)
  })

  it('hq/schema.prisma has no TranscriptEntry model', () => {
    expect(hqSchemaText).not.toMatch(/^model TranscriptEntry \{/m)
  })

  it('hq/schema.prisma has no ToolCallLog model', () => {
    expect(hqSchemaText).not.toMatch(/^model ToolCallLog \{/m)
  })

  it('AgentSession has no entries (TranscriptEntry[]) field', () => {
    const block = hqSchemaText.match(/^model AgentSession \{[\s\S]*?^\}/m)?.[0]
    expect(block).toBeTruthy()
    expect(block).not.toMatch(/entries\s+TranscriptEntry\[\]/)
    expect(block).not.toMatch(/AgentRun\[\]/)
  })

  it('Agent has no runs (AgentRun[]) back-relation', () => {
    const block = hqSchemaText.match(/^model Agent \{[\s\S]*?^\}/m)?.[0]
    expect(block).toBeTruthy()
    expect(block).not.toMatch(/AgentRun\[\]/)
  })

  it('AgentSession itself stays — hq still authors the session row', () => {
    expect(hqSchemaText).toMatch(/^model AgentSession \{/m)
  })
})
