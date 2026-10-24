#!/usr/bin/env node
// Builds the host service (dist/host.js), its CLI (dist/cli.js) and its launcher (dist/launcher.js), and the CLI's command in dist/bin/, named
// from the branding module. Everything is bundled, @agenthix/core included, so the image needs no node_modules:
// the service uses Node's own modules, the docker CLI, and the bundled S3 client for a backup location Cloud sets.
import { build } from 'esbuild'
import fs from 'node:fs'

// No version is built in: the host service learns its own from the image reference it was started from
// (src/images/ownVersion.ts), so the same build serves every version it is published as.
// The bundled S3 client is CommonJS and `require`s Node's own modules as it loads; an ES module has no `require`, so
// each bundle makes one (`scripts/check-bundles.mjs` starts every bundle to prove it loads).
const common = {
  bundle: true, platform: 'node', target: 'node22', format: 'esm', sourcemap: true, logLevel: 'info',
  banner: { js: "import { createRequire as __hostCreateRequire } from 'node:module'; const require = __hostCreateRequire(import.meta.url);" },
}

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/host.js' })
await build({ ...common, entryPoints: ['src/cli/main.ts'], outfile: 'dist/cli.js' })
// The launcher, the image's second entry point, which swaps the host service's container for a new version (ADR-0118).
await build({ ...common, entryPoints: ['src/launcher/main.ts'], outfile: 'dist/launcher.js' })

// The command's name comes from core's branding module, read through a bundle because core's built output uses
// extensionless imports that Node's loader refuses.
const names = await build({
  stdin: { contents: "export { BRANDING } from '@agenthix/core'", resolveDir: '.' },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const { BRANDING } = await import(`data:text/javascript;base64,${Buffer.from(names.outputFiles[0].text).toString('base64')}`)
fs.mkdirSync('dist/bin', { recursive: true })
fs.writeFileSync(`dist/bin/${BRANDING.cliCommand}`, '#!/bin/sh\nexec node --enable-source-maps /app/dist/cli.js "$@"\n', { mode: 0o755 })
