/**
 * Puts the local embedding model's files in a directory, once: each file fetched from its pinned revision, written
 * under a temporary name and kept only when its digest matches the manifest. Used by hq on first use and by the
 * image build, so it imports nothing but Node's own modules.
 */
import { createHash } from 'node:crypto'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ModelFile, ModelManifest } from './localModelManifest'

export type FetchFile = (url: string) => Promise<{ ok: boolean; status: number; body: AsyncIterable<Uint8Array> | null }>

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size
  } catch {
    return null
  }
}

/** Whether every file of the model is in `dir`, at its size. Digests are checked when a file is fetched. */
export async function holdsModel(dir: string, manifest: ModelManifest): Promise<boolean> {
  for (const file of manifest.files) {
    if ((await sizeOf(path.join(dir, file.file))) !== file.bytes) return false
  }
  return true
}

/** Fetches every file `dir` does not already hold at its size. Throws, keeping nothing, on a failed fetch or a wrong digest. */
export async function fetchModel(dir: string, manifest: ModelManifest, fetchFile: FetchFile = fetch as unknown as FetchFile): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const file of manifest.files) {
    const target = path.join(dir, file.file)
    if ((await sizeOf(target)) === file.bytes) continue
    await fetchOne(`${manifest.source}/${file.path}`, target, file, fetchFile)
  }
}

async function fetchOne(url: string, target: string, file: ModelFile, fetchFile: FetchFile): Promise<void> {
  const response = await fetchFile(url)
  if (!response.ok || !response.body) throw new Error(`Fetching ${file.path} of the embedding model failed (HTTP ${response.status})`)
  const partial = `${target}.${process.pid}.partial`
  const hash = createHash('sha256')
  const out = await open(partial, 'w')
  let bytes = 0
  try {
    for await (const chunk of response.body) {
      hash.update(chunk)
      bytes += chunk.byteLength
      if (bytes > file.bytes) throw new Error(`${file.path} of the embedding model is larger than expected`)
      await out.write(chunk)
    }
    await out.close()
    const digest = hash.digest('hex')
    if (digest !== file.sha256) throw new Error(`${file.path} of the embedding model does not match its digest`)
    await rename(partial, target)
  } catch (error) {
    await out.close().catch(() => undefined)
    await rm(partial, { force: true })
    throw error
  }
}
