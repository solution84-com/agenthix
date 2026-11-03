import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearExperimentalFailures, experimentalFailuresGlobalSetup, formatExperimentalFailures, readExperimentalFailures,
  recordExperimentalFailure,
} from '../experimentalFailures.js'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'experimental-failures-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('the experimental failures record @SC-1764', () => {
  it('reads back what was written, from every process\'s file', () => {
    recordExperimentalFailure({ flag: 'livePreview', test: 'a > b', error: 'boom' }, dir)
    fs.writeFileSync(path.join(dir, '1.jsonl'), `${JSON.stringify({ flag: 'other', test: 'c', error: 'bang' })}\n`)
    expect(readExperimentalFailures(dir)).toEqual(expect.arrayContaining([
      { flag: 'livePreview', test: 'a > b', error: 'boom' },
      { flag: 'other', test: 'c', error: 'bang' },
    ]))
  })

  it('skips a line that is not a record, and answers none for a folder that is not there', () => {
    fs.writeFileSync(path.join(dir, '2.jsonl'), 'not json\n{"flag":1}\n\n{"flag":"f","test":"t","error":"e"}\n')
    fs.writeFileSync(path.join(dir, 'notes.txt'), '{"flag":"x","test":"t","error":"e"}\n')
    expect(readExperimentalFailures(dir)).toEqual([{ flag: 'f', test: 't', error: 'e' }])
    expect(readExperimentalFailures(path.join(dir, 'missing'))).toEqual([])
  })

  it('clears a run\'s records', () => {
    recordExperimentalFailure({ flag: 'f', test: 't', error: 'e' }, dir)
    clearExperimentalFailures(dir)
    expect(readExperimentalFailures(dir)).toEqual([])
  })

  it('summarises by flag: the count, then each test with the first line of its error', () => {
    expect(formatExperimentalFailures([
      { flag: 'b', test: 'x', error: 'first\nsecond' },
      { flag: 'a', test: 'y', error: 'one' },
      { flag: 'b', test: 'z', error: 'two' },
    ])).toEqual([
      'Experimental failures: a, 1 test',
      '  y: one',
      'Experimental failures: b, 2 tests',
      '  x: first',
      '  z: two',
    ])
    expect(formatExperimentalFailures([])).toEqual([])
  })

  it('a run\'s global setup clears the last run and prints this run\'s summary at the end', () => {
    recordExperimentalFailure({ flag: 'stale', test: 't', error: 'e' }, dir)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const teardown = experimentalFailuresGlobalSetup(dir)
      recordExperimentalFailure({ flag: 'fresh', test: 't', error: 'e' }, dir)
      teardown()
      expect(log).toHaveBeenCalledTimes(1)
      expect(log.mock.calls[0][0]).toContain('Experimental failures: fresh, 1 test')
      expect(log.mock.calls[0][0]).not.toContain('stale')
    } finally {
      log.mockRestore()
    }
  })
})
