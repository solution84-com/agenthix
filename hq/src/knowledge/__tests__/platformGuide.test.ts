import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GrepRateLimiter } from '@agenthix/core/file-tools'
import { buildPlatformGuide } from '../guideBuild/build'
import { platformGuideMissingMessage, platformNameOfFile, platformGuideNotice, readPlatformGuidePage, searchPlatformGuide } from '../platformGuide'

const RG_ON_PATH = Boolean(process.env.CI) || (process.env.PATH ?? '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, 'rg')))

let tmp: string
let root: string
const grepOptions = () => ({ grep: { limiter: new GrepRateLimiter(1000) }, root })

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-guide-'))
  const guideDir = path.join(tmp, 'guide')
  fs.mkdirSync(path.join(guideDir, 'your-tools'), { recursive: true })
  fs.writeFileSync(path.join(guideDir, 'your-tools/providers.md'), '---\ntitle: Providers\ndescription: Add a model key.\n---\n\nAdd a model key under Models.\nSecond line.\n')
  root = path.join(tmp, 'platform-guide')
  buildPlatformGuide({ guideDir, outDir: root, toolsMarkdown: '# tools\nThe tool ping.\n' })
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('reading the built platform guide @SC-1413', () => {
  it('reads a page with its line numbers, after the opening line, with or without its level', () => {
    for (const page of ['your-tools/providers.md', 'platform:your-tools/providers.md']) {
      const r = readPlatformGuidePage({ page }, { root })
      expect(r.ok).toBe(true)
      expect(r.text.startsWith(platformGuideNotice())).toBe(true)
      expect(r.text).toMatch(/\s+\d+\tAdd a model key under Models\./)
    }
  })

  it('names a built file as the guide does', () => {
    expect(platformNameOfFile('pages/your-tools/providers.md')).toBe('your-tools/providers.md')
    expect(platformNameOfFile('tools.md')).toBe('tools.md')
  })

  it('reads the tools reference, and honours offset and limit', () => {
    const r = readPlatformGuidePage({ page: 'platform:tools.md', offset: 2, limit: 1 }, { root })
    expect(r.text).toContain('The tool ping.')
    expect(r.text).not.toContain('# tools')
  })

  it('refuses a name leaving the guide, with the fixed message and no path', () => {
    for (const page of ['../secrets', '/etc/passwd', 'your-tools/../../x']) {
      const r = readPlatformGuidePage({ page }, { root })
      expect(r.ok).toBe(false)
      expect(r.text).not.toContain(tmp)
      expect(r.text).toContain('Nothing was changed.')
    }
  })

  it('answers a fixed message when the guide is not built, for a search and a read', async () => {
    const missing = { root: path.join(tmp, 'nothing-here') }
    expect(await searchPlatformGuide({ pattern: 'x' }, missing)).toEqual({ ok: false, text: platformGuideMissingMessage() })
    expect(readPlatformGuidePage({ page: 'tools.md' }, missing)).toEqual({ ok: false, text: platformGuideMissingMessage() })
    expect(platformGuideMissingMessage()).not.toContain(tmp)
  })

  it('has the opening line name the product from the branding constant', () => {
    expect(platformGuideNotice()).toMatch(/^This describes \S+\. What you may do here is what your tools allow\.$/)
  })

  it.skipIf(!RG_ON_PATH)('searches the pages and the tools reference, not the index, and opens with the line', async () => {
    const r = await searchPlatformGuide({ pattern: 'model key', output_mode: 'files_with_matches' }, grepOptions())
    expect(r.ok).toBe(true)
    expect(r.text.startsWith(platformGuideNotice())).toBe(true)
    expect(r.text).toContain('pages/your-tools/providers.md')
    expect(r.text).not.toContain('index.json')
    const tools = await searchPlatformGuide({ pattern: 'The tool ping' }, grepOptions())
    expect(tools.text).toContain('tools.md')
  })

  it.skipIf(!RG_ON_PATH)('refuses a hostile pattern with a fixed message', async () => {
    const r = await searchPlatformGuide({ pattern: '(a+)+\\1' }, grepOptions())
    expect(r.ok).toBe(false)
    expect(r.text).not.toContain('(a+)+')
  })
})
