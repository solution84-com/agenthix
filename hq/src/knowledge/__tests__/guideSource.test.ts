import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPlatformGuide } from '../guideBuild/build'
import { guideSource } from '../guideSource'
import { platformGuideMissingMessage } from '../platformGuide'

const RG_ON_PATH = Boolean(process.env.CI) || (process.env.PATH ?? '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, 'rg')))

let tmp: string
let root: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-source-'))
  const guideDir = path.join(tmp, 'guide')
  fs.mkdirSync(path.join(guideDir, 'your-tools'), { recursive: true })
  fs.writeFileSync(path.join(guideDir, 'your-tools/providers.md'), '---\ntitle: Providers\ndescription: Add a model key.\n---\n\nAdd a model key under Models.\n')
  root = path.join(tmp, 'platform-guide')
  buildPlatformGuide({ guideDir, outDir: root, toolsMarkdown: '# tools\n' })
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('the guide as the knowledge service reads it', () => {
  it('lists its pages from its index @SC-1413', () => {
    expect(guideSource({ root }).outline()).toEqual([{ name: 'your-tools/providers', title: 'Providers' }])
  })

  it('says it is missing, for a listing and a search @SC-1400 @SC-1413', async () => {
    const missing = guideSource({ root: path.join(tmp, 'none') })
    expect(missing.outline()).toBeNull()
    expect(await missing.grep({ pattern: 'x' }, 'c')).toEqual({ ok: false, missing: true, message: platformGuideMissingMessage() })
  })

  it.runIf(RG_ON_PATH)('searches its pages and not its index @SC-1413', async () => {
    const answer = await guideSource({ root }).grep({ pattern: 'model key', output_mode: 'files_with_matches' }, 'c')
    expect(answer.ok && answer.found.mode === 'files_with_matches' && answer.found.filenames).toEqual(['pages/your-tools/providers.md'])
  })
})
