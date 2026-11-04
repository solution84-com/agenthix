import { describe, expect, it } from 'vitest'
import { DockerStreams, WRITE_SCRIPT, type DockerRunner } from '../docker'
import { mountArg } from '../mountArg'

describe('the --mount argument', () => {
  it('quotes a path that holds a comma or a quote, as Docker reads it, and leaves a plain one alone', () => {
    expect(mountArg({ type: 'bind', source: '/home/sam/state', destination: '/folder', readOnly: true })).toBe('type=bind,src=/home/sam/state,dst=/folder,readonly')
    expect(mountArg({ type: 'bind', source: '/home/sam/a,b', destination: '/folder', readOnly: false })).toBe('type=bind,"src=/home/sam/a,b",dst=/folder')
    expect(mountArg({ type: 'bind', source: '/home/"sam"', destination: '/folder', readOnly: false })).toBe('type=bind,"src=/home/""sam""",dst=/folder')
  })

  it("is what the backup's helper container reads and writes the state folder through", async () => {
    const args: string[][] = []
    const run: DockerRunner = async () => ({ code: 0, stdout: 'sha256:img\n', stderr: '' })
    const streams = new DockerStreams(run, a => {
      args.push(a)
      return { stdout: (async function* () { /* nothing */ })(), done: Promise.resolve({ code: 0, stdout: '', stderr: '' }), kill: () => {} }
    }, 'agenthix-host')
    for await (const _ of streams.readFolder({ machinePath: '/srv/a,b' })) { /* nothing */ }
    await streams.writeFolder({ machinePath: '/srv/a,b' }, (async function* () { /* nothing */ })())
    expect(args.map(a => a[a.indexOf('--mount') + 1])).toEqual(['type=bind,"src=/srv/a,b",dst=/folder,readonly', 'type=bind,"src=/srv/a,b",dst=/folder'])
  })
})

describe("a copy written to the backup location's folder", () => {
  it('clears its temporary file when it fails or is stopped, and one a killed run left', () => {
    expect(WRITE_SCRIPT).toContain(`rm -f "$p"; trap 'rm -f "$p"' EXIT INT TERM`)
    expect(WRITE_SCRIPT).toContain('cat > "$p" && mv "$p" "/location/$1"')
  })

  it('runs as that script, with the name as an argument and not in the script', async () => {
    const args: string[][] = []
    const run: DockerRunner = async () => ({ code: 0, stdout: 'sha256:img\n', stderr: '' })
    const streams = new DockerStreams(run, a => {
      args.push(a)
      return { stdout: (async function* () { /* nothing */ })(), done: Promise.resolve({ code: 0, stdout: '', stderr: '' }), kill: () => {} }
    }, 'agenthix-host')
    await streams.write('/mnt/nas', 'b1', (async function* () { /* nothing */ })())
    expect(args[0]).toContain(WRITE_SCRIPT)
    expect(args[0].slice(-2)).toEqual(['write', 'b1'])
  })
})
