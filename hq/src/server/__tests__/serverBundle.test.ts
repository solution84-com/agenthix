import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { rollup } from 'rollup'

// Loaded by path rather than imported: the package's tsconfig is composite and
// lists only src/, so a static import of a file under scripts/ is a type error.
type BundleInMemory = (
  rollupFn: typeof rollup,
  configs: Array<{ input: string; output: { file: string; format: string } }>
) => Promise<Array<{ input: string; message: string }>>

const scriptPath = resolve(__dirname, '../../../scripts/check/bundle.mjs')
async function loadBundleInMemory(): Promise<BundleInMemory> {
  const module = (await import(/* @vite-ignore */ pathToFileURL(scriptPath).href)) as { bundleInMemory: BundleInMemory }
  return module.bundleInMemory
}

// R-124: a module reached only through `await import(...)` becomes a second
// Rollup chunk, and the generated server bundles to `output.file`, which
// refuses more than one. Nothing else the repository runs notices.

async function withFixture(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-check-'))
  try {
    for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source)
    const bundleInMemory = await loadBundleInMemory()
    return await bundleInMemory(rollup, [
      { input: join(dir, 'entry.js'), output: { file: join(dir, 'out.js'), format: 'es' } },
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('bundleInMemory', () => {
  it('fails on a module reached only through a dynamic import', async () => {
    const failures = await withFixture({
      'entry.js': `export async function boot() { const { seed } = await import('./seed.js'); return seed() }`,
      'seed.js': `export function seed() { return 1 }`,
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toMatch(/output\.file/)
  })

  it('passes when the dynamically imported module is also imported statically', async () => {
    const failures = await withFixture({
      'entry.js': `import { other } from './seed.js'\nexport async function boot() { const { seed } = await import('./seed.js'); return seed() + other }`,
      'seed.js': `export const other = 2\nexport function seed() { return 1 }`,
    })
    expect(failures).toEqual([])
  })
})

const generatedServer = resolve(__dirname, '../../../.wasp/out/server/rollup.config.js')

describe('the generated hq server bundle', () => {
  // Skipped, visibly, on a checkout where wasp has not generated the app yet.
  it.skipIf(!existsSync(generatedServer))('bundles (npm run check:bundle)', () => {
    const run = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
  }, 60_000)
})
