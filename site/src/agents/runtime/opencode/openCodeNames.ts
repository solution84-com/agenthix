/**
 * The single place that knows OpenCode's tool names (spec, "Tool-name
 * mapping") — sdkNames.ts is Claude's.
 *
 * Agenthix's plugin hands the gate every call as OpenCode's own tool id and the
 * call's full arguments, so the gate translates the tool here: a built-in to
 * its canonical name with the paths its file tool will open, a platform tool
 * to its own name once the conversation's connection prefix is removed. A tool
 * this table does not know is refused, never guessed at.
 *
 * Arguments are as OpenCode 1.18.32 defines them (`tool/*.ts`): `filePath` for
 * `read`, `write` and `edit`; `pattern` and `path` for `glob`; `path` for
 * `grep`, whose `pattern` is a regular expression and whose `include` only
 * filters names; `patchText` for `apply_patch`, whose file headers name the
 * paths (`patch/index.ts`); `command` for `bash`. Re-checked at every upgrade.
 */
import { BRANDING } from '@agenthix/core'
import { platformToolName } from './openCodeConnection'
import path from 'node:path'
import type { GateCall } from '../toolGate'
import type { RunContext } from '../types'
import type { HarnessRealPaths } from '../harnessPathRule'
import { builtinWithheld, unattendedAskTools } from '../toolPermissions'
import { ALL_SYSTEM_MCP_TOOL_NAMES } from '../../../shared/mcpTools'
import { RUNTIME_TOOLS } from '../../../shared/runtimeTools'

type Args = Record<string, unknown>
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** OpenCode's built-in tools the gate decides like Claude's, by canonical name. */
const OPENCODE_RUNTIME_TOOLS: Readonly<Record<string, string>> = {
  bash:     'bash',
  read:     'read_file',
  write:    'write_file',
  edit:     'edit_file',
  glob:     'glob_files',
  grep:     'grep_files',
  webfetch: 'web_fetch',
}

/**
 * Tools every agent has whatever its permissions, still gated and logged:
 * OpenCode's own to-do list, Agenthix's plugin `skill` tool (which reads only
 * the skills staged for the calling session), and `invalid`, which OpenCode
 * runs in place of a call it could not parse and which only answers an error.
 */
const OPENCODE_PERMISSION_FREE_TOOLS: ReadonlySet<string> = new Set(['todowrite', 'skill', 'invalid'])

type HidingContext = Pick<RunContext, 'bypassed' | 'allowedTools' | 'allowedBashPatterns' | 'approvedManifest' | 'webSearchKey'>

/**
 * The OpenCode permission keys a session denies so the model is not shown a
 * restricted agent's withheld built-ins — `never`, and `ask` in a run with no
 * manifest (builtinWithheld) — as Claude's `tools` list leaves them out (spec,
 * "Per-call authorization gate" item 1). OpenCode hides a tool by its
 * permission key (`permission/index.ts` `disabled`): `edit`, `write` and
 * `apply_patch` share `edit`, so it is denied only when both `edit_file` and
 * `write_file` are withheld — with one of them allowed, the three stay listed
 * and the gate refuses the other on call. Denying `read` also hides OpenCode's
 * MCP-resource tools, which the gate refuses anyway. An bypassed agent is
 * shown every built-in, as on Claude.
 */
export function openCodeHiddenBuiltins(context: HidingContext): string[] {
  if (context.bypassed || !context.allowedTools) return []
  const withheld = (canonical: string) => builtinWithheld(canonical, context)
  const hidden = Object.entries(OPENCODE_RUNTIME_TOOLS)
    .filter(([tool, canonical]) => tool !== 'edit' && tool !== 'write' && withheld(canonical))
    .map(([tool]) => tool)
  if (withheld('edit_file') && withheld('write_file')) hidden.push('edit')
  return hidden.sort()
}

/** Every platform tool a conversation's connection can list: hq's, and the site's own `web_search`. */
const OPENCODE_PLATFORM_TOOLS: readonly string[] = [...ALL_SYSTEM_MCP_TOOL_NAMES, RUNTIME_TOOLS.WEB.WEB_SEARCH]

/**
 * The OpenCode tool ids a session denies so the model is not shown a restricted
 * agent's `ask` platform tools in a run with no manifest, where nobody can
 * approve them. `never` ones the platform server already leaves out of its list.
 *
 * `web_search` is denied too on a turn of an organisation with no search key,
 * for every agent: the connection keeps listing it for the conversation's later
 * turns, so the turn's rules, not the listing, decide whether a key saved or
 * removed mid-conversation shows it (what agents can do, spec section 4).
 */
export function openCodeHiddenPlatformTools(context: HidingContext, connectionName: string): string[] {
  const hidden = new Set(unattendedAskTools(context, OPENCODE_PLATFORM_TOOLS))
  if (!context.webSearchKey) hidden.add(RUNTIME_TOOLS.WEB.WEB_SEARCH)
  return [...hidden].map(tool => `${connectionName}_${tool}`).sort()
}

const PATCH_HEADERS = ['*** Add File:', '*** Delete File:', '*** Update File:', '*** Move to:'] as const
const PATCH_WRITES: ReadonlySet<string> = new Set(['*** Add File:', '*** Delete File:', '*** Move to:'])

type PatchHeader = { line: number; header: (typeof PATCH_HEADERS)[number]; path: string }

/**
 * Every file header in a patch. OpenCode reads a header only at the start of a
 * line inside the patch's markers (`patch/index.ts`), and no line of file
 * content can start with `***`, so reading every line that starts with one —
 * leading spaces allowed — finds each path OpenCode will use, and perhaps more.
 */
export function openCodePatchHeaders(patchText: string): PatchHeader[] {
  const found: PatchHeader[] = []
  patchText.split('\n').forEach((raw, line) => {
    const text = raw.trimStart()
    const header = PATCH_HEADERS.find(h => text.startsWith(h))
    if (!header) return
    const p = text.slice(header.length).trim()
    if (p) found.push({ line, header, path: p })
  })
  return found
}

const DELETE_HEADER = '*** Delete File:'

/**
 * Where a header's path really leads. OpenCode removes a deleted file's own
 * entry, never following a link there, so a deleted path takes only its
 * folder's real path and keeps its name; any other path is followed to its end.
 */
function realPathFor(header: PatchHeader, realPaths: HarnessRealPaths): string | undefined {
  if (header.header !== DELETE_HEADER) return realPaths[header.path]
  const dir = realPaths[path.posix.dirname(header.path)]
  return dir === undefined ? undefined : path.posix.join(dir, path.posix.basename(header.path))
}

/** The paths the gate checks for a patch: every header's, and the folder each deleted file is removed from. */
function patchPaths(headers: readonly PatchHeader[]): string[] {
  return [...new Set(headers.flatMap(h => (h.header === DELETE_HEADER ? [h.path, path.posix.dirname(h.path)] : [h.path])))]
}

function patchWithRealPaths(patchText: string, realPaths: HarnessRealPaths): string | null {
  const lines = patchText.split('\n')
  let changed = false
  for (const found of openCodePatchHeaders(patchText)) {
    const { line, header } = found
    const real = realPathFor(found, realPaths)
    if (real === undefined || !lines[line].startsWith(header)) continue
    lines[line] = `${header} ${real}${lines[line].endsWith('\r') ? '\r' : ''}`
    changed = true
  }
  return changed ? lines.join('\n') : null
}

/** How the gate sees one OpenCode call: a call to decide, or a refusal before any decision. */
export type OpenCodeGateCall =
  | {
      kind: 'decide'
      call: GateCall
      /** The call's arguments with the real paths the gate found put in place, or null when nothing changes. */
      withRealPaths(realPaths: HarnessRealPaths): Args | null
    }
  | { kind: 'refuse'; reason: string }

const unchanged = (): null => null

function replacing(args: Args, key: string) {
  return (realPaths: HarnessRealPaths): Args | null => {
    const given = str(args[key])
    const real = given !== undefined ? realPaths[given] : undefined
    return real !== undefined ? { ...args, [key]: real } : null
  }
}

/** Translates one call from Agenthix's plugin into what the gate decides. */
export function openCodeGateCall(tool: string, args: Args, callId: string, connectionName: string): OpenCodeGateCall {
  const base = { input: args, toolUseId: callId }

  const platformTool = platformToolName(tool, connectionName)
  if (platformTool !== null) {
    return { kind: 'decide', call: { ...base, toolName: platformTool, target: null }, withRealPaths: unchanged }
  }

  if (OPENCODE_PERMISSION_FREE_TOOLS.has(tool)) {
    return { kind: 'decide', call: { ...base, toolName: tool, target: null, permissionFree: true }, withRealPaths: unchanged }
  }

  if (tool === 'apply_patch') {
    const patchText = str(args.patchText)
    if (patchText === undefined) return { kind: 'refuse', reason: 'apply_patch needs its patch as text in patchText.' }
    const headers = openCodePatchHeaders(patchText)
    const writes = headers.some(h => PATCH_WRITES.has(h.header))
    return {
      kind: 'decide',
      call: {
        ...base,
        toolName: 'edit_file',
        target: [...new Set(headers.map(h => h.path))].map(p => path.posix.basename(p)).join(', ') || null,
        paths: patchPaths(headers),
        ...(writes ? { alsoRequires: ['write_file'] } : {}),
      },
      withRealPaths: realPaths => {
        const rewritten = patchWithRealPaths(patchText, realPaths)
        return rewritten === null ? null : { ...args, patchText: rewritten }
      },
    }
  }

  const toolName = OPENCODE_RUNTIME_TOOLS[tool]
  if (!toolName) {
    return { kind: 'refuse', reason: `${tool} is not available in ${BRANDING.displayName} agent runs.` }
  }

  switch (toolName) {
    case 'bash':
      if (typeof args.command !== 'string') return { kind: 'refuse', reason: 'bash needs its command as text in command.' }
      return { kind: 'decide', call: { ...base, toolName, target: null }, withRealPaths: unchanged }
    case 'read_file':
    case 'write_file':
    case 'edit_file': {
      const filePath = str(args.filePath)
      return {
        kind: 'decide',
        call: { ...base, toolName, target: filePath ? path.posix.basename(filePath) : null, paths: [filePath ?? '.'] },
        withRealPaths: replacing(args, 'filePath'),
      }
    }
    case 'glob_files': {
      const folder = str(args.path) ?? '.'
      const pattern = str(args.pattern)
      const paths = pattern ? [folder, pattern.startsWith('/') ? pattern : `${folder.replace(/\/+$/, '')}/${pattern}`] : [folder]
      return { kind: 'decide', call: { ...base, toolName, target: pattern ?? null, paths }, withRealPaths: replacing(args, 'path') }
    }
    case 'grep_files':
      return {
        kind: 'decide',
        call: { ...base, toolName, target: str(args.pattern) ?? null, paths: [str(args.path) ?? '.'] },
        withRealPaths: replacing(args, 'path'),
      }
    default:
      return { kind: 'decide', call: { ...base, toolName, target: str(args.url) ?? null }, withRealPaths: unchanged }
  }
}
