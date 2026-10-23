import { describe, expect, it } from 'vitest'
import { Docker, type DockerRunner, type RunResult } from '../docker'
import { publishArgs, readPublishProbe } from '../publishProbe'

const result = (code: number, stderr = ''): RunResult => ({ code, stdout: '', stderr })
// What Docker Desktop says when a program on the computer holds the port.
const DESKTOP_HELD = 'docker: Error response from daemon: ports are not available: exposing port TCP 127.0.0.1:7802 -> 127.0.0.1:0: ' +
  'listen tcp4 127.0.0.1:7802: bind: address already in use.'

function docker(answers: { image?: RunResult; run?: RunResult }): { docker: Docker; calls: string[][] } {
  const calls: string[][] = []
  const run: DockerRunner = async args => {
    calls.push(args)
    if (args[0] === 'container') return answers.image ?? { code: 0, stdout: 'sha256:abc\n', stderr: '' }
    return answers.run ?? result(0)
  }
  return { docker: new Docker(run), calls }
}

describe("Docker's own publish, from a throwaway container @SC-1244", () => {
  it("publishes the port on the address asked, from the host service's own image, never fetching one", () => {
    expect(publishArgs('sha256:abc', 7802, '127.0.0.1')).toEqual(
      ['run', '--rm', '--pull', 'never', '-p', '127.0.0.1:7802:9', '--entrypoint', 'true', 'sha256:abc'])
    expect(publishArgs('sha256:abc', 7800, '::')[5]).toBe('[::]:7800:9')
  })

  it('reads a held port, a free one, and a probe Docker could not run', () => {
    expect(readPublishProbe(result(125, DESKTOP_HELD))).toBe(true)
    expect(readPublishProbe(result(125, 'Bind for 0.0.0.0:7800 failed: port is already allocated'))).toBe(true)
    expect(readPublishProbe(result(0))).toBe(false)
    expect(readPublishProbe(result(125, 'Unable to find image'))).toBeNull()
    expect(readPublishProbe(result(1, 'Cannot connect to the Docker daemon'))).toBeNull()
  })

  it("asks for the host service's image once, then publishes from it", async () => {
    const { docker: d, calls } = docker({ run: result(125, DESKTOP_HELD) })
    expect(await d.publishProbe(7802, '127.0.0.1', 'agenthix-host')).toBe(true)
    expect(await d.publishProbe(7803, '127.0.0.1', 'agenthix-host')).toBe(true)
    expect(calls).toEqual([
      ['container', 'inspect', '--format', '{{.Image}}', 'agenthix-host'],
      publishArgs('sha256:abc', 7802, '127.0.0.1'),
      publishArgs('sha256:abc', 7803, '127.0.0.1'),
    ])
  })

  it('cannot tell when the host service\'s own image cannot be found', async () => {
    const { docker: d, calls } = docker({ image: result(1, 'No such container: agenthix-host') })
    expect(await d.publishProbe(7802, '127.0.0.1', 'agenthix-host')).toBeNull()
    expect(calls).toHaveLength(1)
  })
})
