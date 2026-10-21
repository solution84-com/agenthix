import { describe, it, expect, vi, beforeEach } from 'vitest'
import { register, get, remove, listAll, sweepGone, forgetContainer, _reset } from '../previewRegistry'
import { notifyContainerDestroyed } from '../../runtime/containerDestroyed'

describe('the preview registry', () => {
  beforeEach(() => { _reset() })

  it('hands back what it was given, by id', () => {
    register({ previewId: 'pv1', container: 'c1', port: 5173, sessionId: 's1' })
    expect(get('pv1')).toMatchObject({ container: 'c1', port: 5173, sessionId: 's1' })
    expect(typeof get('pv1')!.startedAt).toBe('number')
  })

  it('knows nothing about an id it was never given', () => {
    expect(get('pv-nope')).toBeUndefined()
  })

  it('forgets one on remove, and says whether it knew it', () => {
    register({ previewId: 'pv1', container: 'c1', port: 5173, sessionId: 's1' })
    expect(remove('pv1')).toBe(true)
    expect(remove('pv1')).toBe(false)
    expect(listAll()).toHaveLength(0)
  })

  it('drops every entry whose container is gone, and stops nothing else', async () => {
    register({ previewId: 'pv1', container: 'gone', port: 5173, sessionId: 's1' })
    register({ previewId: 'pv2', container: 'up', port: 5174, sessionId: 's1' })
    const docker = vi.fn(async (args: string[]) =>
      args.includes('up') ? { stdout: 'true\n', stderr: '' } : { stdout: 'false\n', stderr: '' })

    const dropped = await sweepGone({ docker })

    expect(dropped).toEqual(['pv1'])
    expect(get('pv1')).toBeUndefined()
    expect(get('pv2')).toBeDefined()
    // The sweep reports what it forgot; it never kills a process, because the
    // container that held one is what has gone.
    expect(docker.mock.calls.map(c => c[0][0])).not.toContain('rm')
  })

  it('forgets every preview in a container that has gone, and only that container', () => {
    register({ previewId: 'pv1', container: 'c1', port: 5173, sessionId: 's1' })
    register({ previewId: 'pv2', container: 'c1', port: 5174, sessionId: 's2' })
    register({ previewId: 'pv3', container: 'c2', port: 5175, sessionId: 's3' })

    expect(forgetContainer('c1').sort()).toEqual(['pv1', 'pv2'])
    expect(listAll().map(p => p.previewId)).toEqual(['pv3'])
  })

  it('is subscribed to the runtime, so a destroyed container clears itself out', () => {
    register({ previewId: 'pv1', container: 'c1', port: 5173, sessionId: 's1' })

    // The runtime announces; this module listens. The other direction would be
    // a cycle, which is why the seam exists at all.
    notifyContainerDestroyed('c1')

    expect(get('pv1')).toBeUndefined()
  })

  it('asks docker once per container, however many previews share one', async () => {
    register({ previewId: 'pv1', container: 'c1', port: 5173, sessionId: 's1' })
    register({ previewId: 'pv2', container: 'c1', port: 5174, sessionId: 's2' })
    const docker = vi.fn(async () => ({ stdout: 'true\n', stderr: '' }))

    await sweepGone({ docker })

    expect(docker).toHaveBeenCalledTimes(1)
  })
})
