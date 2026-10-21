// Puts the local embedding model memory embeds with into a directory, for hq's image (docker/Dockerfile): fetched
// once at build from its pinned revision and checked against its digests, so an install never fetches it itself.
// Node reads the two TypeScript modules directly; they import nothing but Node's own.
//
//   node scripts/models/fetch-embedding-model.mjs <directory>
import path from 'node:path'
import { LOCAL_EMBEDDING_MODEL } from '../../src/memory/embedding/localModelManifest.ts'
import { fetchModel } from '../../src/memory/embedding/localModelFiles.ts'

const root = process.argv[2]
if (!root) {
  console.error('Usage: node scripts/models/fetch-embedding-model.mjs <directory>')
  process.exit(2)
}
const dir = path.join(path.resolve(root), LOCAL_EMBEDDING_MODEL.name)
await fetchModel(dir, LOCAL_EMBEDDING_MODEL)
console.log(`${LOCAL_EMBEDDING_MODEL.name} is in ${dir}`)
