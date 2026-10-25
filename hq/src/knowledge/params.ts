/**
 * A tool's raw input checked against its own schema in `knowledgeToolSchemas.ts`, the one definition the agents are
 * offered, so what is checked is what was described. Fields the schema does not name are dropped.
 */
import { z } from 'zod'
import { KNOWLEDGE_TOOLS } from '../server/controlplane/knowledgeToolSchemas'
import { MESSAGES } from './messages'

type ToolName = 'search_knowledge' | 'read_knowledge' | 'write_knowledge' | 'edit_knowledge' | 'delete_knowledge'

const schemas = new Map(KNOWLEDGE_TOOLS.map(t => [t.name, z.object(t.schema)]))

export type ParsedParams = { ok: true; value: Record<string, unknown> } | { ok: false; parameter: string; message: string }

export function parseToolParams(tool: ToolName, input: unknown): ParsedParams {
  const schema = schemas.get(tool)
  if (!schema) throw new Error(`No schema for ${tool}`)
  const parsed = schema.safeParse(input ?? {})
  if (parsed.success) return { ok: true, value: parsed.data as Record<string, unknown> }
  const first = parsed.error.issues[0]
  const parameter = typeof first?.path[0] === 'string' ? first.path[0] : 'input'
  return { ok: false, parameter, message: MESSAGES.invalidParameter(parameter) }
}
