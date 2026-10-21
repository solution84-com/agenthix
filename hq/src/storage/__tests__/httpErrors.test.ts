import { describe, it, expect } from 'vitest'
import { HttpError } from 'wasp/server'
import { asHttp, rethrowDispatchErrorAsHttp, rethrowLocationFileErrorAsHttp, rethrowRepoWorkErrorAsHttp } from '../httpErrors'
import { SiteUnreachableError } from '../workspaceStore'
import { LocationFileError, LOCATION_FILE_ERROR_MARKER, REPO_WORK_ERROR_MARKER, RepoWorkError } from '@agenthix/core'
import { AgentPackageMissingError, SystemPackageMissingError } from '../../packages/runPackages'
import { PackageDeliveryError } from '../../packages/packageDelivery'
import { PackageNotFoundError } from '../../packages/packageStore'

function thrown(err: unknown): unknown {
  try {
    rethrowDispatchErrorAsHttp(err)
  } catch (caught) {
    return caught
  }
  throw new Error('rethrowDispatchErrorAsHttp did not throw')
}

describe('rethrowDispatchErrorAsHttp', () => {
  it('maps AgentPackageMissingError to 409 with its message', () => {
    const err = thrown(new AgentPackageMissingError('agent-1'))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(409)
    expect((err as HttpError).message).toMatch(/agent-1/)
  })

  it('maps SystemPackageMissingError to 409 with its message', () => {
    const err = thrown(new SystemPackageMissingError('platform', 'platform'))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(409)
    expect((err as HttpError).message).toMatch(/platform/)
  })

  it('maps PackageNotFoundError to 409 with its message', () => {
    const ref = { kind: 'agent' as const, key: 'a1', digest: 'a'.repeat(64) }
    const err = thrown(new PackageNotFoundError(ref))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(409)
  })

  it('maps PackageDeliveryError to 409 with its message — the reason must reach the person', () => {
    const err = thrown(new PackageDeliveryError('package_delivery_failed', 'Delivering the agent package a1 failed: disk full'))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(409)
    expect((err as HttpError).message).toMatch(/disk full/)
  })

  it('still maps SiteUnreachableError to 503, delegating rather than duplicating the rule', () => {
    const err = thrown(new SiteUnreachableError('Box One', 'site-1'))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(503)
  })

  it('propagates anything else unchanged, including an HttpError the same try block already threw', () => {
    const notFound = new HttpError(404, 'Agent not found')
    expect(thrown(notFound)).toBe(notFound)

    const plain = new Error('boom')
    expect(thrown(plain)).toBe(plain)
  })
})

describe('rethrowLocationFileErrorAsHttp', () => {
  function locationThrown(err: unknown): unknown {
    try {
      rethrowLocationFileErrorAsHttp(err)
    } catch (caught) {
      return caught
    }
    throw new Error('rethrowLocationFileErrorAsHttp did not throw')
  }

  // A containment refusal, a missing file and an unreachable site are three
  // different answers to the caller, and a site's own vocabulary is what makes
  // them distinguishable. Unmapped, every one of them was a 500.
  it.each([
    ['outside', 403],
    ['not_found', 404],
    ['exists', 409],
    ['not_a_file', 400],
    ['not_a_directory', 400],
    ['refused', 502],
    ['too_large', 413],
    ['too_many', 413],
    ['cancelled', 503],
    ['failed', 502],
  ] as const)('maps a site\'s %s refusal to %i', (code, status) => {
    const err = locationThrown(new LocationFileError(code, `location.readFile "a.md" in project p1`))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(status)
  })

  // The marker is wire encoding, not something to show a person.
  it('carries the detail the site wrote, without the wire marker', () => {
    const err = locationThrown(new LocationFileError('not_found', 'location.statFile "a.md" in project p1'))
    expect((err as HttpError).message).toBe('location.statFile "a.md" in project p1')
    expect((err as HttpError).message).not.toContain(LOCATION_FILE_ERROR_MARKER)
  })

  it('still maps SiteUnreachableError to 503, delegating rather than duplicating the rule', () => {
    const err = thrown(new SiteUnreachableError('Box One', 'site-1'))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(503)
  })

  it('propagates anything else unchanged, including an HttpError the same try block already threw', () => {
    const notFound = new HttpError(404, 'Agent not found')
    expect(thrown(notFound)).toBe(notFound)

    const plain = new Error('boom')
    expect(thrown(plain)).toBe(plain)
  })
})

describe('rethrowLocationFileErrorAsHttp', () => {
  function locationThrown(err: unknown): unknown {
    try {
      rethrowLocationFileErrorAsHttp(err)
    } catch (caught) {
      return caught
    }
    throw new Error('rethrowLocationFileErrorAsHttp did not throw')
  }

  // A containment refusal, a missing file and an unreachable site are three
  // different answers to the caller, and a site's own vocabulary is what makes
  // them distinguishable. Unmapped, every one of them was a 500.
  it.each([
    ['outside', 403],
    ['not_found', 404],
    ['exists', 409],
    ['not_a_file', 400],
    ['not_a_directory', 400],
    ['refused', 502],
    ['too_large', 413],
    ['too_many', 413],
    ['cancelled', 503],
    ['failed', 502],
  ] as const)('maps a site\'s %s refusal to %i', (code, status) => {
    const err = locationThrown(new LocationFileError(code, `location.readFile "a.md" in project p1`))
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).statusCode).toBe(status)
  })

  // The marker is wire encoding, not something to show a person.
  it('carries the detail the site wrote, without the wire marker', () => {
    const err = locationThrown(new LocationFileError('not_found', 'location.statFile "a.md" in project p1'))
    expect((err as HttpError).message).toBe('location.statFile "a.md" in project p1')
    expect((err as HttpError).message).not.toContain(LOCATION_FILE_ERROR_MARKER)
  })

  it('still maps SiteUnreachableError to 503, delegating rather than duplicating the rule', () => {
    const err = locationThrown(new SiteUnreachableError('Box One', 'site-1'))
    expect((err as HttpError).statusCode).toBe(503)
  })

  it('propagates anything else unchanged', () => {
    const plain = new Error('boom')
    expect(locationThrown(plain)).toBe(plain)
  })
})

describe('rethrowRepoWorkErrorAsHttp', () => {
  const status = (err: unknown): HttpError => {
    try {
      rethrowRepoWorkErrorAsHttp(err)
    } catch (caught) {
      return caught as HttpError
    }
    throw new Error('rethrowRepoWorkErrorAsHttp did not throw')
  }

  /**
   * The whole reason `git_abandoned` exists as its own code is that it is NOT
   * its sibling's answer. Pinned as a number here, because the exhaustive
   * `Record` only forces a status to be CHOSEN — it cannot notice the two being
   * given the same one, which is how the distinction would quietly disappear.
   */
  it('separates a stopped deadline from one it could not confirm', () => {
    const stopped = status(new RepoWorkError('git_timeout', 'repo.connect was stopped'))
    const abandoned = status(new RepoWorkError('git_abandoned', 'repo.connect could not be confirmed stopped'))

    // 504: the operation did not fit, and retrying is the right advice.
    expect(stopped.statusCode).toBe(504)
    // 502: something may still be writing to the location, so retrying is
    // precisely the wrong advice — the failure is upstream and needs looking at.
    expect(abandoned.statusCode).toBe(502)
    expect(abandoned.statusCode).not.toBe(stopped.statusCode)
  })

  it('answers with the detail, never the wire marker that encodes the code', () => {
    const err = status(new RepoWorkError('git_abandoned', 'repo.connect could not be confirmed stopped'))
    expect(err.message).toBe('repo.connect could not be confirmed stopped')
    expect(err.message).not.toContain(REPO_WORK_ERROR_MARKER)
  })

  it('gives the same two answers through asHttp, which is what the connect action uses', () => {
    expect(asHttp(new RepoWorkError('git_timeout', 'x')).statusCode).toBe(504)
    expect(asHttp(new RepoWorkError('git_abandoned', 'x')).statusCode).toBe(502)
  })
})
