#!/usr/bin/env node
// Builds the relay into dist/relay.js, and the PDF viewer page's files into dist/viewer/pdf.
//
// The server: as in console/, packages from npm (ws) stay external and load from node_modules at run time, and
// @agenthix/core is bundled: it is this repository's own source, and its built output uses extensionless imports that
// Node's ES module loader refuses.
//
// The viewer: browser code with pdf.js bundled in (pinned in package.json; no CDN), pdf.js's worker and the data it
// reads (standard fonts, character maps, colour profiles, image decoders) copied beside it — never pdf.js's scripting
// sandbox — and its style with ui's design tokens ahead of it.
import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundled = path => path === '@agenthix/core' || path.startsWith('@agenthix/core/')

await build({
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  entryPoints: ['src/main.ts'],
  outfile: 'dist/relay.js',
  plugins: [{
    name: 'npm-packages-external',
    setup(b) {
      b.onResolve({ filter: /^[^./#]/ }, args => (bundled(args.path) ? undefined : { path: args.path, external: true }))
    },
  }],
})

const viewer = join(root, 'dist/viewer/pdf')
const pdfjs = join(root, 'node_modules/pdfjs-dist')
rmSync(viewer, { recursive: true, force: true })
mkdirSync(viewer, { recursive: true })

await build({
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  minify: true,
  logLevel: 'info',
  entryPoints: ['viewer/pdf/main.ts'],
  outfile: join(viewer, 'viewer.js'),
  legalComments: 'linked',
})

cpSync(join(pdfjs, 'build/pdf.worker.min.mjs'), join(viewer, 'pdf.worker.mjs'))
cpSync(join(pdfjs, 'cmaps'), join(viewer, 'cmaps'), { recursive: true })
cpSync(join(pdfjs, 'standard_fonts'), join(viewer, 'standard_fonts'), { recursive: true })
cpSync(join(pdfjs, 'iccs'), join(viewer, 'iccs'), { recursive: true })
// The image decoders only; quickjs is pdf.js's scripting engine, which the viewer never runs.
mkdirSync(join(viewer, 'wasm'))
for (const name of [
  'openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'jbig2.wasm', 'jbig2_nowasm_fallback.js', 'qcms_bg.wasm',
  'LICENSE_OPENJPEG', 'LICENSE_PDFJS_OPENJPEG', 'LICENSE_JBIG2', 'LICENSE_PDFJS_JBIG2', 'LICENSE_QCMS', 'LICENSE_PDFJS_QCMS',
]) cpSync(join(pdfjs, 'wasm', name), join(viewer, 'wasm', name))
cpSync(join(pdfjs, 'LICENSE'), join(viewer, 'LICENSE_PDFJS'))

// ui's tokens are a Tailwind theme block; outside Tailwind the same variables are declared on :root.
const tokens = readFileSync(join(root, '../ui/src/theme/tokens.css'), 'utf8').replace(/@theme\s*\{/, ':root {')
writeFileSync(join(viewer, 'viewer.css'), `${tokens}\n${readFileSync(join(root, 'viewer/pdf/viewer.css'), 'utf8')}`)
console.log(`viewer: ${viewer}`)
