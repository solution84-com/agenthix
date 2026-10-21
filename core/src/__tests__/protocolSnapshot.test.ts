/**
 * Each connection's declared shape against its committed snapshot (core/snapshot/). A difference fails, saying
 * what changed and what the version must become; once the version is right, `npm run snapshot:update` records the
 * new shape, and refuses to while a rule is broken.
 */
import { describe, expect, it } from 'vitest'
import { CONNECTIONS, CORE_SRC, coreProgram, readSnapshot, writeSnapshot } from './protocolSnapshot/connections.js'
import { extractConnection } from './protocolSnapshot/extract.js'
import { judge } from './protocolSnapshot/rules.js'
import { canonical } from './protocolSnapshot/shape.js'

// Core has no Node type declarations; vitest runs under Node.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const UPDATE = env.PROTOCOL_SNAPSHOT_UPDATE === '1'
const program = coreProgram()

describe('every connection matches its committed shape snapshot @SC-1133', () => {
  for (const connection of CONNECTIONS) {
    it(connection.name, () => {
      const now = extractConnection(program, CORE_SRC, connection)
      const before = readSnapshot(connection.name)
      const previous = connection.previousMajor.length
        ? extractConnection(program, CORE_SRC, { ...connection, modules: connection.previousMajor, constants: [] })
        : null

      if (!before) {
        // The first snapshot: nothing to compare with, but its marks keep the rules.
        const { problems } = judge(now, now, previous)
        expect(problems, problems.join('\n')).toEqual([])
        if (UPDATE) return writeSnapshot(now)
        throw new Error(`${connection.name}: no snapshot at core/snapshot/${connection.name}.json; run \`npm run snapshot:update\` in core`)
      }
      const verdict = judge(before, now, previous)
      expect(verdict.problems, verdict.problems.join('\n')).toEqual([])
      if (canonical(before) === canonical(now)) return
      if (UPDATE) return writeSnapshot(now)
      const changed = verdict.changes.map(c => `  ${c.at}: ${c.what}`).join('\n')
      throw new Error(
        `${connection.name}: the declared shape differs from core/snapshot/${connection.name}.json, and the version ` +
        `(${now.version}) allows it. Record it with \`npm run snapshot:update\` in core.\n${changed || '  the version moved'}`)
    })
  }
})
