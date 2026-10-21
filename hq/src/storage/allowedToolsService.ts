import { HttpError } from 'wasp/server'
import { listKnownToolNames } from '../shared/mcpTools'

const MAX_ALLOWED_TOOLS = 200

/** Workspace.allowedTools input: null clears the cap; a string list caps (spec §H6).
 *  Anything else is refused — the legacy ToolPermission[] object shape would be read
 *  by the mint as "no tool matches" and silently lock out every tool (5b-1 ledger 15).
 *
 *  Every surviving name is checked against listKnownToolNames() — hq's current tool
 *  vocabulary — so a typo can't silently create a cap that matches nothing (the same
 *  silent-lockout shape as the legacy-object-shape guard above). If a future site
 *  exposes tools hq does not enumerate, widen the catalogue here (recorded in plan
 *  5b-2's deferred decisions). */
export function parseAllowedToolsInput(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) throw new HttpError(400, 'allowedTools must be null or a list of tool names')
  if (value.length > MAX_ALLOWED_TOOLS) throw new HttpError(400, `allowedTools cannot have more than ${MAX_ALLOWED_TOOLS} entries`)
  const names = value.map((v) => {
    if (typeof v !== 'string' || v.trim() === '') throw new HttpError(400, 'allowedTools entries must be tool names (strings)')
    return v.trim()
  })
  const known = new Set(listKnownToolNames())
  for (const name of names) {
    if (!known.has(name)) throw new HttpError(400, `unknown tool name: ${name}`)
  }
  return [...new Set(names)]
}
