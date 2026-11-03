import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NO_FEATURE_SWITCHES, isFeatureOn } from '../../shared/featureFlags.js'
import { withFeature } from '../withFeature.js'
import { readExperimentalFailures } from '../experimentalFailures.js'

const inThisRun = (flag: 'usageBilling' | 'marketplace') => isFeatureOn(flag, { env: process.env, switches: NO_FEATURE_SWITCHES })

describe('withFeature in a unit test (adr-0172) @SC-1764', () => {
  it('runs as shipped outside the group', () => {
    expect(process.env.NODE_ENV).toBe('test')
    expect(inThisRun('usageBilling')).toBe(false)
  })

  withFeature('usageBilling', () => {
    it('switches the flag on inside the group, and only that flag', () => {
      expect(inThisRun('usageBilling')).toBe(true)
      expect(inThisRun('marketplace')).toBe(false)
    })

    it('is ignored outside a test run, so a production build never sees it', () => {
      expect(isFeatureOn('usageBilling', { env: { NODE_ENV: 'production' }, switches: NO_FEATURE_SWITCHES })).toBe(false)
      expect(isFeatureOn('usageBilling', { env: {}, switches: NO_FEATURE_SWITCHES })).toBe(false)
    })

    withFeature('usageBilling', () => {
      it('nests: an inner group for the same flag keeps it on', () => {
        expect(inThisRun('usageBilling')).toBe(true)
      })
    })

    it('is still on after an inner group for the same flag ends', () => {
      expect(inThisRun('usageBilling')).toBe(true)
    })
  })

  it('switches the flag off again after the group', () => {
    expect(inThisRun('usageBilling')).toBe(false)
  })
})

/** Runs one fixture file in a child vitest, with its own records folder, and answers its exit, output and records. */
function runFixture(file: string) {
  const fixtures = path.join(import.meta.dirname, 'fixtures')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'experimental-failures-'))
  const vitest = path.resolve(import.meta.dirname, '../../../node_modules/vitest/vitest.mjs')
  try {
    let status = 0
    let output: string
    try {
      output = execFileSync(process.execPath, [vitest, 'run', '--config', 'vitest.fixture.config.ts', '--root', fixtures], {
        cwd: fixtures,
        env: { ...process.env, NODE_ENV: 'test', FIXTURE_FILE: file, EXPERIMENTAL_FAILURES_DIR: dir, VITEST_MAX_WORKERS: '1' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string }
      status = e.status
      output = `${e.stdout}${e.stderr}`
    }
    return { status, output, records: readExperimentalFailures(dir) }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('a failing test of a feature in its group (adr-0172) @SC-1764', () => {
  it('at experimental, is recorded and reported, and does not fail the run', () => {
    const { status, output, records } = runFixture('experimental.fixture.ts')
    expect(status, output).toBe(0)
    expect(records).toEqual([{
      flag: 'trial',
      test: 'experimental.fixture.ts > with the trial feature on > breaks',
      error: expect.stringContaining('what it should do'),
    }])
    expect(output).toContain('Experimental failures: trial, 1 test')
    expect(output).toMatch(/1 passed/)
  }, 60_000)

  it('from preview on, fails the run as any other', () => {
    const { status, output, records } = runFixture('preview.fixture.ts')
    expect(status, output).not.toBe(0)
    expect(output).toMatch(/1 failed/)
    expect(records).toEqual([])
    expect(output).not.toContain('Experimental failures')
  }, 60_000)
})
