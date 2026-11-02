import { describe, expect, it } from 'vitest'
import { BRANCH_WORK_SITE_BUDGET_MS, BRANCH_WORK_TIMEOUT_MS } from '../branchWork.js'
import { BRANCH_READ_SITE_BUDGET_MS, BRANCH_READ_TIMEOUT_MS } from '../branchReads.js'
import { MAIN_WORK_SITE_BUDGET_MS, MAIN_WORK_TIMEOUT_MS } from '../mainWork.js'
import { BRANCH_WORK_ERROR_CODES, BRANCH_WORK_ERROR_MARKER, BranchWorkError } from '../branchErrors.js'
import { REPO_WORK_ERROR_MARKER, RepoWorkError } from '../repoWork.js'

// As with repo.connect: the site stops what it started before hq gives up, so nothing runs on unwatched.
describe('the branch methods\' budgets', () => {
  it.each([
    ['branch work', BRANCH_WORK_SITE_BUDGET_MS, BRANCH_WORK_TIMEOUT_MS],
    ['branch reads', BRANCH_READ_SITE_BUDGET_MS, BRANCH_READ_TIMEOUT_MS],
    ['main work', MAIN_WORK_SITE_BUDGET_MS, MAIN_WORK_TIMEOUT_MS],
  ])('gives the site strictly less than hq waits, for %s', (_, site, hq) => {
    expect(site).toBeLessThan(hq)
    expect(hq - site).toBeGreaterThanOrEqual(5_000)
  })
})

describe('the branch refusals @SC-1673', () => {
  it('round-trip every code, and are not read as a repository-work refusal or the other way round', () => {
    for (const code of BRANCH_WORK_ERROR_CODES) {
      expect(BranchWorkError.fromWire(new BranchWorkError(code, 'branch.create for workspace w1').message))
        .toMatchObject({ code, detail: 'branch.create for workspace w1' })
    }
    expect(BRANCH_WORK_ERROR_MARKER).not.toBe(REPO_WORK_ERROR_MARKER)
    expect(BranchWorkError.fromWire(new RepoWorkError('refused', 'x').message)).toBeNull()
    expect(RepoWorkError.fromWire(new BranchWorkError('is_main', 'x').message)).toBeNull()
    expect(BranchWorkError.fromWire('branch-work/not_a_code: x')).toBeNull()
  })
})
