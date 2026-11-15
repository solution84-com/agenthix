/**
 * `location.searchKnowledge`: runs the file tools' Grep (ripgrep, with every guard of "Running a pattern safely") over
 * the owner's `pages/` and answers in `grep`; the pattern is a model's and is never trusted. Nothing here names a path
 * on this disk.
 */
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS,
  type Exact,
  type KnowledgeGrepHit,
  type KnowledgeGrepParams,
  type KnowledgeGrepResult,
  type LocationSearchKnowledgeParams,
  type LocationSearchKnowledgeResult,
} from '@agenthix/core'
import { grep, GrepRateLimiter, type GrepFound, type GrepParams } from '@agenthix/core/file-tools'
import { knowledgeOwnerShape, orgIdIsFixed } from '../knowledge/owner'
import { pagesFolderOf } from '../knowledge/pagesRoot'
import { parseParams } from './locationContainment'

export const searchKnowledgeParams = z
  .object({
    ...knowledgeOwnerShape,
    // Taken as it comes: the file tools' own check judges every field.
    grep: z.object({ pattern: z.string() }).passthrough() as z.ZodType<KnowledgeGrepParams>,
  })
  .refine(orgIdIsFixed)

const _wireMirrorsCore: Exact<z.infer<typeof searchKnowledgeParams>, LocationSearchKnowledgeParams> = true
void _wireMirrorsCore

const GREP_KEYS: (keyof KnowledgeGrepParams)[] = [
  'pattern', 'path', 'glob', 'output_mode', '-i', '-n', '-A', '-B', '-C', 'head_limit', 'offset',
]

function hitsOf(found: GrepFound): KnowledgeGrepHit[] {
  if (found.mode === 'files_with_matches') return found.filenames.map(page => ({ page }))
  if (found.mode === 'count') return found.counts.map(c => ({ page: c.file, count: c.count }))
  const hits: KnowledgeGrepHit[] = []
  for (const l of found.lines) {
    if (l.kind === 'break') continue
    if (l.kind === 'binary') hits.push({ page: l.file, text: l.text })
    else {
      hits.push({
        page: l.file,
        ...(found.showLineNumbers ? { line: l.line } : {}),
        text: l.text,
        ...(l.kind === 'context' ? { context: true as const } : {}),
      })
    }
  }
  return hits
}

/**
 * hq limits each run and conversation to the file tools' 30 searches a minute. Here the key is the owner, which every
 * caller in the organisation shares for `org`, so the site's limit is only a backstop against flooding the machine:
 * high enough that one busy caller never uses up an owner for everyone else.
 */
export const OWNER_SEARCHES_PER_MINUTE = 600
const ownerLimiter = new GrepRateLimiter(OWNER_SEARCHES_PER_MINUTE)

/** One owner's pages searched by Grep's parameters; a refusal is an answer with one of the file tools' fixed messages. */
async function grepPages(owner: LocationSearchKnowledgeParams, params: KnowledgeGrepParams): Promise<KnowledgeGrepResult> {
  // Only Grep's own parameters go on: nothing else the caller sent is looked at.
  const picked: Record<string, unknown> = {}
  for (const key of GREP_KEYS) if (params[key] !== undefined) picked[key] = params[key]
  const folder = pagesFolderOf(owner)
  const mode = (picked.output_mode as KnowledgeGrepParams['output_mode']) ?? 'files_with_matches'
  if (folder.kind !== 'ok') return { outcome: 'done', mode, hits: [] }
  const result = await grep(folder.real, picked as GrepParams, { callerKey: `knowledge:${owner.ownerType}:${owner.ownerId}`, limiter: ownerLimiter })
  if (!result.ok) return { outcome: 'refused', message: result.message }
  return {
    outcome: 'done',
    mode: result.mode,
    hits: hitsOf(result),
    ...(result.nextOffset !== undefined ? { nextOffset: result.nextOffset } : {}),
  }
}

export async function searchKnowledge(params: unknown): Promise<LocationSearchKnowledgeResult> {
  const parsed = parseParams(searchKnowledgeParams, params, LOCATION_FILE_METHODS.searchKnowledge)
  return { truncated: false, grep: await grepPages(parsed, parsed.grep) }
}
