/**
 * The thread harness: the real thread components on a page of their own, with a scripted reply and no server, served
 * by Vite from this folder (`npx vite --config e2e/harness/vite.config.ts` from `hq/`). It is never part of hq's build:
 * hq's own Vite configuration does not reach this folder. Wasp's client modules are replaced by stand-ins, since
 * nothing here talks to hq's server.
 */
import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../../src')

/** Every name hq's code imports from each `wasp/...` module, so each stand-in exports them all. */
function importedNames(): Map<string, Set<string>> {
  const byModule = new Map<string, Set<string>>()
  for (const file of globSync('**/*.{ts,tsx}', { cwd: src })) {
    const text = readFileSync(path.join(src, file), 'utf8')
    for (const m of text.matchAll(/import\s+(?:type\s+)?(\w+\s*,\s*)?\{([^}]*)\}\s*from\s*['"](wasp\/[^'"]+)['"]/g)) {
      const names = byModule.get(m[3]!) ?? new Set<string>()
      for (const part of m[2]!.split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim()
        if (name && !part.trim().startsWith('type ')) names.add(name)
      }
      byModule.set(m[3]!, names)
    }
  }
  return byModule
}

/** Wasp's client modules as stand-ins: queries find nothing, actions do nothing, the person is signed in. */
function waspStandIns(): Plugin {
  const names = importedNames()
  const PREFIX = '\0wasp-stand-in:'
  return {
    name: 'wasp-stand-ins',
    enforce: 'pre',
    resolveId(id) {
      return id.startsWith('wasp/') ? PREFIX + id : null
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null
      const lines = [
        'const nothing = { data: undefined, error: null, isLoading: false, isSuccess: false, refetch: async () => undefined }',
        'const stand = async () => undefined',
      ]
      for (const name of names.get(id.slice(PREFIX.length)) ?? []) {
        if (name === 'useAuth') lines.push(`export const useAuth = () => ({ data: { id: 'harness-person' }, isLoading: false })`)
        else if (name === 'useAction') lines.push('export const useAction = () => stand')
        else if (/^use[A-Z]/.test(name)) lines.push(`export const ${name} = () => nothing`)
        else if (/^[A-Z]/.test(name)) lines.push(`export class ${name} extends Error {}`)
        else lines.push(`export const ${name} = stand`)
      }
      lines.push('export default {}')
      return lines.join('\n')
    },
  }
}

export default defineConfig({
  root: here,
  // Its own dependency cache: sharing hq's would make the running dev server's cache out of date.
  cacheDir: path.resolve(here, '../../node_modules/.vite-harness'),
  plugins: [waspStandIns(), react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', fs: { allow: [path.resolve(here, '../../..')] } },
})
