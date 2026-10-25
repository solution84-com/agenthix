/**
 * hq's reading of the platform guide it holds in its image (agent knowledge spec, part 1): a search over it by the file
 * tools' Grep and a read of one page by their Read, both read-only. The guide is built by
 * scripts/guide/build-platform-guide.mjs into assets/platform-guide/. Every result starts with what the guide is about,
 * and a guide that is not there answers a fixed message rather than failing a turn (spec S8).
 */
import fs from 'node:fs'
import path from 'node:path'
import { BRANDING } from '@agenthix/core'
import { grep, read, formatGrepResult, refusalMessage, type GrepOptions, type GrepParams } from '@agenthix/core/file-tools'
import { getHqAssetsRoot } from '../server/hqAssets'

export const PLATFORM_GUIDE_FOLDER = 'platform-guide'
const LEVEL_PREFIX = 'platform:'

export const platformGuideNotice = (): string =>
  `This describes ${BRANDING.displayName}. What you may do here is what your tools allow.`

export const platformGuideMissingMessage = (): string =>
  `The ${BRANDING.displayName} guide is not in this installation, so it cannot be searched or read here. Whoever runs this installation can restore it by updating ${BRANDING.displayName}. Nothing was changed.`

export type PlatformGuideAnswer = { ok: boolean; text: string }

export type PlatformGuideOptions = {
  /** The folder holding the built guide; hq's assets folder's `platform-guide` by default. */
  root?: string
  grep?: GrepOptions
}

const OUTSIDE_PAGES = new Set(['tools.md', 'glossary.md'])

/** The guide's name for a file of the built folder, as search_knowledge shows it: `pages/your-tools/providers.md` is `your-tools/providers.md`. */
export const platformNameOfFile = (file: string): string => (file.startsWith('pages/') ? file.slice('pages/'.length) : file)

/** The file of the built folder for a guide name: the tools reference and the glossary stand apart, every other name is a page. */
const fileOfName = (name: string): string => (OUTSIDE_PAGES.has(name) ? name : `pages/${name}`)

const answer = (ok: boolean, body: string): PlatformGuideAnswer => ({ ok, text: `${platformGuideNotice()}\n\n${body}` })

/** The built guide's folder, or null when this installation has none. */
export function platformGuideRoot(options: PlatformGuideOptions = {}): string | null {
  const root = options.root ?? path.join(getHqAssetsRoot(), PLATFORM_GUIDE_FOLDER)
  return fs.existsSync(path.join(root, 'index.json')) ? root : null
}

/** Grep over the guide. The built index is not a page, so it is left out unless the caller names a glob of their own. */
export async function searchPlatformGuide(params: GrepParams, options: PlatformGuideOptions = {}): Promise<PlatformGuideAnswer> {
  const root = platformGuideRoot(options)
  if (!root) return { ok: false, text: platformGuideMissingMessage() }
  const result = await grep(root, { ...params, glob: params.glob ?? '!index.json' }, options.grep)
  return result.ok ? answer(true, formatGrepResult(result)) : answer(false, result.message)
}

/** One page of the guide, with Read's line numbers. `page` may carry its level, `platform:`, as search_knowledge shows it, and no `pages/`. */
export function readPlatformGuidePage(args: { page: string; offset?: number; limit?: number }, options: PlatformGuideOptions = {}): PlatformGuideAnswer {
  const root = platformGuideRoot(options)
  if (!root) return { ok: false, text: platformGuideMissingMessage() }
  const named = args.page.startsWith(LEVEL_PREFIX) ? args.page.slice(LEVEL_PREFIX.length) : args.page
  const file = fileOfName(named)
  const result = read(root, { file, offset: args.offset, limit: args.limit })
  if (!result.ok) return answer(false, refusalMessage(result.reason, result.count))
  const more = result.more ? `\n[Lines ${result.startLine}-${result.endLine} of ${result.totalLines}; read on with offset ${result.endLine + 1}.]` : ''
  return answer(true, result.content + more)
}
