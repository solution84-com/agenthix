import { describe, expect, it } from 'vitest'
import { HttpError } from 'wasp/server'
import { BRANCH_WORK_ERROR_CODES, BranchWorkError, RepoWorkError } from '@agenthix/core'
import { asBranchHttp, asBranchTool, branchRefusalWords } from '../refusals'
import { ControlPlaneError } from '../../server/controlplane/types'
import { SiteUnreachableError } from '../../storage/workspaceStore'

describe("a site's refusal of branch work, in words", () => {
  it('says every code in words a person can act on, ending that nothing was changed', () => {
    for (const code of BRANCH_WORK_ERROR_CODES) {
      expect(branchRefusalWords(code)).toMatch(/Nothing was changed\.$/)
      expect(branchRefusalWords(code)).not.toContain('branch-work/')
    }
  })

  it('maps a coded refusal to its status and words', async () => {
    const err = await asBranchHttp(() => Promise.reject(new BranchWorkError('not_repository', 'x'))).catch(e => e)
    expect(err).toBeInstanceOf(HttpError)
    expect(err.statusCode).toBe(409)
    expect(err.message).toContain('turn Git on')
  })

  it('keeps the repository refusals and an unreachable site as every repository call has them', async () => {
    const repo = await asBranchHttp(() => Promise.reject(new RepoWorkError('git_timeout', 'slow'))).catch(e => e)
    expect(repo.statusCode).toBe(504)
    const away = await asBranchHttp(() => Promise.reject(new SiteUnreachableError('Box', 'site-1', 'offline', null))).catch(e => e)
    expect(away.statusCode).toBe(503)
  })

  it('leaves anything else as it is', async () => {
    const boom = new Error('boom')
    await expect(asBranchHttp(() => Promise.reject(boom))).rejects.toBe(boom)
    await expect(asBranchTool(() => Promise.reject(boom))).rejects.toBe(boom)
  })

  it("gives an agent's tool call the same words as a control-plane refusal", async () => {
    const err = await asBranchTool(() => Promise.reject(new BranchWorkError('no_copy', 'x'))).catch(e => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('conflict')
    expect(err.message).toBe(branchRefusalWords('no_copy'))
  })
})
