/**
 * The repository-work contract's own invariants — the ones that are properties
 * of the two numbers and the two vocabularies rather than of either app.
 */
import { describe, it, expect } from 'vitest'
import {
  REPO_CONNECT_SITE_BUDGET_MS,
  REPO_CONNECT_TIMEOUT_MS,
  REPO_WORK_ERROR_CODES,
  REPO_WORK_ERROR_MARKER,
  RepoWorkError,
  decodeRepoWorkError,
} from '../repoWork.js'
import { LOCATION_FILE_ERROR_MARKER, LocationFileError } from '../locationFiles.js'

describe('the connect budgets', () => {
  /**
   * The whole point of the pair. If the site's budget ever reaches hq's, hq
   * rejects first, forgets the request, and the git the site started runs on
   * unwatched into a location's files — which is the abandonment this ordering
   * exists to prevent, and it would come back silently.
   */
  it('gives the site strictly less than hq waits, with room for the round trip', () => {
    expect(REPO_CONNECT_SITE_BUDGET_MS).toBeLessThan(REPO_CONNECT_TIMEOUT_MS)
    expect(REPO_CONNECT_TIMEOUT_MS - REPO_CONNECT_SITE_BUDGET_MS).toBeGreaterThanOrEqual(15_000)
  })
})

describe('the refusal vocabulary', () => {
  it('round-trips every published code', () => {
    for (const code of REPO_WORK_ERROR_CODES) {
      const wire = new RepoWorkError(code, 'repo.connect for project p1').message
      expect(decodeRepoWorkError(wire)).toEqual({ code, message: 'repo.connect for project p1' })
    }
  })

  /**
   * Two marked vocabularies travel the same channel. A decoder that accepted
   * either would hand a caller a code from a list it is not checking against —
   * and both lists contain the word `refused`, so this is not hypothetical.
   */
  it('does not decode a location-file refusal, and is not decoded as one', () => {
    expect(REPO_WORK_ERROR_MARKER).not.toBe(LOCATION_FILE_ERROR_MARKER)
    expect(RepoWorkError.fromWire(new LocationFileError('refused', 'x').message)).toBeNull()
    expect(LocationFileError.fromWire(new RepoWorkError('refused', 'x').message)).toBeNull()
  })

  it('reads nothing out of prose that merely opens with one of the words', () => {
    expect(RepoWorkError.fromWire('refused: the remote said no')).toBeNull()
    expect(RepoWorkError.fromWire('repo-work/not_a_real_code: x')).toBeNull()
  })
})
