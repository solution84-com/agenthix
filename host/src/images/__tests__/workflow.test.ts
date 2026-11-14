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
// What a release builds is defined once, in the release build; the publishing workflow promotes what it proved.
const RELEASE_BUILD = '.github/workflows/release-build.yml'
const releaseBuild = fs.readFileSync(path.join(root, RELEASE_BUILD), 'utf8')
const hostDockerfile = fs.readFileSync(path.join(root, 'host/docker/Dockerfile'), 'utf8')

const sorted = (xs: readonly string[]) => [...xs].sort()

describe('the publishing workflow @SC-820 @SC-1052 @SC-1270', () => {
  it('runs only for a release’s tag or a pre-release’s, the tag the signer is named by', () => {
    const tags = [...workflow.match(/on:\n {2}push:\n {4}tags:\n((?: {6}- '[^']+'\n)+)/)![1].matchAll(/- '([^']+)'/g)].map(m => m[1])
    expect(tags).toEqual([
      'v[0-9]+.[0-9]+.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-alpha.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-beta.[0-9]+', 'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+',
    ])
    expect(workflow).not.toMatch(/pull_request|branches:|workflow_call/)
    // Release starts it at the tag by hand, since a tag a workflow pushes starts nothing; its first step refuses any
    // ref but a tag, so the signer is still this file at the version's tag.
    const triggers = workflow.match(/\non:\n((?: {2}.*\n|\n)*?)\npermissions:/)![1]
    expect(triggers).toMatch(/\n {2}workflow_dispatch:\n/)
    expect(triggers).not.toMatch(/inputs:/)
    const refusal = workflow.indexOf('if [[ "$GITHUB_REF" != refs/tags/* ]]; then')
    expect(refusal).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(workflow.indexOf('version="${GITHUB_REF_NAME#v}"'))
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

  it('promotes, signs and names every image the host service runs, built by the release build alone', () => {
    // The tag builds nothing: no image build, and no call of the release build.
    expect(workflow).not.toMatch(/docker\/build-push-action|docker (buildx )?build |uses: \.\/\.github\/workflows\//)
    // It signs, and only after checking each image's attestation and recomputing its key at the tagged commit.
    expect(workflow).toMatch(/cosign sign --yes "\$IMAGE@\$DIGEST"/)
    const verify = workflow.indexOf('scripts/release/verify-candidate.mjs')
    expect(verify).toBeGreaterThan(-1)
    expect(workflow.indexOf('node scripts/images/keys.mjs "$GITHUB_SHA" --json')).toBeGreaterThan(-1)
    expect(verify).toBeLessThan(workflow.indexOf('cosign sign'))
    expect(fs.readFileSync(path.join(root, 'scripts/release/verify-candidate.mjs'), 'utf8')).toContain("'reuse.sh'")
    // The signature names the workflow whose job signs, so the release build attests its images but never signs them.
    expect(releaseBuild).not.toMatch(/cosign sign/)
    expect(releaseBuild).toMatch(/cosign attest /)
    // Both take the parts from the one list of them, which is the host service's.
    expect(releaseBuild).toContain('scripts/images/parts.json')
    expect(workflow).toContain('scripts/images/parts.json')
    expect(workflow).not.toMatch(/part: \[/)
    expect(workflow).toContain('include: ${{ fromJSON(needs.release.outputs.promote) }}')
    const listed = Object.keys((JSON.parse(fs.readFileSync(path.join(root, 'scripts/images/parts.json'), 'utf8')) as { parts: Record<string, unknown> }).parts)
    expect(sorted(listed)).toEqual(sorted(PUBLISHED_PARTS))
  })

  it('publishes to the registry of the repository the host service trusts', () => {
    expect(releaseBuild).toContain('registry=ghcr.io/${GITHUB_REPOSITORY_OWNER,,}')
    // The tag promotes only images under that registry.
    expect(workflow).toContain('--registry "ghcr.io/${GITHUB_REPOSITORY_OWNER,,}"')
    const owner = new URL(PUBLISHING_REPOSITORY).pathname.split('/')[1]
    expect(REGISTRY).toBe(`ghcr.io/${owner.toLowerCase()}`)
  })

  it('checks each image as a host service will, against this file at the version’s tag', () => {
    expect(workflow).toContain(`--certificate-identity "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/${PUBLISHING_WORKFLOW}@refs/tags/v$VERSION"`)
    expect(workflow).toContain(`--certificate-oidc-issuer ${SIGNING_ISSUER}`)
  })

  it('signs with the cosign version the host service checks with', () => {
    const checking = hostDockerfile.match(/cosign\/cosign:(v[\d.]+)@sha256:[0-9a-f]{64}/)?.[1]
    expect(checking).toBeTruthy()
    // The release build signs nothing but checks with cosign too: neither workflow may drift from the host image.
    for (const text of [workflow, releaseBuild]) {
      expect(text.match(/COSIGN_VERSION: (v[\d.]+)/)?.[1]).toBe(checking)
    }
  })
})
