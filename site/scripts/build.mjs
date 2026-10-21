#!/usr/bin/env node
// Builds the site's server into dist/server.js (ADR-0086).
//
// Packages from npm stay external and load from node_modules at run time.
// @agenthix/core is bundled instead: it is this repository's own source, and
// its built output uses extensionless imports, which Node's ES module loader
// refuses. So the image needs no copy of core/ at run time.
import { build } from 'esbuild'

const bundled = path => path === '@agenthix/core' || path.startsWith('@agenthix/core/')

await build({
  entryPoints: ['src/server/main.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  plugins: [{
    name: 'npm-packages-external',
    setup(b) {
      // A bare specifier: not relative, not absolute, not a `#` subpath import.
      b.onResolve({ filter: /^[^./#]/ }, args => (bundled(args.path) ? undefined : { path: args.path, external: true }))
    },
  }],
})
