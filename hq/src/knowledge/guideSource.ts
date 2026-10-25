/**
 * hq's own copy of the platform guide, for the knowledge service: Grep over its built folder by the file tools (the
 * index left out unless the caller names a glob of their own, as `searchPlatformGuide` does), its pages from its index
 * for an empty pattern, and a read of one page through `readPlatformGuidePage`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { grep } from '@agenthix/core/file-tools'
import type { KnowledgeGuide } from './deps'
import { platformGuideMissingMessage, platformGuideRoot, readPlatformGuidePage } from './platformGuide'

export function guideSource(options: { root?: string } = {}): KnowledgeGuide {
  return {
    async grep(params, callerKey) {
      const root = platformGuideRoot(options)
      if (!root) return { ok: false, missing: true, message: platformGuideMissingMessage() }
      const result = await grep(root, { ...params, glob: params.glob ?? '!index.json' }, { callerKey: `platform-guide:${callerKey}` })
      return result.ok ? { ok: true, found: result } : { ok: false, missing: false, message: result.message }
    },
    outline() {
      const root = platformGuideRoot(options)
      if (!root) return null
      try {
        const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')) as { pages?: { name?: unknown; title?: unknown }[] }
        return (index.pages ?? []).flatMap(p => (typeof p.name === 'string' ? [{ name: p.name, title: typeof p.title === 'string' ? p.title : p.name }] : []))
      } catch {
        return null
      }
    },
    read: args => readPlatformGuidePage(args, options),
  }
}
