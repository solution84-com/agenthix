import { afterEach, describe, expect, it } from 'vitest'
import { executorImageName, LOCAL_EXECUTOR_IMAGE } from '../agentImage'

afterEach(() => {
  delete process.env.EXECUTOR_IMAGE
})

describe('the executor image a workflow step runs in @SC-1356', () => {
  it('is the one the host service passes in EXECUTOR_IMAGE', () => {
    process.env.EXECUTOR_IMAGE = 'ghcr.io/example/executor@sha256:' + 'b'.repeat(64)
    expect(executorImageName()).toBe('ghcr.io/example/executor@sha256:' + 'b'.repeat(64))
  })

  it('is the local build only when EXECUTOR_IMAGE is not set or empty', () => {
    expect(executorImageName()).toBe(LOCAL_EXECUTOR_IMAGE)
    process.env.EXECUTOR_IMAGE = '  '
    expect(executorImageName()).toBe('agenthix-executor')
  })
})
