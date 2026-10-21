import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { fetchModel, holdsModel, type FetchFile } from '../localModelFiles'
import type { ModelManifest } from '../localModelManifest'
import { modelDirectory } from '../localEmbedder'

const content = { 'model.onnx': 'weights', 'tokenizer.json': '{"t":1}' }
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const manifest: ModelManifest = {
  name: 'tiny', source: 'https://models.invalid/tiny/resolve/rev', dimensions: 3, maxTokens: 8,
  files: Object.entries(content).map(([file, text]) => ({ path: `onnx/${file}`, file, sha256: sha(text), bytes: text.length })),
}

function serving(files: Record<string, string>, asked: string[] = []): FetchFile {
  return async (url) => {
    asked.push(url)
    const text = files[path.basename(url)]
    if (text === undefined) return { ok: false, status: 404, body: null }
    return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode(text) })() }
  }
}

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'model-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('the local model\'s files @SC-988', () => {
  it('are fetched from the pinned revision and kept when their digests match', async () => {
    const asked: string[] = []
    await fetchModel(dir, manifest, serving(content, asked))
    expect(asked).toEqual(['https://models.invalid/tiny/resolve/rev/onnx/model.onnx', 'https://models.invalid/tiny/resolve/rev/onnx/tokenizer.json'])
    expect(await readFile(path.join(dir, 'model.onnx'), 'utf8')).toBe('weights')
    expect(await holdsModel(dir, manifest)).toBe(true)
  })

  it('are fetched once: a file already held is not fetched again', async () => {
    await fetchModel(dir, manifest, serving(content))
    const asked: string[] = []
    await fetchModel(dir, manifest, serving(content, asked))
    expect(asked).toEqual([])
  })

  it('are refused, and nothing kept, when a file does not match its digest', async () => {
    await expect(fetchModel(dir, manifest, serving({ ...content, 'model.onnx': 'WEIGHTS' }))).rejects.toThrow(/digest/)
    expect(await readdir(dir)).toEqual([])
  })

  it('are refused when a fetch fails', async () => {
    await expect(fetchModel(dir, manifest, serving({}))).rejects.toThrow(/HTTP 404/)
    expect(await holdsModel(dir, manifest)).toBe(false)
  })

  it('come from the image when it holds them, and from hq\'s storage otherwise', async () => {
    const bundled = path.join(dir, 'bundled')
    const storage = path.join(dir, 'storage')
    const before = { bundled: process.env.HQ_BUNDLED_MODELS_DIR, storage: process.env.HQ_STORAGE_ROOT }
    process.env.HQ_STORAGE_ROOT = storage
    try {
      process.env.HQ_BUNDLED_MODELS_DIR = bundled
      await fetchModel(path.join(bundled, 'tiny'), manifest, serving(content))
      const asked: string[] = []
      expect(await modelDirectory(manifest, serving(content, asked))).toBe(path.join(bundled, 'tiny'))
      expect(asked).toEqual([])

      await writeFile(path.join(bundled, 'tiny', 'model.onnx'), 'cut')
      expect(await modelDirectory(manifest, serving(content))).toBe(path.join(storage, 'models', 'tiny'))
      expect(await holdsModel(path.join(storage, 'models', 'tiny'), manifest)).toBe(true)
    } finally {
      for (const [key, value] of [['HQ_BUNDLED_MODELS_DIR', before.bundled], ['HQ_STORAGE_ROOT', before.storage]] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
