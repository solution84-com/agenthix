import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('../siteHealthReport', () => ({ takeHealth: vi.fn() }))

import { readLogs } from '../diagnosticsMethods'
import { startLogFile } from '../../utils/logFile'
import { Logger } from '../../utils/logger'

const SECRET = 'sk-ant-oat01-ThisIsAClaudeLoginThatMustNeverBeWritten'
let dir: string

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-logs-'))
  startLogFile(dir)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const logger = new Logger('dispatch')
  logger.info('tick')
  logger.error(`run r-1 failed with ${SECRET}`, { runId: 'r-1', token: SECRET })
  logger.warn('Docker is not running')
})

afterAll(async () => {
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})

describe("site.readLogs: a page of this site's own log @SC-765", () => {
  it('starts at errors and warnings, newest first, with each line dated, levelled and sourced', async () => {
    const page = await readLogs({})
    expect(page.lines.map(l => [l.level, l.source])).toEqual([['warn', 'dispatch'], ['error', 'dispatch']])
    expect(page.lines[1].fields?.runId).toBe('r-1')
    expect(Date.parse(page.lines[0].at)).not.toBeNaN()
    expect(page.nextCursor).toBeNull()
  })

  it('reads everything when asked, and checks what it is sent', async () => {
    expect((await readLogs({ levels: 'all' })).lines).toHaveLength(3)
    expect((await readLogs({ levels: 'all', limit: 'many', search: 42 })).lines).toHaveLength(3)
  })

  it('wrote no secret to the file @SC-764', async () => {
    const files = await fs.readdir(dir)
    const text = (await Promise.all(files.map(f => fs.readFile(path.join(dir, f), 'utf8')))).join('')
    expect(text).toContain('run r-1 failed')
    expect(text).not.toContain(SECRET)
  })
})
