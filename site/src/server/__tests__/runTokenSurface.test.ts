/**
 * Workflows spec, security V3: no site endpoint the agent's run token can call returns a run instruction, unmasked
 * output or a secret. A run's instruction, its step values and its masking material live in the executor
 * (`executor/`) and reach the site only on the control channel from hq (`server/hq/channelMethods.ts`, the
 * `workflow.*` methods), which no HTTP route calls. This holds that by three checks: the routes are the ones
 * reviewed, no route's code can reach the executor or the channel's methods, and the agent's workflow tools carry no
 * way to ask for a run's own material.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { WORKFLOW_TOOL_DECLARATIONS } from '@agenthix/core'
import { ROUTES } from '../app'

const SRC = path.resolve(__dirname, '../..')

/** Every source file a route's handler can reach through its imports, dynamic ones included. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
      if (!m[1].startsWith('.')) continue
      const base = path.resolve(path.dirname(file), m[1])
      const found = [`${base}.ts`, path.join(base, 'index.ts')].find(c => fs.existsSync(c))
      if (found) walk(found)
    }
  }
  walk(entry)
  return seen
}

describe('V3: what an agent’s run token can call on the site @SC-1353', () => {
  it('is these routes and no other; a new one has to be reviewed against V3 here', () => {
    expect(ROUTES.map(r => `${r.method} ${r.path}`).sort()).toEqual([
      'all /api/v1/model-relay/:provider{/*rest}',
      'get /api/v1/identity/whoami',
      'get /health',
      'post /api/v1/harness/claude-key',
      'post /api/v1/harness/gate',
      'post /api/v1/harness/turn',
      'post /mcp',
    ].sort())
  })

  it('has no route whose code can reach the executor or the control channel’s methods', () => {
    const forbidden = [path.join(SRC, 'executor') + path.sep, path.join(SRC, 'server/hq/channelMethods')]
    const here = path.join(SRC, 'server/app.ts')
    const files = [...reachable(here)]
    expect(files.length).toBeGreaterThan(20)
    const leaks = files.filter(f => forbidden.some(x => f.startsWith(x)))
    expect(leaks.map(f => path.relative(SRC, f))).toEqual([])
  })

  it('gives the agent’s workflow tools no argument or tool that returns a run’s instruction, output or secrets', () => {
    const names = WORKFLOW_TOOL_DECLARATIONS.map(d => d.name)
    expect(names).toEqual(expect.arrayContaining(['run_workflow']))
    for (const d of WORKFLOW_TOOL_DECLARATIONS) {
      expect(d.name).not.toMatch(/secret|instruction|token|env/i)
      for (const arg of Object.keys(d.args)) expect(arg).not.toMatch(/secret|instruction|token|env|material/i)
    }
  })
})
