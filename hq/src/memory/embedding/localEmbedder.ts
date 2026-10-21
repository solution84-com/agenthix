/**
 * The local embedding model as a platform component (memory and knowledge spec, Recall by meaning): run in hq's
 * own process through ONNX Runtime's WebAssembly build, which needs nothing native and runs on every image hq
 * ships on. Loaded once, lazily, on the first text to embed; its files come from the image when it carries them
 * and are otherwise fetched once into hq's own storage. Calls run one at a time.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Embedder } from '../contract'
import { getHqStorageRoot } from '../../server/hqStoragePaths'
import { LOCAL_EMBEDDING_MODEL, type ModelManifest } from './localModelManifest'
import { fetchModel, holdsModel, type FetchFile } from './localModelFiles'

/** The organisation setting's name for this model. */
export const LOCAL_MODEL = 'local'

export interface Encoded { ids: number[]; attentionMask: number[] }

/** What the embedder needs of a tokenizer and a model session; tests stand in for both. */
export interface LocalRuntime {
  encode(text: string): Encoded
  /** The model's last hidden state for one text: `tokens × dims` values. */
  run(encoded: Encoded): Promise<{ data: ArrayLike<number>; dims: number }>
}

/** Where the model's files are: the image's copy when complete, else hq's storage, fetched there when missing. */
export async function modelDirectory(manifest: ModelManifest = LOCAL_EMBEDDING_MODEL, fetchFile?: FetchFile): Promise<string> {
  const bundled = process.env.HQ_BUNDLED_MODELS_DIR
  if (bundled) {
    const dir = path.join(bundled, manifest.name)
    if (await holdsModel(dir, manifest)) return dir
  }
  const stored = path.join(getHqStorageRoot(), 'models', manifest.name)
  if (!(await holdsModel(stored, manifest))) await fetchModel(stored, manifest, fetchFile)
  return stored
}

/** Keeps the first word pieces and the closing marker, so a long text is read as far as the model can. */
export function truncate(encoded: Encoded, max: number): Encoded {
  if (encoded.ids.length <= max) return encoded
  const keep = (values: number[]) => [...values.slice(0, max - 1), values[values.length - 1]]
  return { ids: keep(encoded.ids), attentionMask: keep(encoded.attentionMask) }
}

/** The sentence vector: the mean of the attended tokens' states, at unit length. */
export function meanPool(data: ArrayLike<number>, mask: readonly number[], dims: number): number[] {
  const sum = new Array<number>(dims).fill(0)
  let count = 0
  for (let t = 0; t < mask.length; t++) {
    if (!mask[t]) continue
    count++
    for (let d = 0; d < dims; d++) sum[d] += data[t * dims + d]
  }
  const mean = sum.map(v => (count ? v / count : 0))
  const norm = Math.sqrt(mean.reduce((s, v) => s + v * v, 0))
  return norm === 0 ? mean : mean.map(v => v / norm)
}

async function loadRuntime(manifest: ModelManifest = LOCAL_EMBEDDING_MODEL): Promise<LocalRuntime> {
  const dir = await modelDirectory(manifest)
  const fileOf = (name: string) => path.join(dir, name)
  const [ort, { Tokenizer }] = await Promise.all([import('onnxruntime-web'), import('@huggingface/tokenizers')])
  ort.env.wasm.numThreads = 1
  const tokenizer = new Tokenizer(
    JSON.parse(await readFile(fileOf('tokenizer.json'), 'utf8')),
    JSON.parse(await readFile(fileOf('tokenizer_config.json'), 'utf8')),
  )
  const session = await ort.InferenceSession.create(await readFile(fileOf('model.onnx')))
  const int64 = (values: number[]) => new ort.Tensor('int64', BigInt64Array.from(values.map(BigInt)), [1, values.length])
  return {
    encode(text) {
      const encoding = tokenizer.encode(text)
      return { ids: encoding.ids, attentionMask: encoding.attention_mask }
    },
    async run({ ids, attentionMask }) {
      const outputs = await session.run({
        input_ids: int64(ids),
        attention_mask: int64(attentionMask),
        token_type_ids: int64(ids.map(() => 0)),
      })
      const hidden = outputs[session.outputNames[0]]
      return { data: hidden.data as Float32Array, dims: hidden.dims[2] }
    },
  }
}

export function createLocalEmbedder(
  load: () => Promise<LocalRuntime> = () => loadRuntime(),
  manifest: ModelManifest = LOCAL_EMBEDDING_MODEL,
): Embedder {
  let runtime: Promise<LocalRuntime> | null = null
  let queue: Promise<unknown> = Promise.resolve()
  return {
    model: LOCAL_MODEL,
    dimensions: manifest.dimensions,
    embed(texts) {
      const job = queue.then(async () => {
        // A failed load (no network for the first fetch) is tried again on the next call.
        runtime ??= load().catch(error => {
          runtime = null
          throw error
        })
        const loaded = await runtime
        const vectors: number[][] = []
        for (const text of texts) {
          const encoded = truncate(loaded.encode(text), manifest.maxTokens)
          const { data, dims } = await loaded.run(encoded)
          vectors.push(meanPool(data, encoded.attentionMask, dims))
        }
        return vectors
      })
      queue = job.catch(() => undefined)
      return job
    },
  }
}
