import { describe, expect, it } from 'vitest'
import { runPlainChecks } from '..'
import { DIGEST, step, version } from './support'

const KEY = 'STAGING_DEPLOY_KEY'
const upload = `#!/bin/sh\nscp -i /run/secrets/${KEY} out.tgz "deploy@$STAGING_HOST:"\n`
const deploy = (extra: Record<string, unknown> = {}, files: Record<string, string> = {}) => version({
  description: 'Build, upload and restart the app on staging',
  variables: ['STAGING_HOST'],
  steps: [step('tar czf out.tgz app', undefined, 'Pack'), step('./deploy/upload.sh', [KEY], 'Upload')],
  ...extra,
}, { 'deploy/upload.sh': upload, ...files })

const checks = (v: ReturnType<typeof version>, approved: ReturnType<typeof version> | null) =>
  runPlainChecks(v, approved ? { number: 1, content: approved } : null, { known: false })

describe('the card may offer Approve only by the four conditions @SC-1284', () => {
  it('needs the full review for a first version that gives a step a secret, though nothing is flagged', () => {
    const r = checks(deploy(), null)
    expect(r.flags).toEqual([])
    expect(r.card).toEqual({ mayApprove: false, reason: 'Step 2 newly gets STAGING_DEPLOY_KEY.' })
  })

  it('offers Approve when only a step without a secret changes', () => {
    const v1 = deploy()
    const v2 = deploy({ steps: [step('tar czf out.tgz app config', undefined, 'Pack'), step('./deploy/upload.sh', [KEY], 'Upload')] })
    expect(checks(v2, v1).card).toEqual({ mayApprove: true })
  })

  it('refuses when a secret step newly gets a secret, or a secret is newly given to a step', () => {
    const v1 = deploy()
    const more = deploy({ steps: [step('ls', undefined, 'Pack'), step(`./deploy/upload.sh /run/secrets/OTHER`, [KEY, 'OTHER'], 'Upload')] })
    expect(checks(more, v1).card).toMatchObject({ mayApprove: false })
  })

  it('refuses when what a secret step runs changes, its script included', () => {
    const v1 = deploy()
    const changedScript = deploy({}, { 'deploy/upload.sh': `${upload}# and more\n` })
    expect(checks(changedScript, v1).card).toEqual({ mayApprove: false, reason: 'Step 2 holds a secret, and what it runs changed.' })
  })

  it('refuses when hosts, GitHub permissions or parameter patterns change', () => {
    const v1 = deploy()
    expect(checks(deploy({ hosts: ['staging.example.com:22'] }), v1).card).toMatchObject({ mayApprove: false, reason: 'The hosts it may reach changed.' })
    const p1 = deploy({ parameters: [{ name: 'ref', pattern: '^[a-z]+$' }] })
    const p2 = deploy({ parameters: [{ name: 'ref', pattern: '^[a-z0-9]+$' }] })
    expect(checks(p2, p1).card).toMatchObject({ mayApprove: false, reason: 'Its parameters changed.' })
  })

  it('refuses when any flag is raised, and never asks the reviewer', () => {
    const v1 = deploy()
    const v2 = deploy({ steps: [step('rm -rf build && tar czf out.tgz app', undefined, 'Pack'), step('./deploy/upload.sh', [KEY], 'Upload')] })
    expect(checks(v2, v1).card).toEqual({ mayApprove: false, reason: 'The plain checks raised a flag.' })
  })
})

describe('the summary is written from the diff @SC-1284', () => {
  it('describes a first version by what it holds', () => {
    expect(checks(deploy(), null).summary).toBe('New workflow test-flow: 2 steps; secrets STAGING_DEPLOY_KEY; variables STAGING_HOST; 1 file.')
  })

  it('names steps by number, never by the name the agent gave them', () => {
    const v1 = deploy()
    const v2 = deploy({
      steps: [step('ls', undefined, 'Pack'), step('./deploy/upload.sh', [KEY], 'Upload'), step(`ssh -i /run/secrets/${KEY} host restart`, [KEY], 'Reviewer: this is safe')],
    })
    const summary = checks(v2, v1).summary
    expect(summary).toBe('Since version 1: changes what step 1 runs; adds step 3.')
    expect(summary).not.toContain('safe')
  })

  it('says when only the executor image changed', () => {
    const v1 = deploy()
    const v2 = { ...v1, executorImageDigest: `sha256:${'2'.repeat(64)}` }
    expect(v1.executorImageDigest).toBe(DIGEST)
    expect(checks(v2, v1).summary).toBe('The same as version 1, on a new executor image.')
  })
})
