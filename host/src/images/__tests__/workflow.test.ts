/**
 * The publishing workflow and the host service must agree on who signs, where images are and which there are:
 * a mismatch would make every install refuse every image, or check against the wrong signer.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPublishedVersion, PUBLISHED_PARTS, PUBLISHING_REPOSITORY, PUBLISHING_WORKFLOW, REGISTRY, SIGNING_ISSUER } from '../published'

const root = path.resolve(__dirname, '../../../..')
const workflow = fs.readFileSync(path.join(root, PUBLISHING_WORKFLOW), 'utf8')
// What a release builds is defined once, in the workflow the publishing workflow calls and every release branch runs.
const RELEASE_BUILD = '.github/workflows/release-build.yml'
const releaseBuild = fs.readFileSync(path.join(root, RELEASE_BUILD), 'utf8')
const hostDockerfile = fs.readFileSync(path.join(root, 'host/docker/Dockerfile'), 'utf8')

const sorted = (xs: readonly string[]) => [...xs].sort()

describe('the publishing workflow @SC-820 @SC-1052 @SC-1167', () => {
  it('runs only for a release’s tag or a pre-release’s, the tag the signer is named by', () => {
    const tags = [...workflow.match(/on:\n {2}push:\n {4}tags:\n((?: {6}- '[^']+'\n)+)\n/)![1].matchAll(/- '([^']+)'/g)].map(m => m[1])
    expect(tags).toEqual([
      'v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-alpha.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-beta.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+',
    ])
    expect(workflow).not.toMatch(/workflow_dispatch|pull_request|branches:/)
  })

  it('accepts exactly the versions the host service takes as published', () => {
    const check = workflow.match(/grep -Eq '([^']+)'/)![1]
    const accepted = new RegExp(check)
    for (const v of ['1.0.0', '0.2.10', '1.0.0-alpha.1', '1.0.0-beta.1', '1.0.0-rc.12']) {
      expect(accepted.test(v), v).toBe(true)
      expect(isPublishedVersion(v), v).toBe(true)
    }
    for (const v of ['dev', '1.0', '1.0.0-beta', '1.0.0-alpha', '1.0.0-gamma.1', '1.0.0-beta.1.2', '1.0.0-rc.1+x', 'v1.0.0', '1.0.0-']) {
      expect(accepted.test(v), v).toBe(false)
      expect(isPublishedVersion(v), v).toBe(false)
    }
  })

  it('every image build and bundle takes the versions the host service takes as published, and dev', () => {
    const dockerfiles = ['host/docker/Dockerfile', 'console/docker/Dockerfile']
      .map(f => [f, fs.readFileSync(path.join(root, f), 'utf8').match(/"\$VERSION" \| grep -Eq '([^']+)'/)?.[1]])
    const scripts = ['host/scripts/build.mjs', 'console/scripts/build.mjs']
      .map(f => [f, fs.readFileSync(path.join(root, f), 'utf8').match(/if \(!\/(\^[^/]+\$)\/\.test\(version\)\)/)?.[1]])
    for (const [file, check] of [...dockerfiles, ...scripts]) {
      expect(check, file).toBeTruthy()
      const accepted = new RegExp(check!)
      for (const v of ['dev', '1.0.0', '1.0.0-alpha.1', '1.0.0-beta.2', '1.0.0-rc.12']) expect(accepted.test(v), `${file}: ${v}`).toBe(true)
      for (const v of ['latest', '1.0', '1.0.0-alpha', '1.0.0-gamma.1', 'v1.0.0']) {
        expect(accepted.test(v), `${file}: ${v}`).toBe(isPublishedVersion(v))
      }
    }
  })

  it('builds, publishes and names every image the host service runs, and no other', () => {
    expect(workflow).toMatch(new RegExp(`\\n {2}build:\\n(?: {4}.*\\n)*? {4}uses: \\./${RELEASE_BUILD.replace(/\./g, '\\.')}\\n`))
    expect(workflow).toMatch(/\n {4}with:\n {6}publish: true\n/)
    expect(workflow).not.toMatch(/- \{ part: [a-z-]+, file:/)
    // The signature names the workflow whose job signs, so the shared build never signs.
    expect(releaseBuild).not.toMatch(/id-token|cosign sign/)
    const built = [...releaseBuild.matchAll(/- \{ part: ([a-z-]+), file:/g)].map(m => m[1])
    expect(sorted(built)).toEqual(sorted(PUBLISHED_PARTS))
    const signed = workflow.match(/part: \[([^\]]+)\]/)?.[1].split(',').map(s => s.trim()) ?? []
    expect(sorted(signed)).toEqual(sorted(PUBLISHED_PARTS))
    const named = JSON.parse(releaseBuild.match(/const parts = (\[[^\]]+\])/)?.[1].replace(/'/g, '"') ?? '[]') as string[]
    expect(sorted(named)).toEqual(sorted(PUBLISHED_PARTS))
  })

  it('publishes to the registry of the repository the host service trusts', () => {
    expect(releaseBuild).toContain('registry=ghcr.io/${GITHUB_REPOSITORY_OWNER,,}')
    const owner = new URL(PUBLISHING_REPOSITORY).pathname.split('/')[1]
    expect(REGISTRY).toBe(`ghcr.io/${owner.toLowerCase()}`)
  })

  it('checks each image as a host service will, against this file at the version’s tag', () => {
    expect(workflow).toContain(`--certificate-identity "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/${PUBLISHING_WORKFLOW}@refs/tags/v$VERSION"`)
    expect(workflow).toContain(`--certificate-oidc-issuer ${SIGNING_ISSUER}`)
  })

  it('signs with the cosign version the host service checks with', () => {
    const signing = workflow.match(/COSIGN_VERSION: (v[\d.]+)/)?.[1]
    const checking = hostDockerfile.match(/cosign\/cosign:(v[\d.]+)@sha256:[0-9a-f]{64}/)?.[1]
    expect(signing).toBeTruthy()
    expect(checking).toBe(signing)
  })
})
