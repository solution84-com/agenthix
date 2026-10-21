/**
 * The local embedding model hq bundles (memory and knowledge spec, Recall by meaning): a small open sentence model,
 * the same on every install, pinned to one revision and checked against its digests. Listed in LICENSING.md.
 *
 * Kept free of imports so the image build can read it with Node alone (scripts/models/fetch-embedding-model.mjs).
 */
export interface ModelFile {
  /** Where the file is in the model's repository. */
  path: string
  /** Its name on disk. */
  file: string
  sha256: string
  bytes: number
}

export interface ModelManifest {
  name: string
  /** The revision's base address; each file is fetched from `<source>/<path>`. */
  source: string
  dimensions: number
  /** The most word pieces the model reads; longer text is cut. */
  maxTokens: number
  files: ModelFile[]
}

export const LOCAL_EMBEDDING_MODEL: ModelManifest = {
  name: 'all-MiniLM-L6-v2',
  source: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/1110a243fdf4706b3f48f1d95db1a4f5529b4d41',
  dimensions: 384,
  maxTokens: 256,
  files: [
    { path: 'onnx/model.onnx', file: 'model.onnx', sha256: '6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452', bytes: 90405214 },
    { path: 'tokenizer.json', file: 'tokenizer.json', sha256: 'be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037', bytes: 466247 },
    { path: 'tokenizer_config.json', file: 'tokenizer_config.json', sha256: 'acb92769e8195aabd29b7b2137a9e6d6e25c476a4f15aa4355c233426c61576b', bytes: 350 },
  ],
}
