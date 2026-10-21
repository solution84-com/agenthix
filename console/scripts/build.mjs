#!/usr/bin/env node
// Builds the Fleet Console's server into dist/console.js and its command line into dist/cli.js. As in site/, packages from npm (express, ws) stay external
// and load from node_modules at run time, and @agenthix/core is bundled: it is this repository's own source, and its
// built output uses extensionless imports that Node's ES module loader refuses.
import { build } from 'esbuild'

// The version is fixed into the bundle when it is built (`dev` unless the image build passes one).
const version = process.env.CONSOLE_VERSION || 'dev'
if (!/^(dev|\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?)$/.test(version)) throw new Error(`CONSOLE_VERSION must be dev or a published version such as 0.2.0 or 1.0.0-alpha.1 (got ${version})`)
const bundled = path => path === '@agenthix/core' || path.startsWith('@agenthix/core/')

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  define: { 'process.env.CONSOLE_VERSION': JSON.stringify(version) },
  plugins: [{
    name: 'npm-packages-external',
    setup(b) {
      b.onResolve({ filter: /^[^./#]/ }, args => (bundled(args.path) ? undefined : { path: args.path, external: true }))
    },
  }],
}

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/console.js' })
// The command line the host service runs with `docker exec` (`node dist/cli.js local-join`).
await build({ ...common, entryPoints: ['src/cli.ts'], outfile: 'dist/cli.js' })
