#!/usr/bin/env node
// Writes hq/assets/platform-guide/ (gitignored) from docs/guide/ and hq's tool registry, and fails on a bad page.
// hq's image runs it in its Wasp stage and hq's dev start runs it before the server.
//   node scripts/guide/build-platform-guide.mjs
//
// The build reads hq's TypeScript (the tool registry), so esbuild bundles it first, in memory, to a temporary file.
import { build } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const hqRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const { outputFiles } = await build({
  entryPoints: [resolve(hqRoot, 'src/knowledge/guideBuild/cli.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  logLevel: 'error',
  // CommonJS packages inside the bundle may call require().
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  absWorkingDir: hqRoot,
})

const dir = mkdtempSync(resolve(tmpdir(), 'platform-guide-'))
try {
  const file = resolve(dir, 'build.mjs')
  writeFileSync(file, outputFiles[0].text)
  const module = await import(pathToFileURL(file).href)
  module.run(hqRoot)
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
