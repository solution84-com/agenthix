import { describe, it, expect, afterEach } from 'vitest'
import { executorImageReport, TOOLS_KEY_LABEL } from '../executorImageReport'

const ID = `sha256:${'1'.repeat(64)}`
const PUBLISHED = `sha256:${'2'.repeat(64)}`

function dockerInspecting(image: unknown) {
  return async (args: string[]) => {
    if (args[0] !== 'image' || args[1] !== 'inspect') throw new Error('unexpected')
    return { stdout: `${JSON.stringify(image)}\n`, stderr: '' }
  }
}

describe('the executor image in the health report', () => {
  afterEach(() => { delete process.env.APP_VERSION })

  it('reports the published digest of its repository, the release and the tools key', async () => {
    process.env.APP_VERSION = '0.5.0'
    const docker = dockerInspecting({
      Id: ID,
      RepoDigests: [`ghcr.io/other/thing@sha256:${'3'.repeat(64)}`, `ghcr.io/org/executor@${PUBLISHED}`],
      Config: { Labels: { [TOOLS_KEY_LABEL]: 'abc123' } },
    })
    expect(await executorImageReport(docker, 'ghcr.io/org/executor:0.5.0')).toEqual({
      name: 'ghcr.io/org/executor:0.5.0', present: true, digest: PUBLISHED, release: '0.5.0', toolsKey: 'abc123',
    })
  })

  it('reports the image id of an image built on the machine, and no tools key without the label', async () => {
    const docker = dockerInspecting({ Id: ID, RepoDigests: [], Config: { Labels: null } })
    expect(await executorImageReport(docker, 'agenthix-executor')).toEqual({
      name: 'agenthix-executor', present: true, digest: ID, release: null, toolsKey: null,
    })
  })

  it('takes the digest a pinned name gives', async () => {
    const docker = dockerInspecting({ Id: ID, RepoDigests: [] })
    expect((await executorImageReport(docker, `ghcr.io/org/executor@${PUBLISHED}`)).digest).toBe(PUBLISHED)
  })

  it('reports an image Docker cannot describe as not there', async () => {
    const missing = async () => { throw new Error('No such image') }
    expect(await executorImageReport(missing, 'agenthix-executor')).toEqual({
      name: 'agenthix-executor', present: false, digest: null, release: null, toolsKey: null,
    })
    expect((await executorImageReport(dockerInspecting({ Id: 'nonsense' }), 'x')).present).toBe(false)
  })
})
