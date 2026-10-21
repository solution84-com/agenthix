import { describe, it, expect } from 'vitest'
import { RollingLog, LOG_RETENTION_MS, utf8Length, type LogFs } from '../rollingLog.js'
import { makeLogLine, parseLogLine, logLineText, type LogLevel } from '../logLine.js'
import { parseLogQuery } from '../logQuery.js'

/** A folder in memory, with the same contract `node:fs` gives the apps. */
function memoryFs(): LogFs & { files: Map<string, string> } {
  const files = new Map<string, string>()
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  return {
    files,
    async mkdir() {},
    async list(dir) {
      return [...files.keys()].filter(p => p.startsWith(`${dir}/`)).map(base)
    },
    async size(file) {
      return utf8Length(files.get(file) ?? '')
    },
    async append(file, text) {
      files.set(file, (files.get(file) ?? '') + text)
    },
    async read(file) {
      const text = files.get(file)
      if (text === undefined) throw new Error('ENOENT')
      return text
    },
    async remove(file) {
      files.delete(file)
    },
  }
}

const DIR = '/logs'

function setup(start = '2026-10-10T12:00:00.000Z', opts: { maxTotalBytes?: number; segmentMaxBytes?: number } = {}) {
  const fs = memoryFs()
  let now = new Date(start)
  const log = new RollingLog(DIR, fs, { now: () => now, ...opts })
  const write = (level: LogLevel, message: string, fields?: Record<string, unknown>) =>
    log.write(makeLogLine(level, 'test', message, fields ? [fields] : [], now))
  return { fs, log, write, at: (iso: string) => { now = new Date(iso) } }
}

describe('RollingLog: writing @SC-762', () => {
  it('writes one JSON line per call to a file named by its day', async () => {
    const { fs, log, write } = setup()
    write('info', 'first')
    write('error', 'second', { runId: 'r-1' })
    await log.flush()
    expect([...fs.files.keys()]).toEqual([`${DIR}/2026-10-10.000.jsonl`])
    const lines = fs.files.get(`${DIR}/2026-10-10.000.jsonl`)!.trim().split('\n').map(parseLogLine)
    expect(lines.map(l => l?.message)).toEqual(['first', 'second'])
    expect(lines[1]?.fields).toEqual({ runId: 'r-1' })
  })

  it('starts a new file each day and when one passes its size', async () => {
    const { fs, log, write, at } = setup(undefined, { segmentMaxBytes: 300 })
    for (let i = 0; i < 4; i++) write('info', `line ${i} ${'x'.repeat(10)}`)
    await log.flush()
    at('2026-10-11T00:00:01.000Z')
    write('info', 'next day')
    await log.flush()
    expect([...fs.files.keys()].sort()).toEqual([
      `${DIR}/2026-10-10.000.jsonl`, `${DIR}/2026-10-10.001.jsonl`, `${DIR}/2026-10-11.000.jsonl`,
    ])
  })

  it('carries on in the latest file of the day after a restart', async () => {
    const first = setup()
    first.write('info', 'before restart')
    await first.log.flush()
    const again = new RollingLog(DIR, first.fs, { now: () => new Date('2026-10-10T13:00:00.000Z') })
    again.write(makeLogLine('info', 'test', 'after restart', [], new Date('2026-10-10T13:00:00.000Z')))
    await again.flush()
    expect([...first.fs.files.keys()]).toEqual([`${DIR}/2026-10-10.000.jsonl`])
  })

  it('never throws when the disk refuses, and reports it once', async () => {
    const fs = memoryFs()
    const errors: unknown[] = []
    fs.append = async () => { throw new Error('EACCES') }
    const log = new RollingLog(DIR, fs, { onError: e => errors.push(e) })
    log.write(makeLogLine('info', 't', 'a'))
    log.write(makeLogLine('info', 't', 'b'))
    await log.flush()
    expect(errors).toHaveLength(1)
  })
})

describe('RollingLog: 7 days or 100 MB, whichever first, oldest dropped first @SC-762', () => {
  it('drops a day once every line in it is older than 7 days', async () => {
    const { fs, log, write, at } = setup('2026-10-01T10:00:00.000Z')
    write('info', 'old')
    await log.flush()
    at('2026-10-02T10:00:00.000Z')
    write('info', 'newer')
    await log.flush()
    at(new Date(Date.parse('2026-10-02T00:00:00.000Z') + LOG_RETENTION_MS + 1000).toISOString())
    await log.prune()
    expect([...fs.files.keys()].sort()).toEqual([`${DIR}/2026-10-02.000.jsonl`])
  })

  it('drops the oldest files while the folder is over its size, never the one being written', async () => {
    const { fs, log, write } = setup(undefined, { segmentMaxBytes: 200, maxTotalBytes: 600 })
    for (let i = 0; i < 12; i++) write('info', `line ${i} ${'y'.repeat(120)}`)
    await log.flush()
    await log.prune()
    const sizes = [...fs.files.values()].map(t => utf8Length(t))
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(600)
    const kept = [...fs.files.keys()].sort()
    expect(kept[kept.length - 1]).toBe(`${DIR}/2026-10-10.011.jsonl`)
    const page = await log.read(parseLogQuery({ levels: 'all' }))
    expect(page.lines[0].message).toMatch(/^line 11 /)
  })
})

describe('RollingLog: reading @SC-763', () => {
  async function filled() {
    const s = setup('2026-10-09T08:00:00.000Z', { segmentMaxBytes: 400 })
    const plan: [string, LogLevel, string][] = [
      ['2026-10-09T08:00:00.000Z', 'info', 'tick'],
      ['2026-10-09T09:00:00.000Z', 'error', 'run r-1 failed: login expired'],
      ['2026-10-10T10:00:00.000Z', 'warn', 'Docker not running on Build server 2'],
      ['2026-10-10T11:00:00.000Z', 'info', 'tick'],
      ['2026-10-10T12:00:00.000Z', 'error', 'GitHub refused a push to acme/web'],
      ['2026-10-10T13:00:00.000Z', 'warn', 'turn limit reached'],
    ]
    for (const [at, level, message] of plan) {
      s.at(at)
      s.write(level, message)
    }
    await s.log.flush()
    return s
  }

  it('starts at errors and warnings, newest first, across files and days', async () => {
    const { log } = await filled()
    const page = await log.read(parseLogQuery({}))
    expect(page.lines.map(l => l.message)).toEqual([
      'turn limit reached', 'GitHub refused a push to acme/web', 'Docker not running on Build server 2', 'run r-1 failed: login expired',
    ])
    expect(page.nextCursor).toBeNull()
  })

  it('adds the informational lines with everything', async () => {
    const { log } = await filled()
    expect((await log.read(parseLogQuery({ levels: 'all' }))).lines).toHaveLength(6)
  })

  it('pages back with a cursor, without repeating or skipping a line', async () => {
    const { log } = await filled()
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page = await log.read(parseLogQuery({ levels: 'all', limit: 2, cursor }))
      seen.push(...page.lines.map(l => `${l.at} ${l.message}`))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(6)
    expect(new Set(seen).size).toBe(6)
    expect([...seen].sort().reverse()).toEqual(seen)
  })

  it('keeps to a time range and a search, without regard to case', async () => {
    const { log } = await filled()
    const ranged = await log.read(parseLogQuery({ levels: 'all', since: '2026-10-10T10:30:00.000Z', until: '2026-10-10T12:30:00.000Z' }))
    expect(ranged.lines.map(l => l.message)).toEqual(['GitHub refused a push to acme/web', 'tick'])
    const searched = await log.read(parseLogQuery({ levels: 'all', search: 'DOCKER' }))
    expect(searched.lines.map(l => l.message)).toEqual(['Docker not running on Build server 2'])
  })

  it('skips a line cut short by a crash', async () => {
    const { fs, log } = await filled()
    const last = [...fs.files.keys()].sort().pop()!
    fs.files.set(last, `${fs.files.get(last)}{"at":"2026-10-10T14:00:00.000Z","lev`)
    expect((await log.read(parseLogQuery({ levels: 'all' }))).lines[0].message).toBe('turn limit reached')
  })

  it('ignores a cursor it did not make', async () => {
    const { log } = await filled()
    for (const cursor of ['../../etc/passwd:3', 'nonsense', '2026-10-10.000.jsonl:-1']) {
      const page = await log.read(parseLogQuery({ cursor }))
      expect(page.lines).toHaveLength(4)
    }
  })
})

describe('logLineText @SC-763', () => {
  it('reads as date, level, source and message, with the stack below when asked', () => {
    const line = makeLogLine('error', 'dispatch', 'run failed', [new Error('boom'), { runId: 'r-1' }], new Date('2026-10-10T11:04:10.000Z'))
    expect(logLineText(line)).toMatch(/^2026-10-10T11:04:10\.000Z ERROR \[dispatch\] run failed \{/)
    const multi = logLineText(line, { multiline: true }).split('\n')
    expect(multi[0]).toContain('"runId":"r-1"')
    expect(multi[1]).toBe('Error: boom')
  })
})
