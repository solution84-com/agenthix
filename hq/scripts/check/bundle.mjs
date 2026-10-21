#!/usr/bin/env node
// Runs the server bundle step in memory, writing nothing, so the failure that
// only booting the app used to show is found by a command instead.
//
// A module that nothing imports statically but something imports through
// `await import(...)` becomes a second Rollup chunk. The generated server is
// bundled with `output.file`, which refuses more than one chunk, and the whole
// bundle fails. The typecheck cannot see that, and neither can `wasp build`,
// which never runs the bundle step.
//
//   npm run check:bundle                       # this module (hq)
//   node scripts/check/bundle.mjs ../site      # another Wasp module
//
// Needs the generated output (`.wasp/out`, made by `npx wasp compile`, `start` or `build`).
// Takes about a second: it is the same Rollup run as the real bundle, minus the write.

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Bundles every config in memory. Returns one entry per config that failed to
 * bundle; an empty array means all of them bundle.
 *
 * @param {Function} rollup  the `rollup` function of the Rollup package
 * @param {Array<{ input: string, output: object }>} configs
 * @returns {Promise<Array<{ input: string, message: string }>>}
 */
export async function bundleInMemory(rollup, configs) {
  const failures = []
  for (const { output, ...inputOptions } of configs) {
    try {
      const bundle = await rollup({ ...inputOptions, onwarn: () => {} })
      try {
        await bundle.generate(output)
      } finally {
        await bundle.close()
      }
    } catch (error) {
      failures.push({ input: String(inputOptions.input), message: error instanceof Error ? error.message : String(error) })
    }
  }
  return failures
}

async function main() {
  const root = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
  const serverDir = resolve(root, '.wasp/out/server')
  const configPath = resolve(serverDir, 'rollup.config.js')
  if (!existsSync(configPath)) {
    console.error(`[check:bundle] ${configPath} does not exist. Generate the app first: \`npx wasp compile\` in ${root}.`)
    process.exit(2)
  }

  // The generated config's inputs are relative to the server directory, and its
  // esbuild plugin reads the tsconfig from the working directory.
  process.chdir(serverDir)
  const { rollup } = createRequire(resolve(root, 'package.json'))('rollup')
  const { default: configs } = await import(pathToFileURL(configPath).href)

  const failures = await bundleInMemory(rollup, configs)
  if (failures.length === 0) {
    console.log(`[check:bundle] ${configs.length} server bundle(s) built in memory (${root})`)
    return
  }
  for (const { input, message } of failures) console.error(`[check:bundle] ${input} failed to bundle:\n${message}`)
  console.error(
    '[check:bundle] If the message is about "output.file" and multiple chunks, a module is reached only ' +
      'through a dynamic `import()`. Import it statically somewhere in the server graph too.'
  )
  process.exit(1)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
